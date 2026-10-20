package dev.sino.sticker.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
import dev.sino.sticker.domain.StickerPack;

/**
 * The table of sticker packs and the pack of a sticker (SP-01, D-340), in plain SQL on a real PostgreSQL: what the
 * database itself refuses and keeps. Every test is one transaction and a refused statement aborts it, so a test checks
 * one refusal.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class StickerPackSchemaTests {

    private static final Timestamp AT = Timestamp.from(Instant.parse("2026-10-20T08:00:00Z"));

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private StickerPackRepository packs;

    @Autowired
    private StickerRepository stickers;

    private UUID alice;
    private UUID bob;

    @BeforeEach
    void createOwners() {
        // Flushed: the plain SQL below is not seen by the persistence context, and the foreign keys need the rows.
        alice = users.saveAndFlush(new AppUser("alice@example.com", "Alice")).id();
        bob = users.saveAndFlush(new AppUser("bob@example.com", "Bob")).id();
    }

    private UUID insertPack(UUID owner, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sticker_pack (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", id, owner, name, AT);
        return id;
    }

    private UUID insertSticker(UUID owner, UUID pack, int seed) {
        UUID id = UUID.randomUUID();
        byte[] sha = new byte[32];
        sha[0] = (byte) seed;
        jdbc.update("""
                INSERT INTO sticker (id, user_id, name, media_type, kind, width, height, size_bytes, sha256, created_at,
                                     pack_id)
                VALUES (?, ?, 'meo', 'image/png', 'STATIC', 256, 256, 4, ?, ?, ?)""", id, owner, sha, AT, pack);
        return id;
    }

    private UUID packOf(UUID sticker) {
        return jdbc.queryForObject("SELECT pack_id FROM sticker WHERE id = ?", UUID.class, sticker);
    }

    @Test
    void keepsAPackAndAStickerInIt() {
        UUID pack = insertPack(alice, "Mèo");
        UUID sticker = insertSticker(alice, pack, 1);

        assertThat(packOf(sticker)).isEqualTo(pack);
    }

    @Test
    void theStickerEntityReadsItsPack() {
        UUID pack = insertPack(alice, "Mèo");
        UUID inPack = insertSticker(alice, pack, 1);
        UUID inNone = insertSticker(alice, null, 2);

        assertThat(stickers.findById(inPack).orElseThrow().packId()).isEqualTo(pack);
        assertThat(stickers.findById(inNone).orElseThrow().packId()).isNull();
    }

    @Test
    void aStickerWithoutAPackIsInNone() {
        UUID sticker = insertSticker(alice, null, 1);

        assertThat(packOf(sticker)).isNull();
    }

    @ParameterizedTest(name = "[{index}] \"{0}\"")
    @CsvSource(delimiter = '|', value = { "''", "'   '" })
    void refusesABlankName(String name) {
        assertThatThrownBy(() -> insertPack(alice, name)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_pack_name_ck");
    }

    @Test
    void refusesANameOver50Characters() {
        assertThatThrownBy(() -> insertPack(alice, "x".repeat(51))).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("character varying(50)");
    }

    @Test
    void takesANameOf50Characters() {
        insertPack(alice, "x".repeat(50));

        assertThat(packs.count()).isEqualTo(1);
    }

    @Test
    void refusesTheSameNameTwiceForOneOwnerWhateverTheCase() {
        insertPack(alice, "Mèo vui");

        assertThatThrownBy(() -> insertPack(alice, "MÈO VUI")).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_pack_user_name_uq");
    }

    @Test
    void twoOwnersMayHaveTheSameName() {
        insertPack(alice, "Mèo");
        insertPack(bob, "Mèo");

        assertThat(packs.count()).isEqualTo(2);
    }

    @Test
    void refusesAStickerInThePackOfAnotherOwner() {
        UUID bobsPack = insertPack(bob, "Của Bob");

        assertThatThrownBy(() -> insertSticker(alice, bobsPack, 1)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("sticker_pack_fk");
    }

    @Test
    void refusesMovingAStickerIntoThePackOfAnotherOwner() {
        UUID sticker = insertSticker(alice, null, 1);
        UUID bobsPack = insertPack(bob, "Của Bob");

        assertThatThrownBy(() -> jdbc.update("UPDATE sticker SET pack_id = ? WHERE id = ?", bobsPack, sticker))
                .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("sticker_pack_fk");
    }

    @Test
    void deletingAPackKeepsItsStickersInNoPackAndWithTheirOwner() {
        UUID pack = insertPack(alice, "Mèo");
        UUID first = insertSticker(alice, pack, 1);
        UUID second = insertSticker(alice, pack, 2);
        UUID elsewhere = insertSticker(alice, insertPack(alice, "Chó"), 3);

        jdbc.update("DELETE FROM sticker_pack WHERE id = ?", pack);

        List<UUID> kept = jdbc.queryForList("SELECT id FROM sticker WHERE user_id = ? AND pack_id IS NULL ORDER BY id",
                UUID.class, alice);
        assertThat(kept).containsExactlyInAnyOrder(first, second);
        assertThat(packOf(elsewhere)).isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sticker WHERE user_id = ?", Long.class, alice)).isEqualTo(3);
    }

    @Test
    void theRepositoryReadsAPackOfItsOwnerOnlyAndListsThemOldestFirst() {
        StickerPack first = packs.saveAndFlush(StickerPack.create(alice, "Mèo", Instant.parse("2026-10-20T08:00:00Z")));
        StickerPack second = packs.saveAndFlush(StickerPack.create(alice, "Chó", Instant.parse("2026-10-20T09:00:00Z")));
        StickerPack bobs = packs.saveAndFlush(StickerPack.create(bob, "Của Bob", Instant.parse("2026-10-20T07:00:00Z")));

        assertThat(packs.findByIdAndOwnerId(first.id(), alice)).isPresent();
        assertThat(packs.findByIdAndOwnerId(bobs.id(), alice)).isEmpty();
        assertThat(packs.findByOwnerIdOrderByCreatedAtAscIdAsc(alice)).extracting(StickerPack::id)
                .containsExactly(first.id(), second.id());
        assertThat(packs.countByOwnerId(alice)).isEqualTo(2);
    }

}
