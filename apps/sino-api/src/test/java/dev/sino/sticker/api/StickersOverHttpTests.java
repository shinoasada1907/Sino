package dev.sino.sticker.api;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.Browser;
import dev.sino.Browser.Response;
import dev.sino.TestcontainersConfiguration;

/**
 * The sticker upload on a real server (ST-08): what MockMvc cannot show, because the multipart limit and the decoding of
 * a file name belong to the servlet container. A real HTTP client signs in and sends real multipart requests.
 *
 * <p>{@code server.tomcat.max-swallow-size} is raised above the 3 MB file of the tests that cross the multipart fence.
 * Tomcat reads and drops the rest of a refused body only up to that size (2 MB by default) and closes the connection when
 * more is left; seen on Windows, the client then gets "connection aborted" instead of the 413 it was sent, while on Linux
 * it reads the 413. What is tested here (the answer to a refusal of the fence, and the session that outlives it) does not
 * depend on that size, so it is raised to make the tests the same on every system.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "server.tomcat.max-swallow-size=10MB")
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class StickersOverHttpTests {

    private static final String PASSWORD = "test-owner-password";

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    private Browser browser;

    @BeforeEach
    void signIn() {
        jdbc.update("delete from sticker");
        browser = new Browser("http://localhost:" + port);
        assertThat(browser.signIn("owner@sino.test", PASSWORD, false).status()).isLessThan(300);
    }

    @Test
    void keepsAPngSentLikeABrowserSendsAFile() {
        Response response = browser.upload("/api/stickers", "meo.png", "image/png", png(40, 30), Map.of());

        assertThat(response.status()).isEqualTo(201);
        assertThat(response.json("$.name")).isEqualTo("meo");
        assertThat(response.header("Location")).hasValueSatisfying(location -> assertThat(location).contains("/api/stickers/"));
    }

    @Test
    void keepsTheNameOfAFileWithVietnameseLettersAsTheBrowserWroteIt() {
        Response response = browser.upload("/api/stickers", "Mèo vui đáng yêu.png", "image/png", png(40, 30), Map.of());

        assertThat(response.status()).isEqualTo(201);
        assertThat(response.json("$.name")).isEqualTo("Mèo vui đáng yêu");
    }

    @Test
    void keepsTheNameTypedInATextPart() {
        Response response = browser.upload("/api/stickers", "x.png", "image/png", png(40, 30), Map.of("name", "Mèo vui"));

        assertThat(response.status()).isEqualTo(201);
        assertThat(response.json("$.name")).isEqualTo("Mèo vui");
    }

    @Test
    void aFileBetweenTheLimitAndTheFenceIsRefusedByTheServiceWithItsOwnCode() {
        // The default limit of a sticker is 1 MiB and the fence of the server 2 MiB: 1.5 MiB gets through the fence.
        byte[] file = Arrays.copyOf(png(40, 30), 1_500_000);

        Response response = browser.upload("/api/stickers", "over.png", "image/png", file, Map.of());

        assertThat(response.status()).isEqualTo(413);
        assertThat(response.json("$.code")).isEqualTo("STICKER_TOO_LARGE");
    }

    @Test
    void aFileAboveTheFenceIsRefusedByTheServerAsAProblemWithItsOwnCode() {
        byte[] file = Arrays.copyOf(png(40, 30), 3_000_000);

        Response response = browser.upload("/api/stickers", "huge.png", "image/png", file, Map.of());

        assertThat(response.status()).isEqualTo(413);
        assertThat(response.header("Content-Type")).hasValueSatisfying(type -> assertThat(type).contains("application/problem+json"));
        assertThat(response.json("$.code")).isEqualTo("PAYLOAD_TOO_LARGE");
        assertThat(jdbc.queryForObject("select count(*) from sticker", Integer.class)).isZero();
    }

    @Test
    void aRefusalOfTheFenceDoesNotEndTheSession() {
        browser.upload("/api/stickers", "huge.png", "image/png", Arrays.copyOf(png(40, 30), 3_000_000), Map.of());

        assertThat(browser.get("/api/stickers").status()).isEqualTo(200);
        assertThat(browser.upload("/api/stickers", "meo.png", "image/png", png(40, 30), Map.of()).status()).isEqualTo(201);
    }

}
