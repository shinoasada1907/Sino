package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.PrintWriter;
import java.io.StringWriter;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The owner password, the remember-me key and the optional admin are checked while the application starts (D-33,
 * D-34, D-261), so a missing or short value stops it, and their values never show up in a message or a log line.
 */
class LoginSettingsTests {

    private static final String PASSWORD = "correct horse battery";
    private static final String KEY = "0123456789abcdef0123456789abcdef-test";
    private static final String ADMIN_PASSWORD = "staple admin battery";

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
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=admin@example.com", "sino.admin.password=" + ADMIN_PASSWORD)
                .run(context -> assertThat(String.join(" | ", context.getBean(OwnerProperties.class).toString(),
                        context.getBean(AuthProperties.class).toString(),
                        context.getBean(AdminProperties.class).toString(),
                        context.getBean(LoginSettings.class).toString()))
                        .contains("owner@example.com")
                        .contains("admin@example.com")
                        .doesNotContain(PASSWORD)
                        .doesNotContain(ADMIN_PASSWORD)
                        .doesNotContain(KEY));
    }

    @Test
    void noAdminWithoutItsEmail() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=  ")
                .run(context -> assertThat(context.getBean(LoginSettings.class).adminEmail()).isEmpty());
    }

    @Test
    void keepsOnlyAHashOfTheAdminPassword() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email= Admin@Example.com ", "sino.admin.password=" + ADMIN_PASSWORD)
                .run(context -> {
                    LoginSettings settings = context.getBean(LoginSettings.class);
                    PasswordEncoder encoder = context.getBean(PasswordEncoder.class);

                    assertThat(settings.adminEmail()).contains("admin@example.com");
                    assertThat(settings.adminPasswordHash()).startsWith("{bcrypt}").doesNotContain(ADMIN_PASSWORD);
                    assertThat(encoder.matches(ADMIN_PASSWORD, settings.adminPasswordHash())).isTrue();
                    assertThat(encoder.matches(PASSWORD, settings.adminPasswordHash())).isFalse();
                });
    }

    @Test
    void acceptsTheShortestAllowedAdminPassword() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=admin@example.com", "sino.admin.password=" + "a".repeat(12))
                .run(context -> assertThat(context).hasNotFailed());
    }

    @Test
    void doesNotStartWithAnElevenCharacterAdminPasswordAndNeverPrintsIt() {
        String elevenCharacters = "Adm1n-pass!";

        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=admin@example.com", "sino.admin.password=" + elevenCharacters)
                .run(context -> {
                    assertThat(context).getFailure()
                            .hasStackTraceContaining("sino.admin.password (SINO_ADMIN_PASSWORD)");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(elevenCharacters);
                });
    }

    @Test
    void doesNotStartWithAnAdminEmailButNoPassword() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=admin@example.com")
                .run(context -> assertThat(context).getFailure()
                        .hasStackTraceContaining("sino.admin.password (SINO_ADMIN_PASSWORD)"));
    }

    @Test
    void doesNotStartWhenTheAdminIsTheOwner() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=  OWNER@example.COM ", "sino.admin.password=" + ADMIN_PASSWORD)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("sino.admin.email (SINO_ADMIN_EMAIL)");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(ADMIN_PASSWORD);
                });
    }

    @Test
    void doesNotStartWithAnAdminPasswordButNoEmail() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.password=" + ADMIN_PASSWORD)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("sino.admin.email (SINO_ADMIN_EMAIL)");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(ADMIN_PASSWORD);
                });
    }

    @Test
    void doesNotStartWithAMalformedAdminEmail() {
        contextRunner
                .withPropertyValues("sino.owner.password=" + PASSWORD, "sino.auth.remember-me-key=" + KEY,
                        "sino.admin.email=not-an-email", "sino.admin.password=" + ADMIN_PASSWORD)
                .run(context -> {
                    assertThat(context).getFailure().hasStackTraceContaining("sino.admin");
                    assertThat(stackTraceOf(context.getStartupFailure())).doesNotContain(ADMIN_PASSWORD);
                });
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
