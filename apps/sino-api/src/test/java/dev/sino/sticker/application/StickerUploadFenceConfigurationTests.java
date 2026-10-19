package dev.sino.sticker.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.util.unit.DataSize;

/**
 * The fence of an upload in {@code application.yaml} must stay above the limit the sticker service checks, or a file
 * between the two would be refused by the server with a generic error instead of by the service with its own.
 */
class StickerUploadFenceConfigurationTests {

    @Test
    void theMultipartFenceIsAboveTheDefaultLimitOfAStickerAndNotFarAbove() {
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            // The binder knows sizes written as 2MB; Environment.getProperty alone does not.
            Binder binder = Binder.get(context.getEnvironment());
            DataSize file = binder.bind("spring.servlet.multipart.max-file-size", DataSize.class).get();
            DataSize request = binder.bind("spring.servlet.multipart.max-request-size", DataSize.class).get();
            DataSize stickerLimit = new StickerProperties(DataSize.ofMegabytes(1), 1, 1).maxFileSize();

            assertThat(file).isGreaterThan(stickerLimit);
            assertThat(request).isGreaterThanOrEqualTo(file);
            // The room for the other parts and the boundaries is small; a fence of ten times the limit would defeat its purpose.
            assertThat(file).isLessThanOrEqualTo(DataSize.ofMegabytes(4));
        });
    }

}
