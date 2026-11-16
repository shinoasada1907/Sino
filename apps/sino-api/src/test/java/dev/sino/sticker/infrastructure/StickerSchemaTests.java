package dev.sino.sticker.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * The tables of the sticker library (ST-01, D-331). Plain SQL on a real PostgreSQL: the checks of the migration are a
 * floor under the application's, so what is tested here is what the database itself refuses. Every test is one
 * transaction, and a refused statement aborts it, so a test checks one refusal; the cases of a rule are parameters.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class StickerSchemaTests {

    private static final byte[] PIXEL = { 1, 2, 3, 4 };

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AppUserRepository users;

    private UUID alice;
    private UUID bob;

    @BeforeEach
    void createOwners() {
        // Flushed: the plain SQL below is not seen by the persistence context, and the foreign key needs the row.
        alice = users.saveAndFlush(new AppUser("alice@example.com", "Alice")).id();
        bob = users.saveAndFlush(new AppUser("bob@example.com", "Bob")).id();
    }

    /** A row that satisfies every check; each refusal test changes one thing about it. */
    private UUID insert(UUID owner, String name, String kind, String mediaType, int width, int height, long sizeBytes,
            byte[] sha256) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO sticker (id, user_id, name, media_type, kind, width, height, size_bytes, sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", id, owner, name, mediaType, kind, width, height, sizeBytes, sha256,
                Timestamp.from(Instant.parse("2026-10-19T08:00:00Z")));
        return id;
    }

    private UUID insertValid(UUID owner) {
        return insert(owner, "meo", "STATIC", "image/png", 256, 256, 4, digest(1));
    }

    /** 32 bytes that differ by `seed`. */
    private static byte[] digest(int seed) {
        byte[] sha = new byte[32];
        sha[0] = (byte) seed;
        return sha;
    }

    private void insertContent(UUID stickerId, byte[] content) {
        jdbc.update("INSERT INTO sticker_content (sticker_id, content) VALUES (?, ?)", stickerId, content);
    }

    @Test
    void storesAStickerAndItsContentApart() {
        UUID id = insertValid(alice);
        insertContent(id, PIXEL);

        assertThat(jdbc.queryForObject("SELECT name FROM sticker WHERE id = ?", String.class, id)).isEqualTo("meo");
        assertThat(jdbc.queryForObject("SELECT content FROM sticker_content WHERE sticker_id = ?", byte[].class, id))
                .containsExactly(PIXEL);
    }

    @Test
    void acceptsEveryMediaTypeAndKindTheLibraryKnowsAtTheEdgesOfTheLimits() {
        insert(alice, "a", "STATIC", "image/png", 1, 1, 1, digest(1));
        insert(alice, "b", "ANIMATED", "image/gif", 16383, 16383, 10_485_760, digest(2));
        insert(alice, "c", "ANIMATED", "image/webp", 64, 64, 100, digest(3));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM sticker", Integer.class)).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = { "VIDEO", "static", "" })
    void refusesAKindOtherThanStaticOrAnimated(String kind) {
        assertThatThrownBy(() -> insert(alice, "meo", kind, "image/png", 256, 256, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_kind_ck");
    }

    @ParameterizedTest
    @ValueSource(strings = { "image/jpeg", "image/svg+xml", "png", "IMAGE/PNG" })
    void refusesAMediaTypeTheLibraryDoesNotKeep(String mediaType) {
        assertThatThrownBy(() -> insert(alice, "meo", "STATIC", mediaType, 256, 256, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_media_type_ck");
    }

    @ParameterizedTest
    @CsvSource({ "0,256", "256,0", "-1,256", "256,-1", "16384,256", "256,16384" })
    void refusesADimensionOutsideWhatAnImageCanBe(int width, int height) {
        assertThatThrownBy(() -> insert(alice, "meo", "STATIC", "image/png", width, height, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_dimensions_ck");
    }

    @ParameterizedTest
    @ValueSource(longs = { 0, -1, 10_485_761 })
    void refusesASizeOutsideWhatAStickerCanBe(long sizeBytes) {
        assertThatThrownBy(() -> insert(alice, "meo", "STATIC", "image/png", 256, 256, sizeBytes, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_size_ck");
    }

    static Stream<String> namesTheDatabaseRefuses() {
        return Stream.of("", " ", "   ", "x".repeat(51));
    }

    @ParameterizedTest
    @MethodSource("namesTheDatabaseRefuses")
    void refusesABlankOrTooLongName(String name) {
        // A blank name is refused by sticker_name_ck, a name of 51 characters by the type varchar(50): the row is refused either way.
        assertThatThrownBy(() -> insert(alice, name, "STATIC", "image/png", 256, 256, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void refusesABlankNameByTheCheckAndNotOnlyByTheApplication() {
        assertThatThrownBy(() -> insert(alice, "   ", "STATIC", "image/png", 256, 256, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_name_ck");
    }

    @Test
    void countsTheLengthOfANameInCodePoints() {
        // 50 code points is the limit, and a code point outside the BMP counts once (char_length, not the UTF-16 length).
        insert(alice, "😀".repeat(50), "STATIC", "image/png", 256, 256, 4, digest(1));

        assertThat(jdbc.queryForObject("SELECT char_length(name) FROM sticker", Integer.class)).isEqualTo(50);
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 31, 33 })
    void refusesADigestThatIsNotAnSha256(int length) {
        assertThatThrownBy(() -> insert(alice, "meo", "STATIC", "image/png", 256, 256, 4, new byte[length]))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_sha256_ck");
    }

    @Test
    void refusesTheSameContentTwiceForOneOwner() {
        insert(alice, "meo", "STATIC", "image/png", 256, 256, 4, digest(9));

        assertThatThrownBy(() -> insert(alice, "meo 2", "STATIC", "image/png", 256, 256, 4, digest(9)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_user_sha256_uq");
    }

    @Test
    void acceptsTheSameContentForTwoOwners() {
        insert(alice, "meo", "STATIC", "image/png", 256, 256, 4, digest(9));
        insert(bob, "meo", "STATIC", "image/png", 256, 256, 4, digest(9));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM sticker WHERE sha256 = ?", Integer.class, digest(9))).isEqualTo(2);
    }

    @Test
    void refusesAStickerWithoutAKnownOwner() {
        assertThatThrownBy(() -> insert(UUID.randomUUID(), "meo", "STATIC", "image/png", 256, 256, 4, digest(1)))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_user_fk");
    }

    @Test
    void refusesContentWithoutASticker() {
        assertThatThrownBy(() -> insertContent(UUID.randomUUID(), PIXEL)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_content_sticker_fk");
    }

    @Test
    void refusesEmptyContent() {
        UUID id = insertValid(alice);

        assertThatThrownBy(() -> insertContent(id, new byte[0])).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_content_size_ck");
    }

    @Test
    void refusesTwoContentsForOneSticker() {
        UUID id = insertValid(alice);
        insertContent(id, PIXEL);

        assertThatThrownBy(() -> insertContent(id, PIXEL)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_content_pk");
    }

    @Test
    void deletingAStickerDeletesItsContentAndOnlyItsContent() {
        UUID id = insertValid(alice);
        UUID kept = insert(bob, "meo", "STATIC", "image/png", 256, 256, 4, digest(2));
        insertContent(id, PIXEL);
        insertContent(kept, PIXEL);

        jdbc.update("DELETE FROM sticker WHERE id = ?", id);

        assertThat(jdbc.queryForList("SELECT sticker_id FROM sticker_content", UUID.class)).containsExactly(kept);
    }

    @Test
    void indexesTheStickersOfAnOwnerNewestFirst() {
        List<String> indexes = jdbc.queryForList("SELECT indexname FROM pg_indexes WHERE tablename = 'sticker'", String.class);

        assertThat(indexes).contains("sticker_user_created_idx", "sticker_user_sha256_uq");
        assertThat(jdbc.queryForObject("SELECT indexdef FROM pg_indexes WHERE indexname = 'sticker_user_created_idx'",
                String.class)).contains("(user_id, created_at DESC)");
    }

    @Test
    void keepsTheBytesOutOfLineAndUncompressed() {
        // Images are compressed already, so PostgreSQL should not try again (EXTERNAL = out of line, not compressed).
        String storage = jdbc.queryForObject("""
                SELECT attstorage::text FROM pg_attribute
                WHERE attrelid = 'sticker_content'::regclass AND attname = 'content'""", String.class);

        assertThat(storage).isEqualTo("e");
    }

}
