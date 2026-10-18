package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sticker;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/** The picture of a Zalo sticker message reaches {@code metadata}, and only when its address is safe to show (D-279). */
class ZaloStickerTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String SENT_AT = "2026-10-17T08:30:00Z";
    private static final String PICTURE = "https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236";

    private static Message sticker(Sticker sticker) {
        return new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "chat.sticker", null, SENT_AT, sticker);
    }

    @Test
    void aStickerWithItsPictureKeepsTheAddressAndTheIdsInMetadataAndStaysAPlaceholderInText() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(new Sticker("11236", "3341", 7, PICTURE)),
                SELF);

        assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
        assertThat(message.textContent()).isEqualTo("[Sticker]");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.sticker",
                NormalizedMessage.STICKER_URL, PICTURE,
                "stickerId", "11236",
                "stickerCatId", "3341"));
    }

    @Test
    void aStickerWithNoPictureYetIsStillAPlaceholderWithItsIds() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(new Sticker("11236", "3341", 7, null)),
                SELF);

        assertThat(message.textContent()).isEqualTo("[Sticker]");
        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.STICKER_URL)
                .containsEntry("stickerId", "11236").containsEntry("zaloType", "chat.sticker");
    }

    @Test
    void aStickerWithoutAStickerObjectBehavesAsBefore() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(null), SELF);

        assertThat(message.textContent()).isEqualTo("[Sticker]");
        assertThat(message.metadata()).containsExactly(Map.entry("zaloType", "chat.sticker"));
    }

    @Test
    void theOldNineValueConstructorStillMakesAMessageWithoutASticker() {
        Message message = new Message("1", FRIEND, "USER", FRIEND, "Bình", false, "chat.sticker", null, SENT_AT);

        assertThat(message.sticker()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://zalo-api.zadn.vn/a.webp",
        "https://zfcloud.zdn.vn/a.png",
        "https://b-api.zaloapp.com/a.png",
        "https://ZALO-API.ZADN.VN/a.webp" })
    void anHttpsAddressOnAZaloHostIsKept(String url) {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(new Sticker("1", "2", 7, url)), SELF);

        assertThat(message.metadata()).containsEntry(NormalizedMessage.STICKER_URL, url);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        "   ",
        "http://zalo-api.zadn.vn/a.webp",
        "javascript:alert(1)",
        "data:image/svg+xml;base64,PHN2Zz4=",
        "//zalo-api.zadn.vn/a.webp",
        "https://evil.example.com/a.webp",
        "https://zadn.vn.evil.com/a.webp",
        "https://evilzadn.vn/a.webp",
        "https://zalo-api.zadn.vn@evil.example.com/a.webp",
        "https://user:pw@zalo-api.zadn.vn/a.webp",
        "https://zalo-api.zadn.vn/a b.webp",
        "not a url" })
    void anyOtherAddressIsLeftOut(String url) {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(new Sticker("1", "2", 7, url)), SELF);

        assertThat(message.textContent()).isEqualTo("[Sticker]");
        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.STICKER_URL);
    }

    @Test
    void anAddressOverTwoThousandCharactersIsLeftOut() {
        String url = "https://zalo-api.zadn.vn/" + "a".repeat(2_000);

        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(new Sticker("1", "2", 7, url)), SELF);

        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.STICKER_URL);
    }

    @Test
    void theStickerObjectOfSinoZaloIsReadAndUnknownFieldsAreIgnored() throws Exception {
        String json = """
                {"msgId":"1001","threadId":"%s","threadType":"USER","fromId":"%s","fromName":"Bình","isSelf":false,
                 "zaloType":"chat.sticker","text":null,"sentAt":"%s","extra":1,
                 "sticker":{"id":"11236","catId":"3341","type":7,"url":"%s","future":true}}
                """.formatted(FRIEND, FRIEND, SENT_AT, PICTURE);

        Message message = JsonMapper.builder().build().readValue(json, Message.class);

        assertThat(message.sticker()).isEqualTo(new Sticker("11236", "3341", 7, PICTURE));
    }
}
