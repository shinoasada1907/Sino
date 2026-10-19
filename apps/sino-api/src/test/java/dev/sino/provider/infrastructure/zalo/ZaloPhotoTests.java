package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Photo;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Sticker;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedMessage;
import tools.jackson.databind.json.JsonMapper;

/**
 * The picture of a Zalo photo message reaches {@code metadata}, and only when its address is safe to show (ZL-16). The
 * text stays the placeholder {@code [Ảnh]} either way, so lists and previews do not change.
 */
@ExtendWith(OutputCaptureExtension.class)
class ZaloPhotoTests {

    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String SENT_AT = "2026-10-19T08:30:00Z";
    private static final String FULL = "https://f21-zpc.zdn.vn/jpg/1234/full.jpg";
    private static final String THUMB = "https://b-f21-zpc.zdn.vn/jpg/1234/thumb.jpg";

    private static Message photo(Photo photo) {
        return new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "chat.photo", null, SENT_AT, null, photo);
    }

    private static NormalizedMessage normalize(Photo photo) {
        return ZaloMessageNormalizer.normalize(photo(photo), SELF);
    }

    @Test
    void aPhotoKeepsItsAddressesAndCaptionInMetadataAndStaysAPlaceholderInText() {
        NormalizedMessage message = normalize(new Photo(FULL, THUMB, "Chuyến đi Đà Lạt"));

        assertThat(message.type()).isEqualTo(MessageType.IMAGE);
        assertThat(message.textContent()).isEqualTo("[Ảnh]");
        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.photo",
                NormalizedMessage.IMAGE_URL, FULL,
                NormalizedMessage.IMAGE_THUMB_URL, THUMB,
                NormalizedMessage.IMAGE_CAPTION, "Chuyến đi Đà Lạt"));
    }

    @Test
    void aPhotoWithNeitherThumbnailNorCaptionHasOnlyItsAddress() {
        NormalizedMessage message = normalize(new Photo(FULL, null, null));

        assertThat(message.metadata()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "zaloType", "chat.photo",
                NormalizedMessage.IMAGE_URL, FULL));
    }

    @Test
    void aThumbnailThatIsTheSameAddressAsThePictureIsLeftOut() {
        NormalizedMessage message = normalize(new Photo(FULL, FULL, null));

        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.IMAGE_THUMB_URL);
    }

    @Test
    void aPhotoWithoutAPhotoObjectBehavesAsBefore() {
        NormalizedMessage message = normalize(null);

        assertThat(message.type()).isEqualTo(MessageType.IMAGE);
        assertThat(message.textContent()).isEqualTo("[Ảnh]");
        assertThat(message.metadata()).containsExactly(Map.entry("zaloType", "chat.photo"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://f21-zpc.zdn.vn/a.jpg",
        "https://photo-stal-1.zadn.vn/a.jpg",
        "https://b-api.zaloapp.com/a.png",
        "https://ZALO-API.ZADN.VN/a.jpg" })
    void anHttpsAddressOnAZaloHostIsKept(String url) {
        assertThat(normalize(new Photo(url, null, null)).metadata()).containsEntry(NormalizedMessage.IMAGE_URL, url);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
        "   ",
        "http://f21-zpc.zdn.vn/a.jpg",
        "javascript:alert(1)",
        "data:image/svg+xml;base64,PHN2Zz4=",
        "//f21-zpc.zdn.vn/a.jpg",
        "https://evil.example.com/a.jpg",
        "https://zdn.vn.evil.com/a.jpg",
        "https://evilzdn.vn/a.jpg",
        "https://f21-zpc.zdn.vn@evil.example.com/a.jpg",
        "https://user:pw@f21-zpc.zdn.vn/a.jpg",
        "https://f21-zpc.zdn.vn/a b.jpg",
        "not a url" })
    void anyOtherAddressIsLeftOutAndTheMessageStaysAPlaceholder(String url) {
        NormalizedMessage message = normalize(new Photo(url, null, "Chuyến đi"));

        assertThat(message.textContent()).isEqualTo("[Ảnh]");
        assertThat(message.metadata()).containsExactly(Map.entry("zaloType", "chat.photo"));
    }

    @Test
    void anAddressOverTwoThousandCharactersIsLeftOut() {
        String url = "https://f21-zpc.zdn.vn/" + "a".repeat(2_000);

        assertThat(normalize(new Photo(url, null, null)).metadata()).doesNotContainKey(NormalizedMessage.IMAGE_URL);
    }

    @Test
    void whenOnlyTheThumbnailIsSafeItBecomesThePicture() {
        NormalizedMessage message = normalize(new Photo("https://evil.example.com/a.jpg", THUMB, null));

        assertThat(message.metadata()).containsEntry(NormalizedMessage.IMAGE_URL, THUMB)
                .doesNotContainKey(NormalizedMessage.IMAGE_THUMB_URL);
    }

    @Test
    void anUnsafeThumbnailIsLeftOutAndThePictureIsKept() {
        NormalizedMessage message = normalize(new Photo(FULL, "http://b-f21-zpc.zdn.vn/t.jpg", null));

        assertThat(message.metadata()).containsEntry(NormalizedMessage.IMAGE_URL, FULL)
                .doesNotContainKey(NormalizedMessage.IMAGE_THUMB_URL);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = { "   ", "\n\t " })
    void aCaptionThatIsBlankIsLeftOut(String caption) {
        assertThat(normalize(new Photo(FULL, null, caption)).metadata()).doesNotContainKey(NormalizedMessage.IMAGE_CAPTION);
    }

    @Test
    void aCaptionIsTrimmedAndLosesNulCharacters() {
        NormalizedMessage message = normalize(new Photo(FULL, null, "  Xin\u0000 chào \n"));

        assertThat(message.metadata()).containsEntry(NormalizedMessage.IMAGE_CAPTION, "Xin chào");
    }

    @Test
    void aCaptionLongerThanTheLimitIsCutWithoutSplittingASurrogatePair() {
        String limit = "a".repeat(ZaloMessageNormalizer.MAX_CAPTION_LENGTH - 1);

        NormalizedMessage cut = normalize(new Photo(FULL, null, limit + "😀😀"));
        NormalizedMessage whole = normalize(new Photo(FULL, null, limit));

        assertThat(cut.metadata().get(NormalizedMessage.IMAGE_CAPTION)).isEqualTo(limit);
        assertThat(whole.metadata().get(NormalizedMessage.IMAGE_CAPTION)).isEqualTo(limit);
    }

    @Test
    void aPhotoThatIsSentByTheAccountIsStillOutboundAndKeepsItsPicture() {
        Message own = new Message("1002", FRIEND, "USER", SELF, "Tôi", true, "chat.photo", null, SENT_AT, null,
                new Photo(FULL, THUMB, null));

        NormalizedMessage message = ZaloMessageNormalizer.normalize(own, SELF);

        assertThat(message.read()).isTrue();
        assertThat(message.metadata()).containsEntry(NormalizedMessage.IMAGE_URL, FULL);
    }

    @Test
    void theOlderNineAndTenValueConstructorsMakeAMessageWithoutAPhoto() {
        Message nine = new Message("1", FRIEND, "USER", FRIEND, "Bình", false, "chat.photo", null, SENT_AT);
        Message ten = new Message("1", FRIEND, "USER", FRIEND, "Bình", false, "chat.sticker", null, SENT_AT,
                new Sticker("1", "2", 7, null));

        assertThat(nine.photo()).isNull();
        assertThat(ten.photo()).isNull();
        assertThat(ten.sticker()).isNotNull();
    }

    @Test
    void theNormalizedMessageOfAPhotoDoesNotGetStickerKeys() {
        NormalizedMessage message = normalize(new Photo(FULL, THUMB, "x"));

        assertThat(message.metadata()).doesNotContainKeys(NormalizedMessage.STICKER_URL, "stickerId");
    }

    @Test
    void thePhotoObjectOfSinoZaloIsReadAndUnknownFieldsAreIgnored() throws Exception {
        String json = """
                {"msgId":"1001","threadId":"%s","threadType":"USER","fromId":"%s","fromName":"Bình","isSelf":false,
                 "zaloType":"chat.photo","text":null,"sentAt":"%s","extra":1,
                 "photo":{"url":"%s","thumbUrl":"%s","caption":"Chuyến đi","future":true}}
                """.formatted(FRIEND, FRIEND, SENT_AT, FULL, THUMB);
        String older = """
                {"msgId":"1001","threadId":"%s","threadType":"USER","fromId":"%s","fromName":"Bình","isSelf":false,
                 "zaloType":"chat.photo","text":null,"sentAt":"%s"}
                """.formatted(FRIEND, FRIEND, SENT_AT);
        JsonMapper mapper = JsonMapper.builder().build();

        assertThat(mapper.readValue(json, Message.class).photo()).isEqualTo(new Photo(FULL, THUMB, "Chuyến đi"));
        assertThat(mapper.readValue(older, Message.class).photo()).isNull();
    }

    @Test
    void aPictureSinoRefusesIsWarnedAboutByHostAloneNeverByPathOrCaption(CapturedOutput output) {
        normalize(new Photo("https://cdn.example.com/private/token-abc123/a.jpg", null, "Mật khẩu là 1234"));

        assertThat(output.getAll()).contains("cdn.example.com").doesNotContain("token-abc123")
                .doesNotContain("Mật khẩu");
    }

    @Test
    void theWarningSaysWhyAnAddressOnAZaloHostWasStillRefused(CapturedOutput output) {
        normalize(new Photo("http://f21-zpc.zdn.vn/jpg/token-abc123/a.jpg", null, null));
        normalize(new Photo("https://f21-zpc.zdn.vn/jpg/to ken/a.jpg", null, null));
        normalize(new Photo("not a url", null, null));

        assertThat(output.getAll())
                .contains("host: f21-zpc.zdn.vn, scheme: http, length: 44, plain: true")
                .contains("host: unreadable, scheme: unreadable, length: 39, plain: false")
                .contains("host: unreadable, scheme: unreadable, length: 9, plain: false")
                .doesNotContain("token-abc123");
    }

    @Test
    void aPictureSinoKeepsIsNotWarnedAbout(CapturedOutput output) {
        normalize(new Photo(FULL, THUMB, null));

        assertThat(output.getAll()).doesNotContain("does not accept");
    }

    @Test
    void aPhotoWithNoAddressAtAllIsNotWarnedAbout(CapturedOutput output) {
        normalize(new Photo(null, null, null));

        assertThat(output.getAll()).doesNotContain("does not accept");
    }
}
