package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.infrastructure.gmail.GmailMessage.Body;
import dev.sino.provider.infrastructure.gmail.GmailMessage.Header;
import dev.sino.provider.infrastructure.gmail.GmailMessage.Part;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import tools.jackson.databind.json.JsonMapper;

/** The samples in {@code src/test/resources/gmail} are hand made in the shape of the Gmail API, not real mail. */
class GmailMessageNormalizerTests {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SELF = "owner@gmail.test";

    @Test
    void aReplyWithPlainTextAndHtmlKeepsThePlainText() {
        NormalizedGmailMessage normalized = normalize("alternative.json");
        NormalizedMessage message = normalized.message();

        assertThat(message.externalMessageId()).isEqualTo("18f0a1b2c3d4e5f6");
        assertThat(message.externalConversationId()).isEqualTo("thread-report");
        assertThat(message.textContent()).isEqualTo("Xin chào,\nĐây là báo cáo tháng 9.");
        assertThat(message.senderExternalParticipantId()).isEqualTo("an.nguyen@example.com");
        assertThat(message.direction()).isEqualTo(MessageDirection.INBOUND);
        assertThat(message.status()).isEqualTo(MessageStatus.UNKNOWN);
        assertThat(message.read()).isFalse();
        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.attachments()).isEmpty();
        assertThat(message.replyToExternalMessageId()).isNull();
        assertThat(message.sentAt()).isEqualTo(Instant.ofEpochMilli(1759996800000L));
        assertThat(message.metadata()).containsOnly(
                Map.entry("subject", "Re: FW: Báo cáo tháng 9"),
                Map.entry("rfcMessageId", "<CAB+report-1@mail.gmail.com>"));
        assertThat(normalized.title()).isEqualTo("Báo cáo tháng 9");
        assertThat(normalized.participants()).containsExactly(
                new NormalizedParticipant("an.nguyen@example.com", "Nguyễn Văn An", null, false),
                new NormalizedParticipant("owner@gmail.test", null, null, true),
                new NormalizedParticipant("binh@example.com", "Trần, Bình", null, false),
                new NormalizedParticipant("chi@example.com", null, null, false));
    }

    @Test
    void keepsWhoTheMailWentToInOrderAndWhereRepliesGo() {
        GmailMessage reply = withHeader(sample("alternative.json"), "Reply-To",
                "=?UTF-8?Q?Ph=C3=B2ng_k=E1=BA=BF_to=C3=A1n?= <KeToan@Example.com>");

        NormalizedRecipients recipients = GmailMessageNormalizer.normalize(reply, SELF).message().recipients();

        assertThat(recipients.to()).containsExactly(new Address(null, "owner@gmail.test"),
                new Address("Trần, Bình", "binh@example.com"));
        assertThat(recipients.cc()).containsExactly(new Address(null, "chi@example.com"));
        assertThat(recipients.replyTo()).containsExactly(new Address("Phòng kế toán", "ketoan@example.com"));
    }

    @Test
    void keepsTheHtmlBodyAsSentNextToItsText() {
        NormalizedMessage alternative = normalize("alternative.json").message();
        NormalizedMessage htmlOnly = normalize("html-only.json").message();

        assertThat(alternative.htmlContent()).isEqualTo("<div>HTML version</div>");
        assertThat(alternative.textContent()).isEqualTo("Xin chào,\nĐây là báo cáo tháng 9.");
        assertThat(htmlOnly.htmlContent()).startsWith("<html><head><title>Bản tin</title>")
                .contains("<script>track(\"open\")</script>", "<td>Ô một</td>");
    }

    @Test
    void whatAForwardedMessageAttachedAsAFileHoldsIsNotTheBody() {
        Part forwarded = new Part("1", "message/rfc822", "", List.of(), new Body(null, 120L, null),
                List.of(new Part("1.0", "multipart/alternative", "", List.of(), new Body(null, 0L, null), List.of(
                        new Part("1.0.0", "text/plain", "", List.of(), new Body(null, 9L, base64url("Thư cũ")), null),
                        new Part("1.0.1", "text/html", "", List.of(), new Body(null, 16L, base64url("<p>Thư cũ</p>")),
                                null)))));
        GmailMessage message = plain("m-1", "t-1", "1760000000000", "a@example.com", "Fwd", "unused");
        Part outer = new Part("", "multipart/mixed", "", message.payload().headers(), new Body(null, 0L, null),
                List.of(new Part("0", "text/plain", "", List.of(), new Body(null, 8L, base64url("Xem thư")), null),
                        forwarded));
        NormalizedMessage normalized = GmailMessageNormalizer.normalize(new GmailMessage(message.id(),
                message.threadId(), message.labelIds(), message.internalDate(), outer), SELF).message();

        assertThat(normalized.textContent()).isEqualTo("Xem thư");
        assertThat(normalized.htmlContent()).isNull();
    }

    @Test
    void aMessageWhoseOnlyPartBesideItsTextIsAnEmbeddedPictureIsText() {
        GmailMessage message = plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "unused");
        Part related = new Part("", "multipart/related", "", message.payload().headers(), new Body(null, 0L, null),
                List.of(new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                        base64url("<p><img src=\"cid:sig\"></p>")), null),
                        new Part("1", "image/gif", "", List.of(new Header("Content-ID", "  <sig> ")),
                                new Body(null, 4L, base64url("GIF8")), null)));

        NormalizedMessage normalized = GmailMessageNormalizer.normalize(new GmailMessage(message.id(),
                message.threadId(), message.labelIds(), message.internalDate(), related), SELF).message();

        assertThat(normalized.type()).isEqualTo(MessageType.TEXT);
        assertThat(normalized.attachments()).containsExactly(
                new NormalizedAttachment("1", null, "image/gif", 4L, null, null, "sig"));
    }

    @Test
    void anEmbeddedPictureTheHtmlDoesNotShowIsAFile() {
        Part picture = new Part("1", "image/png", "", List.of(new Header("Content-ID", "<photo@phone>")),
                new Body(null, 4L, base64url("PNG!")), null);
        Part text = new Part("0", "text/plain", "", List.of(), new Body(null, 5L, base64url("Hello")), null);
        // Sino's cleaning drops an <embed>: only an <img> shows a picture.
        Part html = new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                base64url("<p><img src=\"cid:other\"><embed src=\"cid:photo@phone\"></p>")), null);

        for (Part body : List.of(text, html)) {
            NormalizedMessage normalized = GmailMessageNormalizer.normalize(multipart(body, picture), SELF).message();

            assertThat(normalized.attachments()).as("so the picture can still be downloaded").containsExactly(
                    new NormalizedAttachment("1", null, "image/png", 4L, null, null, null));
            assertThat(normalized.type()).isEqualTo(MessageType.MIXED);
        }
    }

    @Test
    void anEmbeddedPictureABrowserMayNotShowIsAFile() {
        Part html = new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                base64url("<p><img src=\"cid:drawing\"><img src=\"cid:\"><img src=\"cid:scan\"></p>")), null);
        Part svg = new Part("1", "image/svg+xml", "", List.of(new Header("Content-ID", "<drawing>")),
                new Body(null, 9L, base64url("<svg></svg>")), null);
        Part noId = new Part("2", "image/png", "", List.of(new Header("Content-ID", "<>")),
                new Body(null, 4L, base64url("PNG!")), null);
        Part tiff = new Part("3", "image/tiff", "scan.tif", List.of(new Header("Content-ID", "<scan>")),
                new Body("ANGjdJ-scan", 900L, null), null);
        Part empty = new Part("4", "image/png", "", List.of(new Header("Content-ID", "<empty>")),
                new Body(null, 0L, null), null);

        NormalizedMessage normalized = GmailMessageNormalizer.normalize(multipart(html, svg, noId, tiff, empty), SELF)
                .message();

        assertThat(normalized.attachments()).as("a part with nothing in it is nothing").containsExactly(
                new NormalizedAttachment("1", null, "image/svg+xml", 9L, null, null, null),
                new NormalizedAttachment("2", null, "image/png", 4L, null, null, null),
                new NormalizedAttachment("3", "scan.tif", "image/tiff", 900L, null, null, null));
    }

    @Test
    void theHtmlShowsAPictureWhateverTheCaseOrTheEscapesOfItsCid() {
        Part html = new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                base64url("<p><img src='CID:Logo%40Shop'></p>")), null);
        Part logo = new Part("1", "image/webp", "", List.of(new Header("Content-ID", "<logo@shop>")),
                new Body(null, 4L, base64url("RIFF")), null);

        assertThat(GmailMessageNormalizer.normalize(multipart(html, logo), SELF).message().attachments())
                .containsExactly(new NormalizedAttachment("1", null, "image/webp", 4L, null, null, "logo@shop"));
    }

    @Test
    void anEmbeddedPartThatIsNoPictureIsAFile() {
        GmailMessage message = plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "unused");
        Part mixed = new Part("", "multipart/mixed", "", message.payload().headers(), new Body(null, 0L, null),
                List.of(new Part("0", "text/plain", "", List.of(), new Body(null, 5L, base64url("Hello")), null),
                        new Part("1", "application/pdf", "hop-dong.pdf", List.of(new Header("Content-ID", "<doc>"),
                                new Header("Content-Disposition", "inline; filename=\"hop-dong.pdf\"")),
                                new Body("ANGjdJ-doc", 900L, null), null)));

        NormalizedMessage normalized = GmailMessageNormalizer.normalize(new GmailMessage(message.id(),
                message.threadId(), message.labelIds(), message.internalDate(), mixed), SELF).message();

        assertThat(normalized.attachments()).containsExactly(
                new NormalizedAttachment("1", "hop-dong.pdf", "application/pdf", 900L, null, null, null));
        assertThat(normalized.type()).isEqualTo(MessageType.MIXED);
    }

    @Test
    void aMessageReadAgainBringsItsFilesAndEmbeddedPictures() {
        assertThat(GmailMessageNormalizer.content(sample("mixed-sent.json")).attachments()).containsExactly(
                new NormalizedAttachment("0.1", "logo.png", "image/png", 2048L, null, null, "logo@sino"),
                new NormalizedAttachment("1", "Hợp đồng.pdf", "application/pdf", 52431L, null, null, null),
                new NormalizedAttachment("2", "notes.txt", "text/plain", 44L, null, null, null));
    }

    @Test
    void aSecondPictureWithTheSameContentIdIsAFile() {
        Part html = new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                base64url("<p><img src=\"cid:logo\"></p>")), null);
        Part first = new Part("1", "image/png", "", List.of(new Header("Content-ID", "<logo>")),
                new Body(null, 4L, base64url("PNG1")), null);
        Part second = new Part("2", "image/png", "", List.of(new Header("Content-ID", "<logo>")),
                new Body(null, 4L, base64url("PNG2")), null);

        assertThat(GmailMessageNormalizer.normalize(multipart(html, first, second), SELF).message().attachments())
                .as("only one can be shown by that id; the other is downloaded")
                .containsExactly(new NormalizedAttachment("1", null, "image/png", 4L, null, null, "logo"),
                        new NormalizedAttachment("2", null, "image/png", 4L, null, null, null));
    }

    @Test
    void aPlainTextMessageHasNoHtml() {
        assertThat(normalizePlain("Hello").htmlContent()).isNull();
    }

    @Test
    void anHtmlPartWithNothingInItIsNoHtml() {
        GmailMessage message = plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "unused");
        Part alternative = new Part("", "multipart/alternative", "", message.payload().headers(),
                new Body(null, 0L, null), List.of(
                        new Part("0", "text/plain", "", List.of(), new Body(null, 5L, base64url("Hello")), null),
                        new Part("1", "text/html", "", List.of(), new Body(null, 4L, base64url(" \n\t ")), null)));

        assertThat(GmailMessageNormalizer.normalize(new GmailMessage(message.id(), message.threadId(),
                message.labelIds(), message.internalDate(), alternative), SELF).message().htmlContent()).isNull();
    }

    @Test
    void theContentOfAMessageReadAgainIsItsHtmlAndAddressees() {
        MessageContent content = GmailMessageNormalizer.content(sample("alternative.json"));

        assertThat(content.htmlContent()).isEqualTo("<div>HTML version</div>");
        assertThat(content.recipients().to()).hasSize(2);
        assertThat(GmailMessageNormalizer.content(sample("latin1.json")).htmlContent()).isNull();
    }

    @Test
    void aBlankSubjectIsNoSubject() {
        NormalizedGmailMessage normalized = GmailMessageNormalizer.normalize(
                plain("m-1", "t-1", "1760000000000", "a@example.com", "  ", "Hi"), SELF);

        assertThat(normalized.message().metadata()).doesNotContainKey(NormalizedMessage.SUBJECT);
    }

    @Test
    void aMessageWithoutCcOrReplyToHasNone() {
        NormalizedRecipients recipients = normalize("html-only.json").message().recipients();

        assertThat(recipients.to()).containsExactly(new Address(null, "owner@gmail.test"));
        assertThat(recipients.cc()).isEmpty();
        assertThat(recipients.replyTo()).isEmpty();
    }

    @Test
    void anHtmlOnlyMessageGetsTheTextOfItsHtml() {
        NormalizedMessage message = normalize("html-only.json").message();

        assertThat(message.textContent()).isEqualTo("Chào bạn & cả nhóm\nDòng hai\nDòng ba\nÔ một\nÔ hai");
        assertThat(message.read()).isTrue();
        assertThat(message.metadata()).containsOnlyKeys("subject", "bulk");
    }

    @Test
    void aPromotionIsBulk() {
        assertThat(normalize("html-only.json").message().metadata()).containsEntry(NormalizedMessage.BULK, "true");
    }

    @Test
    void aNewsletterWithAnUnsubscribeLinkIsBulkEvenInThePrimaryTab() {
        NormalizedMessage message = normalize("newsletter.json").message();

        assertThat(message.textContent()).isEqualTo("Tuần này ở Sino: ba bài viết mới.");
        assertThat(message.metadata()).containsOnly(
                Map.entry("subject", "Bản tin tuần"),
                Map.entry("rfcMessageId", "<digest-42@lists.example.com>"),
                Map.entry("bulk", "true"));
    }

    @ParameterizedTest
    @ValueSource(strings = { "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS" })
    void mailInATabOfBulkMailIsBulk(String label) {
        GmailMessage message = withLabels(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "Hello"),
                "INBOX", label);

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().metadata())
                .containsEntry(NormalizedMessage.BULK, "true");
    }

    @Test
    void anUnsubscribeHeaderInAnyCaseMakesMailBulk() {
        GmailMessage message = withHeader(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "Hello"),
                "list-unsubscribe", "<https://lists.example.com/unsubscribe/42>");

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().metadata())
                .containsEntry(NormalizedMessage.BULK, "true");
    }

    @Test
    void personalMailIsNotBulk() {
        GmailMessage message = withLabels(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "Hello"),
                "INBOX", "CATEGORY_PERSONAL", "IMPORTANT", "Label_42");

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().metadata())
                .doesNotContainKey(NormalizedMessage.BULK);
        assertThat(normalize("alternative.json").message().metadata()).doesNotContainKey(NormalizedMessage.BULK);
    }

    @Test
    void aSentMessageListsItsFilesAndKeepsItsEmbeddedPictureApart() {
        NormalizedGmailMessage normalized = normalize("mixed-sent.json");
        NormalizedMessage message = normalized.message();

        assertThat(message.direction()).isEqualTo(MessageDirection.OUTBOUND);
        assertThat(message.status()).isEqualTo(MessageStatus.SENT);
        assertThat(message.read()).isTrue();
        assertThat(message.type()).isEqualTo(MessageType.MIXED);
        assertThat(message.textContent()).as("the text of the body, not of the attached notes.txt")
                .isEqualTo("Gửi anh hợp đồng và ghi chú.");
        assertThat(message.attachments()).containsExactly(
                new NormalizedAttachment("0.1", "logo.png", "image/png", 2048L, null, null, "logo@sino"),
                new NormalizedAttachment("1", "Hợp đồng.pdf", "application/pdf", 52431L, null, null, null),
                new NormalizedAttachment("2", "notes.txt", "text/plain", 44L, null, null, null));
        assertThat(message.senderExternalParticipantId()).isEqualTo(SELF);
        assertThat(normalized.participants()).containsExactly(
                new NormalizedParticipant(SELF, "Owner", null, true),
                new NormalizedParticipant("minh@example.com", "Lê Minh", null, false));
    }

    @Test
    void aBodyInAnotherCharsetIsReadInThatCharset() {
        NormalizedGmailMessage normalized = normalize("latin1.json");

        assertThat(normalized.message().textContent()).isEqualTo("Un café, s'il vous plaît.");
        assertThat(normalized.participants()).first()
                .isEqualTo(new NormalizedParticipant("paul@example.fr", null, null, false));
    }

    @Test
    void aPlainBodyGmailKeepsAsAnAttachmentFallsBackToTheHtml() {
        NormalizedMessage message = normalize("plain-as-attachment.json").message();

        assertThat(message.textContent()).isEqualTo("Phần HTML đọc được");
        assertThat(message.attachments()).isEmpty();
        assertThat(message.type()).isEqualTo(MessageType.TEXT);
    }

    @Test
    void theAccountIsFoundWhateverTheCaseOfItsEmail() {
        assertThat(GmailMessageNormalizer.normalize(sample("alternative.json"), "OWNER@Gmail.TEST").participants())
                .filteredOn(NormalizedParticipant::self).extracting(NormalizedParticipant::externalParticipantId)
                .containsExactly(SELF);
    }

    @Test
    void aMessageWithoutFromCannotBeNormalized() {
        assertThatNormalizationFails(sample("no-from.json")).withMessageContaining("From")
                .withMessageNotContaining("Who sent this?").withMessageNotContaining(SELF);
    }

    @Test
    void aFromWithoutAnAddressCannotBeNormalized() {
        assertThatNormalizationFails(plain("m-1", "t-1", "1760000000000", "Somebody", "Hi", "Hello"));
    }

    @Test
    void aMessageWithoutAUsableDateCannotBeNormalized() {
        assertThatNormalizationFails(plain("m-1", "t-1", null, "a@example.com", "Hi", "Hello"))
                .withMessageContaining("internalDate");
        assertThatNormalizationFails(plain("m-1", "t-1", "yesterday", "a@example.com", "Hi", "Hello"))
                .withMessageContaining("internalDate");
    }

    @Test
    void aMessageWithoutIdOrThreadCannotBeNormalized() {
        assertThatNormalizationFails(plain(null, "t-1", "1760000000000", "a@example.com", "Hi", "Hello"));
        assertThatNormalizationFails(plain("m-1", " ", "1760000000000", "a@example.com", "Hi", "Hello"));
    }

    @Test
    void aBodyThatIsNotBase64urlCannotBeNormalized() {
        GmailMessage message = withBody(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "x"),
                "text/plain; charset=UTF-8", "%%% not base64 %%%");

        assertThatNormalizationFails(message).withMessageContaining("base64");
    }

    @Test
    void anUnknownCharsetIsReadAsUtf8() {
        GmailMessage message = withBody(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "x"),
                "text/plain; charset=\"x-made-up\"", base64url("Chào"));

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().textContent()).isEqualTo("Chào");
    }

    @Test
    void aBodyWithoutACharsetIsReadAsUtf8() {
        GmailMessage message = withBody(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "x"),
                "text/plain", base64url("Chào"));

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().textContent()).isEqualTo("Chào");
    }

    @Test
    void aFileIsNeverTheBodyEvenWithItsContentInline() {
        Part file = new Part("0", "text/plain", "notes.txt", List.of(), new Body("ANGjdJ-notes", 8L,
                base64url("attached")), null);
        Part body = new Part("1", "text/plain", "", List.of(), new Body(null, 4L, base64url("Body")), null);

        NormalizedMessage message = GmailMessageNormalizer.normalize(multipart(file, body), SELF).message();

        assertThat(message.textContent()).isEqualTo("Body");
        assertThat(message.attachments()).extracting(NormalizedAttachment::fileName).containsExactly("notes.txt");
    }

    @Test
    void anImageSentAsAnAttachmentIsAFileEvenWithAContentIdTheHtmlShows() {
        Part image = new Part("1", "image/png", "=?UTF-8?Q?B=C3=A1o_c=C3=A1o.png?=",
                List.of(new Header("Content-ID", "<chart@sino>"),
                        new Header("Content-Disposition", "Attachment; filename=chart.png")),
                new Body("ANGjdJ-chart", 2048L, null), null);
        Part body = new Part("0", "text/html", "", List.of(), new Body(null, 30L,
                base64url("<p><img src=\"cid:chart@sino\"></p>")), null);

        NormalizedMessage message = GmailMessageNormalizer.normalize(multipart(body, image), SELF).message();

        assertThat(message.attachments()).containsExactly(
                new NormalizedAttachment("1", "Báo cáo.png", "image/png", 2048L, null, null, null));
    }

    @Test
    void anAddressTwiceInOneMessageKeepsTheFirstName() {
        GmailMessage message = withHeader(plain("m-1", "t-1", "1760000000000", "Bình <binh@example.com>", "Hi",
                "Hello"), "Cc", "Someone Else <binh@example.com>, binh@example.com");

        assertThat(GmailMessageNormalizer.normalize(message, SELF).participants())
                .filteredOn(participant -> participant.externalParticipantId().equals("binh@example.com"))
                .singleElement().extracting(NormalizedParticipant::displayName).isEqualTo("Bình");
    }

    @Test
    void aMailThatIsOneFileKeepsThatFile() {
        Part scan = new Part("", "application/pdf", "=?UTF-8?Q?scan=00.pdf?=",
                List.of(new Header("From", "scanner@example.com"), new Header("To", SELF)),
                new Body("ANGjdJ-scan", 90000L, null), null);

        NormalizedMessage message = GmailMessageNormalizer.normalize(
                new GmailMessage("m-1", "t-1", List.of("INBOX"), "1760000000000", scan), SELF).message();

        assertThat(message.attachments()).containsExactly(
                new NormalizedAttachment(GmailMessageNormalizer.ROOT_PART_ID, "scan.pdf", "application/pdf", 90000L,
                        null, null, null));
        assertThat(message.textContent()).isNull();
    }

    @Test
    void headersAndListsWithHolesAreRead() {
        GmailMessage message = JSON.readValue("""
                {"id": "m-1", "threadId": "t-1", "labelIds": ["INBOX", null], "internalDate": "1760000000000",
                 "payload": {"mimeType": "text/plain", "filename": "",
                   "headers": [{"name": "From"}, null, {"name": "From", "value": "a@example.com"},
                               {"name": "Subject"}],
                   "body": {"size": 2, "data": "SGk"}, "parts": [null]}}
                """, GmailMessage.class);

        NormalizedGmailMessage normalized = GmailMessageNormalizer.normalize(message, SELF);

        assertThat(normalized.message().senderExternalParticipantId()).isEqualTo("a@example.com");
        assertThat(normalized.message().textContent()).isEqualTo("Hi");
        assertThat(normalized.message().metadata()).doesNotContainKey("subject");
    }

    @Test
    void aHeaderWithoutValueIsNoHeader() {
        Part payload = new Part("", "text/plain", "", List.of(new Header("From", null), new Header("To", SELF)),
                new Body(null, 2L, base64url("Hi")), null);

        assertThatNormalizationFails(new GmailMessage("m-1", "t-1", List.of("INBOX"), "1760000000000", payload))
                .withMessageContaining("From");
    }

    @Test
    void nulCharactersAreDropped() {
        GmailMessage message = withHeader(plain("m-1", "t-1", "1760000000000", "=?UTF-8?Q?An=00?= <a@example.com>",
                "=?UTF-8?Q?A=00B?=", "Hello\u0000world"), "Cc", "=?UTF-8?Q?=00?= <b@example.com>");

        NormalizedGmailMessage normalized = GmailMessageNormalizer.normalize(message, SELF);

        assertThat(normalized.message().textContent()).isEqualTo("Helloworld");
        assertThat(normalized.message().metadata()).containsEntry("subject", "AB");
        assertThat(normalized.title()).isEqualTo("AB");
        assertThat(normalized.participants()).extracting(NormalizedParticipant::displayName)
                .containsExactly("An", null, null);
    }

    @Test
    void aFoldedHeaderIsReadAsOneLine() {
        NormalizedGmailMessage normalized = GmailMessageNormalizer.normalize(plain("m-1", "t-1", "1760000000000",
                "\"Nguyen\r\n Van An\" <a@example.com>", "A long\r\n\tsubject", "Hello"), SELF);

        assertThat(normalized.message().metadata()).containsEntry("subject", "A long\tsubject");
        assertThat(normalized.participants()).first().extracting(NormalizedParticipant::displayName)
                .isEqualTo("Nguyen Van An");
    }

    @Test
    void theSenderOfASentMessageIsTheAccountEvenFromAnAlias() {
        GmailMessage fromAlias = plain("m-1", "t-1", "1760000000000", "Alias <alias@example.com>", "Hi", "Hello");
        GmailMessage sent = new GmailMessage(fromAlias.id(), fromAlias.threadId(), List.of("SENT"),
                fromAlias.internalDate(), fromAlias.payload());

        assertThat(GmailMessageNormalizer.normalize(sent, SELF).participants()).containsExactly(
                new NormalizedParticipant("alias@example.com", "Alias", null, true),
                new NormalizedParticipant(SELF, null, null, true));
        assertThat(GmailMessageNormalizer.normalize(fromAlias, SELF).participants()).first()
                .extracting(NormalizedParticipant::self).isEqualTo(false);
    }

    @Test
    void aMessageWithoutTextHasNone() {
        GmailMessage message = withBody(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", "x"),
                "text/plain; charset=UTF-8", null);

        assertThat(GmailMessageNormalizer.normalize(message, SELF).message().textContent()).isNull();
    }

    @Test
    void aLongTextIsCutAt100000Characters() {
        String longText = "a".repeat(GmailMessageNormalizer.MAX_TEXT_LENGTH + 50);

        assertThat(normalizePlain(longText).textContent()).hasSize(GmailMessageNormalizer.MAX_TEXT_LENGTH);
    }

    @Test
    void theCutNeverSplitsACharacter() {
        // The 100 000th char is the first half of an emoji: the whole emoji goes.
        String text = "a".repeat(GmailMessageNormalizer.MAX_TEXT_LENGTH - 1) + "😀😀";

        assertThat(normalizePlain(text).textContent())
                .isEqualTo("a".repeat(GmailMessageNormalizer.MAX_TEXT_LENGTH - 1));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', nullValues = "NULL", value = {
        "Re: Hello                  | Hello",
        "RE: Fwd: FW: Hello         | Hello",
        "TL: Re[2]: Hello           | Hello",
        "Fw:Hello                   | Hello",
        "Reply about the report     | Reply about the report",
        "Re:                        | NULL",
        "NULL                       | NULL" })
    void theTitleIsTheSubjectWithoutReplyOrForwardPrefixes(String subject, String title) {
        NormalizedGmailMessage normalized = GmailMessageNormalizer.normalize(
                plain("m-1", "t-1", "1760000000000", "a@example.com", subject, "Hello"), SELF);

        assertThat(normalized.title()).isEqualTo(title);
        if (subject == null) {
            assertThat(normalized.message().metadata()).doesNotContainKey("subject");
        } else {
            assertThat(normalized.message().metadata()).containsEntry("subject", subject);
        }
    }

    @Test
    void theMessagesOfOneThreadMakeOneConversation() {
        NormalizedGmailMessage report = normalize("alternative.json");
        NormalizedGmailMessage news = normalize("html-only.json");
        NormalizedGmailMessage correction = GmailMessageNormalizer.normalize(plain("m-2", "thread-report",
                "1760090000000", "binh@example.com", "Re: Báo cáo tháng 9 (bản sửa)", "Đã sửa"), SELF);

        List<NormalizedConversation> threads = GmailMessageNormalizer.threadsOf(List.of(report, news, correction));

        assertThat(threads).extracting(NormalizedConversation::externalConversationId)
                .containsExactly("thread-report", "thread-news");
        NormalizedConversation thread = threads.getFirst();
        assertThat(thread.type()).isEqualTo(ConversationType.THREAD);
        assertThat(thread.title()).as("the title of the latest message").isEqualTo("Báo cáo tháng 9 (bản sửa)");
        assertThat(thread.lastActivityAt()).isEqualTo(Instant.ofEpochMilli(1760090000000L));
        assertThat(thread.avatarUrl()).isNull();
        assertThat(thread.participants()).as("everyone once, with the name a message gave").containsExactly(
                new NormalizedParticipant("an.nguyen@example.com", "Nguyễn Văn An", null, false),
                new NormalizedParticipant("owner@gmail.test", null, null, true),
                new NormalizedParticipant("binh@example.com", "Trần, Bình", null, false),
                new NormalizedParticipant("chi@example.com", null, null, false));
    }

    @Test
    void aLaterMessageGivesANameAParticipantDidNotHave() {
        NormalizedGmailMessage first = GmailMessageNormalizer.normalize(
                plain("m-1", "t-1", "1760000000000", "binh@example.com", "Hi", "Hello"), SELF);
        NormalizedGmailMessage second = GmailMessageNormalizer.normalize(
                plain("m-2", "t-1", "1760000001000", "Trần Bình <binh@example.com>", "Re: Hi", "Hello"), SELF);

        assertThat(GmailMessageNormalizer.threadsOf(List.of(first, second)).getFirst().participants())
                .contains(new NormalizedParticipant("binh@example.com", "Trần Bình", null, false));
    }

    @Test
    void noMessagesMakeNoConversations() {
        assertThat(GmailMessageNormalizer.threadsOf(List.of())).isEmpty();
    }

    private static NormalizedGmailMessage normalize(String sample) {
        return GmailMessageNormalizer.normalize(sample(sample), SELF);
    }

    private static NormalizedMessage normalizePlain(String text) {
        return GmailMessageNormalizer.normalize(plain("m-1", "t-1", "1760000000000", "a@example.com", "Hi", text), SELF)
                .message();
    }

    private static ThrowableAssertAlternative<ProviderException> assertThatNormalizationFails(GmailMessage message) {
        return assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> GmailMessageNormalizer.normalize(message, SELF))
                .satisfies(failure -> assertThat(failure.errorCode())
                        .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED));
    }

    private static GmailMessage sample(String name) {
        try (InputStream json = GmailMessageNormalizerTests.class.getResourceAsStream("/gmail/" + name)) {
            return JSON.readValue(json, GmailMessage.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // A one-part text/plain message; a null header is left out.
    private static GmailMessage plain(String id, String threadId, String internalDate, String from, String subject,
            String text) {
        List<Header> headers = new ArrayList<>();
        if (from != null) {
            headers.add(new Header("From", from));
        }
        headers.add(new Header("To", SELF));
        if (subject != null) {
            headers.add(new Header("Subject", subject));
        }
        headers.add(new Header("Content-Type", "text/plain; charset=UTF-8"));
        Part payload = new Part("", "text/plain", "", headers, new Body(null, null, base64url(text)), null);
        return new GmailMessage(id, threadId, List.of("INBOX"), internalDate, payload);
    }

    private static GmailMessage withBody(GmailMessage message, String contentType, String data) {
        Part part = message.payload();
        List<Header> headers = new ArrayList<>(part.headers().stream()
                .filter(header -> !header.name().equals("Content-Type")).toList());
        headers.add(new Header("Content-Type", contentType));
        return new GmailMessage(message.id(), message.threadId(), message.labelIds(), message.internalDate(),
                new Part(part.partId(), part.mimeType(), part.filename(), headers, new Body(null, null, data), null));
    }

    private static GmailMessage withHeader(GmailMessage message, String name, String value) {
        Part part = message.payload();
        List<Header> headers = new ArrayList<>(part.headers());
        headers.add(new Header(name, value));
        return new GmailMessage(message.id(), message.threadId(), message.labelIds(), message.internalDate(),
                new Part(part.partId(), part.mimeType(), part.filename(), headers, part.body(), part.parts()));
    }

    private static GmailMessage withLabels(GmailMessage message, String... labels) {
        return new GmailMessage(message.id(), message.threadId(), List.of(labels), message.internalDate(),
                message.payload());
    }

    private static GmailMessage multipart(Part... parts) {
        List<Header> headers = List.of(new Header("From", "a@example.com"), new Header("To", SELF));
        Part payload = new Part("", "multipart/mixed", "", headers, new Body(null, 0L, null), List.of(parts));
        return new GmailMessage("m-1", "t-1", List.of("INBOX"), "1760000000000", payload);
    }

    private static String base64url(String text) {
        return Base64.getUrlEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8));
    }

}
