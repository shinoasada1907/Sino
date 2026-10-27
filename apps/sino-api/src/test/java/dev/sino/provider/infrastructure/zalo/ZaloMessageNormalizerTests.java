package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Conversation;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.MessagePage;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Participant;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/** Normalizing what sino-zalo sends back for GET /accounts/{accountId}/messages (D-279, ZL-08). */
class ZaloMessageNormalizerTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String GROUP = "300000000000000003";
    private static final String SENT_AT = "2026-10-17T08:30:00Z";

    @Test
    void anInboundTextMessageBecomesUnreadInboundText() {
        Message raw = new Message("1001", FRIEND, "USER", FRIEND, "Nguyễn Văn B", false,
                "webchat", "Xin chào bạn!", SENT_AT);

        NormalizedMessage message = ZaloMessageNormalizer.normalize(raw, SELF);

        assertThat(message.externalMessageId()).isEqualTo("1001");
        assertThat(message.externalConversationId()).isEqualTo(FRIEND);
        assertThat(message.senderExternalParticipantId()).isEqualTo(FRIEND);
        assertThat(message.direction()).isEqualTo(MessageDirection.INBOUND);
        assertThat(message.status()).isEqualTo(MessageStatus.UNKNOWN);
        assertThat(message.read()).isFalse();
        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.textContent()).isEqualTo("Xin chào bạn!");
        assertThat(message.htmlContent()).isNull();
        assertThat(message.recipients()).isNull();
        assertThat(message.attachments()).isEmpty();
        assertThat(message.sentAt()).isEqualTo(Instant.parse(SENT_AT));
        assertThat(message.metadata()).isEmpty();
    }

    @Test
    void anOwnMessageBecomesSentAndReadFromTheAccount() {
        Message raw = new Message("1002", FRIEND, "USER", SELF, "Tôi", true,
                "webchat", "Chào anh!", SENT_AT);

        NormalizedMessage message = ZaloMessageNormalizer.normalize(raw, SELF);

        assertThat(message.direction()).isEqualTo(MessageDirection.OUTBOUND);
        assertThat(message.status()).isEqualTo(MessageStatus.SENT);
        assertThat(message.read()).isTrue();
        assertThat(message.senderExternalParticipantId()).isEqualTo(SELF);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "chat.photo     | IMAGE   | [Ảnh]",
        "chat.sticker   | UNKNOWN | [Sticker]",
        "share.file     | FILE    | [Tệp]",
        "chat.voice     | AUDIO   | [Tin nhắn thoại]",
        "chat.video.msg | UNKNOWN | [Tin Zalo chưa hỗ trợ]",
        "chat.location  | UNKNOWN | [Tin Zalo chưa hỗ trợ]"
    })
    void aNonTextMessageGetsItsVietnamesePlaceholderAndKeepsItsZaloType(String zaloType, MessageType expectedType,
            String placeholder) {
        Message raw = new Message("1003", GROUP, "GROUP", FRIEND, "Bình", false, zaloType, null, SENT_AT);

        NormalizedMessage message = ZaloMessageNormalizer.normalize(raw, SELF);

        assertThat(message.type()).isEqualTo(expectedType);
        assertThat(message.textContent()).isEqualTo(placeholder);
        assertThat(message.metadata()).containsExactly(Map.entry("zaloType", zaloType));
    }

    @Test
    void aLongTextIsCutAt100000CharactersWithoutSplittingASurrogatePair() {
        String overLimit = "a".repeat(ZaloMessageNormalizer.MAX_TEXT_LENGTH + 25);
        Message longMsg = new Message("1004", FRIEND, "USER", FRIEND, "Bình", false, "webchat", overLimit, SENT_AT);

        assertThat(ZaloMessageNormalizer.normalize(longMsg, SELF).textContent())
                .hasSize(ZaloMessageNormalizer.MAX_TEXT_LENGTH);

        String emojiOnBoundary = "a".repeat(ZaloMessageNormalizer.MAX_TEXT_LENGTH - 1) + "😀😀";
        Message emojiMsg = new Message("1005", FRIEND, "USER", FRIEND, "Bình", false,
                "webchat", emojiOnBoundary, SENT_AT);

        assertThat(ZaloMessageNormalizer.normalize(emojiMsg, SELF).textContent())
                .isEqualTo("a".repeat(ZaloMessageNormalizer.MAX_TEXT_LENGTH - 1));
    }

    @Test
    void nulCharactersAreRemovedFromTextAndMetadataAndNames() {
        Message raw = new Message("10\u000006", FRIEND, "USER", FRIEND, "Bình\u0000", false,
                "webchat", "Xin\u0000 chào", SENT_AT);
        Conversation conv = new Conversation(FRIEND, "USER", "Bình\u0000 Nguyễn", "https://avatar.test/a\u0000.jpg",
                List.of(new Participant(FRIEND, "Bình\u0000")));
        MessagePage page = new MessagePage(List.of(conv), List.of(raw), "1006", false);

        SyncBatch batch = ZaloMessageNormalizer.normalize(page, SELF, null, SyncCursor.initial());

        assertThat(batch.messages()).singleElement().satisfies(message -> {
            assertThat(message.externalMessageId()).isEqualTo("1006");
            assertThat(message.textContent()).isEqualTo("Xin chào");
        });
        assertThat(batch.conversations()).singleElement().satisfies(conversation -> {
            assertThat(conversation.title()).isEqualTo("Bình Nguyễn");
            assertThat(conversation.avatarUrl()).isEqualTo("https://avatar.test/a.jpg");
            assertThat(conversation.participants()).filteredOn(p -> p.externalParticipantId().equals(FRIEND))
                    .singleElement().extracting(NormalizedParticipant::displayName).isEqualTo("Bình");
        });
    }

    @Test
    void userAndGroupConversationsAreNormalizedWithParticipantsAndActivity() {
        Message directMsg = new Message("1001", FRIEND, "USER", FRIEND, "Nguyễn Văn B", false,
                "webchat", "Chào bạn", "2026-10-17T08:00:00Z");
        Message groupFirst = new Message("1002", GROUP, "GROUP", FRIEND, "Nguyễn Văn B", false,
                "webchat", "Họp nhóm nhé", "2026-10-17T08:05:00Z");
        Message groupSecond = new Message("1003", GROUP, "GROUP", SELF, "Tôi", true,
                "webchat", "Ok anh", "2026-10-17T08:10:00Z");
        Conversation directConv = new Conversation(FRIEND, "USER", "Nguyễn Văn B", "https://ava.zalo.test/b.jpg",
                List.of(new Participant(FRIEND, "Nguyễn Văn B")));
        Conversation groupConv = new Conversation(GROUP, "GROUP", "Nhóm Dự Án", "https://ava.zalo.test/g.jpg",
                List.of(new Participant(FRIEND, "Nguyễn Văn B"), new Participant(SELF, "Tôi")));
        MessagePage page = new MessagePage(List.of(directConv, groupConv),
                List.of(directMsg, groupFirst, groupSecond), "1003", false);

        SyncBatch batch = ZaloMessageNormalizer.normalize(page, SELF, null, SyncCursor.initial());

        assertThat(batch.conversations()).hasSize(2);
        NormalizedConversation direct = batch.conversations().get(0);
        assertThat(direct.externalConversationId()).isEqualTo(FRIEND);
        assertThat(direct.type()).isEqualTo(ConversationType.DIRECT);
        assertThat(direct.title()).isEqualTo("Nguyễn Văn B");
        assertThat(direct.avatarUrl()).isEqualTo("https://ava.zalo.test/b.jpg");
        assertThat(direct.lastActivityAt()).isEqualTo(Instant.parse("2026-10-17T08:00:00Z"));
        assertThat(direct.participants()).containsExactlyInAnyOrder(
                new NormalizedParticipant(FRIEND, "Nguyễn Văn B", null, false),
                new NormalizedParticipant(SELF, null, null, true));

        NormalizedConversation group = batch.conversations().get(1);
        assertThat(group.externalConversationId()).isEqualTo(GROUP);
        assertThat(group.type()).isEqualTo(ConversationType.GROUP);
        assertThat(group.title()).isEqualTo("Nhóm Dự Án");
        assertThat(group.lastActivityAt()).isEqualTo(Instant.parse("2026-10-17T08:10:00Z"));
        assertThat(group.participants()).containsExactlyInAnyOrder(
                new NormalizedParticipant(FRIEND, "Nguyễn Văn B", null, false),
                new NormalizedParticipant(SELF, "Tôi", null, true));
    }

    @Test
    void aParticipantKeepsThePictureSinoZaloGaveItLikeItsName() {
        Message fromBinh = new Message("1001", GROUP, "GROUP", FRIEND, "Bình", false, "webchat", "Chào", SENT_AT);
        Conversation conv = new Conversation(GROUP, "GROUP", "Nhóm", null, List.of(
                new Participant(FRIEND, "Bình", "https://ava.zalo.test/binh.jpg"),
                new Participant("200000000000000009", "Lan", null),
                new Participant("200000000000000010", null, " \u0000 ")));
        MessagePage page = new MessagePage(List.of(conv), List.of(fromBinh), "1001", false);

        SyncBatch batch = ZaloMessageNormalizer.normalize(page, SELF, null, SyncCursor.initial());

        assertThat(batch.conversations()).singleElement().satisfies(group -> assertThat(group.participants())
                .as("the sender of the message has no picture of its own: the listed one stays")
                .containsExactlyInAnyOrder(
                        new NormalizedParticipant(FRIEND, "Bình", "https://ava.zalo.test/binh.jpg", false),
                        new NormalizedParticipant("200000000000000009", "Lan", null, false),
                        new NormalizedParticipant("200000000000000010", null, null, false),
                        new NormalizedParticipant(SELF, null, null, true)));
    }

    @Test
    void aParticipantListedTwiceTakesTheFirstPictureThatIsNotNull() {
        Message fromBinh = new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "webchat", "Chào", SENT_AT);
        Conversation conv = new Conversation(FRIEND, "USER", "Bình", null, List.of(
                new Participant(FRIEND, null, null),
                new Participant(FRIEND, "Bình", "https://ava.zalo.test/first.jpg"),
                new Participant(FRIEND, "Binh", "https://ava.zalo.test/second.jpg")));
        MessagePage page = new MessagePage(List.of(conv), List.of(fromBinh), "1001", false);

        SyncBatch batch = ZaloMessageNormalizer.normalize(page, SELF, null, SyncCursor.initial());

        assertThat(batch.conversations()).singleElement().satisfies(direct -> assertThat(direct.participants())
                .filteredOn(p -> p.externalParticipantId().equals(FRIEND)).singleElement()
                .isEqualTo(new NormalizedParticipant(FRIEND, "Bình", "https://ava.zalo.test/first.jpg", false)));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = { "  ", "\u0000" })
    void aMessageWithoutMsgIdOrThreadIdOrFromIdOrZaloTypeCannotBeNormalized(String blank) {
        assertThatNormalizationFails(new Message(blank, FRIEND, "USER", FRIEND, "B", false, "webchat", "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", blank, "USER", FRIEND, "B", false, "webchat", "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", FRIEND, blank, FRIEND, "B", false, "webchat", "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", FRIEND, "CHANNEL", FRIEND, "B", false, "webchat", "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", FRIEND, "USER", blank, "B", false, "webchat", "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", FRIEND, "USER", FRIEND, "B", false, blank, "Hi", SENT_AT));
        assertThatNormalizationFails(new Message("1", FRIEND, "USER", FRIEND, "B", false, "webchat", "Hi", blank));
        assertThatNormalizationFails(new Message("1", FRIEND, "USER", FRIEND, "B", false, "webchat", "Hi", "not-iso"));
        assertThatNormalizationFails(new Message("1", FRIEND, "USER", FRIEND, "B", false, "webchat", null, SENT_AT));
    }

    @Test
    void aBrokenMessageOnAPageBecomesASkippedItemAndTheValidOnesStay() {
        Message first = new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "webchat", "Chào", SENT_AT);
        Message broken = new Message("1002", FRIEND, "USER", null, "Bình", false, "webchat", "Thiếu người gửi", SENT_AT);
        Message third = new Message("1003", FRIEND, "USER", SELF, "Tôi", true, "chat.photo", null, SENT_AT);
        Conversation conv = new Conversation(FRIEND, "USER", "Bình", null, List.of(new Participant(FRIEND, "Bình")));
        MessagePage page = new MessagePage(List.of(conv), List.of(first, broken, third), "1003", false);

        SyncBatch batch = ZaloMessageNormalizer.normalize(page, SELF, null, SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("1001", "1003");
        assertThat(batch.skipped()).singleElement().satisfies(skipped -> {
            assertThat(skipped.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
            assertThat(skipped.externalId()).isEqualTo("1002");
            assertThat(skipped.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        });
    }

    private static ThrowableAssertAlternative<ProviderException> assertThatNormalizationFails(Message message) {
        return assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> ZaloMessageNormalizer.normalize(message, SELF))
                .satisfies(failure -> assertThat(failure.errorCode())
                        .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED));
    }

}
