package dev.sino.sticker.application;

import static dev.sino.sticker.domain.ImageFixtures.animatedGif;
import static dev.sino.sticker.domain.ImageFixtures.png;
import static dev.sino.sticker.domain.ImageFixtures.webpFile;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.sticker.StickerPictureForSending;
import dev.sino.sticker.StickerPictures;

/**
 * The picture of a sticker, for the module that sends it (ZS-04, D-350), on a real PostgreSQL: the owner's own sticker
 * gives its bytes and what is needed to send them, and anything else gives nothing, so a caller cannot tell a sticker of
 * another user from one that is not there.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, StickerServiceTests.Clocks.class })
@ActiveProfiles("test")
class StickerPicturesTests {

    @Autowired
    private StickerPictures pictures;

    @Autowired
    private StickerService stickers;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;
    private UUID another;

    @BeforeEach
    void twoOwners() {
        JdbcTestUtils.deleteFromTables(jdbc, "sticker", "sticker_pack", "app_user");
        owner = insertUser("owner@sino.test");
        another = insertUser("another@sino.test");
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    @Test
    void givesTheBytesTypeAndSizeOfAStickerOfTheOwner() {
        byte[] file = png(60, 40);
        UUID id = stickers.upload(owner, "meo.png", null, file).id();

        Optional<StickerPictureForSending> picture = pictures.forOwner(owner, id);

        assertThat(picture).hasValueSatisfying(found -> {
            assertThat(found.bytes()).containsExactly(file);
            assertThat(found.mediaType()).isEqualTo("image/png");
            assertThat(found.width()).isEqualTo(60);
            assertThat(found.height()).isEqualTo(40);
        });
    }

    @Test
    void givesTheTypeOfAGifAndOfAWebp() {
        UUID gif = stickers.upload(owner, "nhay.gif", null, animatedGif(30, 20, 3)).id();
        UUID webp = stickers.upload(owner, "ngu.webp", null, webpFile("static-lossy.webp")).id();

        assertThat(pictures.forOwner(owner, gif)).get().extracting(StickerPictureForSending::mediaType)
                .isEqualTo("image/gif");
        assertThat(pictures.forOwner(owner, webp)).get().extracting(StickerPictureForSending::mediaType)
                .isEqualTo("image/webp");
    }

    @Test
    void givesNothingForAStickerOfAnotherOwner() {
        UUID id = stickers.upload(owner, "meo.png", null, png(8, 8)).id();

        assertThat(pictures.forOwner(another, id)).isEmpty();
    }

    @Test
    void givesNothingForAStickerThatIsNotThereOrIsGone() {
        UUID id = stickers.upload(owner, "meo.png", null, png(8, 8)).id();
        stickers.delete(owner, id);

        assertThat(pictures.forOwner(owner, id)).isEmpty();
        assertThat(pictures.forOwner(owner, UUID.randomUUID())).isEmpty();
    }

    @Test
    void doesNotChangeWhatItGaveBeforeWhenTheCallerWritesInTheBytes() {
        byte[] file = png(8, 8);
        UUID id = stickers.upload(owner, "meo.png", null, file).id();

        pictures.forOwner(owner, id).orElseThrow().bytes()[0] = 0;

        assertThat(pictures.forOwner(owner, id).orElseThrow().bytes()).containsExactly(file);
    }

}
