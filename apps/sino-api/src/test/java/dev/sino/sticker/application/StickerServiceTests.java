package dev.sino.sticker.application;

import static dev.sino.sticker.domain.ImageFixtures.animatedGif;
import static dev.sino.sticker.domain.ImageFixtures.gif;
import static dev.sino.sticker.domain.ImageFixtures.png;
import static dev.sino.sticker.domain.ImageFixtures.webpFile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerContent;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.domain.StickerKind;
import dev.sino.sticker.domain.StickerMediaType;
import dev.sino.sticker.infrastructure.StickerContentRepository;
import dev.sino.sticker.infrastructure.StickerRepository;

/**
 * Keeping a sticker (ST-06) on a real PostgreSQL: what is kept, what is refused and why, and that a refusal leaves nothing
 * behind. The limits are small here (20 KB, 64 px, 3 stickers) so that the edges are cheap to reach.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, StickerServiceTests.Clocks.class })
@ActiveProfiles("test")
@TestPropertySource(properties = { "sino.stickers.max-file-size=20KB", "sino.stickers.max-side=64",
        "sino.stickers.max-per-owner=3" })
class StickerServiceTests {

    private static final Instant NOW = Instant.parse("2026-10-19T08:00:00Z");
    private static final int MAX_BYTES = 20 * 1024;

    @Autowired
    private StickerService service;

    @Autowired
    private StickerRepository stickers;

    @Autowired
    private StickerContentRepository contents;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MovableClock clock;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "sticker", "sticker_pack", "app_user");
        owner = insertUser("owner@sino.test");
        clock.set(NOW);
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    /** A valid PNG padded with zeros after its end to exactly {@code size} bytes; what follows the image is not read. */
    private static byte[] pngOfSize(int width, int height, int size) {
        byte[] png = png(width, height);
        assertThat(png.length).isLessThanOrEqualTo(size);
        return Arrays.copyOf(png, size);
    }

    private static Consumer<Throwable> refusedWith(ErrorCode code) {
        return e -> assertThat(e).isInstanceOfSatisfying(SinoException.class, sino -> assertThat(sino.errorCode()).isEqualTo(code));
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    @Test
    void keepsAPngWithItsBytesAndWhatIsWorkedOutFromIt() {
        byte[] file = png(60, 40);

        Sticker sticker = service.upload(owner, "meo.png", null, file);

        Sticker stored = stickers.findById(sticker.id()).orElseThrow();
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.name()).isEqualTo("meo");
        assertThat(stored.mediaType()).isEqualTo(StickerMediaType.PNG);
        assertThat(stored.kind()).isEqualTo(StickerKind.STATIC);
        assertThat(stored.width()).isEqualTo(60);
        assertThat(stored.height()).isEqualTo(40);
        assertThat(stored.sizeBytes()).isEqualTo(file.length);
        assertThat(stored.createdAt()).isEqualTo(NOW);
        assertThat(contents.findById(sticker.id()).map(StickerContent::bytes).orElseThrow()).containsExactly(file);
    }

    @Test
    void namesAStickerByTheNameAskedFor() {
        assertThat(service.upload(owner, "meo.png", "  Mèo vui  ", png(8, 8)).name()).isEqualTo("Mèo vui");
    }

    @Test
    void namesAStickerStickerWhenThereIsNoNameAndNoFileName() {
        assertThat(service.upload(owner, null, null, png(8, 8)).name()).isEqualTo("Sticker");
    }

    @Test
    void takesTheLastPartOfAPathAsTheFileName() {
        assertThat(service.upload(owner, "C:\\fakepath\\meo.png", null, png(8, 8)).name()).isEqualTo("meo");
    }

    @Test
    void keepsAGifThatMovesAsAnimatedAndOneThatDoesNotAsStatic() {
        Sticker moving = service.upload(owner, "nhay.gif", null, animatedGif(30, 20, 3));
        Sticker still = service.upload(owner, "dung.gif", null, gif(30, 20));

        assertThat(moving.kind()).isEqualTo(StickerKind.ANIMATED);
        assertThat(moving.mediaType()).isEqualTo(StickerMediaType.GIF);
        assertThat(still.kind()).isEqualTo(StickerKind.STATIC);
    }

    @Test
    void keepsAWebpStillAndMoving() {
        Sticker still = service.upload(owner, "a.webp", null, webpFile("static-alpha.webp"));
        Sticker moving = service.upload(owner, "b.webp", null, webpFile("animated.webp"));

        assertThat(still.mediaType()).isEqualTo(StickerMediaType.WEBP);
        assertThat(still.kind()).isEqualTo(StickerKind.STATIC);
        assertThat(moving.kind()).isEqualTo(StickerKind.ANIMATED);
        assertThat(moving.width()).isEqualTo(32);
        assertThat(moving.height()).isEqualTo(24);
    }

    @Test
    void takesTheTimeFromTheClock() {
        clock.set(Instant.parse("2026-12-24T10:15:30Z"));

        assertThat(service.upload(owner, "a.png", null, png(8, 8)).createdAt()).isEqualTo(Instant.parse("2026-12-24T10:15:30Z"));
    }

    @Test
    void refusesNoFileAndAnEmptyFile() {
        assertThatThrownBy(() -> service.upload(owner, "a.png", null, null)).satisfies(refusedWith(StickerErrorCode.STICKER_FILE_MISSING));
        assertThatThrownBy(() -> service.upload(owner, "a.png", null, new byte[0])).satisfies(refusedWith(StickerErrorCode.STICKER_FILE_MISSING));
    }

    @Test
    void takesAFileOfExactlyTheLimitAndRefusesOneByteMore() {
        service.upload(owner, "edge.png", null, pngOfSize(8, 8, MAX_BYTES));

        assertThatThrownBy(() -> service.upload(owner, "over.png", null, pngOfSize(9, 9, MAX_BYTES + 1)))
                .satisfies(refusedWith(StickerErrorCode.STICKER_TOO_LARGE));
    }

    @Test
    void saysTooLargeBeforeLookingAtWhatTheFileIs() {
        byte[] hugeText = new byte[MAX_BYTES + 1];
        Arrays.fill(hugeText, (byte) 'x');

        assertThatThrownBy(() -> service.upload(owner, "x.png", null, hugeText)).satisfies(refusedWith(StickerErrorCode.STICKER_TOO_LARGE));
    }

    @Test
    void saysTheLimitsInTheRefusal() {
        assertThatThrownBy(() -> service.upload(owner, "over.png", null, pngOfSize(9, 9, MAX_BYTES + 1)))
                .isInstanceOfSatisfying(SinoException.class, e -> assertThat(e.properties()).containsEntry("maxBytes", (long) MAX_BYTES));
    }

    @Test
    void refusesWhatIsNotAnImageByWhatIsInsideAndNotByItsName() {
        byte[] text = "not an image".getBytes(StandardCharsets.US_ASCII);
        byte[] jpeg = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0 };

        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, text)).satisfies(refusedWith(StickerErrorCode.STICKER_TYPE_UNSUPPORTED));
        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, jpeg)).satisfies(refusedWith(StickerErrorCode.STICKER_TYPE_UNSUPPORTED));
    }

    @Test
    void refusesAnImageWhoseHeadIsBroken() {
        byte[] cut = Arrays.copyOf(png(8, 8), 20);

        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, cut)).satisfies(refusedWith(StickerErrorCode.STICKER_INVALID_IMAGE));
    }

    @ParameterizedTest
    @ValueSource(ints = { 65, 100, 1000 })
    void refusesAnImageWithASideAboveTheLimitWhicheverSide(int side) {
        assertThatThrownBy(() -> service.upload(owner, "wide.png", null, png(side, 10))).satisfies(refusedWith(StickerErrorCode.STICKER_INVALID_IMAGE));
        assertThatThrownBy(() -> service.upload(owner, "tall.png", null, png(10, side))).satisfies(refusedWith(StickerErrorCode.STICKER_INVALID_IMAGE));
    }

    @Test
    void takesAnImageOfExactlyTheLimitOnBothSides() {
        assertThat(service.upload(owner, "edge.png", null, png(64, 64)).width()).isEqualTo(64);
        assertThat(service.upload(owner, "wide.png", null, png(64, 1)).width()).isEqualTo(64);
        assertThat(service.upload(owner, "tall.png", null, png(1, 64)).height()).isEqualTo(64);
    }

    @Test
    void refusesTheSameFileTwiceForOneOwnerAndNamesTheOneKept() {
        Sticker first = service.upload(owner, "meo.png", null, png(20, 20));

        assertThatThrownBy(() -> service.upload(owner, "again.png", "other name", png(20, 20)))
                .satisfies(refusedWith(StickerErrorCode.STICKER_DUPLICATE))
                .isInstanceOfSatisfying(SinoException.class, e -> assertThat(e.properties()).containsEntry("stickerId", first.id().toString()));
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void doesNotCallTwoDifferentFilesTheSame() {
        service.upload(owner, "a.png", null, png(20, 20));

        assertThat(service.upload(owner, "b.png", null, png(20, 21)).id()).isNotNull();
        assertThat(count("sticker")).isEqualTo(2);
    }

    @Test
    void anotherOwnerMayKeepTheSameFile() {
        UUID stranger = insertUser("stranger@sino.test");
        service.upload(owner, "meo.png", null, png(20, 20));

        assertThat(service.upload(stranger, "meo.png", null, png(20, 20)).ownerId()).isEqualTo(stranger);
    }

    @Test
    void refusesAFourthStickerWhenTheLimitIsThree() {
        service.upload(owner, "1.png", null, png(10, 10));
        service.upload(owner, "2.png", null, png(11, 10));
        service.upload(owner, "3.png", null, png(12, 10));

        assertThatThrownBy(() -> service.upload(owner, "4.png", null, png(13, 10))).satisfies(refusedWith(StickerErrorCode.STICKER_LIMIT_REACHED));
        assertThat(count("sticker")).isEqualTo(3);
    }

    @Test
    void takesTheThirdStickerWhenTheLimitIsThree() {
        service.upload(owner, "1.png", null, png(10, 10));
        service.upload(owner, "2.png", null, png(11, 10));

        assertThat(service.upload(owner, "3.png", null, png(12, 10)).id()).isNotNull();
    }

    @Test
    void theLimitIsOfOneOwnerAndFreesWhenAStickerIsDeleted() {
        UUID stranger = insertUser("stranger@sino.test");
        Sticker first = service.upload(owner, "1.png", null, png(10, 10));
        service.upload(owner, "2.png", null, png(11, 10));
        service.upload(owner, "3.png", null, png(12, 10));

        assertThat(service.upload(stranger, "1.png", null, png(10, 10)).ownerId()).isEqualTo(stranger);
        stickers.deleteOwned(first.id(), owner);

        assertThat(service.upload(owner, "4.png", null, png(13, 10)).id()).isNotNull();
    }

    @Test
    void saysDuplicateAndNotLimitWhenTheOwnerIsAtTheLimitAndUploadsAFileAlreadyKept() {
        service.upload(owner, "1.png", null, png(10, 10));
        service.upload(owner, "2.png", null, png(11, 10));
        service.upload(owner, "3.png", null, png(12, 10));

        assertThatThrownBy(() -> service.upload(owner, "again.png", null, png(10, 10))).satisfies(refusedWith(StickerErrorCode.STICKER_DUPLICATE));
    }

    @Test
    void aRefusalKeepsNothing() {
        byte[] text = "not an image".getBytes(StandardCharsets.US_ASCII);
        service.upload(owner, "kept.png", null, png(20, 20));

        Consumer<Runnable> refused = action -> assertThatThrownBy(action::run).isInstanceOf(SinoException.class);
        refused.accept(() -> service.upload(owner, "a.png", null, new byte[0]));
        refused.accept(() -> service.upload(owner, "b.png", null, pngOfSize(9, 9, MAX_BYTES + 1)));
        refused.accept(() -> service.upload(owner, "c.png", null, text));
        refused.accept(() -> service.upload(owner, "d.png", null, png(100, 10)));
        refused.accept(() -> service.upload(owner, "e.png", null, png(20, 20)));

        assertThat(count("sticker")).isEqualTo(1);
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    @Test
    void takesAnOwnerTheDatabaseDoesNotKnowAsAnErrorOfTheDatabaseAndKeepsNothing() {
        UUID nobody = UUID.randomUUID();

        assertThatThrownBy(() -> service.upload(nobody, "a.png", null, png(8, 8))).isNotInstanceOf(SinoException.class);
        assertThat(count("sticker")).isZero();
        assertThat(count("sticker_content")).isZero();
    }

    // --- list, picture and delete (ST-07, D-336): every one is of one owner, and another owner's sticker is "not found" ---

    private void later() {
        clock.set(clock.instant().plus(Duration.ofMinutes(1)));
    }

    @Test
    void listsTheStickersOfTheOwnerNewestFirstAndOnlyThose() {
        Sticker first = service.upload(owner, "1.png", null, png(10, 10));
        later();
        Sticker second = service.upload(owner, "2.png", null, png(11, 10));
        later();
        Sticker third = service.upload(owner, "3.png", null, png(12, 10));
        service.upload(insertUser("stranger@sino.test"), "x.png", null, png(13, 10));

        assertThat(service.list(owner)).extracting(Sticker::id).containsExactly(third.id(), second.id(), first.id());
    }

    @Test
    void listsNothingForAnOwnerWithNoStickers() {
        assertThat(service.list(owner)).isEmpty();
        assertThat(service.list(UUID.randomUUID())).isEmpty();
    }

    @Test
    void giveBackThePictureOfAStickerByteForByteWithItsMediaType() {
        byte[] file = animatedGif(30, 20, 3);
        Sticker sticker = service.upload(owner, "nhay.gif", null, file);

        StickerPicture picture = service.picture(owner, sticker.id());

        assertThat(picture.mediaType()).isEqualTo(StickerMediaType.GIF);
        assertThat(picture.bytes()).containsExactly(file);
    }

    @Test
    void aStickerOfAnotherOwnerAndOneThatDoesNotExistAreNotFoundAlike() {
        UUID stranger = insertUser("stranger@sino.test");
        Sticker theirs = service.upload(stranger, "theirs.png", null, png(10, 10));
        UUID unknown = UUID.randomUUID();

        Throwable otherOwners = org.assertj.core.api.Assertions.catchThrowable(() -> service.picture(owner, theirs.id()));
        Throwable nobodys = org.assertj.core.api.Assertions.catchThrowable(() -> service.picture(owner, unknown));

        assertThat(otherOwners).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
        assertThat(nobodys).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
        // Nothing in the answer tells the two apart, so no id can be found out by trying.
        assertThat(otherOwners).hasMessage(nobodys.getMessage());
        assertThat(((SinoException) otherOwners).properties()).isEqualTo(((SinoException) nobodys).properties());
    }

    @Test
    void aStickerWhoseBytesAreMissingIsAFaultOfTheDataAndNotNotFound() {
        Sticker sticker = service.upload(owner, "meo.png", null, png(10, 10));
        jdbc.update("delete from sticker_content where sticker_id = ?", sticker.id());

        assertThatThrownBy(() -> service.picture(owner, sticker.id())).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(sticker.id().toString());
    }

    @Test
    void deletesAStickerWithItsBytesAndNothingElse() {
        Sticker gone = service.upload(owner, "gone.png", null, png(10, 10));
        Sticker kept = service.upload(owner, "kept.png", null, png(11, 10));

        service.delete(owner, gone.id());

        assertThat(service.list(owner)).extracting(Sticker::id).containsExactly(kept.id());
        assertThat(count("sticker_content")).isEqualTo(1);
        assertThatThrownBy(() -> service.picture(owner, gone.id())).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
        assertThat(service.picture(owner, kept.id()).bytes()).isNotEmpty();
    }

    @Test
    void deletingTwiceIsNotFoundTheSecondTime() {
        Sticker sticker = service.upload(owner, "meo.png", null, png(10, 10));
        service.delete(owner, sticker.id());

        assertThatThrownBy(() -> service.delete(owner, sticker.id())).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
    }

    @Test
    void deletingAStickerOfAnotherOwnerDeletesNothing() {
        UUID stranger = insertUser("stranger@sino.test");
        Sticker theirs = service.upload(stranger, "theirs.png", null, png(10, 10));

        assertThatThrownBy(() -> service.delete(owner, theirs.id())).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));

        assertThat(service.list(stranger)).extracting(Sticker::id).containsExactly(theirs.id());
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    @Test
    void deletingAnUnknownStickerIsNotFound() {
        assertThatThrownBy(() -> service.delete(owner, UUID.randomUUID())).satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
    }

    @Test
    void aFileDeletedCanBeKeptAgain() {
        Sticker first = service.upload(owner, "meo.png", null, png(10, 10));
        service.delete(owner, first.id());

        Sticker again = service.upload(owner, "meo.png", null, png(10, 10));

        assertThat(again.id()).isNotEqualTo(first.id());
        assertThat(service.list(owner)).extracting(Sticker::id).containsExactly(again.id());
    }

    @Test
    void deletingFreesARoomUnderTheLimit() {
        Sticker first = service.upload(owner, "1.png", null, png(10, 10));
        service.upload(owner, "2.png", null, png(11, 10));
        service.upload(owner, "3.png", null, png(12, 10));
        assertThatThrownBy(() -> service.upload(owner, "4.png", null, png(13, 10))).satisfies(refusedWith(StickerErrorCode.STICKER_LIMIT_REACHED));

        service.delete(owner, first.id());

        assertThat(service.upload(owner, "4.png", null, png(13, 10)).id()).isNotNull();
        List<Sticker> list = service.list(owner);
        assertThat(list).hasSize(3);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Clocks {

        @Bean
        @Primary
        MovableClock movableClock() {
            return new MovableClock(NOW);
        }

    }

    static final class MovableClock extends Clock {

        private volatile Instant now;

        MovableClock(Instant start) {
            this.now = start;
        }

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }

    }

}
