package dev.sino.sticker.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.infrastructure.StickerPackRepository;

/**
 * The packs of a user (SP-02): create, rename, delete, list with their counts and covers, on a real PostgreSQL. The
 * test methods are not transactional, so every call commits or rolls back as it would in the application. At most
 * three packs per owner here, to reach the limit quickly. The repository of the packs is wrapped (see {@link Hooks}) so
 * that two creations of one name can be forced past the check before either writes.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, StickerServiceTests.Clocks.class, StickerPackServiceTests.Hooks.class })
@ActiveProfiles("test")
@TestPropertySource(properties = "sino.stickers.max-packs-per-owner=3")
class StickerPackServiceTests {

    private static final Instant NOW = Instant.parse("2026-10-20T08:00:00Z");

    @Autowired
    private StickerPackService service;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private StickerServiceTests.MovableClock clock;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "sticker", "sticker_pack", "app_user");
        owner = insertUser("owner@sino.test");
        clock.set(NOW);
    }

    @AfterEach
    void removeTheHook() {
        Hooks.afterLookingForAName = () -> {
        };
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    /** A sticker row of {@code owner}, in {@code pack} (or none), kept at {@code at}. */
    private UUID insertSticker(UUID stickerOwner, UUID pack, Instant at) {
        UUID id = UUID.randomUUID();
        byte[] sha = new byte[32];
        System.arraycopy(id.toString().getBytes(), 0, sha, 0, 32);
        jdbc.update("""
                INSERT INTO sticker (id, user_id, name, media_type, kind, width, height, size_bytes, sha256, created_at,
                                     pack_id)
                VALUES (?, ?, 'meo', 'image/png', 'STATIC', 8, 8, 4, ?, ?, ?)""", id, stickerOwner, sha, Timestamp.from(at),
                pack);
        return id;
    }

    private UUID packOf(UUID sticker) {
        return jdbc.queryForObject("SELECT pack_id FROM sticker WHERE id = ?", UUID.class, sticker);
    }

    private String nameOf(UUID pack) {
        return jdbc.queryForObject("SELECT name FROM sticker_pack WHERE id = ?", String.class, pack);
    }

    private int packCount() {
        return jdbc.queryForObject("SELECT count(*) FROM sticker_pack", Integer.class);
    }

    private static Consumer<Throwable> refusedWith(ErrorCode code) {
        return e -> assertThat(e).isInstanceOfSatisfying(SinoException.class, sino -> assertThat(sino.errorCode()).isEqualTo(code));
    }

    @Test
    void createsAPackWithATrimmedNameAndNoStickers() {
        StickerPackSummary pack = service.create(owner, "  Mèo vui  ");

        assertThat(pack.name()).isEqualTo("Mèo vui");
        assertThat(pack.stickerCount()).isZero();
        assertThat(pack.coverStickerId()).isNull();
        assertThat(pack.createdAt()).isEqualTo(NOW);
        assertThat(nameOf(pack.id())).isEqualTo("Mèo vui");
    }

    @Test
    void aBlankNameIsRefusedAndNothingIsKept() {
        assertThatIllegalArgumentException().isThrownBy(() -> service.create(owner, "   "));

        assertThat(packCount()).isZero();
    }

    @Test
    void aNameThatAnotherPackOfTheOwnerHasIsTakenWhateverItsCase() {
        service.create(owner, "Mèo vui");

        assertThatThrownBy(() -> service.create(owner, "  MÈO VUI ")).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NAME_TAKEN));
        assertThat(packCount()).isEqualTo(1);
    }

    @Test
    void twoOwnersMayUseTheSameName() {
        UUID other = insertUser("other@sino.test");
        service.create(owner, "Mèo");

        assertThat(service.create(other, "Mèo").name()).isEqualTo("Mèo");
    }

    @Test
    void anOwnerHasAtMostTheConfiguredNumberOfPacks() {
        service.create(owner, "Một");
        service.create(owner, "Hai");
        service.create(owner, "Ba");

        assertThatThrownBy(() -> service.create(owner, "Bốn")).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_LIMIT_REACHED))
                .isInstanceOfSatisfying(SinoException.class, e -> assertThat(e.properties()).containsEntry("maxPacks", 3));
        assertThat(packCount()).isEqualTo(3);
        UUID other = insertUser("other@sino.test");
        assertThat(service.create(other, "Bốn").name()).isEqualTo("Bốn");
    }

    @Test
    void listsThePacksOfTheOwnerOldestFirstWithHowManyStickersAndTheNewestOne() {
        StickerPackSummary cats = service.create(owner, "Mèo");
        clock.set(NOW.plus(Duration.ofHours(1)));
        StickerPackSummary dogs = service.create(owner, "Chó");
        clock.set(NOW.plus(Duration.ofHours(2)));
        StickerPackSummary goats = service.create(owner, "Dê");
        insertSticker(owner, cats.id(), NOW.plus(Duration.ofMinutes(10)));
        UUID newestCat = insertSticker(owner, cats.id(), NOW.plus(Duration.ofMinutes(20)));
        UUID onlyGoat = insertSticker(owner, goats.id(), NOW.plus(Duration.ofMinutes(5)));
        insertSticker(owner, null, NOW.plus(Duration.ofMinutes(30)));
        UUID other = insertUser("other@sino.test");
        UUID theirs = service.create(other, "Của người khác").id();
        insertSticker(other, theirs, NOW);

        List<StickerPackSummary> packs = service.list(owner);

        assertThat(packs).extracting(StickerPackSummary::id).containsExactly(cats.id(), dogs.id(), goats.id());
        assertThat(packs).extracting(StickerPackSummary::stickerCount).containsExactly(2L, 0L, 1L);
        assertThat(packs).extracting(StickerPackSummary::coverStickerId).containsExactly(newestCat, null, onlyGoat);
    }

    @Test
    void readsOnePackOfTheOwnerOnly() {
        StickerPackSummary cats = service.create(owner, "Mèo");
        insertSticker(owner, cats.id(), NOW);
        UUID other = insertUser("other@sino.test");
        UUID theirs = service.create(other, "Mèo").id();

        assertThat(service.get(owner, cats.id()).stickerCount()).isEqualTo(1);
        assertThatThrownBy(() -> service.get(owner, theirs)).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThatThrownBy(() -> service.get(owner, UUID.randomUUID())).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
    }

    @Test
    void renamesAPackAndKeepsItsStickers() {
        StickerPackSummary cats = service.create(owner, "Mèo");
        UUID sticker = insertSticker(owner, cats.id(), NOW);

        StickerPackSummary renamed = service.rename(owner, cats.id(), "  Mèo vui ");

        assertThat(renamed.name()).isEqualTo("Mèo vui");
        assertThat(renamed.stickerCount()).isEqualTo(1);
        assertThat(nameOf(cats.id())).isEqualTo("Mèo vui");
        assertThat(packOf(sticker)).isEqualTo(cats.id());
    }

    @Test
    void aPackMayTakeItsOwnNameInAnotherCase() {
        StickerPackSummary cats = service.create(owner, "mèo");

        assertThat(service.rename(owner, cats.id(), "Mèo").name()).isEqualTo("Mèo");
    }

    @Test
    void aPackCannotTakeTheNameOfAnotherPack() {
        service.create(owner, "Mèo");
        StickerPackSummary dogs = service.create(owner, "Chó");

        assertThatThrownBy(() -> service.rename(owner, dogs.id(), "MÈO")).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NAME_TAKEN));
        assertThat(nameOf(dogs.id())).isEqualTo("Chó");
    }

    @Test
    void aPackOfAnotherOwnerCannotBeRenamed() {
        UUID other = insertUser("other@sino.test");
        UUID theirs = service.create(other, "Của người khác").id();

        assertThatThrownBy(() -> service.rename(owner, theirs, "Của tôi")).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(nameOf(theirs)).isEqualTo("Của người khác");
    }

    @Test
    void deletingAPackKeepsItsStickersInNoPack() {
        StickerPackSummary cats = service.create(owner, "Mèo");
        UUID first = insertSticker(owner, cats.id(), NOW);
        UUID second = insertSticker(owner, cats.id(), NOW.plusSeconds(1));

        service.delete(owner, cats.id());

        assertThat(packCount()).isZero();
        assertThat(packOf(first)).isNull();
        assertThat(packOf(second)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sticker WHERE user_id = ?", Integer.class, owner)).isEqualTo(2);
        assertThatThrownBy(() -> service.delete(owner, cats.id())).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
    }

    @Test
    void aPackOfAnotherOwnerCannotBeDeleted() {
        UUID other = insertUser("other@sino.test");
        UUID theirs = service.create(other, "Của người khác").id();

        assertThatThrownBy(() -> service.delete(owner, theirs)).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(packCount()).isEqualTo(1);
    }

    @Test
    void twoCreationsOfOneNameAtTheSameMomentKeepOneAndRefuseTheOther() throws Exception {
        // Both look for the name before either has written: the barrier holds the first two looks until both have come.
        CyclicBarrier bothHaveLooked = new CyclicBarrier(2);
        AtomicInteger looks = new AtomicInteger();
        Hooks.afterLookingForAName = () -> {
            if (looks.incrementAndGet() <= 2) {
                try {
                    bothHaveLooked.await(10, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }
        };

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Object> outcomes;
        try {
            Callable<Object> create = () -> {
                try {
                    return service.create(owner, "Mèo");
                } catch (RuntimeException e) {
                    return e;
                }
            };
            Future<Object> first = pool.submit(create);
            Future<Object> second = pool.submit(create);
            outcomes = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }

        assertThat(outcomes).filteredOn(StickerPackSummary.class::isInstance).hasSize(1);
        assertThat(outcomes).filteredOn(SinoException.class::isInstance).singleElement().isInstanceOfSatisfying(
                SinoException.class, e -> assertThat(e.errorCode()).isEqualTo(StickerErrorCode.STICKER_PACK_NAME_TAKEN));
        assertThat(looks.get()).isGreaterThanOrEqualTo(3); // the two before writing, and the one that finds the pack kept
        assertThat(packCount()).isEqualTo(1);
    }

    /** Wraps the repository of the packs so that a test can act right after the service looked for a name. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Hooks {

        static volatile Runnable afterLookingForAName = () -> {
        };

        @Bean
        static BeanPostProcessor packRepositoryHook() {
            return new BeanPostProcessor() {

                @Override
                public Object postProcessAfterInitialization(Object bean, String beanName) {
                    if (!(bean instanceof StickerPackRepository)) {
                        return bean;
                    }
                    return Proxy.newProxyInstance(StickerPackRepository.class.getClassLoader(),
                            new Class<?>[] { StickerPackRepository.class }, (proxy, method, args) -> {
                                Object result;
                                try {
                                    result = method.invoke(bean, args);
                                } catch (InvocationTargetException e) {
                                    throw e.getCause();
                                }
                                if (method.getName().equals("findNamed")) {
                                    afterLookingForAName.run();
                                }
                                return result;
                            });
                }

            };
        }

    }

}
