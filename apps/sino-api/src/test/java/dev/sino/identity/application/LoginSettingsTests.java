package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The owner password and the remember-me key are checked while the application starts (D-33, D-34), so a missing
 * or short value stops it, and their values never show up in a message or a log line.
 */
class LoginSettingsTests {

    private static final String PASSWORD = "correct horse battery";
    private static final String KEY = "0123456789abcdef0123456789abcdef-test";

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(LoginConfiguration.class, LoginSettings.class)
            .withPropertyValues("sino.owner.email= Owner@Example.com ", "sino.owner.display-name=Owner");

    @Test
    void keepsOnlyAHashOfThePassword() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY)
                .run(context -> {
                    LoginSettings settings = context.getBean(LoginSettings.class);
                    PasswordEncoder encoder = context.getBean(PasswordEncoder.class);

                    assertThat(settings.ownerEmail()).isEqualTo("owner@example.com");
                    assertThat(settings.passwordHash()).startsWith("{bcrypt}").doesNotContain(PASSWORD);
                    assertThat(encoder.matches(PASSWORD, settings.passwordHash())).isTrue();
                    assertThat(encoder.matches("correct horse batterY", settings.passwordHash())).isFalse();
                    assertThat(settings.rememberMeKey()).isEqualTo(KEY);
                });
    }

    @Test
    void acceptsTheShortestAllowedValues() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + "p".repeat(12),
                        "sino.auth.remember-me-key=" + "k".repeat(32))
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(LoginSettings.class));
    }

    @Test
    void doesNotStartWithoutThePassword() {
        contextRunner
                .withPropertyValues("sino.owner.password=", "sino.auth.remember-me-key=" + KEY)
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("sino.owner.password"));
    }

    @Test
    void doesNotStartWithAnElevenCharacterPasswordAndNeverPrintsIt() {
        String elevenCharacters = "S3cret-pass";

        contextRunner
                .withPropertyValues("sino.owner.password=" + elevenCharacters, "sino.auth.remember-me-key=" + KEY)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("sino.owner.password");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(elevenCharacters);
                });
    }

    @Test
    void countsAnEmojiAsOneCharacter() {
        String elevenEmoji = new String(Character.toChars(0x1F600)).repeat(11);

        contextRunner
                .withPropertyValues("sino.owner.password=" + elevenEmoji, "sino.auth.remember-me-key=" + KEY)
                .run(context -> assertThat(context).getFailure().hasStackTraceContaining("sino.owner.password"));
    }

    @Test
    void doesNotStartWithoutTheRememberMeKey() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.auth.remember-me-key"));
    }

    @Test
    void doesNotStartWithAShortKeyAndNeverPrintsIt() {
        String thirtyOneCharacters = "0123456789abcdef0123456789abcde";

        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD,
                        "sino.auth.remember-me-key=" + thirtyOneCharacters)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("sino.auth.remember-me-key");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(thirtyOneCharacters);
                });
    }

    @Test
    void neverPrintsTheSecrets() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY)
                .run(context -> assertThat(String.join(" | ", context.getBean(OwnerProperties.class).toString(),
                        context.getBean(AuthProperties.class).toString(),
                        context.getBean(LoginSettings.class).toString()))
                        .contains("owner@example.com")
                        .doesNotContain(PASSWORD)
                        .doesNotContain(KEY));
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
