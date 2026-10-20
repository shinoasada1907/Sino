package dev.sino.sticker.api;

import static dev.sino.sticker.domain.ImageFixtures.animatedGif;
import static dev.sino.sticker.domain.ImageFixtures.gif;
import static dev.sino.sticker.domain.ImageFixtures.png;
import static dev.sino.sticker.domain.ImageFixtures.pngSaying;
import static dev.sino.sticker.domain.ImageFixtures.webpFile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
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
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.sticker.application.StickerService;

/**
 * The sticker library through HTTP (ST-08, spec {@code custom-stickers}) on the whole application and a real PostgreSQL.
 * The limits are small (20 KB, 64 px, 3 stickers) so that their edges are cheap to reach.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestPropertySource(properties = { "sino.stickers.max-file-size=20KB", "sino.stickers.max-side=64", "sino.stickers.max-per-owner=3" })
class StickersApiTests {

    private static final int MAX_BYTES = 20 * 1024;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private StickerService service;

    private UUID owner;

    @BeforeEach
    void startFromAnEmptyLibrary() {
        jdbc.update("delete from sticker");
        jdbc.update("delete from sticker_pack");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    private static MockMultipartFile file(String name, String type, byte[] bytes) {
        return new MockMultipartFile("file", name, type, bytes);
    }

    private org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder upload(MockMultipartFile file) {
        return multipart("/api/stickers").file(file);
    }

    private UUID uploadAsOwner(String name, byte[] bytes) throws Exception {
        MvcResult result = mvc.perform(upload(file(name, "image/png", bytes)).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    private UUID strangerWithASticker(byte[] bytes) {
        UUID stranger = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'stranger@sino.test', 'Stranger', 'ACTIVE', now(), now())", stranger);
        return service.upload(stranger, "theirs.png", null, bytes).id();
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    // --- POST /api/stickers ---

    @Test
    void keepsAPngAndAnswersWithTheStickerAndItsAddress() throws Exception {
        mvc.perform(upload(file("meo.png", "image/png", png(60, 40))).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern(".*/api/stickers/[0-9a-f-]{36}")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("meo"))
                .andExpect(jsonPath("$.mediaType").value("image/png"))
                .andExpect(jsonPath("$.kind").value("STATIC"))
                .andExpect(jsonPath("$.width").value(60))
                .andExpect(jsonPath("$.height").value(40))
                .andExpect(jsonPath("$.sizeBytes").value(png(60, 40).length))
                .andExpect(jsonPath("$.createdAt").value(matchesPattern("\\d{4}-\\d{2}-\\d{2}T[0-9:.]+Z")));
    }

    @Test
    void saysWhenTheStickerWasKept() throws Exception {
        java.time.Instant before = java.time.Instant.now().minusSeconds(60);

        MvcResult result = mvc.perform(upload(file("meo.png", "image/png", png(8, 8))).with(apiUser()).with(csrf())).andReturn();

        java.time.Instant keptAt = java.time.Instant.parse(JsonPath.read(result.getResponse().getContentAsString(), "$.createdAt"));
        assertThat(keptAt).isBetween(before, java.time.Instant.now().plusSeconds(60));
    }

    @Test
    void theAnswerHasNoBytesAndNoOwner() throws Exception {
        mvc.perform(upload(file("meo.png", "image/png", png(8, 8))).with(apiUser()).with(csrf()))
                .andExpect(jsonPath("$.content").doesNotExist())
                .andExpect(jsonPath("$.bytes").doesNotExist())
                .andExpect(jsonPath("$.ownerId").doesNotExist())
                .andExpect(jsonPath("$.sha256").doesNotExist());
    }

    @Test
    void theLocationLeadsToTheStickerKept() throws Exception {
        MvcResult result = mvc.perform(upload(file("meo.png", "image/png", png(30, 20))).with(apiUser()).with(csrf())).andReturn();
        String location = result.getResponse().getHeader("Location");
        String id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");

        mvc.perform(get(java.net.URI.create(location)).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.name").value("meo"))
                .andExpect(jsonPath("$.width").value(30));
    }

    @Test
    void keepsAGifThatMovesAsAnimatedAndOneThatDoesNotAsStatic() throws Exception {
        mvc.perform(upload(file("nhay.gif", "image/gif", animatedGif(30, 20, 12))).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mediaType").value("image/gif"))
                .andExpect(jsonPath("$.kind").value("ANIMATED"));
        mvc.perform(upload(file("dung.gif", "image/gif", gif(30, 20))).with(apiUser()).with(csrf()))
                .andExpect(jsonPath("$.kind").value("STATIC"));
    }

    @Test
    void keepsAWebp() throws Exception {
        mvc.perform(upload(file("a.webp", "image/webp", webpFile("animated.webp"))).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mediaType").value("image/webp"))
                .andExpect(jsonPath("$.kind").value("ANIMATED"))
                .andExpect(jsonPath("$.width").value(32));
    }

    @Test
    void namesAStickerByTheNameAskedForTrimmed() throws Exception {
        mvc.perform(upload(file("meo.png", "image/png", png(8, 8))).param("name", "  Mèo vui  ").with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Mèo vui"));
    }

    @Test
    void takesTheTypeFromTheFileAndNotFromTheNameOrTheDeclaredType() throws Exception {
        // A text file named meo.png and declared as image/png is no image.
        mvc.perform(upload(file("meo.png", "image/png", "not an image".getBytes(StandardCharsets.US_ASCII))).with(apiUser()).with(csrf()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("STICKER_TYPE_UNSUPPORTED"));
        // And a real PNG named .txt and declared as text is kept as a PNG.
        mvc.perform(upload(file("meo.txt", "text/plain", png(8, 8))).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mediaType").value("image/png"));
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void refusesAJpegAndAnSvg() throws Exception {
        byte[] jpeg = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0 };
        byte[] svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8);

        mvc.perform(upload(file("a.jpg", "image/jpeg", jpeg)).with(apiUser()).with(csrf())).andExpect(status().isUnsupportedMediaType());
        mvc.perform(upload(file("a.svg", "image/svg+xml", svg)).with(apiUser()).with(csrf()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("STICKER_TYPE_UNSUPPORTED"));
        assertThat(count("sticker")).isZero();
    }

    @Test
    void refusesAnImageThatSaysItIsEnormousWithoutDecodingIt() throws Exception {
        mvc.perform(upload(file("big.png", "image/png", pngSaying(png(8, 8), 60_000, 40_000))).with(apiUser()).with(csrf()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("STICKER_INVALID_IMAGE"));
        assertThat(count("sticker")).isZero();
    }

    @Test
    void refusesAFileAboveTheLimitAndTakesOneAtTheLimit() throws Exception {
        mvc.perform(upload(file("edge.png", "image/png", Arrays.copyOf(png(8, 8), MAX_BYTES))).with(apiUser()).with(csrf()))
                .andExpect(status().isCreated());

        mvc.perform(upload(file("over.png", "image/png", Arrays.copyOf(png(9, 9), MAX_BYTES + 1))).with(apiUser()).with(csrf()))
                .andExpect(status().isContentTooLarge())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("STICKER_TOO_LARGE"))
                .andExpect(jsonPath("$.maxBytes").value(MAX_BYTES));
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void refusesARequestWithoutAFileAndAnEmptyFile() throws Exception {
        mvc.perform(multipart("/api/stickers").param("name", "x").with(apiUser()).with(csrf()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("STICKER_FILE_MISSING"));
        mvc.perform(upload(file("empty.png", "image/png", new byte[0])).with(apiUser()).with(csrf()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("STICKER_FILE_MISSING"));
    }

    @Test
    void refusesARequestThatIsNotMultipart() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/stickers").with(apiUser()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"meo\"}"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
        assertThat(count("sticker")).isZero();
    }

    @Test
    void refusesTheSameFileTwiceAndNamesTheOneKept() throws Exception {
        UUID first = uploadAsOwner("meo.png", png(20, 20));

        mvc.perform(upload(file("again.png", "image/png", png(20, 20))).with(apiUser()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STICKER_DUPLICATE"))
                .andExpect(jsonPath("$.stickerId").value(first.toString()));
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void refusesAFourthStickerWhenTheLimitIsThree() throws Exception {
        uploadAsOwner("1.png", png(10, 10));
        uploadAsOwner("2.png", png(11, 10));
        uploadAsOwner("3.png", png(12, 10));

        mvc.perform(upload(file("4.png", "image/png", png(13, 10))).with(apiUser()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STICKER_LIMIT_REACHED"));
    }

    // --- GET /api/stickers ---

    @Test
    void listsTheStickersNewestFirstWithoutTheBytesAndOnlyTheOwners() throws Exception {
        uploadAsOwner("a.png", png(10, 10));
        uploadAsOwner("b.png", png(11, 10));
        strangerWithASticker(png(12, 10));

        mvc.perform(get("/api/stickers").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].name").value("b"))
                .andExpect(jsonPath("$.items[1].name").value("a"))
                .andExpect(jsonPath("$.items[0].width").value(11))
                .andExpect(jsonPath("$.items[0].content").doesNotExist())
                .andExpect(content().string(not(containsString("theirs"))));
    }

    @Test
    void anEmptyLibraryListsNothing() throws Exception {
        mvc.perform(get("/api/stickers").with(apiUser())).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
    }

    // --- GET /api/stickers/{id} ---

    @Test
    void readsOneStickerWithoutItsBytes() throws Exception {
        UUID id = uploadAsOwner("nhay.gif", animatedGif(30, 20, 3));

        mvc.perform(get("/api/stickers/{id}", id).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.kind").value("ANIMATED"))
                .andExpect(jsonPath("$.mediaType").value("image/gif"))
                .andExpect(jsonPath("$.content").doesNotExist());
    }

    @Test
    void oneStickerOfAnotherOwnerAndAnUnknownOneAreNotFoundAlike() throws Exception {
        UUID theirs = strangerWithASticker(png(12, 10));

        mvc.perform(get("/api/stickers/{id}", theirs).with(apiUser())).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));
        mvc.perform(get("/api/stickers/{id}", UUID.randomUUID()).with(apiUser())).andExpect(status().isNotFound());
    }

    // --- GET /api/stickers/{id}/content ---

    @Test
    void sendsThePictureToABrowserWhoseAcceptHeaderDoesNotNameTheType() throws Exception {
        // An <img> asks for image/avif, image/webp... and */*; a GIF is sent as a GIF all the same.
        UUID id = uploadAsOwner("nhay.gif", animatedGif(30, 20, 3));

        mvc.perform(get("/api/stickers/{id}/content", id).with(apiUser())
                        .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/gif"));
    }

    @Test
    void givesBackTheBytesWithTheTypeAndTheHeadersOfAPictureThatNeverChanges() throws Exception {
        byte[] bytes = png(30, 20);
        UUID id = uploadAsOwner("meo.png", bytes);

        mvc.perform(get("/api/stickers/{id}/content", id).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(bytes))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Disposition", "inline"))
                .andExpect(header().string("Cache-Control", "private, max-age=31536000, immutable"));
    }

    @ParameterizedTest
    @ValueSource(strings = { "gif", "webp" })
    void sendsEachTypeAsItself(String type) throws Exception {
        byte[] bytes = type.equals("gif") ? animatedGif(30, 20, 3) : webpFile("static-alpha.webp");
        MvcResult result = mvc.perform(upload(file("a." + type, "application/octet-stream", bytes)).with(apiUser()).with(csrf())).andReturn();
        String id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/stickers/{id}/content", id).with(apiUser()))
                .andExpect(content().contentType("image/" + type))
                .andExpect(content().bytes(bytes));
    }

    @Test
    void aStickerOfAnotherOwnerAndAnUnknownOneAreNotFoundAlike() throws Exception {
        UUID theirs = strangerWithASticker(png(12, 10));

        mvc.perform(get("/api/stickers/{id}/content", theirs).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));
        mvc.perform(get("/api/stickers/{id}/content", UUID.randomUUID()).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));
    }

    @Test
    void anIdThatIsNotAnIdIsABadRequestAndNotAServerError() throws Exception {
        mvc.perform(get("/api/stickers/{id}/content", "not-an-id").with(apiUser())).andExpect(status().isBadRequest());
    }

    // --- DELETE /api/stickers/{id} ---

    @Test
    void deletesAStickerAndItsPicture() throws Exception {
        UUID gone = uploadAsOwner("gone.png", png(10, 10));
        uploadAsOwner("kept.png", png(11, 10));

        mvc.perform(delete("/api/stickers/{id}", gone).with(apiUser()).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/stickers").with(apiUser())).andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].name").value("kept"));
        mvc.perform(get("/api/stickers/{id}/content", gone).with(apiUser())).andExpect(status().isNotFound());
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    @Test
    void deletingTwiceIsNotFoundTheSecondTime() throws Exception {
        UUID id = uploadAsOwner("meo.png", png(10, 10));
        mvc.perform(delete("/api/stickers/{id}", id).with(apiUser()).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(delete("/api/stickers/{id}", id).with(apiUser()).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_NOT_FOUND"));
    }

    @Test
    void deletingAStickerOfAnotherOwnerDeletesNothing() throws Exception {
        UUID theirs = strangerWithASticker(png(12, 10));

        mvc.perform(delete("/api/stickers/{id}", theirs).with(apiUser()).with(csrf())).andExpect(status().isNotFound());

        assertThat(count("sticker")).isEqualTo(1);
        assertThat(count("sticker_content")).isEqualTo(1);
    }

    @Test
    void aFileDeletedCanBeKeptAgain() throws Exception {
        UUID first = uploadAsOwner("meo.png", png(10, 10));
        mvc.perform(delete("/api/stickers/{id}", first).with(apiUser()).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(upload(file("meo.png", "image/png", png(10, 10))).with(apiUser()).with(csrf())).andExpect(status().isCreated());
    }

    // --- who may ---

    @Test
    void everyEndpointNeedsASignedInUser() throws Exception {
        UUID id = uploadAsOwner("meo.png", png(10, 10));

        mvc.perform(get("/api/stickers")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/stickers/{id}/content", id)).andExpect(status().isUnauthorized());
        mvc.perform(upload(file("meo.png", "image/png", png(11, 10))).with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/stickers/{id}", id).with(csrf())).andExpect(status().isUnauthorized());
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        UUID id = uploadAsOwner("meo.png", png(10, 10));

        mvc.perform(upload(file("meo.png", "image/png", png(11, 10))).with(apiUser()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mvc.perform(delete("/api/stickers/{id}", id).with(apiUser())).andExpect(status().isForbidden());
        assertThat(count("sticker")).isEqualTo(1);
    }

    @Test
    void theAdminHasNoLibraryHere() throws Exception {
        mvc.perform(get("/api/stickers").with(user("admin@sino.test").roles("ADMIN"))).andExpect(status().isForbidden());
    }

}
