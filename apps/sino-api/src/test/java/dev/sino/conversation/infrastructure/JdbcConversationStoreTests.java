package dev.sino.conversation.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.tuple;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
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
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import tools.jackson.databind.json.JsonMapper;

/** Storing pages of mail (BE-42) in a real PostgreSQL; each test runs in a transaction that is rolled back. */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, JdbcConversationStore.class, ConversationSummaries.class })
@ActiveProfiles("test")
class JdbcConversationStoreTests {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final Instant TUESDAY = Instant.parse("2026-10-06T09:30:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice",
            null, false);
    private static final NormalizedParticipant OWNER = new NormalizedParticipant("owner@gmail.test", null, null,
            true);
    private static final NormalizedRecipients ADDRESSEES = new NormalizedRecipients(
            List.of(new Address(null, "owner@gmail.test")), List.of(new Address("Trần, Bình", "binh@example.test")),
            List.of());
    private static final NormalizedAttachment REPORT = new NormalizedAttachment("1", "report.pdf",
            "application/pdf", 1024L, null, null, null);
    // An embedded picture is kept as one only beside HTML that can show it.
    private static final String SHOWS_LOGO = "<p><img src=\"cid:logo@x\"></p>";
    private static final NormalizedAttachment PHOTO = new NormalizedAttachment("2", "photo.png", "image/png", 2048L,
            "https://files.example.test/2", "https://files.example.test/2/small", null);

    @Autowired
    private ConversationStore store;

    @Autowired
    private JdbcConversationStore contents;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private final UUID account = UUID.randomUUID();

    @Test
    void storesAPageOfMail() {
        NormalizedMessage question = question(REPORT, PHOTO);
        NormalizedMessage answer = answer();

        StoreResult result = store.store(account, batch(List.of(thread("Báo cáo tháng 9", ALICE, OWNER)), question,
                answer));

        Map<String, Object> conversation = conversation("thread-1");
        assertThat(result).as("the question came in, the answer went out")
                .isEqualTo(new StoreResult(2, 0, Set.of((UUID) conversation.get("id")), 1));
        assertThat(((UUID) conversation.get("id")).version()).as("UUIDv7 (D-08)").isEqualTo(7);
        assertThat(conversation).containsEntry("type", "THREAD").containsEntry("title", "Báo cáo tháng 9")
                .containsEntry("avatar_url", null).containsEntry("archived", false);
        assertThat(participants("thread-1")).containsExactly(
                List.of("alice@example.test", "Alice", "-", false),
                List.of("owner@gmail.test", "-", "-", true));
        assertStoredAs(question);
        assertStoredAs(answer);
        assertThat(readState("m-1")).containsExactly(false, false);
        assertThat(readState("m-2")).containsExactly(true, true);
        assertThat(attachments("m-1")).containsExactly(
                List.of("1", "report.pdf", "application/pdf", 1024L, "-", "-"),
                List.of("2", "photo.png", "image/png", 2048L, "https://files.example.test/2",
                        "https://files.example.test/2/small"));
        assertThat(attachments("m-2")).isEmpty();
    }

    @Test
    void storingTheSamePageTwiceChangesNothing() {
        SyncBatch page = batch(List.of(thread("Báo cáo tháng 9", ALICE, OWNER)), question(REPORT, PHOTO), answer());
        store.store(account, page);
        Map<String, String> rowVersions = rowVersions();

        StoreResult again = store.store(account, page);

        assertThat(again).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 0);
        assertThat(rowVersions()).as("no row rewritten (02B section 11)").isEqualTo(rowVersions);
        assertThat(count("conversation")).isEqualTo(1);
        assertThat(count("conversation_participant")).isEqualTo(2);
        assertThat(count("message")).isEqualTo(2);
        assertThat(count("attachment")).isEqualTo(2);
    }

    @Test
    void aMessageWithNewTextIsUpdatedInPlace() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));
        UUID id = messageId("m-1");
        NormalizedMessage edited = changed(question(), "text");

        StoreResult result = store.store(account, batch(List.of(), edited));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(result.newInbound()).as("an inbound message that changed is not new mail").isZero();
        assertThat(messageId("m-1")).isEqualTo(id);
        assertStoredAs(edited);
    }

    @ParameterizedTest
    @ValueSource(strings = { "sender", "direction", "type", "text", "status", "sentAt", "replyTo", "metadata",
        "recipients", "html" })
    void aMessageWhoseFieldChangedIsUpdated(String field) {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));
        String rowVersion = rowVersion("m-1");
        NormalizedMessage edited = changed(question(), field);

        StoreResult result = store.store(account, batch(List.of(), edited));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(rowVersion("m-1")).isNotEqualTo(rowVersion);
        assertStoredAs(edited);
    }

    @Test
    void anUpdateThatCannotTellTheRecipientsKeepsTheStoredOnes() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));
        String rowVersion = rowVersion("m-1");

        StoreResult same = store.store(account, batch(List.of(), withRecipients(question(), null)));

        assertThat(same).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 0);
        assertThat(rowVersion("m-1")).as("nothing else changed, so the row is not written").isEqualTo(rowVersion);

        NormalizedMessage readOnGmail = changed(question(), "read");
        StoreResult read = store.store(account, batch(List.of(), withRecipients(readOnGmail, null)));

        assertThat(read).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertStoredAs(readOnGmail);
    }

    @Test
    void theHtmlOfAMessageIsKeptAsItCame() {
        NormalizedMessage newsletter = withHtml(question(), "<p onclick=\"x()\">Chào</p>");

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), newsletter));

        assertStoredAs(newsletter);
        assertThat(body("m-1")).containsExactly("HTML", "<p onclick=\"x()\">Chào</p>");
    }

    @Test
    void htmlLongerThanTheLimitIsNotKeptAndTheMessageShowsItsText() {
        String longest = "x".repeat(JdbcConversationStore.MAX_HTML_LENGTH);

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(), longest),
                withHtml(answer(), longest + "x")));

        assertThat(body("m-1")).containsExactly("HTML", longest);
        assertThat(body("m-2")).containsExactly("TEXT", null);
    }

    @Test
    void anUpdateWithoutHtmlKeepsTheStoredHtmlAndIsNoChange() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(), "<p>Chào</p>")));
        String rowVersion = rowVersion("m-1");

        StoreResult result = store.store(account, batch(List.of(), question()));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 0);
        assertThat(rowVersion("m-1")).isEqualTo(rowVersion);
        assertThat(body("m-1")).containsExactly("HTML", "<p>Chào</p>");
    }

    @Test
    void readOnGmailLaterKeepsTheStoredHtml() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(), "<p>Chào</p>")));

        StoreResult read = store.store(account, batch(List.of(), changed(question(), "read")));

        assertThat(read).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(body("m-1")).containsExactly("HTML", "<p>Chào</p>");
    }

    @Test
    void mailStoredBeforeSinoKeptHtmlIsSettledWhenStoredAgain() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(), answer()));
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED'").update();

        StoreResult again = store.store(account, batch(List.of(), question(), withHtml(answer(), "<p>Cảm ơn</p>")));

        assertThat(again).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 2);
        assertThat(body("m-1")).containsExactly("TEXT", null);
        assertThat(body("m-2")).containsExactly("HTML", "<p>Cảm ơn</p>");
    }

    @Test
    void anEmbeddedPictureIsStoredWithItsContentIdAndIsNoFile() {
        NormalizedAttachment logo = new NormalizedAttachment("9", "logo.png", "image/png", 10L, null, null, "logo@x");

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)),
                withHtml(question(REPORT, logo), SHOWS_LOGO)));

        assertThat(contentIds("m-1")).containsExactly("1=-", "9=logo@x");
        assertThat(conversation("thread-1")).containsEntry("has_attachments", true);
    }

    @Test
    void aPartStoredAgainAsAFileIsNoLongerAnEmbeddedPicture() {
        NormalizedAttachment logo = new NormalizedAttachment("9", "logo.png", "image/png", 10L, null, null, "logo@x");
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(logo), SHOWS_LOGO)));

        store.store(account, batch(List.of(), question(new NormalizedAttachment("9", "logo.png", "image/png", 10L,
                null, null, null))));

        assertThat(contentIds("m-1")).containsExactly("9=-");
        assertThat(conversation("thread-1")).containsEntry("has_attachments", true);
    }

    @Test
    void aPictureOfMailWhoseHtmlIsTooLongToKeepIsAFile() {
        NormalizedAttachment logo = new NormalizedAttachment("9", "logo.png", "image/png", 10L, null, null, "logo@x");
        String tooLong = "<p>" + "x".repeat(JdbcConversationStore.MAX_HTML_LENGTH) + "</p>";

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(logo), tooLong)));

        assertThat(contentIds("m-1")).as("no HTML shows it, so the user downloads it").containsExactly("9=-");
        assertThat(conversation("thread-1")).containsEntry("has_attachments", true);
    }

    @Test
    void aConversationWhoseMailHasOnlyEmbeddedPicturesHasNoAttachments() {
        NormalizedAttachment logo = new NormalizedAttachment("9", "logo.png", "image/png", 10L, null, null, "logo@x");

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(logo), SHOWS_LOGO)));

        assertThat(conversation("thread-1")).containsEntry("has_attachments", false);
    }

    @Test
    void contentReadAgainAddsItsEmbeddedPicturesBesideTheFiles() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(REPORT)));
        UUID id = messageId("m-1");
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED' WHERE id = :id").param("id", id).update();

        contents.storeContent(id, new MessageContent("<p><img src=\"cid:logo@x\"></p>", null, List.of(
                new NormalizedAttachment("9", "lo go.png", "image/png", 10L, null, null, "logo@x"))));

        assertThat(contentIds("m-1")).containsExactly("1=-", "9=logo@x");
        assertThat(jdbc.sql("SELECT file_name FROM attachment WHERE external_attachment_id = '9'")
                .query(String.class).single()).isEqualTo("logo.png");
    }

    @Test
    void contentReadAgainAddsTheFilesAnEarlierImportLeftOut() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(REPORT)));
        UUID id = messageId("m-1");
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED' WHERE id = :id").param("id", id).update();

        contents.storeContent(id, new MessageContent("<p>Ảnh</p>", null, List.of(REPORT,
                new NormalizedAttachment("7", null, "image/png", 10L, null, null, null))));

        assertThat(contentIds("m-1")).containsExactly("1=-", "7=-");
    }

    @Test
    void aPictureReadAgainWithHtmlTooLongToKeepIsAFile() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));
        UUID id = messageId("m-1");
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED' WHERE id = :id").param("id", id).update();

        contents.storeContent(id, new MessageContent("x".repeat(JdbcConversationStore.MAX_HTML_LENGTH + 1), null,
                List.of(new NormalizedAttachment("9", "logo.png", "image/png", 10L, null, null, "logo@x"))));

        assertThat(contentIds("m-1")).containsExactly("9=-");
    }

    @Test
    void contentReadAgainIsKeptOnceForMailStoredBefore() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withRecipients(question(), null)));
        UUID id = messageId("m-1");
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED' WHERE id = :id").param("id", id).update();

        assertThat(contents.storeContent(id, new MessageContent("<p>Ch\u0000ào</p>", ADDRESSEES, List.of()))).isTrue();
        assertThat(contents.storeContent(id, new MessageContent("<p>Khác</p>", null, List.of())))
                .as("a second reader at the same time changes nothing").isFalse();

        assertThat(body("m-1")).containsExactly("HTML", "<p>Chào</p>");
        assertThat(jdbc.sql("SELECT recipients = cast(:recipients AS jsonb) FROM message WHERE id = :id")
                .param("recipients", JSON.writeValueAsString(ADDRESSEES)).param("id", id).query(Boolean.class)
                .single()).isTrue();
    }

    @Test
    void contentWithoutHtmlOrWithTooMuchOfItLeavesTheText() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(), answer()));
        jdbc.sql("UPDATE message SET body_format = 'UNCHECKED'").update();

        assertThat(contents.storeContent(messageId("m-1"), new MessageContent(null, null, List.of()))).isTrue();
        assertThat(contents.storeContent(messageId("m-2"),
                new MessageContent("x".repeat(JdbcConversationStore.MAX_HTML_LENGTH + 1), null, List.of()))).isTrue();

        assertThat(body("m-1")).containsExactly("TEXT", null);
        assertThat(body("m-2")).containsExactly("TEXT", null);
    }

    @Test
    void contentReadAgainNeverChangesAMessageAlreadySettled() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), withHtml(question(), "<p>Chào</p>"),
                answer()));

        MessageContent other = new MessageContent("<p>Khác</p>", null, List.of());
        assertThat(contents.storeContent(messageId("m-1"), other)).isFalse();
        assertThat(contents.storeContent(messageId("m-2"), other)).isFalse();

        assertThat(body("m-1")).containsExactly("HTML", "<p>Chào</p>");
        assertThat(body("m-2")).containsExactly("TEXT", null);
    }

    @Test
    void aMessageWithoutItsConversationGetsAMinimalOne() {
        StoreResult result = store.store(account, batch(List.of(), question()));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(1, 0);
        assertThat(conversation("thread-1")).containsEntry("type", "UNKNOWN").containsEntry("title", null)
                .containsEntry("last_message_at", Timestamp.from(MONDAY));
        assertStoredAs(question());
    }

    @Test
    void aMinimalConversationNeverOverwritesAStoredOne() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));

        store.store(account, batch(List.of(), answer()));

        assertThat(conversation("thread-1")).containsEntry("type", "THREAD").containsEntry("title", "Báo cáo");
    }

    @Test
    void aFullConversationReplacesAMinimalOne() {
        store.store(account, batch(List.of(), question()));

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));

        assertThat(conversation("thread-1")).containsEntry("type", "THREAD").containsEntry("title", "Báo cáo");
        assertThat(count("conversation")).isEqualTo(1);
    }

    @Test
    void aStoredTitleStaysWhenALaterPageOfTheSameMailRenamesIt() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));

        store.store(account, batch(List.of(thread("Re: Báo cáo", ALICE, OWNER)), question()));

        assertThat(conversation("thread-1")).containsEntry("title", "Báo cáo");
    }

    @Test
    void aConversationWithoutTitleGetsOneLater() {
        store.store(account, batch(List.of(thread(null, ALICE, OWNER)), question()));

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));

        assertThat(conversation("thread-1")).containsEntry("title", "Báo cáo");
    }

    @Test
    void aConversationKeepsItsPictureUntilANewOneComes() {
        store.store(account, batch(List.of(chat("a.png")), question()));
        store.store(account, batch(List.of(chat(null)), question()));
        assertThat(conversation("thread-1")).containsEntry("avatar_url", "a.png");

        store.store(account, batch(List.of(chat("b.png")), question()));

        assertThat(conversation("thread-1")).containsEntry("avatar_url", "b.png");
    }

    // Gmail lists the newest message first; another connector may not.
    @ParameterizedTest
    @ValueSource(booleans = { true, false })
    void aNewConversationTakesTheTimeOfItsNewestMessage(boolean newestFirst) {
        NormalizedConversation thread = new NormalizedConversation("thread-1", ConversationType.THREAD, "Báo cáo",
                null, List.of(ALICE, OWNER), Instant.parse("2026-10-01T00:00:00Z"));
        SyncBatch page = newestFirst ? batch(List.of(thread), answer(), question())
                : batch(List.of(thread), question(), answer());

        store.store(account, page);

        assertThat(conversation("thread-1")).containsEntry("last_message_at", Timestamp.from(TUESDAY));
    }

    @Test
    void aConversationWithoutMessagesTakesItsActivityTimeOrSortsLast() {
        NormalizedConversation active = new NormalizedConversation("chat-1", ConversationType.GROUP, "Nhóm", null,
                List.of(ALICE), MONDAY);
        NormalizedConversation silent = new NormalizedConversation("chat-2", ConversationType.GROUP, "Nhóm lặng",
                null, List.of(ALICE), null);

        StoreResult result = store.store(account, batch(List.of(active, silent)));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 0);
        assertThat(conversation("chat-1")).containsEntry("last_message_at", Timestamp.from(MONDAY));
        assertThat(conversation("chat-2")).containsEntry("last_message_at", Timestamp.from(Instant.EPOCH));
    }

    @Test
    void aSenderMissingFromTheParticipantsIsAdded() {
        NormalizedMessage fromBob = new NormalizedMessage("m-3", "thread-1", "bob@example.test",
                MessageDirection.INBOUND, MessageType.TEXT, "Chào", MessageStatus.UNKNOWN, false, null, TUESDAY,
                List.of(), Map.of(), null, null);

        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), fromBob));

        assertThat(participants("thread-1")).contains(List.of("bob@example.test", "-", "-", false));
        assertStoredAs(fromBob);
    }

    @Test
    void aParticipantKeepsWhatALaterPageLeavesOut() {
        NormalizedParticipant alice = new NormalizedParticipant("alice@example.test", "Alice", "alice.png", false);
        store.store(account, batch(List.of(thread("Báo cáo", alice, OWNER)), question()));

        NormalizedParticipant anonymous = new NormalizedParticipant("alice@example.test", null, null, false);
        NormalizedParticipant ownerByName = new NormalizedParticipant("owner@gmail.test", "Owner", null, false);
        store.store(account, batch(List.of(thread("Báo cáo", anonymous, ownerByName)), question()));

        assertThat(participants("thread-1")).containsExactly(
                List.of("alice@example.test", "Alice", "alice.png", false),
                List.of("owner@gmail.test", "Owner", "-", true));
    }

    @Test
    void aParticipantTakesANewNameAndPicture() {
        NormalizedParticipant alice = new NormalizedParticipant("alice@example.test", "Alice", "alice.png", false);
        store.store(account, batch(List.of(thread("Báo cáo", alice, OWNER)), question()));

        NormalizedParticipant renamed = new NormalizedParticipant("alice@example.test", "Alice Nguyễn", "a2.png",
                false);
        store.store(account, batch(List.of(thread("Báo cáo", renamed, OWNER)), question()));

        assertThat(participants("thread-1")).first().isEqualTo(List.of("alice@example.test", "Alice Nguyễn",
                "a2.png", false));
    }

    @Test
    void aFileKeepsItsIdAndAFileNoLongerThereIsRemoved() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(REPORT, PHOTO)));
        UUID reportId = attachmentId("m-1", "1");

        StoreResult result = store.store(account, batch(List.of(), question(REPORT)));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(attachments("m-1")).extracting(List::getFirst).containsExactly("1");
        assertThat(attachmentId("m-1", "1")).isEqualTo(reportId);
    }

    @Test
    void aMessageThatLostAllItsFilesHasNone() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(REPORT, PHOTO)));

        StoreResult result = store.store(account, batch(List.of(), question()));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(attachments("m-1")).isEmpty();
    }

    @Test
    void aFileThatChangedIsUpdatedInPlace() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(REPORT)));
        UUID reportId = attachmentId("m-1", "1");
        NormalizedAttachment renamed = new NormalizedAttachment("1", "report-final.pdf", "application/pdf", 4096L,
                "https://files.example.test/1", "https://files.example.test/1/small", null);

        StoreResult result = store.store(account, batch(List.of(), question(renamed)));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(0, 1);
        assertThat(attachmentId("m-1", "1")).isEqualTo(reportId);
        assertThat(attachments("m-1")).containsExactly(List.of("1", "report-final.pdf", "application/pdf", 4096L,
                "https://files.example.test/1", "https://files.example.test/1/small"));
    }

    @Test
    void theSameMailOfTwoAccountsIsStoredTwice() {
        UUID other = UUID.randomUUID();
        SyncBatch page = batch(List.of(thread("Báo cáo", ALICE, OWNER)), question(), answer());
        store.store(account, page);

        StoreResult result = store.store(other, page);

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(2, 0);
        assertThat(count("conversation")).isEqualTo(2);
        assertThat(count("message")).isEqualTo(4);
    }

    @Test
    void aConversationOfUnknownTypeKeepsTheTypeItHad() {
        store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));

        store.store(account, batch(List.of(new NormalizedConversation("thread-1", null, "Báo cáo", null,
                List.of(ALICE), TUESDAY)), question()));
        assertThat(conversation("thread-1")).containsEntry("type", "THREAD");

        store.store(account, batch(List.of(chat(null)), question()));
        assertThat(conversation("thread-1")).containsEntry("type", "GROUP");
    }

    @Test
    void aMessageWithoutSenderHasNone() {
        NormalizedMessage notice = new NormalizedMessage("m-4", "thread-1", null, MessageDirection.INBOUND,
                MessageType.SYSTEM, "Alice đã vào nhóm", MessageStatus.UNKNOWN, true, null, TUESDAY, List.of(),
                Map.of(), null, null);

        StoreResult result = store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), notice));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(1, 0);
        assertStoredAs(notice);
        assertThat(participants("thread-1")).hasSize(2);
    }

    @Test
    void nulCharactersAreLeftOut() {
        NormalizedConversation thread = new NormalizedConversation("thread-1", ConversationType.THREAD,
                "Báo\u0000 cáo", null, List.of(new NormalizedParticipant("alice@example.test", "Ali\u0000ce", null,
                        false)), TUESDAY);
        NormalizedMessage message = new NormalizedMessage("m-1", "thread-1", "b\u0000ob@example.test",
                MessageDirection.INBOUND, MessageType.MIXED, "Xin\u0000 chào", MessageStatus.UNKNOWN, false, null,
                MONDAY, List.of(new NormalizedAttachment("1", "re\u0000port.pdf", "application/pdf", 10L, null, null,
                        null)),
                Map.of("rfcMessageId", "<a\u0000b@example.test>"), new NormalizedRecipients(
                        List.of(new Address("B\u0000ình", "bi\u0000nh@example.test"),
                                new Address("\u0000", "an@example.test")),
                        List.of(new Address("Chi", "\u0000\u0000")), List.of()), null);

        StoreResult result = store.store(account, batch(List.of(thread), message));

        assertThat(result).extracting(StoreResult::newMessages, StoreResult::updatedMessages).containsExactly(1, 0);
        assertThat(conversation("thread-1")).containsEntry("title", "Báo cáo");
        assertThat(participants("thread-1")).extracting(List::getFirst, participant -> participant.get(1))
                .containsExactly(tuple("alice@example.test", "Alice"), tuple("bob@example.test", "-"));
        assertStoredAs(new NormalizedMessage("m-1", "thread-1", "bob@example.test", MessageDirection.INBOUND,
                MessageType.MIXED, "Xin chào", MessageStatus.UNKNOWN, false, null, MONDAY, List.of(),
                Map.of("rfcMessageId", "<ab@example.test>"), new NormalizedRecipients(
                        List.of(new Address("Bình", "binh@example.test"), new Address(null, "an@example.test")),
                        List.of(), List.of()), null));
        assertThat(attachments("m-1")).extracting(file -> file.get(1)).containsExactly("report.pdf");
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void storesOfOneAccountTakeTurnsAndOtherAccountsDoNotWait() throws Exception {
        TransactionTemplate inTransaction = new TransactionTemplate(transactionManager);
        UUID other = UUID.randomUUID();
        CountDownLatch firstStored = new CountDownLatch(1);
        CountDownLatch commitFirst = new CountDownLatch(1);
        // The second page touches no row of the first: only the lock of the account can make it wait.
        NormalizedMessage elsewhere = new NormalizedMessage("m-9", "thread-2", null, MessageDirection.INBOUND,
                MessageType.TEXT, "Khác", MessageStatus.UNKNOWN, false, null, TUESDAY, List.of(), Map.of(), null, null);
        try {
            CompletableFuture<Void> first = CompletableFuture.runAsync(() -> inTransaction.executeWithoutResult(t -> {
                store.store(account, batch(List.of(thread("Báo cáo", ALICE, OWNER)), question()));
                firstStored.countDown();
                await(commitFirst);
            }));
            assertThat(firstStored.await(10, TimeUnit.SECONDS)).isTrue();

            CompletableFuture<StoreResult> sameAccount = CompletableFuture.supplyAsync(
                    () -> inTransaction.execute(t -> store.store(account, batch(List.of(), elsewhere))));
            CompletableFuture<StoreResult> otherAccount = CompletableFuture.supplyAsync(
                    () -> inTransaction.execute(t -> store.store(other, batch(List.of(), elsewhere))));

            assertThat(otherAccount.get(10, TimeUnit.SECONDS)).extracting(StoreResult::newMessages,
                    StoreResult::updatedMessages).containsExactly(1, 0);
            assertThatExceptionOfType(TimeoutException.class)
                    .as("the same account waits for the first store to commit")
                    .isThrownBy(() -> sameAccount.get(1, TimeUnit.SECONDS));
            commitFirst.countDown();
            assertThat(sameAccount.get(10, TimeUnit.SECONDS)).extracting(StoreResult::newMessages,
                    StoreResult::updatedMessages).containsExactly(1, 0);
            first.get(10, TimeUnit.SECONDS);
        } finally {
            commitFirst.countDown();
            jdbc.sql("DELETE FROM conversation WHERE account_id IN (:accounts)")
                    .param("accounts", List.of(account, other)).update();
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void storesOnlyInsideTheCallersTransaction() {
        assertThatExceptionOfType(IllegalTransactionStateException.class)
                .isThrownBy(() -> store.store(account, batch(List.of(), question())));
        assertThat(count("conversation")).isZero();
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private static NormalizedConversation thread(String title, NormalizedParticipant... participants) {
        return new NormalizedConversation("thread-1", ConversationType.THREAD, title, null, List.of(participants),
                TUESDAY);
    }

    private static NormalizedConversation chat(String avatarUrl) {
        return new NormalizedConversation("thread-1", ConversationType.GROUP, "Nhóm", avatarUrl, List.of(ALICE),
                MONDAY);
    }

    private static NormalizedMessage question(NormalizedAttachment... files) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("subject", "Báo cáo tháng 9");
        metadata.put("rfcMessageId", "<report-1@example.test>");
        return new NormalizedMessage("m-1", "thread-1", "alice@example.test", MessageDirection.INBOUND,
                files.length == 0 ? MessageType.TEXT : MessageType.MIXED, "Xin chào,\nĐây là báo cáo.",
                MessageStatus.UNKNOWN, false, null, MONDAY, List.of(files), metadata, ADDRESSEES, null);
    }

    private static NormalizedMessage answer() {
        return new NormalizedMessage("m-2", "thread-1", "owner@gmail.test", MessageDirection.OUTBOUND,
                MessageType.TEXT, "Cảm ơn chị.", MessageStatus.SENT, true, "m-1", TUESDAY, List.of(),
                Map.of("subject", "Re: Báo cáo tháng 9"), null, null);
    }

    // The same message with one field changed.
    private static NormalizedMessage changed(NormalizedMessage m, String field) {
        return new NormalizedMessage(m.externalMessageId(), m.externalConversationId(),
                field.equals("sender") ? "owner@gmail.test" : m.senderExternalParticipantId(),
                field.equals("direction") ? MessageDirection.OUTBOUND : m.direction(),
                field.equals("type") ? MessageType.SYSTEM : m.type(),
                field.equals("text") ? "Xin chào,\nĐây là báo cáo đã sửa." : m.textContent(),
                field.equals("status") ? MessageStatus.DELIVERED : m.status(),
                field.equals("read") != m.read(),
                field.equals("replyTo") ? "m-0" : m.replyToExternalMessageId(),
                field.equals("sentAt") ? MONDAY.plusSeconds(1) : m.sentAt(),
                m.attachments(),
                field.equals("metadata") ? Map.of("subject", "Báo cáo tháng 9", "bulk", "true") : m.metadata(),
                field.equals("recipients") ? new NormalizedRecipients(List.of(new Address(null, "owner@gmail.test")),
                        List.of(), List.of(new Address("Kế toán", "ketoan@example.test"))) : m.recipients(),
                field.equals("html") ? "<p>Xin chào, đây là báo cáo.</p>" : m.htmlContent());
    }

    private static NormalizedMessage withRecipients(NormalizedMessage m, NormalizedRecipients recipients) {
        return new NormalizedMessage(m.externalMessageId(), m.externalConversationId(),
                m.senderExternalParticipantId(), m.direction(), m.type(), m.textContent(), m.status(), m.read(),
                m.replyToExternalMessageId(), m.sentAt(), m.attachments(), m.metadata(), recipients, m.htmlContent());
    }

    private static NormalizedMessage withHtml(NormalizedMessage m, String html) {
        return new NormalizedMessage(m.externalMessageId(), m.externalConversationId(),
                m.senderExternalParticipantId(), m.direction(), m.type(), m.textContent(), m.status(), m.read(),
                m.replyToExternalMessageId(), m.sentAt(), m.attachments(), m.metadata(), m.recipients(), html);
    }

    // "<external id>=<content id>" of each attachment of the message, "-" for a file.
    private List<String> contentIds(String message) {
        return jdbc.sql("""
                select a.external_attachment_id, a.content_id from attachment a join message m on m.id = a.message_id
                join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message order by a.external_attachment_id
                """).param("account", account).param("message", message)
                .query((row, n) -> row.getString(1) + "=" + (row.getString(2) == null ? "-" : row.getString(2)))
                .list();
    }

    // The body format and the HTML kept for the message.
    private List<String> body(String message) {
        return jdbc.sql("""
                select m.body_format, m.html_content from message m join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message
                """).param("account", account).param("message", message)
                .query((row, n) -> java.util.Arrays.asList(row.getString(1), row.getString(2))).single();
    }

    private static SyncBatch batch(List<NormalizedConversation> conversations, NormalizedMessage... messages) {
        return new SyncBatch(conversations, List.of(messages), List.of(), new SyncCursor("next"), false);
    }

    private void assertStoredAs(NormalizedMessage expected) {
        Map<String, Object> row = jdbc.sql("""
                select p.external_participant_id as sender, m.direction, m.type, m.text_content, m.status, m.sent_at,
                       m.reply_to_external_message_id as reply_to, m.metadata = cast(:metadata as jsonb) as same_metadata,
                       coalesce(m.recipients, 'null') = cast(:recipients as jsonb) as same_recipients,
                       m.html_content, m.body_format
                from message m
                join conversation c on c.id = m.conversation_id
                left join conversation_participant p on p.id = m.sender_participant_id
                where c.account_id = :account and m.external_message_id = :id
                """).param("metadata", JSON.writeValueAsString(expected.metadata()))
                .param("recipients", JSON.writeValueAsString(expected.recipients())).param("account", account)
                .param("id", expected.externalMessageId()).query().singleRow();
        assertThat(row).containsEntry("sender", expected.senderExternalParticipantId())
                .containsEntry("direction", expected.direction().name())
                .containsEntry("type", expected.type().name())
                .containsEntry("text_content", expected.textContent())
                .containsEntry("status", expected.status().name())
                .containsEntry("sent_at", Timestamp.from(expected.sentAt()))
                .containsEntry("reply_to", expected.replyToExternalMessageId())
                .containsEntry("same_metadata", true)
                .containsEntry("same_recipients", true)
                .containsEntry("html_content", expected.htmlContent())
                .containsEntry("body_format", expected.htmlContent() == null ? "TEXT" : "HTML");
    }

    private Map<String, Object> conversation(String externalId) {
        return jdbc.sql("select * from conversation where account_id = :account and external_conversation_id = :id")
                .param("account", account).param("id", externalId).query().singleRow();
    }

    // External id, name, avatar and self of each participant, in the order they were first stored; "-" for null.
    private List<List<Object>> participants(String conversation) {
        return jdbc.sql("""
                select p.external_participant_id, coalesce(p.display_name, '-'), coalesce(p.avatar_url, '-'), p.is_self
                from conversation_participant p join conversation c on c.id = p.conversation_id
                where c.account_id = :account and c.external_conversation_id = :conversation order by p.id
                """).param("account", account).param("conversation", conversation)
                .query((rs, n) -> List.<Object>of(rs.getString(1), rs.getString(2), rs.getString(3), rs.getBoolean(4)))
                .list();
    }

    // External id, name, type, size, url and thumbnail of each file, by external id; "-" for null.
    private List<List<Object>> attachments(String message) {
        return jdbc.sql("""
                select a.external_attachment_id, coalesce(a.file_name, '-'), coalesce(a.mime_type, '-'), a.size_bytes,
                       coalesce(a.remote_url, '-'), coalesce(a.thumbnail_url, '-')
                from attachment a join message m on m.id = a.message_id join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message order by a.external_attachment_id
                """).param("account", account).param("message", message)
                .query((rs, n) -> List.<Object>of(rs.getString(1), rs.getString(2), rs.getString(3), rs.getLong(4),
                        rs.getString(5), rs.getString(6)))
                .list();
    }

    private List<Boolean> readState(String message) {
        return jdbc.sql("""
                select m.is_read, m.provider_read from message m join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message
                """).param("account", account).param("message", message)
                .query((rs, n) -> List.of(rs.getBoolean(1), rs.getBoolean(2))).single();
    }

    private UUID messageId(String message) {
        return jdbc.sql("""
                select m.id from message m join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message
                """).param("account", account).param("message", message).query(UUID.class).single();
    }

    private UUID attachmentId(String message, String file) {
        return jdbc.sql("""
                select a.id from attachment a join message m on m.id = a.message_id
                join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message and a.external_attachment_id = :file
                """).param("account", account).param("message", message).param("file", file).query(UUID.class)
                .single();
    }

    // Where the row lives: PostgreSQL writes a new version of a row for every UPDATE, even one that changes nothing.
    private String rowVersion(String message) {
        return jdbc.sql("""
                select m.ctid::text from message m join conversation c on c.id = m.conversation_id
                where c.account_id = :account and m.external_message_id = :message
                """).param("account", account).param("message", message).query(String.class).single();
    }

    private Map<String, String> rowVersions() {
        Map<String, String> versions = new LinkedHashMap<>();
        for (String table : Arrays.asList("conversation", "conversation_participant", "message", "attachment")) {
            jdbc.sql("select id::text, ctid::text from " + table + " order by id")
                    .query((rs, n) -> Map.entry(table + ":" + rs.getString(1), rs.getString(2))).list()
                    .forEach(version -> versions.put(version.getKey(), version.getValue()));
        }
        return versions;
    }

    private long count(String table) {
        return jdbc.sql("select count(*) from " + table).query(Long.class).single();
    }

}
