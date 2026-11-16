package dev.sino.sticker.application;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
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
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.infrastructure.StickerPackRepository;

/**
 * Stickers in packs (SP-03): an upload into a pack, a rename, a move to another pack or out of every pack, on a real
 * PostgreSQL. The repository of the packs is wrapped (see {@link Hooks}) so that a pack can be deleted right after the
 * service found it, before the sticker is written.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, StickerServiceTests.Clocks.class, StickerInPackTests.Hooks.class })
@ActiveProfiles("test")
class StickerInPackTests {

    private static final Instant NOW = Instant.parse("2026-10-20T08:00:00Z");

    @Autowired
    private StickerService stickers;

    @Autowired
    private StickerPackService packs;

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
        Hooks.afterFindingAPack = () -> {
        };
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    private UUID pack(UUID packOwner, String name) {
        return packs.create(packOwner, name).id();
    }

    private Sticker upload(UUID pack, int side) {
        return stickers.upload(owner, "meo.png", null, pack, png(side, side));
    }

    private UUID storedPackOf(UUID sticker) {
        return jdbc.queryForObject("SELECT pack_id FROM sticker WHERE id = ?", UUID.class, sticker);
    }

    private String storedNameOf(UUID sticker) {
        return jdbc.queryForObject("SELECT name FROM sticker WHERE id = ?", String.class, sticker);
    }

    /**
     * Deletes a pack as another request would: on another thread, so in its own transaction that commits at once, and
     * not in the transaction of the service that called the hook.
     */
    private void deleteElsewhere(UUID pack) {
        CompletableFuture.runAsync(() -> jdbc.update("DELETE FROM sticker_pack WHERE id = ?", pack)).join();
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private static Consumer<Throwable> refusedWith(ErrorCode code) {
        return e -> assertThat(e).isInstanceOfSatisfying(SinoException.class, sino -> assertThat(sino.errorCode()).isEqualTo(code));
    }

    @Test
    void anUploadIntoAPackOfTheOwnerKeepsTheStickerInIt() {
        UUID cats = pack(owner, "Mèo");

        Sticker kept = upload(cats, 20);

        assertThat(kept.packId()).isEqualTo(cats);
        assertThat(storedPackOf(kept.id())).isEqualTo(cats);
        assertThat(packs.get(owner, cats).stickerCount()).isEqualTo(1);
    }

    @Test
    void anUploadWithoutAPackKeepsTheStickerInNone() {
        assertThat(upload(null, 20).packId()).isNull();
        assertThat(stickers.upload(owner, "meo.png", null, png(21, 21)).packId()).isNull();
    }

    @Test
    void anUploadIntoAPackOfAnotherOwnerOrNoPackAtAllKeepsNothing() {
        UUID theirs = pack(insertUser("other@sino.test"), "Của người khác");

        assertThatThrownBy(() -> upload(theirs, 20)).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThatThrownBy(() -> upload(UUID.randomUUID(), 20)).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(count("sticker")).isZero();
        assertThat(count("sticker_content")).isZero();
    }

    @Test
    void anUploadIntoAPackDeletedRightAfterItWasFoundIsRefusedAsNoSuchPack() {
        UUID cats = pack(owner, "Mèo");
        // Another request deletes the pack between the look of the service and the write of the sticker.
        Hooks.afterFindingAPack = () -> deleteElsewhere(cats);

        assertThatThrownBy(() -> upload(cats, 20)).satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(count("sticker")).isZero();
    }

    @Test
    void movesAStickerToAnotherPackOfTheOwner() {
        UUID cats = pack(owner, "Mèo");
        UUID dogs = pack(owner, "Chó");
        Sticker kept = upload(cats, 20);

        Sticker moved = stickers.change(owner, kept.id(), new StickerChange(null, StickerChange.PackMove.into(dogs)));

        assertThat(moved.packId()).isEqualTo(dogs);
        assertThat(storedPackOf(kept.id())).isEqualTo(dogs);
        assertThat(packs.get(owner, cats).stickerCount()).isZero();
        assertThat(packs.get(owner, dogs).stickerCount()).isEqualTo(1);
    }

    @Test
    void takesAStickerOutOfEveryPack() {
        Sticker kept = upload(pack(owner, "Mèo"), 20);

        Sticker moved = stickers.change(owner, kept.id(), new StickerChange(null, StickerChange.PackMove.out()));

        assertThat(moved.packId()).isNull();
        assertThat(storedPackOf(kept.id())).isNull();
    }

    @Test
    void renamesAStickerByTheRulesOfAnUploadAndKeepsItsPictureAndPack() {
        UUID cats = pack(owner, "Mèo");
        Sticker kept = upload(cats, 20);
        byte[] digest = kept.sha256();

        Sticker renamed = stickers.change(owner, kept.id(), new StickerChange("  Mèo vui  ", null));

        assertThat(renamed.name()).isEqualTo("Mèo vui");
        assertThat(storedNameOf(kept.id())).isEqualTo("Mèo vui");
        assertThat(renamed.sha256()).isEqualTo(digest);
        assertThat(renamed.packId()).isEqualTo(cats);
        assertThat(stickers.change(owner, kept.id(), new StickerChange("x".repeat(60), null)).name()).hasSize(50);
        assertThat(stickers.change(owner, kept.id(), new StickerChange("   ", null)).name()).isEqualTo("Sticker");
    }

    @Test
    void renamesAndMovesInOneChange() {
        Sticker kept = upload(null, 20);
        UUID dogs = pack(owner, "Chó");

        Sticker changed = stickers.change(owner, kept.id(), new StickerChange("Cún", StickerChange.PackMove.into(dogs)));

        assertThat(changed.name()).isEqualTo("Cún");
        assertThat(changed.packId()).isEqualTo(dogs);
    }

    @Test
    void aStickerOfAnotherOwnerIsNotFoundAndStaysAsItWas() {
        UUID other = insertUser("other@sino.test");
        Sticker theirs = stickers.upload(other, "cua-ho.png", null, png(20, 20));

        assertThatThrownBy(() -> stickers.change(owner, theirs.id(), new StickerChange("Của tôi", null)))
                .satisfies(refusedWith(StickerErrorCode.STICKER_NOT_FOUND));
        assertThat(storedNameOf(theirs.id())).isEqualTo("cua-ho");
    }

    @Test
    void aStickerCannotMoveIntoAPackOfAnotherOwner() {
        Sticker kept = upload(null, 20);
        UUID theirs = pack(insertUser("other@sino.test"), "Của người khác");

        assertThatThrownBy(() -> stickers.change(owner, kept.id(), new StickerChange(null, StickerChange.PackMove.into(theirs))))
                .satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(storedPackOf(kept.id())).isNull();
    }

    @Test
    void aMoveIntoAPackDeletedRightAfterItWasFoundIsRefusedAsNoSuchPack() {
        Sticker kept = upload(null, 20);
        UUID dogs = pack(owner, "Chó");
        Hooks.afterFindingAPack = () -> deleteElsewhere(dogs);

        assertThatThrownBy(() -> stickers.change(owner, kept.id(), new StickerChange(null, StickerChange.PackMove.into(dogs))))
                .satisfies(refusedWith(StickerErrorCode.STICKER_PACK_NOT_FOUND));
        assertThat(storedPackOf(kept.id())).isNull();
    }

    @Test
    void aChangeNamesSomething() {
        assertThatIllegalArgumentException().isThrownBy(() -> new StickerChange(null, null));
        assertThatIllegalArgumentException().isThrownBy(() -> StickerChange.PackMove.into(null));
    }

    @Test
    void theListTellsThePackOfEachSticker() {
        UUID cats = pack(owner, "Mèo");
        Sticker inCats = upload(cats, 20);
        Sticker inNone = upload(null, 21);

        assertThat(stickers.list(owner)).extracting(Sticker::id, Sticker::packId)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(inNone.id(), null),
                        org.assertj.core.groups.Tuple.tuple(inCats.id(), cats));
    }

    /** Wraps the repository of the packs so that a test can act right after the service found a pack. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Hooks {

        static volatile Runnable afterFindingAPack = () -> {
        };

        @Bean
        static BeanPostProcessor packFinderHook() {
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
                                if (method.getName().equals("findByIdAndOwnerId")) {
                                    afterFindingAPack.run();
                                }
                                return result;
                            });
                }

            };
        }

    }

}
