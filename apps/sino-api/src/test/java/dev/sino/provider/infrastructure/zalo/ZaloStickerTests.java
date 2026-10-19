package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sticker;
import dev.sino.provider.infrastructure.zalo.ZaloClient.StickerSprite;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/** The picture of a Zalo sticker message reaches {@code metadata}, and only when its address is safe to show (D-279). */
class ZaloStickerTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String SENT_AT = "2026-10-17T08:30:00Z";
    private static final String PICTURE = "https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236";
    private static final String SPRITE = "https://zalo-api.zadn.vn/api/emoticon/sprite?eid=11236&size=130";

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

    @Test
    void aChatGifMessageBecomesAnAnimatedStickerWithGifPlaceholder() {
        String tenorUrl = "https://media.tenor.com/xyz/hello.gif";
        Message gifMsg = new Message("1002", FRIEND, "USER", FRIEND, "Bình", false, "chat.gif", null, SENT_AT,
                new Sticker("1002", "0", 0, tenorUrl));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(gifMsg, SELF);

        assertThat(message.type()).isEqualTo(MessageType.UNKNOWN);
        assertThat(message.textContent()).isEqualTo("[GIF]");
        assertThat(message.metadata()).containsEntry("zaloType", "chat.gif")
                .containsEntry(NormalizedMessage.STICKER_URL, tenorUrl);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://media.tenor.com/a.gif",
        "https://c.tenor.com/b.gif",
        "https://media.giphy.com/media/c.gif" })
    void tenorAndGiphyAddressesAreKeptForGifs(String url) {
        Message gifMsg = new Message("1003", FRIEND, "USER", FRIEND, "Bình", false, "chat.gif", null, SENT_AT,
                new Sticker("1003", "0", 0, url));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(gifMsg, SELF);

        assertThat(message.metadata()).containsEntry(NormalizedMessage.STICKER_URL, url);
    }

    private static Sticker moving(String sprite, Integer frames, Integer durationMs) {
        return new Sticker("11236", "3341", 7, PICTURE, new StickerSprite(sprite, frames, durationMs));
    }

    @Test
    void aMovingStickerKeepsItsSpriteSheetFramesAndDurationInMetadataBesidesTheStillPicture() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(moving(SPRITE, 7, 700)), SELF);

        assertThat(message.textContent()).isEqualTo("[Sticker]");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.sticker",
                NormalizedMessage.STICKER_URL, PICTURE,
                NormalizedMessage.STICKER_SPRITE_URL, SPRITE,
                NormalizedMessage.STICKER_FRAMES, "7",
                NormalizedMessage.STICKER_DURATION_MS, "700",
                "stickerId", "11236",
                "stickerCatId", "3341"));
    }

    @Test
    void aStickerWithNoSpriteHasNoSpriteKeys() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(moving(null, null, null)), SELF);

        assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_SPRITE_URL,
                NormalizedMessage.STICKER_FRAMES, NormalizedMessage.STICKER_DURATION_MS)
                .containsEntry(NormalizedMessage.STICKER_URL, PICTURE);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "http://zalo-api.zadn.vn/api/emoticon/sprite?eid=1",
        "javascript:alert(1)",
        "https://evil.example.com/sprite.png",
        "https://zadn.vn.evil.com/sprite.png",
        "https://user:pw@zalo-api.zadn.vn/sprite.png",
        "not a url" })
    void aSpriteOnAnAddressThatIsNotSafeIsLeftOutWhole(String url) {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(moving(url, 7, 700)), SELF);

        assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_SPRITE_URL,
                NormalizedMessage.STICKER_FRAMES, NormalizedMessage.STICKER_DURATION_MS)
                .containsEntry(NormalizedMessage.STICKER_URL, PICTURE);
    }

    @ParameterizedTest
    @CsvSource({ "1,700", "0,700", "-5,700", "301,700", "7,99", "7,0", "7,-1", "7,10001" })
    void aSpriteWithFramesOrDurationOutOfRangeIsLeftOutWhole(int frames, int durationMs) {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(moving(SPRITE, frames, durationMs)),
                SELF);

        assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_SPRITE_URL,
                NormalizedMessage.STICKER_FRAMES, NormalizedMessage.STICKER_DURATION_MS);
    }

    @Test
    void aSpriteMissingItsFramesOrItsDurationIsLeftOutWhole() {
        for (Sticker partial : new Sticker[] { moving(SPRITE, null, 700), moving(SPRITE, 7, null) }) {
            NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(partial), SELF);

            assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_SPRITE_URL,
                    NormalizedMessage.STICKER_FRAMES, NormalizedMessage.STICKER_DURATION_MS);
        }
    }

    @ParameterizedTest
    @CsvSource({ "2,100", "300,10000" })
    void theLimitsOfFramesAndDurationAreKept(int frames, int durationMs) {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(sticker(moving(SPRITE, frames, durationMs)),
                SELF);

        assertThat(message.metadata()).containsEntry(NormalizedMessage.STICKER_FRAMES, String.valueOf(frames))
                .containsEntry(NormalizedMessage.STICKER_DURATION_MS, String.valueOf(durationMs));
    }

    @Test
    void aGifNeverGetsASprite() {
        Message gif = new Message("1004", FRIEND, "USER", FRIEND, "Bình", false, "chat.gif", null, SENT_AT,
                new Sticker("1004", "0", 0, "https://media.tenor.com/a.gif", new StickerSprite(SPRITE, 7, 700)));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(gif, SELF);

        assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_SPRITE_URL,
                NormalizedMessage.STICKER_FRAMES, NormalizedMessage.STICKER_DURATION_MS);
    }

    @Test
    void theSpriteOfSinoZaloIsReadAndAnOlderStickerWithoutOneStillReads() throws Exception {
        String moving = """
                {"msgId":"1001","threadId":"%s","threadType":"USER","fromId":"%s","fromName":"Bình","isSelf":false,
                 "zaloType":"chat.sticker","text":null,"sentAt":"%s",
                 "sticker":{"id":"11236","catId":"3341","type":7,"url":"%s",
                            "sprite":{"url":"%s","frames":7,"durationMs":700,"future":1}}}
                """.formatted(FRIEND, FRIEND, SENT_AT, PICTURE, SPRITE);
        String still = """
                {"msgId":"1001","threadId":"%s","threadType":"USER","fromId":"%s","fromName":"Bình","isSelf":false,
                 "zaloType":"chat.sticker","text":null,"sentAt":"%s",
                 "sticker":{"id":"11236","catId":"3341","type":7,"url":"%s","sprite":null}}
                """.formatted(FRIEND, FRIEND, SENT_AT, PICTURE);
        JsonMapper mapper = JsonMapper.builder().build();

        assertThat(mapper.readValue(moving, Message.class).sticker().sprite())
                .isEqualTo(new StickerSprite(SPRITE, 7, 700));
        assertThat(mapper.readValue(still, Message.class).sticker().sprite()).isNull();
    }
}
