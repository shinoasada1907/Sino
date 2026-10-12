package dev.sino.planner.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
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
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.planner.application.NewTask;
import dev.sino.planner.application.TaskService;
import dev.sino.planner.domain.Task;

/**
 * The task API through HTTP on the whole application and a real PostgreSQL: real security, real owner lookup, real
 * data. Dues are in 2030 so that "today" never moves the next occurrence of a repeating task.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class TasksApiTests {

    // Monday 07/01/2030 09:00 in Vietnam.
    private static final String MONDAY_9 = "2030-01-07T02:00:00Z";
    private static final String WEEKLY_ON_MONDAY = "{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"MONDAY\"]}";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoSpyBean
    private TaskService service;

    private UUID otherUser;

    @BeforeEach
    void startFromNoTasks() {
        jdbc.update("delete from task");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON);
    }

    private String create(String json) throws Exception {
        String body = mvc.perform(asOwner(post("/api/tasks")).content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void createsATaskAndListsIt() throws Exception {
        String body = mvc.perform(asOwner(post("/api/tasks")).content("{\"title\": \"  Gọi thợ sửa máy lạnh  \"}"))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_JSON))
                .andExpect(jsonPath("$.title").value("Gọi thợ sửa máy lạnh"))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.dueAt").value(nullValue()))
                .andExpect(jsonPath("$.dueDate").value(nullValue()))
                .andExpect(jsonPath("$.reminder").value(nullValue()))
                .andExpect(jsonPath("$.recurrence").value(nullValue()))
                .andExpect(jsonPath("$.seriesId").value(nullValue()))
                .andExpect(jsonPath("$.source").value(nullValue()))
                .andExpect(jsonPath("$.related").value(nullValue()))
                .andExpect(jsonPath("$.completedAt").value(nullValue()))
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mvc.perform(get("/api/tasks").with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.tasks", hasSize(1)))
                .andExpect(jsonPath("$.tasks[0].id").value(id));
    }

    @Test
    void theLocationOfANewTaskNamesIt() throws Exception {
        var response = mvc.perform(asOwner(post("/api/tasks")).content("{\"title\": \"A\"}"))
                .andExpect(header().string("Location", startsWith("http://localhost/api/tasks/")))
                .andReturn().getResponse();

        String id = JsonPath.read(response.getContentAsString(), "$.id");
        assertThat(response.getHeader("Location")).isEqualTo("http://localhost/api/tasks/" + id);
        mvc.perform(get("/api/tasks/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.title").value("A"));
    }

    @Test
    void createsARepeatingTaskWithAllItsFields() throws Exception {
        mvc.perform(asOwner(post("/api/tasks")).content("""
                {"title": "Báo cáo tuần", "notes": "Gửi chị Lan", "dueAt": "%s",
                 "recurrence": {"freq": "WEEKLY", "interval": 2, "byWeekdays": ["THURSDAY", "MONDAY"], "count": 5}}
                """.formatted(MONDAY_9)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.notes").value("Gửi chị Lan"))
                .andExpect(jsonPath("$.dueAt").value(MONDAY_9))
                .andExpect(jsonPath("$.dueDate").value(nullValue()))
                .andExpect(jsonPath("$.recurrence.freq").value("WEEKLY"))
                .andExpect(jsonPath("$.recurrence.interval").value(2))
                .andExpect(jsonPath("$.recurrence.byWeekdays", contains("MONDAY", "THURSDAY")))
                .andExpect(jsonPath("$.recurrence.byMonthDay").value(nullValue()))
                .andExpect(jsonPath("$.recurrence.untilDate").value(nullValue()))
                .andExpect(jsonPath("$.recurrence.count").value(5))
                .andExpect(jsonPath("$.recurrence.timeZone").doesNotExist())
                .andExpect(jsonPath("$.seriesId").isString());
    }

    @Test
    void aWholeDayDueAndAMonthlyRuleTakeTheDayOfTheDue() throws Exception {
        mvc.perform(asOwner(post("/api/tasks")).content("""
                {"title": "Trả tiền nhà", "dueDate": "2030-01-31", "recurrence": {"freq": "MONTHLY", "interval": 1}}
                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dueDate").value("2030-01-31"))
                .andExpect(jsonPath("$.dueAt").value(nullValue()))
                .andExpect(jsonPath("$.recurrence.byMonthDay").value(31))
                .andExpect(jsonPath("$.recurrence.byWeekdays").value(nullValue()));
    }

    static Stream<Arguments> badTasks() {
        return Stream.of(
                Arguments.of("no title", "{}"),
                Arguments.of("a blank title", "{\"title\": \"   \"}"),
                Arguments.of("a title over 200 characters", "{\"title\": \"" + "x".repeat(201) + "\"}"),
                Arguments.of("a NUL in the title", "{\"title\": \"a\\u0000b\"}"),
                Arguments.of("notes over 20 000 characters",
                        "{\"title\": \"a\", \"notes\": \"" + "x".repeat(20_001) + "\"}"),
                Arguments.of("a NUL in the notes", "{\"title\": \"a\", \"notes\": \"a\\u0000b\"}"),
                Arguments.of("both kinds of due",
                        "{\"title\": \"a\", \"dueAt\": \"" + MONDAY_9 + "\", \"dueDate\": \"2030-01-07\"}"),
                Arguments.of("a rule without a due", "{\"title\": \"a\", \"recurrence\": " + WEEKLY_ON_MONDAY + "}"),
                Arguments.of("a rule without its frequency", rule("{\"interval\": 1}")),
                Arguments.of("a rule without its interval", rule("{\"freq\": \"DAILY\"}")),
                Arguments.of("every 0", rule("{\"freq\": \"DAILY\", \"interval\": 0}")),
                Arguments.of("every 100", rule("{\"freq\": \"DAILY\", \"interval\": 100}")),
                Arguments.of("a count of 0", rule("{\"freq\": \"DAILY\", \"interval\": 1, \"count\": 0}")),
                Arguments.of("a count of 1000", rule("{\"freq\": \"DAILY\", \"interval\": 1, \"count\": 1000}")),
                Arguments.of("an end day and a count",
                        rule("{\"freq\": \"DAILY\", \"interval\": 1, \"count\": 3, \"untilDate\": \"2030-02-01\"}")),
                Arguments.of("weekly without weekdays", rule("{\"freq\": \"WEEKLY\", \"interval\": 1}")),
                Arguments.of("weekly with an empty list", rule("{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": []}")),
                Arguments.of("an empty weekday",
                        rule("{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"MONDAY\", null]}")),
                Arguments.of("weekdays on a daily rule",
                        rule("{\"freq\": \"DAILY\", \"interval\": 1, \"byWeekdays\": [\"MONDAY\"]}")),
                Arguments.of("a day of the month on a daily rule",
                        rule("{\"freq\": \"DAILY\", \"interval\": 1, \"byMonthDay\": 7}")),
                Arguments.of("a day of the month of 32", rule("{\"freq\": \"MONTHLY\", \"interval\": 1, \"byMonthDay\": 32}")));
    }

    private static String rule(String recurrence) {
        return "{\"title\": \"a\", \"dueAt\": \"" + MONDAY_9 + "\", \"recurrence\": " + recurrence + "}";
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("badTasks")
    void aBadTaskIsRefusedAndNothingIsStored(String name, String json) throws Exception {
        mvc.perform(asOwner(post("/api/tasks")).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(taskCount()).isZero();
    }

    @Test
    void anUnknownFrequencyOrABadDateIsAMalformedRequest() throws Exception {
        for (String json : new String[] { rule("{\"freq\": \"HOURLY\", \"interval\": 1}"),
                "{\"title\": \"a\", \"dueAt\": \"tomorrow\"}", "{\"title\": \"a\", \"dueDate\": \"2030-02-30\"}" }) {
            mvc.perform(asOwner(post("/api/tasks")).content(json))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        }
    }

    @Test
    void aRuleThatDoesNotFitTheDueIsUnprocessable() throws Exception {
        // Wednesday 09/01/2030, a rule of Mondays.
        mvc.perform(asOwner(post("/api/tasks")).content(
                "{\"title\": \"a\", \"dueDate\": \"2030-01-09\", \"recurrence\": " + WEEKLY_ON_MONDAY + "}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_RECURRENCE"));
        assertThat(taskCount()).isZero();
    }

    @Test
    void renamesAndChangesNotesLeavingTheRest() throws Exception {
        String id = create("{\"title\": \"Hợp đồng\", \"notes\": \"Xem điều khoản 4\", \"dueDate\": \"2030-01-09\"}");

        mvc.perform(asOwner(patch("/api/tasks/{id}", id)).content("{\"title\": \"Trả lời: Hợp đồng\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Trả lời: Hợp đồng"))
                .andExpect(jsonPath("$.notes").value("Xem điều khoản 4"))
                .andExpect(jsonPath("$.dueDate").value("2030-01-09"));

        mvc.perform(asOwner(patch("/api/tasks/{id}", id)).content("{\"notes\": \"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Trả lời: Hợp đồng"))
                .andExpect(jsonPath("$.notes").value(nullValue()));
    }

    @Test
    void aPatchWithNothingOrABadFieldIsRefused() throws Exception {
        String id = create("{\"title\": \"Hợp đồng\"}");

        for (String json : new String[] { "{}", "{\"title\": \"  \"}", "{\"title\": \"" + "x".repeat(201) + "\"}",
                "{\"notes\": \"a\\u0000b\"}", "{\"notes\": \"" + "x".repeat(20_001) + "\"}" }) {
            mvc.perform(asOwner(patch("/api/tasks/{id}", id)).content(json))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }

    @Test
    void setsTheDueAndRuleTogetherAndClearsThem() throws Exception {
        String id = create("{\"title\": \"Báo cáo tuần\"}");

        mvc.perform(asOwner(put("/api/tasks/{id}/schedule", id))
                .content("{\"dueAt\": \"" + MONDAY_9 + "\", \"recurrence\": " + WEEKLY_ON_MONDAY + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dueAt").value(MONDAY_9))
                .andExpect(jsonPath("$.recurrence.byWeekdays", contains("MONDAY")))
                .andExpect(jsonPath("$.seriesId").isString());

        mvc.perform(asOwner(put("/api/tasks/{id}/schedule", id)).content("{\"dueAt\": null, \"dueDate\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dueAt").value(nullValue()))
                .andExpect(jsonPath("$.recurrence").value(nullValue()))
                .andExpect(jsonPath("$.seriesId").isString());
    }

    @Test
    void aScheduleIsCheckedLikeANewTask() throws Exception {
        String id = create("{\"title\": \"Báo cáo tuần\"}");

        mvc.perform(asOwner(put("/api/tasks/{id}/schedule", id)).content("{\"recurrence\": " + WEEKLY_ON_MONDAY + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(asOwner(put("/api/tasks/{id}/schedule", id))
                .content("{\"dueDate\": \"2030-01-09\", \"recurrence\": " + WEEKLY_ON_MONDAY + "}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("INVALID_RECURRENCE"));
    }

    @Test
    void completesARepeatingTaskOnceAndOpensItAgain() throws Exception {
        String id = create("{\"title\": \"Báo cáo tuần\", \"dueAt\": \"" + MONDAY_9 + "\", \"recurrence\": "
                + WEEKLY_ON_MONDAY + "}");

        String body = mvc.perform(asOwner(post("/api/tasks/{id}/complete", id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.id").value(id))
                .andExpect(jsonPath("$.task.status").value("DONE"))
                .andExpect(jsonPath("$.task.completedAt").isString())
                .andExpect(jsonPath("$.next.status").value("OPEN"))
                .andExpect(jsonPath("$.next.dueAt").value("2030-01-14T02:00:00Z"))
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.next.seriesId")).isEqualTo(JsonPath.read(body, "$.task.seriesId"));

        mvc.perform(asOwner(post("/api/tasks/{id}/complete", id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.task.status").value("DONE"))
                .andExpect(jsonPath("$.next").value(nullValue()));

        mvc.perform(asOwner(post("/api/tasks/{id}/reopen", id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.completedAt").value(nullValue()));
        assertThat(taskCount()).isEqualTo(2);
    }

    @Test
    void deletesATask() throws Exception {
        String id = create("{\"title\": \"Hỏi giá in\"}");

        mvc.perform(asOwner(delete("/api/tasks/{id}", id)))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        mvc.perform(asOwner(post("/api/tasks/{id}/complete", id)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void theTaskOfAnotherUserIsNotFoundAndNotListed() throws Exception {
        Task theirs = service.create(otherUser, new NewTask("Của người khác", null, null, null));
        String id = theirs.id().toString();

        RequestBuilder[] calls = { asOwner(patch("/api/tasks/{id}", id)).content("{\"title\": \"x\"}"),
                asOwner(put("/api/tasks/{id}/schedule", id)).content("{}"),
                asOwner(post("/api/tasks/{id}/complete", id)), asOwner(post("/api/tasks/{id}/reopen", id)),
                asOwner(delete("/api/tasks/{id}", id)), get("/api/tasks/{id}", id).with(user("owner@sino.test")) };
        for (RequestBuilder call : calls) {
            mvc.perform(call)
                    .andExpect(status().isNotFound())
                    .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
        }
        mvc.perform(get("/api/tasks").with(user("owner@sino.test")))
                .andExpect(jsonPath("$.tasks", hasSize(0)));
        assertThat(jdbc.queryForObject("select title from task where id = ?", String.class, theirs.id()))
                .isEqualTo("Của người khác");
    }

    @Test
    void aMalformedIdIsABadRequest() throws Exception {
        mvc.perform(asOwner(post("/api/tasks/not-a-uuid/complete")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void needsAuthentication() throws Exception {
        mvc.perform(get("/api/tasks"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        mvc.perform(post("/api/tasks").with(user("owner@sino.test")).contentType(APPLICATION_JSON)
                .content("{\"title\": \"a\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        assertThat(taskCount()).isZero();
    }

    // A real race cannot be timed through HTTP; TaskServiceTests makes one with two transactions. Here the service
    // reports it, and the answer must be the F01 conflict.
    @Test
    void aChangeThatLostARaceIsAConflict() throws Exception {
        String id = create("{\"title\": \"Hợp đồng\"}");
        doThrow(new OptimisticLockingFailureException("changed meanwhile")).when(service).complete(any(), any());

        mvc.perform(asOwner(post("/api/tasks/{id}/complete", id)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    }

    private int taskCount() {
        return jdbc.queryForObject("select count(*) from task", Integer.class);
    }

}
