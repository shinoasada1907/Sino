package dev.sino.sticker.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

/** The limits of the sticker library under {@code sino.stickers} (DN-1, D-333): their defaults and what stops the application. */
class StickerPropertiesTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @Test
    void theDefaultsAreTheLimitsOfDn1() {
        contextRunner.run(context -> {
            StickerProperties properties = context.getBean(StickerProperties.class);

            assertThat(properties.maxFileSize()).isEqualTo(DataSize.ofMegabytes(1));
            assertThat(properties.maxFileSize().toBytes()).isEqualTo(1_048_576L);
            assertThat(properties.maxSide()).isEqualTo(1024);
            assertThat(properties.maxPerOwner()).isEqualTo(300);
        });
    }

    @Test
    void bindsTheThreeLimits() {
        contextRunner.withPropertyValues("sino.stickers.max-file-size=512KB", "sino.stickers.max-side=512",
                "sino.stickers.max-per-owner=50").run(context -> {
                    StickerProperties properties = context.getBean(StickerProperties.class);

                    assertThat(properties.maxFileSize().toBytes()).isEqualTo(512 * 1024L);
                    assertThat(properties.maxSide()).isEqualTo(512);
                    assertThat(properties.maxPerOwner()).isEqualTo(50);
                });
    }

    @Test
    void acceptsTheLargestLimitsTheDatabaseTakes() {
        // 10 MiB and 16383 px are the floor of V21: nothing above them could be stored.
        contextRunner.withPropertyValues("sino.stickers.max-file-size=10MB", "sino.stickers.max-side=16383")
                .run(context -> assertThat(context).hasNotFailed());
    }

    @ParameterizedTest
    @ValueSource(strings = { "0B", "-1KB", "10MB1", "11MB", "10485761B" })
    void aFileSizeOfNothingOrAboveWhatTheDatabaseTakesStopsTheApplication(String size) {
        contextRunner.withPropertyValues("sino.stickers.max-file-size=" + size)
                .run(context -> assertThat(context).hasFailed());
    }

    @ParameterizedTest
    @ValueSource(strings = { "0", "-5", "16384", "100000" })
    void aSideOfNothingOrAboveWhatWebpCanSayStopsTheApplication(String side) {
        contextRunner.withPropertyValues("sino.stickers.max-side=" + side)
                .run(context -> assertThat(context).hasFailed());
    }

    @ParameterizedTest
    @ValueSource(strings = { "0", "-1" })
    void aCountOfNothingStopsTheApplication(String count) {
        contextRunner.withPropertyValues("sino.stickers.max-per-owner=" + count)
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void aFailureNamesTheSetting() {
        contextRunner.withPropertyValues("sino.stickers.max-side=0")
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("sino.stickers"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(StickerProperties.class)
    static class PropertiesConfig {
    }

}
