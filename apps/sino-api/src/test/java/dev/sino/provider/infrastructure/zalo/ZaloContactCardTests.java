package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import dev.sino.provider.infrastructure.zalo.ZaloClient.ContactCard;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/**
 * A Zalo contact card becomes a {@code TEXT} {@code [Danh thiếp] <name>} with the person in {@code metadata}
 * (zalo-location-card, ZC-03, D-530); without a card or a name it stays the unsupported placeholder, and the log never
 * carries a name, number, ID or whole address (D-532).
 */
@ExtendWith(OutputCaptureExtension.class)
class ZaloContactCardTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String AVATAR = "https://s160-26-ava-talk.zadn.vn/9/abc.jpg";
    private static final String QR = "https://qr-talk.zadn.vn/q/abc.png";

    private static NormalizedMessage normalize(ContactCard card) {
        return ZaloMessageNormalizer.normalize(new Message("1001", FRIEND, "USER", FRIEND, "Bình", false,
                "chat.recommended", null, "2026-11-20T08:30:00Z", null, null, null, null, null, null, null, null,
                null, null, card), SELF);
    }

    @Test
    void aFullCardKeepsThePersonInMetadataAndIsNamedInTheText() {
        NormalizedMessage message = normalize(new ContactCard("7189952051322871019", "Jason Lê", AVATAR, "0901234567",
                QR));

        assertThat(message.type()).isEqualTo(MessageType.TEXT);
        assertThat(message.textContent()).isEqualTo("[Danh thiếp] Jason Lê");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.recommended",
                NormalizedMessage.CONTACT_NAME, "Jason Lê",
                NormalizedMessage.CONTACT_AVATAR_URL, AVATAR,
                NormalizedMessage.CONTACT_PHONE, "0901234567",
                NormalizedMessage.CONTACT_QR_URL, QR,
                NormalizedMessage.CONTACT_USER_ID, "7189952051322871019"));
    }

    @Test
    void aCardWithOnlyANameHasOnlyTheName() {
        NormalizedMessage message = normalize(new ContactCard(null, "  Jason   Lê ", null, " ", null));

        assertThat(message.textContent()).isEqualTo("[Danh thiếp] Jason Lê");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.recommended", NormalizedMessage.CONTACT_NAME, "Jason   Lê"));
    }

    @Test
    void aCardWithoutANameOrWithoutACardStaysTheUnsupportedPlaceholderAsBefore() {
        for (ContactCard none : new ContactCard[] {null, new ContactCard("7", null, null, null, null),
                new ContactCard("7", "   ", AVATAR, "0901234567", QR)}) {
            NormalizedMessage message = normalize(none);

            assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
            assertThat(message.textContent()).isEqualTo("[Tin Zalo chưa hỗ trợ]");
            assertThat(message.metadata()).containsExactlyEntriesOf(Map.of("zaloType", "chat.recommended"));
        }
    }

    @Test
    void picturesOutsideZaloDomainsAreDroppedAndWarnedAboutByHostAloneAndTheRealAvatarHostPasses(
            CapturedOutput output) {
        NormalizedMessage kept = normalize(new ContactCard("7", "A", AVATAR, null, null));
        NormalizedMessage dropped = normalize(new ContactCard("7", "A", "https://evil.example.com/p/token-abc123.jpg",
                null, "https://qr.example.org/secret-qr/q.png"));

        assertThat(kept.metadata()).containsEntry(NormalizedMessage.CONTACT_AVATAR_URL, AVATAR);
        assertThat(dropped.metadata()).doesNotContainKeys(NormalizedMessage.CONTACT_AVATAR_URL,
                NormalizedMessage.CONTACT_QR_URL);
        assertThat(dropped.type()).isEqualTo(MessageType.TEXT);
        assertThat(output.getAll()).contains("evil.example.com", "qr.example.org").doesNotContain("token-abc123")
                .doesNotContain("secret-qr");
    }

    @Test
    void aProviderIdThatIsNotWholeDigitsIsNotKeptAndTooLongNameAndPhoneAreCut() {
        NormalizedMessage message = normalize(new ContactCard("abc-1", "n".repeat(250), null, "9".repeat(50), null));

        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.CONTACT_USER_ID);
        assertThat(message.metadata().get(NormalizedMessage.CONTACT_NAME)).hasSize(200);
        assertThat(message.metadata().get(NormalizedMessage.CONTACT_PHONE)).hasSize(32);
    }

    @Test
    void theLogCarriesNeitherNameNorPhoneNorIdOfTheCard(CapturedOutput output) {
        normalize(new ContactCard("7189952051322871019", "Quán Bí Mật", "https://evil.example.com/a.jpg", "0987654321",
                "https://evil.example.com/q.png"));

        assertThat(output.getAll()).doesNotContain("Quán Bí Mật").doesNotContain("0987654321")
                .doesNotContain("7189952051322871019").doesNotContain("a.jpg").doesNotContain("q.png");
    }

    @Test
    void aCardMessageKeepsItsRawContentSoItCanStillBeQuoted() {
        Message raw = new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "chat.recommended", null,
                "2026-11-20T08:30:00Z", null, null, null, "123456", 0, null,
                JsonMapper.builder().build().readTree("{\"title\":\"x\"}"), null, null, null,
                new ContactCard("7", "A", null, null, null));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(raw, SELF);

        assertThat(message.metadata()).containsKey(NormalizedMessage.RAW_CONTENT)
                .containsEntry(NormalizedMessage.MSG_TYPE, "chat.recommended");
    }

    @Test
    void theCardOfAMessageIsReadFromJsonAndAMessageWithoutOneHasNone() {
        String json = """
                {"msgId":"1","threadId":"t","threadType":"USER","fromId":"f","fromName":"B","isSelf":false,
                 "zaloType":"chat.recommended","text":null,"sentAt":"2026-11-20T08:30:00Z",
                 "contactCard":{"userId":"7","name":"Jason","avatarUrl":null,"phone":"0901","qrUrl":null,"extra":1}}""";
        String older = """
                {"msgId":"1","threadId":"t","threadType":"USER","fromId":"f","fromName":"B","isSelf":false,
                 "zaloType":"webchat","text":"hi","sentAt":"2026-11-20T08:30:00Z"}""";
        JsonMapper mapper = JsonMapper.builder().build();

        assertThat(mapper.readValue(json, Message.class).contactCard())
                .isEqualTo(new ContactCard("7", "Jason", null, "0901", null));
        assertThat(mapper.readValue(older, Message.class).contactCard()).isNull();
    }

}
