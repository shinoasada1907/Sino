package dev.sino.provider.infrastructure.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import dev.sino.provider.spi.MessageProvider;

/**
 * Zalo is on only when turned on with the secret it shares with sino-zalo (D-272, D-282). Until Sino can tell the web
 * that Zalo connects by QR code, it is also listed only when on (ZL-06; D-286 lists it always from ZL-07 on).
 */
@ExtendWith(OutputCaptureExtension.class)
class ZaloConfigurationTests {

    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String ENABLED = "sino.zalo.enabled=true";

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(ZaloConfiguration.class);

    @Test
    void staysOffByDefaultAndSaysSo(CapturedOutput output) {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(MessageProvider.class);
        });
        assertThat(output).contains("Zalo is off").contains("SINO_ZALO_ENABLED");
    }

    @Test
    void offNeedsNoSecret() {
        contextRunner.withPropertyValues("sino.zalo.enabled=false", "sino.zalo.secret=short").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(MessageProvider.class);
        });
    }

    @Test
    void turnsOnWithTheSecretAndFindsSinoZaloOnThisMachine(CapturedOutput output) {
        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret=" + SECRET).run(context -> {
            assertThat(context).hasSingleBean(ZaloProvider.class);
            assertThat(context.getBean(ZaloProperties.class).url()).isEqualTo(URI.create("http://127.0.0.1:8090"));
        });
        assertThat(output).doesNotContain("Zalo is off").doesNotContain(SECRET);
    }

    @Test
    void sinoZaloCanListenElsewhere() {
        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret=" + SECRET,
                "sino.zalo.url=http://sino-zalo:8090").run(context -> assertThat(context
                        .getBean(ZaloProperties.class).url()).isEqualTo(URI.create("http://sino-zalo:8090")));
    }

    @Test
    void doesNotStartOnWithoutTheSecret() {
        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret= ").run(context -> assertThat(context)
                .getFailure().hasStackTraceContaining("SINO_ZALO_SECRET (sino.zalo.secret) is missing"));
    }

    @Test
    void doesNotStartOnWithAShortSecretAndNeverShowsIt() {
        String short31Bytes = "sino-zalo-secret-of-31-bytes-xy";

        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret=" + short31Bytes).run(context -> {
            assertThat(context).getFailure().hasStackTraceContaining("at least 32 bytes");
            assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(short31Bytes);
        });
    }

    // The secret travels in an HTTP header, which takes no letter outside ASCII and no space: the JDK would refuse it
    // at the first call, with the secret in its error message.
    @ParameterizedTest
    @ValueSource(strings = { "đđđđđđđđđđđđđđđđđđđđđđđđđđđđđđđđ", "sino zalo test secret 0123456789abcdef" })
    void doesNotStartOnWithASecretThatCannotGoInAHeader(String secret) {
        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret=" + secret).run(context -> {
            assertThat(context).getFailure().hasStackTraceContaining("SINO_ZALO_SECRET");
            assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(secret);
        });
    }

    // The switch reads like any Spring boolean, so 1 or yes cannot leave Zalo off without a word.
    @ParameterizedTest
    @ValueSource(strings = { "true", "TRUE", "1", "yes", "on" })
    void anyWayOfSayingTrueTurnsItOn(String value) {
        contextRunner.withPropertyValues("sino.zalo.enabled=" + value, "sino.zalo.secret=" + SECRET)
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(ZaloProvider.class));
    }

    @ParameterizedTest
    @ValueSource(strings = { "false", "0", "no", "off" })
    void anyWayOfSayingFalseTurnsItOff(String value) {
        contextRunner.withPropertyValues("sino.zalo.enabled=" + value)
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(MessageProvider.class));
    }

    @Test
    void doesNotStartWithASwitchThatIsNeitherOnNorOff() {
        contextRunner.withPropertyValues("sino.zalo.enabled=maybe", "sino.zalo.secret=" + SECRET)
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("sino.zalo.enabled"));
    }

    @ParameterizedTest
    @ValueSource(strings = { "localhost:8090", "ftp://127.0.0.1:8090", "http:///accounts" })
    void doesNotStartOnWithAnAddressThatIsNotHttp(String url) {
        contextRunner.withPropertyValues(ENABLED, "sino.zalo.secret=" + SECRET, "sino.zalo.url=" + url)
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("SINO_ZALO_URL"));
    }

    @Test
    void neverPrintsTheSecret() {
        ZaloProperties properties = new ZaloProperties(true, null, SECRET);

        assertThat(properties.toString()).contains("http://127.0.0.1:8090").doesNotContain(SECRET);
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
