package dev.sino.sticker.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** What a {@link Sticker} keeps and what it refuses (ST-05): the invariants the database also checks, before it can. */
class StickerTests {

    private static final UUID OWNER = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-19T08:00:00Z");
    private static final StickerImage PNG = new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 256, 128);
    private static final byte[] CONTENT = "pretend these are the bytes of an image".getBytes(java.nio.charset.StandardCharsets.UTF_8);

    private static Sticker sticker(String name) {
        return Sticker.create(OWNER, name, PNG, CONTENT, NOW);
    }

    @Test
    void keepsWhatTheImageSaysAndWhatTheFileIs() {
        Sticker sticker = sticker("meo");

        assertThat(sticker.ownerId()).isEqualTo(OWNER);
        assertThat(sticker.name()).isEqualTo("meo");
        assertThat(sticker.mediaType()).isEqualTo(StickerMediaType.PNG);
        assertThat(sticker.kind()).isEqualTo(StickerKind.STATIC);
        assertThat(sticker.width()).isEqualTo(256);
        assertThat(sticker.height()).isEqualTo(128);
        assertThat(sticker.sizeBytes()).isEqualTo(CONTENT.length);
        assertThat(sticker.createdAt()).isEqualTo(NOW);
    }

    @Test
    void worksOutTheSha256OfTheBytes() throws NoSuchAlgorithmException {
        byte[] expected = MessageDigest.getInstance("SHA-256").digest(CONTENT);

        assertThat(sticker("meo").sha256()).containsExactly(expected);
        assertThat(HexFormat.of().formatHex(sticker("meo").sha256())).hasSize(64);
    }

    @Test
    void twoFilesThatDifferByOneByteHaveDifferentDigests() {
        byte[] other = CONTENT.clone();
        other[0] ^= 1;

        assertThat(Sticker.create(OWNER, "a", PNG, other, NOW).sha256()).isNotEqualTo(sticker("a").sha256());
    }

    @Test
    void handsOutACopyOfTheDigestSoTheStickerCannotBeChangedFromOutside() {
        Sticker sticker = sticker("meo");
        byte[] first = sticker.sha256();
        first[0] ^= 1;

        assertThat(sticker.sha256()).isNotEqualTo(first);
    }

    @Test
    void keepsAnimatedAndOtherTypesAsTheyAre() {
        Sticker gif = Sticker.create(OWNER, "nhay", new StickerImage(StickerMediaType.GIF, StickerKind.ANIMATED, 320, 240), CONTENT, NOW);

        assertThat(gif.mediaType().value()).isEqualTo("image/gif");
        assertThat(gif.kind()).isEqualTo(StickerKind.ANIMATED);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", " ", "   ", "\t", "\n" })
    void refusesABlankName(String name) {
        assertThatThrownBy(() -> sticker(name)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void refusesANullName() {
        assertThatThrownBy(() -> sticker(null)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void acceptsAFiftyCodePointNameAndRefusesFiftyOne() {
        // An emoji outside the BMP is two UTF-16 units and one code point: the limit counts code points (D-334).
        assertThat(sticker("😀".repeat(50)).name()).isEqualTo("😀".repeat(50));
        assertThatThrownBy(() -> sticker("😀".repeat(51))).isInstanceOf(IllegalArgumentException.class);
        assertThat(sticker("x".repeat(50)).name()).hasSize(50);
        assertThatThrownBy(() -> sticker("x".repeat(51))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void refusesNoBytes() {
        assertThatThrownBy(() -> Sticker.create(OWNER, "meo", PNG, new byte[0], NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Sticker.create(OWNER, "meo", PNG, null, NOW)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void refusesWhatIsMissing() {
        assertThatThrownBy(() -> Sticker.create(null, "meo", PNG, CONTENT, NOW)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> Sticker.create(OWNER, "meo", null, CONTENT, NOW)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> Sticker.create(OWNER, "meo", PNG, CONTENT, null)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void theContentBelongsToOneStickerAndIsACopy() {
        Sticker sticker = sticker("meo");
        UUID id = UUID.randomUUID();
        byte[] bytes = CONTENT.clone();

        StickerContent content = StickerContent.of(id, bytes);
        bytes[0] ^= 1;

        assertThat(content.stickerId()).isEqualTo(id);
        assertThat(content.bytes()).containsExactly(CONTENT);
        assertThat(sticker.sizeBytes()).isEqualTo(content.bytes().length);
    }

    @Test
    void theBytesOfAContentCannotBeChangedFromOutside() {
        StickerContent content = StickerContent.of(UUID.randomUUID(), CONTENT);
        byte[] copy = content.bytes();
        copy[0] ^= 1;

        assertThat(content.bytes()).containsExactly(CONTENT);
    }

    @Test
    void aNewContentIsNewToSpringData() {
        assertThat(StickerContent.of(UUID.randomUUID(), CONTENT).isNew()).isTrue();
    }

    @Test
    void theContentRefusesNoBytesAndNoSticker() {
        assertThatThrownBy(() -> StickerContent.of(UUID.randomUUID(), new byte[0])).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> StickerContent.of(null, CONTENT)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> StickerContent.of(UUID.randomUUID(), null)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void knowsTheMediaTypesByTheirStoredValue() {
        assertThat(StickerMediaType.of("image/png")).isEqualTo(StickerMediaType.PNG);
        assertThat(StickerMediaType.of("image/gif")).isEqualTo(StickerMediaType.GIF);
        assertThat(StickerMediaType.of("image/webp")).isEqualTo(StickerMediaType.WEBP);
        assertThatThrownBy(() -> StickerMediaType.of("image/jpeg")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> StickerMediaType.of("IMAGE/PNG")).isInstanceOf(IllegalArgumentException.class);
    }

}
