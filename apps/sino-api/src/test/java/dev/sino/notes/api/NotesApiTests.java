package dev.sino.notes.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
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
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.notes.application.NewNote;
import dev.sino.notes.application.NoteService;
import dev.sino.notes.domain.Note;

/**
 * The notes API through HTTP on the whole application and a real PostgreSQL: real security, real owner lookup, real
 * data (spec {@code notes}). Text notes and diagram notes go through the same endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class NotesApiTests {

    private static final String A = id(1);
    private static final String B = id(2);
    private static final String C = id(3);
    private static final String LINK_1 = id(101);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private NoteService service;

    private UUID otherUser;

    @BeforeEach
    void startFromNoNotes() {
        // Every table that points at a user, children first: a class that ran before this one (AdminApiTests, for
        // one) may leave the accounts or tasks of another user, and then the last delete fails on a foreign key.
        jdbc.update("delete from conversation");
        jdbc.update("delete from sync_checkpoint");
        jdbc.update("delete from connected_account");
        jdbc.update("delete from task");
        jdbc.update("delete from sticker");
        jdbc.update("delete from sticker_pack");
        jdbc.update("delete from note");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    // ----- JSON of a diagram -----

    private static String id(int n) {
        return new UUID(0x7000L, 0x8000000000000000L | n).toString();
    }

    private static String block(String id, String text) {
        return "{\"id\": \"" + id + "\", \"x\": 120.5, \"y\": -33.25, \"text\": \"" + text
                + "\", \"color\": \"YELLOW\", \"main\": true}";
    }

    private static String link(String id, String from, String to) {
        return "{\"id\": \"" + id + "\", \"from\": \"" + from + "\", \"fromSide\": \"RIGHT\", \"to\": \"" + to
                + "\", \"toSide\": \"LEFT\", \"label\": \"ở đâu\"}";
    }

    private static String diagram(String blocks, String links) {
        return "{\"blocks\": [" + blocks + "], \"links\": [" + links + "]}";
    }

    private static final String TRIP = diagram(block(A, "Chuyến đi Đà Lạt") + ", " + block(B, "Thuê homestay"),
            link(LINK_1, A, B));

    private static String diagramNote(String diagram) {
        return "{\"kind\": \"DIAGRAM\", \"title\": \"Kế hoạch\", \"diagram\": " + diagram + "}";
    }

    /** {@code count} blocks with numbered IDs. */
    private static String blocks(int count) {
        return IntStream.rangeClosed(1, count).mapToObj(n -> block(id(n), "Khối " + n))
                .collect(Collectors.joining(", "));
    }

    /** {@code count} links, each of a different pair among the first 40 numbered blocks. */
    private static String links(int count) {
        return IntStream.range(0, count).mapToObj(n -> {
            int from = n / 39 + 1;
            int to = (from - 1 + n % 39 + 1) % 40 + 1;
            return link(id(1000 + n), id(from), id(to));
        }).collect(Collectors.joining(", "));
    }

    // ----- calls -----

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON);
    }

    private String create(String json) throws Exception {
        String body = mvc.perform(asOwner(post("/api/notes")).content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private int noteCount() {
        return jdbc.queryForObject("select count(*) from note", Integer.class);
    }

    // ----- create and read -----

    @Test
    void createsATextNoteAndListsIt() throws Exception {
        String body = mvc.perform(asOwner(post("/api/notes"))
                .content("{\"title\": \"  \", \"body\": \"Gọi lại cho phòng khám\"}"))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_JSON))
                .andExpect(jsonPath("$.kind").value("TEXT"))
                .andExpect(jsonPath("$.title").value(nullValue()))
                .andExpect(jsonPath("$.body").value("Gọi lại cho phòng khám"))
                .andExpect(jsonPath("$.diagram").value(nullValue()))
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.updatedAt").isString())
                .andExpect(jsonPath("$.anchor").value(nullValue()))
                .andExpect(jsonPath("$.quote").value(nullValue()))
                .andExpect(jsonPath("$.linked", empty()))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mvc.perform(get("/api/notes").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.notes", hasSize(1)))
                .andExpect(jsonPath("$.notes[0].id").value(id));
    }

    @Test
    void theBodyIsKeptAsTypedAndTheTitleTrimmed() throws Exception {
        mvc.perform(asOwner(post("/api/notes"))
                .content("{\"title\": \"  Mã khách hàng  \", \"body\": \"  Mã KH: AD-55120.\\n- Mang theo CCCD\\n\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Mã khách hàng"))
                .andExpect(jsonPath("$.body").value("  Mã KH: AD-55120.\n- Mang theo CCCD\n"));
    }

    @Test
    void theLocationOfANewNoteNamesIt() throws Exception {
        var response = mvc.perform(asOwner(post("/api/notes")).content("{\"body\": \"A\"}"))
                .andExpect(header().string("Location", startsWith("http://localhost/api/notes/")))
                .andReturn().getResponse();

        String id = JsonPath.read(response.getContentAsString(), "$.id");
        assertThat(response.getHeader("Location")).isEqualTo("http://localhost/api/notes/" + id);
        mvc.perform(get("/api/notes/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.body").value("A"));
    }

    @Test
    void createsADiagramNoteWhoseDiagramComesBackAsSent() throws Exception {
        mvc.perform(asOwner(post("/api/notes")).content(diagramNote(TRIP)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("DIAGRAM"))
                .andExpect(jsonPath("$.title").value("Kế hoạch"))
                .andExpect(jsonPath("$.body").value(""))
                .andExpect(jsonPath("$.diagram.blocks", hasSize(2)))
                .andExpect(jsonPath("$.diagram.blocks[0].id").value(A))
                .andExpect(jsonPath("$.diagram.blocks[0].x").value(120.5))
                .andExpect(jsonPath("$.diagram.blocks[0].y").value(-33.25))
                .andExpect(jsonPath("$.diagram.blocks[0].text").value("Chuyến đi Đà Lạt"))
                .andExpect(jsonPath("$.diagram.blocks[0].color").value("YELLOW"))
                .andExpect(jsonPath("$.diagram.blocks[0].main").value(true))
                .andExpect(jsonPath("$.diagram.blocks[1].id").value(B))
                .andExpect(jsonPath("$.diagram.links", hasSize(1)))
                .andExpect(jsonPath("$.diagram.links[0].id").value(LINK_1))
                .andExpect(jsonPath("$.diagram.links[0].from").value(A))
                .andExpect(jsonPath("$.diagram.links[0].fromSide").value("RIGHT"))
                .andExpect(jsonPath("$.diagram.links[0].to").value(B))
                .andExpect(jsonPath("$.diagram.links[0].toSide").value("LEFT"))
                .andExpect(jsonPath("$.diagram.links[0].label").value("ở đâu"))
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.anchor").value(nullValue()))
                .andExpect(jsonPath("$.linked", empty()));
    }

    @Test
    void aDiagramNoteWithoutALabelOrATitleIsTaken() throws Exception {
        String bare = diagram(block(A, ""), "");
        mvc.perform(asOwner(post("/api/notes")).content("{\"kind\": \"DIAGRAM\", \"diagram\": " + bare + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value(nullValue()))
                .andExpect(jsonPath("$.diagram.blocks[0].text").value(""))
                .andExpect(jsonPath("$.diagram.links", empty()));
    }

    @Test
    void theListHoldsBothKindsNewestEditFirst() throws Exception {
        String text = create("{\"body\": \"Gọi lại\"}");
        String sketch = create(diagramNote(TRIP));

        mvc.perform(get("/api/notes").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes[*].id", contains(sketch, text)))
                .andExpect(jsonPath("$.notes[0].kind").value("DIAGRAM"))
                .andExpect(jsonPath("$.notes[0].diagram.blocks", hasSize(2)))
                .andExpect(jsonPath("$.notes[1].kind").value("TEXT"))
                .andExpect(jsonPath("$.notes[1].diagram").value(nullValue()));
    }

    // ----- what a create refuses -----

    static Stream<Arguments> badNotes() {
        String manyBlocks = blocks(301);
        String links601 = links(601);
        return Stream.of(
                Arguments.of("no body", "{}"),
                Arguments.of("an empty body", "{\"body\": \"\"}"),
                Arguments.of("a body of spaces", "{\"body\": \"   \"}"),
                Arguments.of("a body of a no-break space", "{\"body\": \"\\u00a0\"}"),
                Arguments.of("a body over 20 000 characters", "{\"body\": \"" + "x".repeat(20_001) + "\"}"),
                Arguments.of("a NUL in the body", "{\"body\": \"a\\u0000b\"}"),
                Arguments.of("a title over 200 characters", "{\"title\": \"" + "x".repeat(201) + "\", \"body\": \"a\"}"),
                Arguments.of("a NUL in the title", "{\"title\": \"a\\u0000b\", \"body\": \"a\"}"),
                Arguments.of("a diagram on a note without a kind", "{\"body\": \"a\", \"diagram\": " + TRIP + "}"),
                Arguments.of("a diagram on a text note", "{\"kind\": \"TEXT\", \"body\": \"a\", \"diagram\": " + TRIP + "}"),
                Arguments.of("a diagram note without a diagram", "{\"kind\": \"DIAGRAM\"}"),
                Arguments.of("a diagram note with a body", "{\"kind\": \"DIAGRAM\", \"body\": \"a\", \"diagram\": " + TRIP + "}"),
                Arguments.of("a diagram note with an empty body",
                        "{\"kind\": \"DIAGRAM\", \"body\": \"\", \"diagram\": " + TRIP + "}"),
                Arguments.of("a diagram without blocks", diagramNote(diagram("", ""))),
                Arguments.of("a diagram without its blocks key", diagramNote("{\"links\": []}")),
                Arguments.of("a diagram without its links key", diagramNote("{\"blocks\": [" + block(A, "a") + "]}")),
                Arguments.of("a null block", diagramNote("{\"blocks\": [null], \"links\": []}")),
                Arguments.of("301 blocks", diagramNote(diagram(manyBlocks, ""))),
                Arguments.of("601 links", diagramNote(diagram(blocks(40), links601))),
                Arguments.of("a link to a block that is not there",
                        diagramNote(diagram(block(A, "a"), link(LINK_1, A, C)))),
                Arguments.of("a link from a block that is not there",
                        diagramNote(diagram(block(A, "a"), link(LINK_1, C, A)))),
                Arguments.of("a block linked to itself", diagramNote(diagram(block(A, "a"), link(LINK_1, A, A)))),
                Arguments.of("two links of one pair",
                        diagramNote(diagram(block(A, "a") + ", " + block(B, "b"),
                                link(LINK_1, A, B) + ", " + link(id(102), A, B)))),
                Arguments.of("two blocks with one ID", diagramNote(diagram(block(A, "a") + ", " + block(A, "b"), ""))),
                Arguments.of("two links with one ID",
                        diagramNote(diagram(block(A, "a") + ", " + block(B, "b") + ", " + block(C, "c"),
                                link(LINK_1, A, B) + ", " + link(LINK_1, B, C)))),
                Arguments.of("a block text over 2 000 characters", diagramNote(diagram(block(A, "x".repeat(2_001)), ""))),
                Arguments.of("a NUL in a block text", diagramNote(diagram(block(A, "a\\u0000b"), ""))),
                Arguments.of("a label over 80 characters",
                        diagramNote(diagram(block(A, "a") + ", " + block(B, "b"),
                                link(LINK_1, A, B).replace("ở đâu", "x".repeat(81))))),
                Arguments.of("a block without a text", diagramNote(diagram(
                        "{\"id\": \"" + A + "\", \"x\": 1, \"y\": 2, \"color\": \"RED\", \"main\": false}", ""))),
                Arguments.of("a block without a position", diagramNote(diagram(
                        "{\"id\": \"" + A + "\", \"text\": \"a\", \"color\": \"RED\", \"main\": false}", ""))),
                Arguments.of("a block without a colour", diagramNote(diagram(
                        "{\"id\": \"" + A + "\", \"x\": 1, \"y\": 2, \"text\": \"a\", \"main\": false}", ""))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("badNotes")
    void aBadNoteIsRefusedAndNothingIsStored(String name, String json) throws Exception {
        mvc.perform(asOwner(post("/api/notes")).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(noteCount()).isZero();
    }

    @Test
    void aRuleOfTheDiagramIsNamedInTheError() throws Exception {
        mvc.perform(asOwner(post("/api/notes")).content(diagramNote(diagram(block(A, "a"), link(LINK_1, A, A)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("diagram"))
                .andExpect(jsonPath("$.errors[0].message").value(org.hamcrest.Matchers.containsString("itself")));
    }

    static Stream<Arguments> unreadableNotes() {
        return Stream.of(
                Arguments.of("an unknown kind", "{\"kind\": \"MEMO\", \"body\": \"a\"}"),
                Arguments.of("an unknown colour", diagramNote(diagram(
                        block(A, "a").replace("YELLOW", "PINK"), ""))),
                Arguments.of("an unknown side", diagramNote(diagram(block(A, "a") + ", " + block(B, "b"),
                        link(LINK_1, A, B).replace("RIGHT", "MIDDLE")))),
                Arguments.of("a block ID that is not a UUID", diagramNote(diagram(
                        block("not-a-uuid", "a"), ""))),
                Arguments.of("a position that is not a number", diagramNote(diagram(
                        block(A, "a").replace("120.5", "\"left\""), ""))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("unreadableNotes")
    void anUnreadableValueIsAMalformedRequest(String name, String json) throws Exception {
        mvc.perform(asOwner(post("/api/notes")).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        assertThat(noteCount()).isZero();
    }

    // ----- edit -----

    @Test
    void editsTheTitleAndTheBodyLeavingTheRest() throws Exception {
        String id = create("{\"title\": \"Hợp đồng\", \"body\": \"Thời hạn 15 ngày\"}");

        mvc.perform(asOwner(patch("/api/notes/{id}", id))
                .content("{\"version\": 0, \"body\": \"Thời hạn 10 ngày\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Hợp đồng"))
                .andExpect(jsonPath("$.body").value("Thời hạn 10 ngày"))
                .andExpect(jsonPath("$.pinned").value(false))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 1, \"title\": \"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value(nullValue()))
                .andExpect(jsonPath("$.body").value("Thời hạn 10 ngày"))
                .andExpect(jsonPath("$.version").value(2));
    }

    @Test
    void aPinKeepsTheTimeOfTheEditAndRaisesTheVersion() throws Exception {
        String body = mvc.perform(asOwner(post("/api/notes")).content("{\"body\": \"Danh sách mua cho bà\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        String updatedAt = JsonPath.read(body, "$.updatedAt");

        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"pinned\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pinned").value(true))
                .andExpect(jsonPath("$.updatedAt").value(updatedAt))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void aChangeThatChangesNothingKeepsTheVersion() throws Exception {
        String id = create("{\"title\": \"Hợp đồng\", \"body\": \"Thời hạn 15 ngày\"}");

        mvc.perform(asOwner(patch("/api/notes/{id}", id))
                .content("{\"version\": 0, \"title\": \"Hợp đồng\", \"body\": \"Thời hạn 15 ngày\", \"pinned\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void aSavedDiagramReplacesTheOldOneWhole() throws Exception {
        String id = create(diagramNote(TRIP));
        String smaller = diagram(block(C, "Chỉ còn một khối"), "");

        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"diagram\": " + smaller + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagram.blocks", hasSize(1)))
                .andExpect(jsonPath("$.diagram.blocks[0].id").value(C))
                .andExpect(jsonPath("$.diagram.links", empty()))
                .andExpect(jsonPath("$.title").value("Kế hoạch"))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/notes/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.diagram.blocks", hasSize(1)));
    }

    @Test
    void theSameDiagramSentAgainKeepsTheVersionAndTheTimeOfTheEdit() throws Exception {
        String body = mvc.perform(asOwner(post("/api/notes")).content(diagramNote(TRIP)))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        String updatedAt = JsonPath.read(body, "$.updatedAt");

        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"diagram\": " + TRIP + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.updatedAt").value(updatedAt));
    }

    static Stream<Arguments> badChanges() {
        return Stream.of(
                Arguments.of("nothing", "{}"),
                Arguments.of("no version", "{\"body\": \"a\"}"),
                Arguments.of("a version and nothing to change", "{\"version\": 0}"),
                Arguments.of("a negative version", "{\"version\": -1, \"body\": \"a\"}"),
                Arguments.of("a blank body", "{\"version\": 0, \"body\": \"   \"}"),
                Arguments.of("an empty body", "{\"version\": 0, \"body\": \"\"}"),
                Arguments.of("a body over 20 000 characters",
                        "{\"version\": 0, \"body\": \"" + "x".repeat(20_001) + "\"}"),
                Arguments.of("a NUL in the body", "{\"version\": 0, \"body\": \"a\\u0000b\"}"),
                Arguments.of("a title over 200 characters", "{\"version\": 0, \"title\": \"" + "x".repeat(201) + "\"}"),
                Arguments.of("a NUL in the title", "{\"version\": 0, \"title\": \"a\\u0000b\"}"),
                Arguments.of("a diagram without blocks", "{\"version\": 0, \"diagram\": " + diagram("", "") + "}"),
                Arguments.of("a diagram with a link to nowhere",
                        "{\"version\": 0, \"diagram\": " + diagram(block(A, "a"), link(LINK_1, A, C)) + "}"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("badChanges")
    void aBadChangeIsRefusedAndTheNoteStays(String name, String json) throws Exception {
        String text = create("{\"body\": \"Giữ nguyên\"}");
        String sketch = create(diagramNote(TRIP));

        for (String id : new String[] { text, sketch }) {
            mvc.perform(asOwner(patch("/api/notes/{id}", id)).content(json))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        assertThat(jdbc.queryForObject("select count(*) from note where version = 0", Integer.class)).isEqualTo(2);
    }

    @Test
    void aSaveFromAnOldTabIsAConflictAndTheNoteStays() throws Exception {
        String id = create("{\"body\": \"Thời hạn 15 ngày\"}");
        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"body\": \"Sửa ở điện thoại\"}"))
                .andExpect(status().isOk());

        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"body\": \"Sửa ở tab cũ\"}"))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));

        mvc.perform(get("/api/notes/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.body").value("Sửa ở điện thoại"))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void aDiagramFromAnOldTabIsAConflictAndTheDiagramStays() throws Exception {
        String id = create(diagramNote(TRIP));
        mvc.perform(asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"pinned\": true}"))
                .andExpect(status().isOk());

        mvc.perform(asOwner(patch("/api/notes/{id}", id))
                .content("{\"version\": 0, \"diagram\": " + diagram(block(C, "Từ tab cũ"), "") + "}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));

        mvc.perform(get("/api/notes/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.diagram.blocks", hasSize(2)));
    }

    @Test
    void aBodyForADiagramNoteAndADiagramForATextNoteAreUnprocessable() throws Exception {
        String sketch = create(diagramNote(TRIP));
        String text = create("{\"body\": \"Gọi lại\"}");

        mvc.perform(asOwner(patch("/api/notes/{id}", sketch)).content("{\"version\": 0, \"body\": \"Chữ\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOTE_KIND_MISMATCH"));
        mvc.perform(asOwner(patch("/api/notes/{id}", text)).content("{\"version\": 0, \"diagram\": " + TRIP + "}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("NOTE_KIND_MISMATCH"));

        assertThat(jdbc.queryForObject("select count(*) from note where version = 0", Integer.class)).isEqualTo(2);
    }

    // ----- delete, other users, access -----

    @Test
    void deletesANote() throws Exception {
        String id = create("{\"body\": \"Ý tưởng chuyến đi Đà Lạt\"}");

        mvc.perform(asOwner(delete("/api/notes/{id}", id)))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        mvc.perform(get("/api/notes/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOTE_NOT_FOUND"));
    }

    @Test
    void theNoteOfAnotherUserIsNotFoundAndNotListed() throws Exception {
        Note theirs = service.create(otherUser, NewNote.text("Của người khác", "Không được đọc"));
        String id = theirs.id().toString();
        RequestBuilder[] calls = { asOwner(patch("/api/notes/{id}", id)).content("{\"version\": 0, \"body\": \"x\"}"),
                asOwner(delete("/api/notes/{id}", id)), get("/api/notes/{id}", id).with(user("owner@sino.test")) };

        for (RequestBuilder call : calls) {
            mvc.perform(call)
                    .andExpect(status().isNotFound())
                    .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code").value("NOTE_NOT_FOUND"));
        }
        mvc.perform(get("/api/notes").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.notes", hasSize(0)));
        assertThat(jdbc.queryForObject("select body from note where id = ?", String.class, theirs.id()))
                .isEqualTo("Không được đọc");
    }

    @Test
    void aMissingNoteIsNotFoundWhateverTheChange() throws Exception {
        String missing = UUID.randomUUID().toString();

        // A save of a note deleted elsewhere: the web offers to keep the text as a new note (D-178).
        mvc.perform(asOwner(patch("/api/notes/{id}", missing)).content("{\"version\": 3, \"body\": \"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOTE_NOT_FOUND"));
        mvc.perform(asOwner(delete("/api/notes/{id}", missing)))
                .andExpect(status().isNotFound());
    }

    @Test
    void aMalformedIdIsABadRequest() throws Exception {
        mvc.perform(get("/api/notes/not-a-uuid").with(user("owner@sino.test")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(asOwner(delete("/api/notes/not-a-uuid")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void needsAuthentication() throws Exception {
        mvc.perform(get("/api/notes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        String id = create("{\"body\": \"a\"}");
        RequestBuilder[] calls = {
                post("/api/notes").with(user("owner@sino.test")).contentType(APPLICATION_JSON).content("{\"body\": \"b\"}"),
                patch("/api/notes/{id}", id).with(user("owner@sino.test")).contentType(APPLICATION_JSON)
                        .content("{\"version\": 0, \"body\": \"b\"}"),
                delete("/api/notes/{id}", id).with(user("owner@sino.test")) };

        for (RequestBuilder call : calls) {
            mvc.perform(call)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        }
        assertThat(noteCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select body from note", String.class)).isEqualTo("a");
    }

}
