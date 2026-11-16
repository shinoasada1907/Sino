package dev.sino.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.application.AvatarImageTests;

/**
 * {@code PUT}, {@code GET} and {@code DELETE /api/profile/avatar} and the {@code avatarUrl} that follows the picture,
 * through HTTP on the whole application and a real PostgreSQL (spec {@code user-profile-api}, "Ảnh đại diện").
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ProfileAvatarApiTests {

    private static final String URL_PATTERN = "/api/profile/avatar\\?v=[0-9a-f]{8}";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void withoutAPicture() {
        jdbc.update("delete from user_avatar");
    }

    private static MockMultipartHttpServletRequestBuilder upload(String part, String name, String declaredType,
            byte[] bytes) {
        return multipart(HttpMethod.PUT, "/api/profile/avatar").file(new MockMultipartFile(part, name, declaredType, bytes));
    }

    private MvcResult put(String name, String declaredType, byte[] bytes) throws Exception {
        return mvc.perform(upload("file", name, declaredType, bytes).with(user("owner@sino.test")).with(csrf()))
                .andReturn();
    }

    private String avatarUrl() throws Exception {
        String json = mvc.perform(get("/api/profile").with(user("owner@sino.test"))).andReturn().getResponse()
                .getContentAsString();
        return json.contains("\"avatarUrl\":null") ? null : json.replaceAll(".*\"avatarUrl\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void anUploadedPictureIsKeptAndSentBackAsItWas() throws Exception {
        byte[] webp = AvatarImageTests.webpLossless(256, 256);

        mvc.perform(upload("file", "me.webp", "image/webp", webp).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(matchesPattern(URL_PATTERN)))
                .andExpect(jsonPath("$.email").value("owner@sino.test"));

        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/webp"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "no-cache, private"))
                .andExpect(header().exists("ETag"))
                .andExpect(content().bytes(webp));
    }

    @Test
    void thePngAndTheJpegAreKeptToo() throws Exception {
        byte[] png = AvatarImageTests.image("png", 64, 64);
        byte[] jpeg = AvatarImageTests.image("jpg", 64, 64);

        assertThat(put("a.png", "image/png", png).getResponse().getStatus()).isEqualTo(200);
        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(content().bytes(png));

        assertThat(put("a.jpg", "image/jpeg", jpeg).getResponse().getStatus()).isEqualTo(200);
        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(content().bytes(jpeg));
    }

    @Test
    void theTypeComesFromTheBytesNotFromTheNameOrTheDeclaredType() throws Exception {
        byte[] jpeg = AvatarImageTests.image("jpg", 32, 32);

        assertThat(put("photo.png", "image/png", jpeg).getResponse().getStatus()).isEqualTo(200);

        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(header().string("Content-Type", "image/jpeg"));
    }

    @Test
    void anotherPictureHasAnotherAddressAndTheSameOneKeepsIt() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String first = avatarUrl();
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        assertThat(avatarUrl()).isEqualTo(first);

        put("b.png", "image/png", AvatarImageTests.image("png", 65, 64));

        assertThat(avatarUrl()).isNotNull().isNotEqualTo(first);
        assertThat(jdbc.queryForObject("select count(*) from user_avatar", Integer.class)).isEqualTo(1);
    }

    @Test
    void aTextFileCalledPngIsRefusedAndTheOldPictureStays() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String before = avatarUrl();

        mvc.perform(upload("file", "anh.png", "image/png", "not an image".getBytes(StandardCharsets.UTF_8))
                .with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("file"));

        assertThat(avatarUrl()).isEqualTo(before);
    }

    @Test
    void aSideAboveTheLimitIsRefusedAndTheOldPictureStays() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String before = avatarUrl();

        mvc.perform(upload("file", "big.png", "image/png", AvatarImageTests.pngHead(2000, 2000))
                .with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("file"));
        assertThat(put("edge.png", "image/png", AvatarImageTests.image("png", 1024, 1)).getResponse().getStatus())
                .isEqualTo(200);

        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        assertThat(avatarUrl()).isEqualTo(before);
    }

    @Test
    void aFileAboveOneMegabyteIsRefusedWith413AndTheOldPictureStays() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String before = avatarUrl();
        byte[] twoMegabytes = Arrays.copyOf(AvatarImageTests.image("png", 64, 64), 2 * 1024 * 1024);

        mvc.perform(upload("file", "big.png", "image/png", twoMegabytes).with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.code").value("AVATAR_TOO_LARGE"));

        assertThat(avatarUrl()).isEqualTo(before);
    }

    @Test
    void aFileOfExactlyOneMegabyteIsAccepted() throws Exception {
        byte[] exact = Arrays.copyOf(AvatarImageTests.image("png", 64, 64), 1024 * 1024);

        assertThat(put("a.png", "image/png", exact).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void aRequestWithoutThePartFileIsRefused() throws Exception {
        mvc.perform(upload("other", "a.png", "image/png", AvatarImageTests.image("png", 8, 8))
                .with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void theSameEtagGivesA304WithoutABody() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String etag = mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test"))).andReturn().getResponse()
                .getHeader("ETag");

        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")).header("If-None-Match", etag))
                .andExpect(status().isNotModified())
                .andExpect(content().bytes(new byte[0]));
        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")).header("If-None-Match", "\"other\""))
                .andExpect(status().isOk());
    }

    @Test
    void withoutAPictureTheAddressIsNullAndTheGetIs404() throws Exception {
        mvc.perform(get("/api/profile").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));
        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AVATAR_NOT_FOUND"));
    }

    @Test
    void deletingRemovesThePictureAndCanBeRepeated() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));

        mvc.perform(delete("/api/profile/avatar").with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/profile/avatar").with(user("owner@sino.test")).with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/profile").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.avatarUrl").value(nullValue()));
        mvc.perform(get("/api/profile/avatar").with(user("owner@sino.test"))).andExpect(status().isNotFound());
    }

    @Test
    void meFollowsThePicture() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));

        mvc.perform(get("/api/auth/me").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.avatarUrl").value(matchesPattern(URL_PATTERN)));
    }

    @Test
    void aProfileChangeKeepsThePicture() throws Exception {
        put("a.png", "image/png", AvatarImageTests.image("png", 64, 64));
        String before = avatarUrl();

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/profile")
                .with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"bio\": \"hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(before));
    }

    @Test
    void changingThePictureNeedsACsrfToken() throws Exception {
        mvc.perform(upload("file", "a.png", "image/png", AvatarImageTests.image("png", 8, 8))
                .with(user("owner@sino.test")))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/profile/avatar").with(user("owner@sino.test")))
                .andExpect(status().isForbidden());
    }

    @Test
    void thePictureNeedsASignIn() throws Exception {
        mvc.perform(get("/api/profile/avatar")).andExpect(status().isUnauthorized());
        mvc.perform(upload("file", "a.png", "image/png", AvatarImageTests.image("png", 8, 8)).with(csrf()))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/profile/avatar").with(csrf())).andExpect(status().isUnauthorized());
    }

}
