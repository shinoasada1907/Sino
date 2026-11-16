package dev.sino.sticker.api;

import static dev.sino.sticker.domain.ImageFixtures.png;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.sticker.application.StickerPackService;
import dev.sino.sticker.application.StickerService;

/**
 * The sticker packs through HTTP (SP-04, spec {@code sticker-packs}, D-344) on the whole application and a real
 * PostgreSQL. The limits are those of {@link StickersApiTests}, so both share one application, and at most 2 packs, so
 * that the limit is cheap to reach.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
@TestPropertySource(properties = { "sino.stickers.max-file-size=20KB", "sino.stickers.max-side=64", "sino.stickers.max-per-owner=3",
        "sino.stickers.max-packs-per-owner=2" })
class StickerPacksApiTests {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private StickerService stickers;

    @Autowired
    private StickerPackService packs;

    private UUID owner;

    @BeforeEach
    void startWithNoPack() {
        jdbc.update("delete from sticker");
        jdbc.update("delete from sticker_pack");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findIdByEmail("owner@sino.test").orElseThrow();
    }

    private static RequestPostProcessor apiUser() {
        return user("owner@sino.test");
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
        return request.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private UUID createAsOwner(String name) throws Exception {
        MvcResult result = mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"" + name + "\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    private UUID strangerWithAPack(String name) {
        UUID stranger = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, 'stranger@sino.test', 'Stranger', 'ACTIVE', now(), now())", stranger);
        return packs.create(stranger, name).id();
    }

    private String storedNameOf(UUID pack) {
        return jdbc.queryForObject("select name from sticker_pack where id = ?", String.class, pack);
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    // --- POST /api/sticker-packs ---

    @Test
    void createsAPackWithATrimmedNameAndAnswersWithItAndItsAddress() throws Exception {
        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"  Mèo  \"}").with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", matchesPattern(".*/api/sticker-packs/[0-9a-f-]{36}")))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("Mèo"))
                .andExpect(jsonPath("$.stickerCount").value(0))
                .andExpect(jsonPath("$.coverStickerId").value(nullValue()))
                .andExpect(jsonPath("$.createdAt").value(matchesPattern("\\d{4}-\\d{2}-\\d{2}T[0-9:.]+Z")));
    }

    @Test
    void theAddressOfANewPackLeadsToIt() throws Exception {
        MvcResult created = mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"Mèo\"}").with(apiUser()).with(csrf()))
                .andReturn();

        mvc.perform(get(created.getResponse().getHeader("Location")).with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Mèo"));
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = { "{\"name\":\"   \"}", "{\"name\":\"\"}", "{\"name\":\"　\"}", "{}", "{\"name\":null}",
            "{\"name\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"}", "{\"name\":\"M\\u0000o\"}" })
    void aNameThatBreaksTheRuleIsAValidationFailureAndCreatesNothing(String body) throws Exception {
        mvc.perform(json(post("/api/sticker-packs"), body).with(apiUser()).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(count("sticker_pack")).isZero();
    }

    @Test
    void fiftyCharactersCountedAsCodePointsAreANameStill() throws Exception {
        String fifty = "😀".repeat(50);

        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"" + fifty + "\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(fifty));
    }

    @Test
    void aBodyThatIsNotJsonIsMalformed() throws Exception {
        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":").with(apiUser()).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void aNameTakenInAnotherCaseIsAConflict() throws Exception {
        createAsOwner("Mèo");

        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"MÈO\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NAME_TAKEN"));
        assertThat(count("sticker_pack")).isEqualTo(1);
    }

    @Test
    void aNameOfAPackOfAnotherOwnerIsFree() throws Exception {
        strangerWithAPack("Mèo");

        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"Mèo\"}").with(apiUser()).with(csrf())).andExpect(status().isCreated());
    }

    @Test
    void oneMorePackThanTheLimitIsAConflictThatTellsTheLimit() throws Exception {
        createAsOwner("Mèo");
        createAsOwner("Chó");

        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"Gà\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_LIMIT_REACHED"))
                .andExpect(jsonPath("$.maxPacks").value(2));
        assertThat(count("sticker_pack")).isEqualTo(2);
    }

    // --- GET /api/sticker-packs ---

    @Test
    void listsThePacksOfTheOwnerOldestFirstWithTheirCountAndNewestSticker() throws Exception {
        UUID cats = createAsOwner("Mèo");
        createAsOwner("Chó");
        stickers.upload(owner, "a.png", null, cats, png(10, 10));
        UUID newer = stickers.upload(owner, "b.png", null, cats, png(11, 10)).id();
        strangerWithAPack("Của người khác");

        mvc.perform(get("/api/sticker-packs").with(apiUser()))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items[*].name", contains("Mèo", "Chó")))
                .andExpect(jsonPath("$.items[0].stickerCount").value(2))
                .andExpect(jsonPath("$.items[0].coverStickerId").value(newer.toString()))
                .andExpect(jsonPath("$.items[1].stickerCount").value(0))
                .andExpect(jsonPath("$.items[1].coverStickerId").value(nullValue()));
    }

    @Test
    void noPackListsNothing() throws Exception {
        mvc.perform(get("/api/sticker-packs").with(apiUser())).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
    }

    // --- GET /api/sticker-packs/{id} ---

    @Test
    void aPackOfAnotherOwnerAndAnUnknownOneAreNotFoundAlike() throws Exception {
        UUID theirs = strangerWithAPack("Mèo");

        mvc.perform(get("/api/sticker-packs/{id}", theirs).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NOT_FOUND"));
        mvc.perform(get("/api/sticker-packs/{id}", UUID.randomUUID()).with(apiUser()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NOT_FOUND"));
    }

    @Test
    void anIdThatIsNotAnIdIsMalformed() throws Exception {
        mvc.perform(get("/api/sticker-packs/{id}", "not-an-id").with(apiUser()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    // --- PATCH /api/sticker-packs/{id} ---

    @Test
    void renamesAPackAndKeepsItsStickers() throws Exception {
        UUID cats = createAsOwner("Mèo");
        stickers.upload(owner, "a.png", null, cats, png(10, 10));

        mvc.perform(json(patch("/api/sticker-packs/{id}", cats), "{\"name\":\" Mèo con \"}").with(apiUser()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(cats.toString()))
                .andExpect(jsonPath("$.name").value("Mèo con"))
                .andExpect(jsonPath("$.stickerCount").value(1));
        assertThat(storedNameOf(cats)).isEqualTo("Mèo con");
    }

    @Test
    void aPackMayTakeItsOwnNameInAnotherCase() throws Exception {
        UUID cats = createAsOwner("Mèo");

        mvc.perform(json(patch("/api/sticker-packs/{id}", cats), "{\"name\":\"MÈO\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("MÈO"));
    }

    @Test
    void aRenameToTheNameOfAnotherPackIsAConflictAndChangesNothing() throws Exception {
        createAsOwner("Mèo");
        UUID dogs = createAsOwner("Chó");

        mvc.perform(json(patch("/api/sticker-packs/{id}", dogs), "{\"name\":\"mèo\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NAME_TAKEN"));
        assertThat(storedNameOf(dogs)).isEqualTo("Chó");
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = { "{\"name\":\"  \"}", "{}" })
    void aRenameThatBreaksTheRuleIsAValidationFailureAndChangesNothing(String body) throws Exception {
        UUID cats = createAsOwner("Mèo");

        mvc.perform(json(patch("/api/sticker-packs/{id}", cats), body).with(apiUser()).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(storedNameOf(cats)).isEqualTo("Mèo");
    }

    @Test
    void renamingAPackOfAnotherOwnerIsNotFoundAndKeepsItsName() throws Exception {
        UUID theirs = strangerWithAPack("Mèo");

        mvc.perform(json(patch("/api/sticker-packs/{id}", theirs), "{\"name\":\"Của tôi\"}").with(apiUser()).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NOT_FOUND"));
        assertThat(storedNameOf(theirs)).isEqualTo("Mèo");
    }

    // --- DELETE /api/sticker-packs/{id} ---

    @Test
    void deletesAPackAndKeepsItsStickersInNoPack() throws Exception {
        UUID cats = createAsOwner("Mèo");
        stickers.upload(owner, "a.png", null, cats, png(10, 10));
        stickers.upload(owner, "b.png", null, cats, png(11, 10));

        mvc.perform(delete("/api/sticker-packs/{id}", cats).with(apiUser()).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(get("/api/sticker-packs").with(apiUser())).andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/stickers").with(apiUser()))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].packId").value(nullValue()))
                .andExpect(jsonPath("$.items[1].packId").value(nullValue()));
    }

    @Test
    void deletingTwiceIsNotFoundTheSecondTime() throws Exception {
        UUID cats = createAsOwner("Mèo");
        mvc.perform(delete("/api/sticker-packs/{id}", cats).with(apiUser()).with(csrf())).andExpect(status().isNoContent());

        mvc.perform(delete("/api/sticker-packs/{id}", cats).with(apiUser()).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NOT_FOUND"));
    }

    @Test
    void deletingAPackOfAnotherOwnerDeletesNothing() throws Exception {
        UUID theirs = strangerWithAPack("Mèo");

        mvc.perform(delete("/api/sticker-packs/{id}", theirs).with(apiUser()).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STICKER_PACK_NOT_FOUND"));
        assertThat(count("sticker_pack")).isEqualTo(1);
    }

    // --- who may ---

    @Test
    void everyEndpointNeedsASignedInUser() throws Exception {
        UUID cats = createAsOwner("Mèo");

        mvc.perform(get("/api/sticker-packs")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/sticker-packs/{id}", cats)).andExpect(status().isUnauthorized());
        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"Chó\"}").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(json(patch("/api/sticker-packs/{id}", cats), "{\"name\":\"Chó\"}").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/sticker-packs/{id}", cats).with(csrf())).andExpect(status().isUnauthorized());
        assertThat(count("sticker_pack")).isEqualTo(1);
        assertThat(storedNameOf(cats)).isEqualTo("Mèo");
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        UUID cats = createAsOwner("Mèo");

        mvc.perform(json(post("/api/sticker-packs"), "{\"name\":\"Chó\"}").with(apiUser()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mvc.perform(json(patch("/api/sticker-packs/{id}", cats), "{\"name\":\"Chó\"}").with(apiUser())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/sticker-packs/{id}", cats).with(apiUser())).andExpect(status().isForbidden());
        assertThat(count("sticker_pack")).isEqualTo(1);
        assertThat(storedNameOf(cats)).isEqualTo("Mèo");
    }

    @Test
    void theAdminHasNoPacksHere() throws Exception {
        mvc.perform(get("/api/sticker-packs").with(user("admin@sino.test").roles("ADMIN"))).andExpect(status().isForbidden());
    }

}
