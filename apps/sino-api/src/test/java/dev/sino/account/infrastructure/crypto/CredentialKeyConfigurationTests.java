package dev.sino.account.infrastructure.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * The key checks happen while the application starts, so a bad key stops it instead of failing later.
 */
class CredentialKeyConfigurationTests {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(CredentialCipher.class);

    @Test
    void startsWithAValidActiveKey() {
        contextRunner
                .withPropertyValues("sino.credentials.encryption.active-key-id=k1",
                        "sino.credentials.encryption.keys.k1=" + CredentialCipherTests.KEY_1)
                .run(context -> assertThat(context.getBean(CredentialCipher.class).activeKeyId()).isEqualTo("k1"));
    }

    @Test
    void doesNotStartWithoutAnActiveKeyId() {
        contextRunner
                .withPropertyValues("sino.credentials.encryption.active-key-id=",
                        "sino.credentials.encryption.keys.k1=" + CredentialCipherTests.KEY_1)
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.credentials.encryption")
                        .hasStackTraceContaining("activeKeyId"));
    }

    @Test
    void doesNotStartWithoutTheActiveKey() {
        contextRunner
                .withPropertyValues("sino.credentials.encryption.active-key-id=k1",
                        "sino.credentials.encryption.keys.k1=")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.credentials.encryption.keys.k1"));
    }

    @Test
    void neverPrintsAWrongKey() {
        String wrongLength = "AAAAAAAAAAAAAAAAAAAAAA==";

        contextRunner
                .withPropertyValues("sino.credentials.encryption.active-key-id=k1",
                        "sino.credentials.encryption.keys.k1=" + wrongLength)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("must decode to 32 bytes");
                    assertThat(context.getStartupFailure()).hasStackTraceContaining("keys.k1");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(wrongLength);
                });
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
