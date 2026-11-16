package dev.sino.sticker.application;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.jdbc.JdbcTestUtils;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.SinoException;
import dev.sino.sticker.domain.Sticker;
import dev.sino.sticker.domain.StickerErrorCode;
import dev.sino.sticker.infrastructure.StickerContentRepository;
import dev.sino.sticker.infrastructure.StickerRepository;

/**
 * Keeping a sticker when things go wrong (ST-06): two uploads of one file at the same moment, and a failure after the
 * sticker row is written. The two repositories are wrapped (see {@link Hooks}) so that the order of events can be forced
 * and a failure can be made to happen at the exact step.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, StickerServiceTests.Clocks.class, StickerServiceFailuresTests.Hooks.class })
@ActiveProfiles("test")
@TestPropertySource(properties = { "sino.stickers.max-file-size=20KB", "sino.stickers.max-side=64", "sino.stickers.max-per-owner=3" })
class StickerServiceFailuresTests {

    @Autowired
    private StickerService service;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "sticker", "sticker_pack", "app_user");
        owner = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'owner@sino.test', 'Owner', 'ACTIVE', now(), now())", owner);
    }

    @AfterEach
    void removeTheHooks() {
        Hooks.afterLookingForADuplicate = () -> {
        };
        Hooks.beforeKeepingTheBytes = () -> {
        };
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private Object outcomeOfUploading(byte[] file) {
        try {
            return service.upload(owner, "meo.png", null, file);
        } catch (RuntimeException e) {
            return e;
        }
    }

    @Test
    void twoUploadsOfOneFileAtTheSameMomentKeepOneAndRefuseTheOtherAsADuplicate() throws Exception {
        // Both look for a duplicate before either has written: the barrier holds the first two looks until both have come.
        CyclicBarrier bothHaveLooked = new CyclicBarrier(2);
        AtomicInteger looks = new AtomicInteger();
        Hooks.afterLookingForADuplicate = () -> {
            if (looks.incrementAndGet() <= 2) {
                try {
                    bothHaveLooked.await(10, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }
        };
        byte[] file = png(20, 20);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Object> outcomes;
        try {
            Callable<Object> upload = () -> outcomeOfUploading(file);
            Future<Object> first = pool.submit(upload);
            Future<Object> second = pool.submit(upload);
            outcomes = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }

        assertThat(outcomes).filteredOn(Sticker.class::isInstance).hasSize(1);
        Sticker kept = (Sticker) outcomes.stream().filter(Sticker.class::isInstance).findFirst().orElseThrow();
        assertThat(outcomes).filteredOn(SinoException.class::isInstance).singleElement().isInstanceOfSatisfying(SinoException.class, e -> {
            assertThat(e.errorCode()).isEqualTo(StickerErrorCode.STICKER_DUPLICATE);
            assertThat(e.properties()).containsEntry("stickerId", kept.id().toString());
        });
        assertThat(looks.get()).isGreaterThanOrEqualTo(3); // the two before writing, and the one that names the sticker kept
        assertThat(count("sticker")).isEqualTo(1);
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    @Test
    void aFailureWhileKeepingTheBytesLeavesNoStickerBehind() {
        Hooks.beforeKeepingTheBytes = () -> {
            throw new DataAccessResourceFailureException("the disk is full");
        };

        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, png(20, 20))).isInstanceOf(DataAccessResourceFailureException.class);

        assertThat(count("sticker")).isZero();
        assertThat(count("sticker_content")).isZero();
    }

    @Test
    void aConstraintFailureThatIsNotADuplicateIsNotReportedAsOne() {
        Hooks.beforeKeepingTheBytes = () -> {
            throw new DataIntegrityViolationException("some other constraint");
        };

        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, png(20, 20))).isInstanceOf(DataIntegrityViolationException.class);

        assertThat(count("sticker")).isZero();
    }

    @Test
    void aFileThatCouldNotBeKeptBecauseOfAFailureIsKeptTheNextTime() {
        AtomicInteger saves = new AtomicInteger();
        Hooks.beforeKeepingTheBytes = () -> {
            if (saves.incrementAndGet() == 1) {
                throw new DataAccessResourceFailureException("the disk is full");
            }
        };
        byte[] file = png(20, 20);

        assertThatThrownBy(() -> service.upload(owner, "meo.png", null, file)).isInstanceOf(DataAccessResourceFailureException.class);
        Sticker kept = service.upload(owner, "meo.png", null, file);

        assertThat(kept.id()).isNotNull();
        assertThat(count("sticker")).isEqualTo(1);
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    /**
     * Wraps the two repositories in proxies that hand every call to the real one and, at two points, run a hook first or
     * after. (A Mockito spy cannot call the real method of a Spring Data proxy.)
     */
    @TestConfiguration(proxyBeanMethods = false)
    static class Hooks {

        static volatile Runnable afterLookingForADuplicate = () -> {
        };
        static volatile Runnable beforeKeepingTheBytes = () -> {
        };

        @Bean
        static BeanPostProcessor repositoryHooks() {
            return new BeanPostProcessor() {

                @Override
                public Object postProcessAfterInitialization(Object bean, String beanName) {
                    if (bean instanceof StickerRepository) {
                        return wrap(bean, StickerRepository.class, "findByOwnerIdAndSha256", false);
                    }
                    if (bean instanceof StickerContentRepository) {
                        return wrap(bean, StickerContentRepository.class, "save", true);
                    }
                    return bean;
                }

                private Object wrap(Object target, Class<?> type, String hookedMethod, boolean before) {
                    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, (proxy, method, args) -> {
                        boolean hooked = method.getName().equals(hookedMethod);
                        if (hooked && before) {
                            beforeKeepingTheBytes.run();
                        }
                        Object result;
                        try {
                            result = method.invoke(target, args);
                        } catch (InvocationTargetException e) {
                            throw e.getCause();
                        }
                        if (hooked && !before) {
                            afterLookingForADuplicate.run();
                        }
                        return result;
                    });
                }

            };
        }

    }

}
