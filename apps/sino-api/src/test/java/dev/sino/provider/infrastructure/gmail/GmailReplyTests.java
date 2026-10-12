package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import dev.sino.provider.infrastructure.gmail.MailHeaders.Mailbox;
import dev.sino.provider.spi.NormalizedRecipients.Address;

/** The reply Sino sends through Gmail (F10, D-133), as the raw RFC 5322 message, read back the way mail reads it. */
class GmailReplyTests {

    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final String TEXT = "Cảm ơn anh, em nhận được rồi.\nHẹn gặp thứ Hai.";

    @Test
    void aReplyGoesInTheThreadOfTheMessageItAnswers() {
        String mime = new GmailReply("me@gmail.test", List.of(new Address("An Nguyễn", "an@example.test")),
                GmailReply.subjectOf("Báo cáo tháng 9"), GmailReply.messageIdOf(CLIENT_MESSAGE_ID, "me@gmail.test"),
                "<orig@mail.example.test>", "<first@mail.example.test>", TEXT).mime();

        Map<String, String> headers = headersOf(mime);
        assertThat(headers.get("From")).isEqualTo("me@gmail.test");
        assertThat(MailHeaders.mailboxes(headers.get("To")))
                .containsExactly(new Mailbox("an@example.test", "An Nguyễn"));
        assertThat(MailHeaders.decode(headers.get("Subject"))).isEqualTo("Re: Báo cáo tháng 9");
        assertThat(headers.get("Message-ID")).isEqualTo("<sino.6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b@gmail.test>");
        assertThat(headers.get("In-Reply-To")).isEqualTo("<orig@mail.example.test>");
        assertThat(headers.get("References")).isEqualTo("<first@mail.example.test> <orig@mail.example.test>");
        assertThat(headers.get("MIME-Version")).isEqualTo("1.0");
        assertThat(headers.get("Content-Type")).isEqualTo("text/plain; charset=UTF-8");
        assertThat(headers.get("Content-Transfer-Encoding")).isEqualTo("base64");
        assertThat(bodyOf(mime)).isEqualTo(TEXT.replace("\n", "\r\n"));
    }

    @Test
    void theFirstReplyStartsTheReferences() {
        String mime = reply("Report", "<orig@mail.example.test>", null, "ok");

        assertThat(headersOf(mime).get("References")).isEqualTo("<orig@mail.example.test>");
    }

    // Gmail keeps the thread by threadId; without the message it answers there is nothing to point at.
    @Test
    void withoutTheMessageItAnswersThereIsNoThreadHeaderAndNoSubject() {
        String mime = reply(null, null, null, "ok");

        assertThat(headersOf(mime)).doesNotContainKeys("In-Reply-To", "References", "Subject");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = { "Report|Re: Report", "Re: Report|Re: Report", "RE: Report|RE: Report",
            "re : Report|re : Report", "Fwd: Report|Re: Fwd: Report", "Report: Re|Re: Report: Re" })
    void reIsAddedOnce(String original, String expected) {
        assertThat(GmailReply.subjectOf(original)).isEqualTo(expected);
        assertThat(headersOf(reply(original, null, null, "ok")).get("Subject")).isEqualTo(expected);
    }

    @Test
    void aLongSubjectIsSplitIntoShortEncodedWords() {
        String original = "Lịch họp tổng kết quý ba và kế hoạch quý bốn của phòng kinh doanh khu vực miền Nam";

        String subject = headersOf(reply(original, null, null, "ok")).get("Subject");

        assertThat(MailHeaders.decode(subject)).isEqualTo("Re: " + original);
        assertThat(subject.split(" ")).allSatisfy(word -> assertThat(word.length()).isLessThanOrEqualTo(75));
        assertThat(rawHeaderLines(reply(original, null, null, "ok")))
                .allSatisfy(line -> assertThat(line.length()).isLessThanOrEqualTo(78));
    }

    @Test
    void severalAddresseesEachKeepTheirName() {
        String mime = new GmailReply("me@gmail.test", List.of(new Address("Bình \"Bee\" Trần", "binh@example.test"),
                new Address("Ops, Team", "ops@example.test"), new Address(null, "dan@example.test")), "Re: x",
                GmailReply.messageIdOf(CLIENT_MESSAGE_ID, "me@gmail.test"), null, null, "ok").mime();

        assertThat(MailHeaders.mailboxes(headersOf(mime).get("To"))).containsExactly(
                new Mailbox("binh@example.test", "Bình \"Bee\" Trần"), new Mailbox("ops@example.test", "Ops, Team"),
                new Mailbox("dan@example.test", null));
    }

    // Names and subjects come from mail other people sent: a line break in one must not add a header.
    @Test
    void aLineBreakInStoredTextCannotAddAHeader() {
        String mime = new GmailReply("me@gmail.test",
                List.of(new Address("Evil\r\nBcc: victim@example.test", "an@example.test")),
                GmailReply.subjectOf("Hi\r\nBcc: victim@example.test"),
                GmailReply.messageIdOf(CLIENT_MESSAGE_ID, "me@gmail.test"), "<orig@x.test>\r\nBcc: v@x.test", null,
                "ok").mime();

        assertThat(headersOf(mime)).doesNotContainKey("Bcc");
        assertThat(rawHeaderLines(mime)).noneMatch(line -> line.startsWith("Bcc"));
        assertThat(MailHeaders.decode(headersOf(mime).get("Subject"))).as("one line, as the recipient reads it")
                .isEqualTo("Re: Hi Bcc: victim@example.test");
    }

    private static String reply(String original, String inReplyTo, String references, String text) {
        return new GmailReply("me@gmail.test", List.of(new Address(null, "an@example.test")),
                GmailReply.subjectOf(original), GmailReply.messageIdOf(CLIENT_MESSAGE_ID, "me@gmail.test"), inReplyTo,
                references, text).mime();
    }

    private static List<String> rawHeaderLines(String mime) {
        return List.of(mime.substring(0, mime.indexOf("\r\n\r\n")).split("\r\n"));
    }

    // Unfolded: a line starting with a space or tab continues the one before it.
    private static Map<String, String> headersOf(String mime) {
        Map<String, String> headers = new LinkedHashMap<>();
        String last = null;
        for (String line : rawHeaderLines(mime)) {
            if ((line.startsWith(" ") || line.startsWith("\t")) && last != null) {
                headers.merge(last, line, String::concat);
            } else {
                last = line.substring(0, line.indexOf(':'));
                headers.put(last, line.substring(line.indexOf(':') + 1).strip());
            }
        }
        return headers;
    }

    private static String bodyOf(String mime) {
        String encoded = mime.substring(mime.indexOf("\r\n\r\n") + 4).replace("\r\n", "");
        return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
    }

}
