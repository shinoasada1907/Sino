package dev.sino.conversation.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.conversation.ConversationStore;
import dev.sino.conversation.StoreResult;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * What a conversation shows (BE-43): its summary worked out from the stored messages, the read state (D-67), the
 * archive (D-67) and "needs reply" (D-68), in a real PostgreSQL.
 */
@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, JdbcConversationStore.class })
@ActiveProfiles("test")
class ConversationSummaryTests {

    private static final Instant MONDAY = Instant.parse("2026-10-05T08:00:00Z");
    private static final Instant TUESDAY = Instant.parse("2026-10-06T08:00:00Z");
    private static final Instant WEDNESDAY = Instant.parse("2026-10-07T08:00:00Z");
    private static final Instant THURSDAY = Instant.parse("2026-10-08T08:00:00Z");
    private static final NormalizedParticipant ALICE = new NormalizedParticipant("alice@example.test", "Alice",
            null, false);
    private static final NormalizedParticipant OWNER = new NormalizedParticipant("owner@gmail.test", null, null,
            true);

    @Autowired
    private ConversationStore store;

    @Autowired
    private JdbcClient jdbc;

    private final UUID account = UUID.randomUUID();

    @Test
    void theSummaryComesFromTheStoredMessages() {
        NormalizedMessage question = mail("m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY, "Gửi chị",
                false, Map.of(), new NormalizedAttachment("1", "report.pdf", "application/pdf", 10L, null, null));
        NormalizedMessage answer = mail("m-2", MessageDirection.OUTBOUND, "owner@gmail.test", TUESDAY, "Cảm ơn",
                true, Map.of());

        store.store(account, batch(List.of(thread("Báo cáo")), question, answer));

        assertThat(summary()).containsEntry("last_message_at", Timestamp.from(TUESDAY))
                .containsEntry("last_message_preview", "Cảm ơn")
                .containsEntry("last_message_from", "owner@gmail.test")
                .containsEntry("counterpart", "Alice")
                .containsEntry("unread_count", 1)
                .containsEntry("has_attachments", true)
                .containsEntry("needs_reply", false);
    }

    @Test
    void eachConversationOfAPageHasItsOwnSummary() {
        NormalizedConversation other = new NormalizedConversation("thread-2", ConversationType.THREAD, "Khác", null,
                List.of(new NormalizedParticipant("bob@example.test", "Bob", null, false), OWNER), null);
        NormalizedMessage fromBob = new NormalizedMessage("m-9", "thread-2", "bob@example.test",
                MessageDirection.INBOUND, MessageType.MIXED, "Của Bob", MessageStatus.UNKNOWN, false, null, THURSDAY,
                List.of(new NormalizedAttachment("1", "bob.pdf", "application/pdf", 10L, null, null)), Map.of());

        store.store(account, batch(List.of(thread("Báo cáo"), other), inbound("m-1", MONDAY),
                mail("m-2", MessageDirection.INBOUND, "alice@example.test", TUESDAY, "Thư m-2", true, Map.of()),
                outbound("m-3", WEDNESDAY), fromBob));

        assertThat(summary()).containsEntry("unread_count", 1).containsEntry("has_attachments", false)
                .containsEntry("counterpart", "Alice").containsEntry("needs_reply", false)
                .containsEntry("last_message_at", Timestamp.from(WEDNESDAY));
        assertThat(summary("thread-2")).containsEntry("unread_count", 1).containsEntry("has_attachments", true)
                .containsEntry("counterpart", "Bob").containsEntry("needs_reply", true)
                .containsEntry("last_message_at", Timestamp.from(THURSDAY));
    }

    @Test
    void aMessageThatLostItsLastFileLeavesNoFileInTheConversation() {
        NormalizedAttachment file = new NormalizedAttachment("1", "report.pdf", "application/pdf", 10L, null, null);
        store.store(account, batch(List.of(thread("Báo cáo")), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, "Thư m-1", false, Map.of(), file)));
        assertThat(summary()).containsEntry("has_attachments", true);

        store.store(account, batch(List.of(), inbound("m-1", MONDAY)));

        assertThat(summary()).containsEntry("has_attachments", false);
    }

    @Test
    void aPageWithOnlyAnOldMessageNowReadLeavesTheRestAsItWas() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY), inbound("m-2", TUESDAY),
                inbound("m-3", WEDNESDAY)));
        NormalizedMessage oldOneRead = mail("m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY,
                "Thư m-1", true, Map.of());

        StoreResult result = store.store(account, batch(List.of(thread("Tiêu đề cũ")), oldOneRead));

        assertThat(result).isEqualTo(new StoreResult(0, 1));
        assertThat(summary()).containsEntry("unread_count", 2)
                .containsEntry("last_message_at", Timestamp.from(WEDNESDAY))
                .containsEntry("last_message_preview", "Thư m-3")
                .containsEntry("last_message_from", "Alice")
                .containsEntry("title", "Báo cáo");
    }

    @Test
    void theTitleFollowsAPageWithNewerMail() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY)));

        store.store(account, batch(List.of(thread("Báo cáo, bản 2")), inbound("m-2", TUESDAY)));
        assertThat(summary()).containsEntry("title", "Báo cáo, bản 2");

        store.store(account, batch(List.of(thread(null)), inbound("m-3", WEDNESDAY)));
        assertThat(summary()).as("a newer page without a title keeps the one there is")
                .containsEntry("title", "Báo cáo, bản 2");
    }

    @Test
    void thePreviewIsTheStartOfTheNewestTextWithSpacesCollapsed() {
        String text = "  Xin   chào\n\n\tchị\u00a0Alice,  " + "a".repeat(250);

        store.store(account, batch(List.of(thread("Báo cáo")), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, text, false, Map.of())));

        String expected = ("Xin chào chị Alice, " + "a".repeat(250)).substring(0, 200);
        assertThat(summary()).containsEntry("last_message_preview", expected);
    }

    @Test
    void aPreviewCutAtASpaceDoesNotEndWithIt() {
        String text = "a".repeat(199) + " b";

        store.store(account, batch(List.of(thread("Báo cáo")), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, text, false, Map.of())));

        assertThat(summary()).containsEntry("last_message_preview", "a".repeat(199));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { " \n\t\u00a0 " })
    void mailWithoutTextHasNoPreview(String text) {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY),
                mail("m-2", MessageDirection.INBOUND, "alice@example.test", TUESDAY, text, false, Map.of())));

        assertThat(summary()).containsEntry("last_message_preview", null);
    }

    @ParameterizedTest
    @CsvSource({ "INBOUND, false, true", "INBOUND, true, false", "OUTBOUND, false, false" })
    void needsReplyWhenTheNewestMailIsFromSomeoneAndNotBulk(MessageDirection direction, boolean bulk,
            boolean needsReply) {
        NormalizedMessage newest = mail("m-2", direction, direction == MessageDirection.INBOUND ? "alice@example.test"
                : "owner@gmail.test", TUESDAY, "Mới nhất", true, bulk ? Map.of("bulk", "true") : Map.of());

        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY), newest));

        assertThat(summary()).containsEntry("needs_reply", needsReply);
    }

    @Test
    void anOlderBulkMailDoesNotMatter() {
        NormalizedMessage newsletter = mail("m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY, "Bản tin",
                false, Map.of("bulk", "true"));

        store.store(account, batch(List.of(thread("Báo cáo")), newsletter, inbound("m-2", TUESDAY)));

        assertThat(summary()).containsEntry("needs_reply", true);
    }

    @Test
    void theCounterpartIsTheNewestSenderFromOutside() {
        NormalizedParticipant bob = new NormalizedParticipant("bob@example.test", null, null, false);
        NormalizedConversation thread = new NormalizedConversation("thread-1", ConversationType.THREAD, "Báo cáo",
                null, List.of(OWNER, ALICE, bob), THURSDAY);

        store.store(account, batch(List.of(thread), inbound("m-1", MONDAY),
                mail("m-2", MessageDirection.INBOUND, "bob@example.test", TUESDAY, "Bob đây", false, Map.of()),
                outbound("m-3", WEDNESDAY)));

        assertThat(summary()).as("the newest inbound sender, by ID when it has no name")
                .containsEntry("counterpart", "bob@example.test")
                .containsEntry("last_message_from", "owner@gmail.test");
    }

    @Test
    void withoutMailFromOutsideTheCounterpartIsTheFirstParticipantWhoIsNotTheAccount() {
        NormalizedConversation thread = new NormalizedConversation("thread-1", ConversationType.THREAD, "Báo cáo",
                null, List.of(OWNER, ALICE), THURSDAY);

        store.store(account, batch(List.of(thread), outbound("m-1", MONDAY)));

        assertThat(summary()).containsEntry("counterpart", "Alice");
    }

    @Test
    void mailWithoutSenderHasNoSenderInTheSummary() {
        store.store(account, batch(List.of(thread("Nhóm")), inbound("m-1", MONDAY),
                mail("m-2", MessageDirection.INBOUND, null, TUESDAY, "Alice đã vào nhóm", true, Map.of())));

        assertThat(summary()).containsEntry("last_message_from", null).containsEntry("counterpart", "Alice");
    }

    @Test
    void readInSinoStaysReadWhenGmailSaysUnreadAgain() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY)));
        jdbc.sql("UPDATE message SET is_read = true").update();

        StoreResult unchanged = store.store(account, batch(List.of(), inbound("m-1", MONDAY)));
        assertThat(unchanged).isEqualTo(new StoreResult(0, 0));
        assertThat(readState("m-1")).containsExactly(true, false);

        // Gmail sends the message again for another change (a label), still unread: the row is written this time.
        StoreResult relabelled = store.store(account, batch(List.of(), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, "Thư m-1", false, Map.of("bulk", "true"))));
        assertThat(relabelled).isEqualTo(new StoreResult(0, 1));
        assertThat(readState("m-1")).containsExactly(true, false);
        assertThat(summary()).containsEntry("unread_count", 0);
    }

    @Test
    void readOnGmailIsReadInSino() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY)));

        StoreResult result = store.store(account, batch(List.of(), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, "Thư m-1", true, Map.of())));

        assertThat(result).isEqualTo(new StoreResult(0, 1));
        assertThat(readState("m-1")).containsExactly(true, true);
        assertThat(summary()).containsEntry("unread_count", 0);
    }

    @Test
    void unreadOnGmailIsUnreadInSino() {
        store.store(account, batch(List.of(thread("Báo cáo")), mail("m-1", MessageDirection.INBOUND,
                "alice@example.test", MONDAY, "Thư m-1", true, Map.of())));
        assertThat(readState("m-1")).containsExactly(true, true);

        StoreResult result = store.store(account, batch(List.of(), inbound("m-1", MONDAY)));

        assertThat(result).isEqualTo(new StoreResult(0, 1));
        assertThat(readState("m-1")).containsExactly(false, false);
        assertThat(summary()).containsEntry("unread_count", 1);
    }

    @Test
    void unreadInSinoStaysUnreadUntilGmailChanges() {
        NormalizedMessage read = mail("m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY, "Thư m-1", true,
                Map.of());
        store.store(account, batch(List.of(thread("Báo cáo")), read));
        jdbc.sql("UPDATE message SET is_read = false").update();

        store.store(account, batch(List.of(), mail("m-1", MessageDirection.INBOUND, "alice@example.test", MONDAY,
                "Thư m-1, đã sửa", true, Map.of())));
        assertThat(readState("m-1")).as("Gmail still says read, with another change").containsExactly(false, true);

        store.store(account, batch(List.of(), inbound("m-1", MONDAY)));
        assertThat(readState("m-1")).as("Gmail now says unread").containsExactly(false, false);
        store.store(account, batch(List.of(), read));
        assertThat(readState("m-1")).as("and then read again").containsExactly(true, true);
    }

    @Test
    void newMailFromSomeoneBringsAnArchivedConversationBack() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY)));
        archive();

        store.store(account, batch(List.of(), inbound("m-2", TUESDAY)));

        assertThat(summary()).containsEntry("archived", false);
    }

    @Test
    void theAccountsOwnNewMailKeepsItArchived() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-1", MONDAY)));
        archive();

        store.store(account, batch(List.of(), outbound("m-2", TUESDAY)));

        assertThat(summary()).containsEntry("archived", true);
    }

    @Test
    void olderOrKnownMailKeepsItArchived() {
        store.store(account, batch(List.of(thread("Báo cáo")), inbound("m-2", TUESDAY)));
        archive();

        store.store(account, batch(List.of(), inbound("m-1", MONDAY), mail("m-2", MessageDirection.INBOUND,
                "alice@example.test", TUESDAY, "Thư m-2 đã sửa", false, Map.of())));

        assertThat(summary()).containsEntry("archived", true);
    }

    @Test
    void aConversationWithoutMessagesKeepsItsTime() {
        NormalizedConversation silent = new NormalizedConversation("thread-1", ConversationType.GROUP, "Nhóm", null,
                List.of(ALICE), MONDAY);

        store.store(account, batch(List.of(silent)));

        assertThat(summary()).containsEntry("last_message_at", Timestamp.from(MONDAY))
                .containsEntry("unread_count", 0).containsEntry("needs_reply", false)
                .containsEntry("counterpart", "Alice");
    }

    private void archive() {
        jdbc.sql("UPDATE conversation SET archived = true WHERE account_id = :account").param("account", account)
                .update();
    }

    private Map<String, Object> summary() {
        return summary("thread-1");
    }

    private Map<String, Object> summary(String conversation) {
        return jdbc.sql("""
                SELECT title, last_message_at, last_message_preview, last_message_from, counterpart, unread_count,
                       has_attachments, needs_reply, archived
                FROM conversation WHERE account_id = :account AND external_conversation_id = :conversation
                """).param("account", account).param("conversation", conversation).query().singleRow();
    }

    private List<Boolean> readState(String message) {
        return jdbc.sql("""
                SELECT m.is_read, m.provider_read FROM message m JOIN conversation c ON c.id = m.conversation_id
                WHERE c.account_id = :account AND m.external_message_id = :message
                """).param("account", account).param("message", message)
                .query((row, n) -> List.of(row.getBoolean(1), row.getBoolean(2))).single();
    }

    private static NormalizedConversation thread(String title) {
        return new NormalizedConversation("thread-1", ConversationType.THREAD, title, null, List.of(ALICE, OWNER),
                null);
    }

    private static NormalizedMessage inbound(String id, Instant sentAt) {
        return mail(id, MessageDirection.INBOUND, "alice@example.test", sentAt, "Thư " + id, false, Map.of());
    }

    private static NormalizedMessage outbound(String id, Instant sentAt) {
        return mail(id, MessageDirection.OUTBOUND, "owner@gmail.test", sentAt, "Trả lời " + id, true, Map.of());
    }

    private static NormalizedMessage mail(String id, MessageDirection direction, String sender, Instant sentAt,
            String text, boolean read, Map<String, String> metadata, NormalizedAttachment... files) {
        return new NormalizedMessage(id, "thread-1", sender, direction, MessageType.TEXT, text,
                direction == MessageDirection.OUTBOUND ? MessageStatus.SENT : MessageStatus.UNKNOWN, read, null,
                sentAt, List.of(files), metadata);
    }

    private static SyncBatch batch(List<NormalizedConversation> conversations, NormalizedMessage... messages) {
        return new SyncBatch(conversations, List.of(messages), List.of(), new SyncCursor("next"), false);
    }

}
