package dev.sino.sticker.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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
import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerContent;
import dev.sino.sticker.domain.StickerImage;
import dev.sino.sticker.domain.StickerKind;
import dev.sino.sticker.domain.StickerMediaType;

/**
 * The sticker tables through their repositories (ST-05, D-331) on a real PostgreSQL: that what is written comes back as
 * it was, that a list never reads the bytes, and that every question has the owner in it.
 */
@DataJpaTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class StickerRepositoryTests {

    private static final StickerImage PNG = new StickerImage(StickerMediaType.PNG, StickerKind.STATIC, 256, 128);
    private static final StickerImage GIF = new StickerImage(StickerMediaType.GIF, StickerKind.ANIMATED, 320, 240);

    @Autowired
    private StickerRepository stickers;

    @Autowired
    private StickerContentRepository contents;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID alice;
    private UUID bob;

    @BeforeEach
    void createOwners() {
        alice = users.saveAndFlush(new AppUser("alice@example.com", "Alice")).id();
        bob = users.saveAndFlush(new AppUser("bob@example.com", "Bob")).id();
    }

    private static Instant at(int minute) {
        return Instant.parse("2026-10-19T08:00:00Z").plusSeconds(60L * minute);
    }

    private static byte[] bytes(int seed, int length) {
        byte[] bytes = new byte[length];
        new Random(seed).nextBytes(bytes);
        return bytes;
    }

    /** Saves a sticker and its content, as the service does, and clears the persistence context so the next read is real. */
    private Sticker keep(UUID owner, String name, StickerImage image, byte[] content, Instant at) {
        Sticker sticker = stickers.saveAndFlush(Sticker.create(owner, name, image, content, at));
        contents.saveAndFlush(StickerContent.of(sticker.id(), content));
        entityManager.clear();
        return sticker;
    }

    @Test
    void writesAStickerAndReadsEveryFieldBack() {
        byte[] file = bytes(1, 2048);
        Sticker saved = keep(alice, "Mèo vui", PNG, file, at(0));

        Sticker read = stickers.findByIdAndOwnerId(saved.id(), alice).orElseThrow();

        assertThat(read.id()).isEqualTo(saved.id()).isNotNull();
        assertThat(read.ownerId()).isEqualTo(alice);
        assertThat(read.name()).isEqualTo("Mèo vui");
        assertThat(read.mediaType()).isEqualTo(StickerMediaType.PNG);
        assertThat(read.kind()).isEqualTo(StickerKind.STATIC);
        assertThat(read.width()).isEqualTo(256);
        assertThat(read.height()).isEqualTo(128);
        assertThat(read.sizeBytes()).isEqualTo(2048);
        assertThat(read.sha256()).containsExactly(saved.sha256());
        assertThat(read.createdAt()).isEqualTo(at(0));
    }

    @ParameterizedTest
    @CsvSource({ "PNG,STATIC", "PNG,ANIMATED", "GIF,STATIC", "GIF,ANIMATED", "WEBP,STATIC", "WEBP,ANIMATED" })
    void readsEveryTypeAndKindBackAsItWasKept(StickerMediaType type, StickerKind kind) {
        Sticker saved = keep(alice, "any", new StickerImage(type, kind, 40, 30), bytes(3, 10), at(0));

        Sticker read = stickers.findByIdAndOwnerId(saved.id(), alice).orElseThrow();

        assertThat(read.mediaType()).isEqualTo(type);
        assertThat(read.kind()).isEqualTo(kind);
        assertThat(read.width()).isEqualTo(40);
        assertThat(read.height()).isEqualTo(30);
    }

    @Test
    void storesTheMediaTypeAsItIsSentAndNotAsTheNameOfTheConstant() {
        Sticker saved = keep(alice, "nhay", GIF, bytes(2, 100), at(0));

        assertThat(jdbc.queryForObject("SELECT media_type FROM sticker WHERE id = ?", String.class, saved.id())).isEqualTo("image/gif");
        assertThat(jdbc.queryForObject("SELECT kind FROM sticker WHERE id = ?", String.class, saved.id())).isEqualTo("ANIMATED");
    }

    @Test
    void giveEachStickerItsOwnIdThatSortsByTimeOfCreation() {
        Sticker first = keep(alice, "a", PNG, bytes(3, 10), at(0));
        Sticker second = keep(alice, "b", PNG, bytes(4, 10), at(0));

        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(first.id().version()).isEqualTo(7);
    }

    @Test
    void listsTheStickersOfAnOwnerNewestFirstAndOnlyThose() {
        Sticker old = keep(alice, "old", PNG, bytes(5, 10), at(0));
        Sticker newer = keep(alice, "newer", GIF, bytes(6, 10), at(5));
        keep(bob, "bobs", PNG, bytes(7, 10), at(9));

        List<Sticker> list = stickers.findByOwnerIdOrderByCreatedAtDescIdDesc(alice);

        assertThat(list).extracting(Sticker::id).containsExactly(newer.id(), old.id());
    }

    @Test
    void ordersStickersCreatedAtTheSameMomentByTheirIdSoTheOrderIsStable() {
        Sticker a = keep(alice, "a", PNG, bytes(8, 10), at(0));
        Sticker b = keep(alice, "b", PNG, bytes(9, 10), at(0));
        Sticker c = keep(alice, "c", PNG, bytes(10, 10), at(0));

        assertThat(stickers.findByOwnerIdOrderByCreatedAtDescIdDesc(alice)).extracting(Sticker::id)
                .containsExactly(c.id(), b.id(), a.id());
    }

    @Test
    void listingNeverReadsTheBytesOfAnySticker() {
        for (int i = 0; i < 5; i++) {
            keep(alice, "s" + i, PNG, bytes(20 + i, 50_000), at(i));
        }
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        List<Sticker> list = stickers.findByOwnerIdOrderByCreatedAtDescIdDesc(alice);

        assertThat(list).hasSize(5);
        assertThat(statistics.getEntityStatistics(StickerContent.class.getName()).getLoadCount()).isZero();
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void findsAStickerOnlyForItsOwner() {
        Sticker saved = keep(alice, "meo", PNG, bytes(30, 10), at(0));

        assertThat(stickers.findByIdAndOwnerId(saved.id(), alice)).isPresent();
        assertThat(stickers.findByIdAndOwnerId(saved.id(), bob)).isEmpty();
        assertThat(stickers.findByIdAndOwnerId(UUID.randomUUID(), alice)).isEmpty();
    }

    @Test
    void findsTheStickerOfAnOwnerThatHasTheSameFile() {
        byte[] file = bytes(31, 300);
        Sticker saved = keep(alice, "meo", PNG, file, at(0));
        byte[] sha = Sticker.create(alice, "x", PNG, file, at(0)).sha256();

        assertThat(stickers.findByOwnerIdAndSha256(alice, sha)).map(Sticker::id).contains(saved.id());
        assertThat(stickers.findByOwnerIdAndSha256(bob, sha)).isEmpty();
        assertThat(stickers.findByOwnerIdAndSha256(alice, Sticker.create(alice, "x", PNG, bytes(32, 300), at(0)).sha256())).isEmpty();
    }

    @Test
    void countsTheStickersOfOneOwner() {
        keep(alice, "a", PNG, bytes(40, 10), at(0));
        keep(alice, "b", PNG, bytes(41, 10), at(1));
        keep(bob, "c", PNG, bytes(42, 10), at(2));

        assertThat(stickers.countByOwnerId(alice)).isEqualTo(2);
        assertThat(stickers.countByOwnerId(bob)).isEqualTo(1);
        assertThat(stickers.countByOwnerId(UUID.randomUUID())).isZero();
    }

    @Test
    void theDatabaseRefusesTheSameFileTwiceForOneOwner() {
        byte[] file = bytes(50, 100);
        stickers.saveAndFlush(Sticker.create(alice, "meo", PNG, file, at(0)));

        assertThatThrownBy(() -> stickers.saveAndFlush(Sticker.create(alice, "meo 2", PNG, file, at(1))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void readsTheBytesBackExactly() {
        byte[] file = bytes(60, 100_000);
        Sticker saved = keep(alice, "big", PNG, file, at(0));

        Optional<StickerContent> read = contents.findById(saved.id());

        assertThat(read).isPresent();
        assertThat(read.get().bytes()).containsExactly(file);
    }

    @Test
    void readsBytesThatLookLikeTextAndLikeZerosExactly() {
        byte[] zeros = new byte[1000];
        byte[] allValues = new byte[256];
        for (int i = 0; i < 256; i++) {
            allValues[i] = (byte) i;
        }
        Sticker a = keep(alice, "zeros", PNG, zeros, at(0));
        Sticker b = keep(alice, "all", PNG, allValues, at(1));

        assertThat(contents.findById(a.id()).orElseThrow().bytes()).containsExactly(zeros);
        assertThat(contents.findById(b.id()).orElseThrow().bytes()).containsExactly(allValues);
    }

    @Test
    void aContentThatIsSavedOrReadIsNoLongerNew() {
        Sticker sticker = stickers.saveAndFlush(Sticker.create(alice, "meo", PNG, bytes(65, 10), at(0)));
        StickerContent content = StickerContent.of(sticker.id(), bytes(65, 10));
        assertThat(content.isNew()).isTrue();

        contents.saveAndFlush(content);
        assertThat(content.isNew()).isFalse();

        entityManager.clear();
        assertThat(contents.findById(sticker.id()).orElseThrow().isNew()).isFalse();
    }

    @Test
    void savingANewContentDoesNotReadTheTableFirst() {
        Sticker sticker = stickers.saveAndFlush(Sticker.create(alice, "meo", PNG, bytes(66, 10), at(0)));
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        contents.saveAndFlush(StickerContent.of(sticker.id(), bytes(66, 10)));

        // One INSERT, and no SELECT of a row that is not there (the work of merge for an entity that is given its ID).
        assertThat(statistics.getEntityStatistics(StickerContent.class.getName()).getLoadCount()).isZero();
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void deletesAStickerOfTheOwnerWithItsBytesAndNothingElse() {
        Sticker gone = keep(alice, "gone", PNG, bytes(70, 100), at(0));
        Sticker kept = keep(alice, "kept", PNG, bytes(71, 100), at(1));

        int deleted = stickers.deleteOwned(gone.id(), alice);
        entityManager.clear();

        assertThat(deleted).isEqualTo(1);
        assertThat(stickers.findById(gone.id())).isEmpty();
        assertThat(contents.findById(gone.id())).isEmpty();
        assertThat(stickers.findById(kept.id())).isPresent();
        assertThat(contents.findById(kept.id())).isPresent();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sticker_content", Integer.class)).isEqualTo(1);
    }

    @Test
    void deletesNothingForAnotherOwnerOrAnUnknownId() {
        Sticker mine = keep(alice, "mine", PNG, bytes(80, 100), at(0));

        assertThat(stickers.deleteOwned(mine.id(), bob)).isZero();
        assertThat(stickers.deleteOwned(UUID.randomUUID(), alice)).isZero();
        entityManager.clear();

        assertThat(stickers.findById(mine.id())).isPresent();
        assertThat(contents.findById(mine.id())).isPresent();
    }

    @Test
    void aStickerDeletedFreesItsFileToBeKeptAgain() {
        byte[] file = bytes(90, 100);
        Sticker first = keep(alice, "meo", PNG, file, at(0));
        stickers.deleteOwned(first.id(), alice);
        entityManager.clear();

        Sticker again = keep(alice, "meo", PNG, file, at(1));

        assertThat(again.id()).isNotEqualTo(first.id());
        assertThat(stickers.countByOwnerId(alice)).isEqualTo(1);
    }

}
