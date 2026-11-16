package dev.sino.planner.api;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.planner.application.EventService;
import dev.sino.planner.application.NewEvent;
import dev.sino.planner.application.NewTask;
import dev.sino.planner.application.RepeatRule;
import dev.sino.planner.application.TaskService;
import dev.sino.planner.domain.Due;
import dev.sino.planner.domain.EventTime;
import dev.sino.planner.domain.Frequency;

/**
 * {@code GET /api/calendar} through HTTP on the whole application and a real PostgreSQL. The data is in January 2030,
 * so that today of the real clock never changes what is late or coming.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class CalendarApiTests {

    private static final RepeatRule SUNDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(java.time.DayOfWeek.SUNDAY),
            null, null, null);
    private static final RepeatRule MONDAYS = new RepeatRule(Frequency.WEEKLY, 1, Set.of(java.time.DayOfWeek.MONDAY),
            null, null, null);

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private EventService eventService;

    @Autowired
    private TaskService taskService;

    private UUID owner;
    private UUID otherUser;

    @BeforeEach
    void startFromNothing() {
        jdbc.update("delete from calendar_event");
        jdbc.update("delete from task");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        owner = users.findByEmail("owner@sino.test").orElseThrow().id();
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    /** Other tests delete users; a row left here would stop them. */
    @AfterEach
    void leaveNoRows() {
        jdbc.update("delete from calendar_event");
        jdbc.update("delete from task");
    }

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON);
    }

    @Test
    void aRepeatingAppointmentIsAnOccurrenceWithItsOwnIdInTheWeek() throws Exception {
        // Every Sunday 06:00 in Vietnam from 02/12/2029; the week is [01/01/2030, 08/01/2030).
        String id = JsonPath.read(mvc.perform(asOwner(post("/api/events")).content(
                "{\"title\": \"Chạy bộ Hồ Tây\", \"startsAt\": \"2029-12-01T23:00:00Z\", "
                        + "\"endsAt\": \"2029-12-02T00:00:00Z\", \"location\": \"Hồ Tây\", "
                        + "\"recurrence\": {\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"SUNDAY\"]}}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-01-08")
                        .with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value("2030-01-01"))
                .andExpect(jsonPath("$.to").value("2030-01-08"))
                .andExpect(jsonPath("$.generatedAt").isString())
                .andExpect(jsonPath("$.events", hasSize(1)))
                .andExpect(jsonPath("$.events[0].id").value(id + "@2030-01-06"))
                .andExpect(jsonPath("$.events[0].eventId").value(id))
                .andExpect(jsonPath("$.events[0].title").value("Chạy bộ Hồ Tây"))
                .andExpect(jsonPath("$.events[0].startsAt").value("2030-01-05T23:00:00Z"))
                .andExpect(jsonPath("$.events[0].endsAt").value("2030-01-06T00:00:00Z"))
                .andExpect(jsonPath("$.events[0].startDate").value(nullValue()))
                .andExpect(jsonPath("$.events[0].location").value("Hồ Tây"))
                .andExpect(jsonPath("$.events[0].recurrence.freq").value("WEEKLY"))
                .andExpect(jsonPath("$.events[0].reminder").value(nullValue()))
                .andExpect(jsonPath("$.events[0].source").value(nullValue()))
                .andExpect(jsonPath("$.events[0].related").value(nullValue()))
                .andExpect(jsonPath("$.tasks", hasSize(0)))
                .andExpect(jsonPath("$.reminders", hasSize(0)));
    }

    @Test
    void aWholeDayAppointmentThatReachesIntoTheRangeIsThere() throws Exception {
        eventService.create(owner, new NewEvent("Công tác", null, null,
                EventTime.wholeDays(LocalDate.parse("2029-12-27"), LocalDate.parse("2030-01-02")), null));

        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-01-08")
                        .with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(1)))
                .andExpect(jsonPath("$.events[0].startDate").value("2029-12-27"))
                .andExpect(jsonPath("$.events[0].endDate").value("2030-01-02"))
                .andExpect(jsonPath("$.events[0].startsAt").value(nullValue()))
                .andExpect(jsonPath("$.events[0].recurrence").value(nullValue()));
    }

    @Test
    void aRepeatingTaskIsItsRealOccurrenceAndTheComingOnes() throws Exception {
        // Due Monday 07/01/2030 09:00 in Vietnam, every Monday; the month is January 2030.
        UUID id = taskService.create(owner, new NewTask("Báo cáo tuần", null,
                Due.at(Instant.parse("2030-01-07T02:00:00Z")), MONDAYS)).id();

        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-02-01")
                        .with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[*].id", contains(id.toString(), id + "@2030-01-14", id + "@2030-01-21",
                        id + "@2030-01-28")))
                .andExpect(jsonPath("$.tasks[*].taskId", org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is(id.toString()))))
                .andExpect(jsonPath("$.tasks[1].status").value("OPEN"))
                .andExpect(jsonPath("$.tasks[1].dueAt").value("2030-01-14T02:00:00Z"))
                .andExpect(jsonPath("$.tasks[1].dueDate").value(nullValue()))
                .andExpect(jsonPath("$.tasks[1].completedAt").value(nullValue()))
                .andExpect(jsonPath("$.tasks[1].recurrence.freq").value("WEEKLY"))
                .andExpect(jsonPath("$.tasks[1].source").value(nullValue()));
    }

    @Test
    void aTaskOfWholeDaysCarriesItsDay() throws Exception {
        taskService.create(owner, new NewTask("Nộp thuế", null, Due.on(LocalDate.parse("2030-01-10")), null));

        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-02-01")
                        .with(user("owner@sino.test")))
                .andExpect(jsonPath("$.tasks", hasSize(1)))
                .andExpect(jsonPath("$.tasks[0].dueDate").value("2030-01-10"))
                .andExpect(jsonPath("$.tasks[0].dueAt").value(nullValue()))
                .andExpect(jsonPath("$.tasks[0].recurrence").value(nullValue()));
    }

    @Test
    void anotherUserSeesNothingOfIt() throws Exception {
        eventService.create(otherUser, new NewEvent("Của người khác", null, null,
                EventTime.timed(Instant.parse("2029-12-01T23:00:00Z"), Instant.parse("2029-12-02T00:00:00Z")),
                SUNDAYS));
        taskService.create(otherUser, new NewTask("Việc của người khác", null,
                Due.at(Instant.parse("2030-01-07T02:00:00Z")), MONDAYS));

        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-02-01")
                        .with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.events", hasSize(0)))
                .andExpect(jsonPath("$.tasks", hasSize(0)));
    }

    static Stream<Arguments> badRanges() {
        return Stream.of(
                Arguments.of("63 days", "2030-01-01", "2030-03-05", "shortEnough"),
                Arguments.of("a year", "2030-01-01", "2031-01-01", "shortEnough"),
                Arguments.of("no length", "2030-01-01", "2030-01-01", "toAfterFrom"),
                Arguments.of("to before from", "2030-01-08", "2030-01-01", "toAfterFrom"),
                Arguments.of("missing from", null, "2030-01-08", "from"),
                Arguments.of("missing to", "2030-01-01", null, "to"),
                Arguments.of("not a date", "tomorrow", "2030-01-08", "from"),
                Arguments.of("an impossible day", "2030-02-30", "2030-03-08", "from"),
                Arguments.of("before 1900", "1899-12-30", "1900-01-05", "withinSupportedYears"),
                Arguments.of("a far year", "9999-01-01", "9999-01-05", "withinSupportedYears"),
                Arguments.of("past 2200", "2200-12-30", "2201-01-02", "withinSupportedYears"),
                Arguments.of("a year beyond the date arithmetic", "+999999999-01-01", "+999999999-01-05",
                        "withinSupportedYears"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("badRanges")
    void aBadRangeIs400WithTheField(String name, String from, String to, String field) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/calendar").with(user("owner@sino.test"));
        if (from != null) {
            request.param("from", from);
        }
        if (to != null) {
            request.param("to", to);
        }

        mvc.perform(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", hasItem(startsWith(field))));
    }

    @Test
    void theEdgesAreServed() throws Exception {
        // 62 days exactly, and the first and last days of the supported years.
        for (String[] range : new String[][] { { "2030-01-01", "2030-03-04" }, { "1900-01-01", "1900-01-05" },
                { "2200-12-28", "2201-01-01" } }) {
            mvc.perform(get("/api/calendar").param("from", range[0]).param("to", range[1])
                            .with(user("owner@sino.test")))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void theCalendarNeedsSignIn() throws Exception {
        mvc.perform(get("/api/calendar").param("from", "2030-01-01").param("to", "2030-01-08"))
                .andExpect(status().isUnauthorized());
    }

}
