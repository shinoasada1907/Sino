package dev.sino.planner.api;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.planner.application.EventService;
import dev.sino.planner.application.NewEvent;
import dev.sino.planner.domain.CalendarEvent;
import dev.sino.planner.domain.EventTime;

/**
 * The appointment API through HTTP on the whole application and a real PostgreSQL: real security, real owner lookup,
 * real data.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class EventsApiTests {

    // Monday 07/01/2030 09:00 – 10:00 in Vietnam; far ahead, so the clock never matters.
    private static final String STARTS = "2030-01-07T02:00:00Z";
    private static final String ENDS = "2030-01-07T03:00:00Z";
    private static final String TIMED = "\"startsAt\": \"" + STARTS + "\", \"endsAt\": \"" + ENDS + "\"";
    private static final String WEEKLY_ON_MONDAY = "{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"MONDAY\"]}";

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoSpyBean
    private EventService service;

    private UUID otherUser;

    @BeforeEach
    void startFromNoEvents() {
        jdbc.update("delete from calendar_event");
        jdbc.update("delete from app_user where email <> 'owner@sino.test'");
        otherUser = users.save(new AppUser("other@example.com", "Other")).id();
    }

    /** Other tests delete users; a row left here would stop them. */
    @AfterEach
    void leaveNoRows() {
        jdbc.update("delete from calendar_event");
    }

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf()).contentType(APPLICATION_JSON);
    }

    private String create(String json) throws Exception {
        String body = mvc.perform(asOwner(post("/api/events")).content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    void createsATimedAppointmentAndReadsItBack() throws Exception {
        String json = "{\"title\": \"  Họp nhóm  \", " + TIMED + ", \"location\": \"Phòng 3\", \"notes\": \"Mang laptop\"}";
        String body = mvc.perform(asOwner(post("/api/events")).content(json))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("http://localhost/api/events/")))
                .andExpect(jsonPath("$.title").value("Họp nhóm"))
                .andExpect(jsonPath("$.startsAt").value(STARTS))
                .andExpect(jsonPath("$.endsAt").value(ENDS))
                .andExpect(jsonPath("$.startDate").value(nullValue()))
                .andExpect(jsonPath("$.endDate").value(nullValue()))
                .andExpect(jsonPath("$.location").value("Phòng 3"))
                .andExpect(jsonPath("$.notes").value("Mang laptop"))
                .andExpect(jsonPath("$.recurrence").value(nullValue()))
                .andExpect(jsonPath("$.reminder").value(nullValue()))
                .andExpect(jsonPath("$.source").value(nullValue()))
                .andExpect(jsonPath("$.related").value(nullValue()))
                .andExpect(jsonPath("$.createdAt").isString())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.title").value("Họp nhóm"))
                .andExpect(jsonPath("$.startsAt").value(STARTS));
    }

    @Test
    void createsAWholeDayAppointment() throws Exception {
        mvc.perform(asOwner(post("/api/events"))
                        .content("{\"title\": \"Sinh nhật Hà\", \"startDate\": \"2030-10-01\", \"endDate\": \"2030-10-02\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.startsAt").value(nullValue()))
                .andExpect(jsonPath("$.endsAt").value(nullValue()))
                .andExpect(jsonPath("$.startDate").value("2030-10-01"))
                .andExpect(jsonPath("$.endDate").value("2030-10-02"));
    }

    @Test
    void aRepeatingAppointmentIsReadAsAWholeSeries() throws Exception {
        String id = create("{\"title\": \"Họp nhóm\", " + TIMED + ", \"recurrence\": " + WEEKLY_ON_MONDAY + "}");

        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startsAt").value(STARTS))
                .andExpect(jsonPath("$.recurrence.freq").value("WEEKLY"))
                .andExpect(jsonPath("$.recurrence.interval").value(1))
                .andExpect(jsonPath("$.recurrence.byWeekdays", contains("MONDAY")))
                .andExpect(jsonPath("$.recurrence.count").value(nullValue()));
    }

    @Test
    void putReplacesTheWholeAppointment() throws Exception {
        String id = create("{\"title\": \"Họp nhóm\", " + TIMED + ", \"location\": \"Phòng 3\", \"notes\": \"x\", "
                + "\"recurrence\": " + WEEKLY_ON_MONDAY + "}");

        mvc.perform(asOwner(put("/api/events/{id}", id))
                        .content("{\"title\": \"Họp nhóm\", \"startDate\": \"2030-01-07\", \"endDate\": \"2030-01-08\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.startsAt").value(nullValue()))
                .andExpect(jsonPath("$.startDate").value("2030-01-07"))
                .andExpect(jsonPath("$.location").value(nullValue()))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.recurrence").value(nullValue()));

        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.endDate").value("2030-01-08"))
                .andExpect(jsonPath("$.recurrence").value(nullValue()));
    }

    @Test
    void deleteAnswersNoContentAndTheAppointmentIsGone() throws Exception {
        String id = create("{\"title\": \"Chạy bộ\", " + TIMED + ", \"recurrence\": " + WEEKLY_ON_MONDAY + "}");

        mvc.perform(asOwner(delete("/api/events/{id}", id))).andExpect(status().isNoContent());

        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
        mvc.perform(asOwner(delete("/api/events/{id}", id))).andExpect(status().isNotFound());
    }

    static Stream<Arguments> badBodies() {
        String span = "\"startsAt\": \"" + STARTS + "\", \"endsAt\": \"" + ENDS + "\"";
        return Stream.of(
                Arguments.of("end before start", "{\"title\": \"x\", \"startsAt\": \"" + ENDS + "\", \"endsAt\": \""
                        + STARTS + "\"}", "endAfterStart"),
                Arguments.of("no length", "{\"title\": \"x\", \"startsAt\": \"" + STARTS + "\", \"endsAt\": \""
                        + STARTS + "\"}", "endAfterStart"),
                Arguments.of("whole days ending before they start",
                        "{\"title\": \"x\", \"startDate\": \"2030-01-02\", \"endDate\": \"2030-01-01\"}",
                        "endAfterStart"),
                Arguments.of("a timed span over 14 days", "{\"title\": \"x\", \"startsAt\": \"" + STARTS
                        + "\", \"endsAt\": \"2030-01-21T02:00:01Z\"}", "shortEnough"),
                Arguments.of("whole days over 14 days",
                        "{\"title\": \"x\", \"startDate\": \"2030-01-01\", \"endDate\": \"2030-01-16\"}",
                        "shortEnough"),
                Arguments.of("both kinds of time", "{\"title\": \"x\", " + span
                        + ", \"startDate\": \"2030-01-07\", \"endDate\": \"2030-01-08\"}", "oneKindOfTime"),
                Arguments.of("a timed start with a whole-day end",
                        "{\"title\": \"x\", \"startsAt\": \"" + STARTS + "\", \"endDate\": \"2030-01-08\"}",
                        "oneKindOfTime"),
                Arguments.of("no time", "{\"title\": \"x\"}", "oneKindOfTime"),
                Arguments.of("half a span", "{\"title\": \"x\", \"startsAt\": \"" + STARTS + "\"}", "oneKindOfTime"),
                Arguments.of("a blank title", "{\"title\": \"  \", " + span + "}", "title"),
                Arguments.of("no title", "{" + span + "}", "title"),
                Arguments.of("a title over 200 characters", "{\"title\": \"" + "x".repeat(201) + "\", " + span + "}",
                        "title"),
                Arguments.of("a place over 200 characters",
                        "{\"title\": \"x\", \"location\": \"" + "x".repeat(201) + "\", " + span + "}", "location"),
                Arguments.of("notes over 20 000 characters",
                        "{\"title\": \"x\", \"notes\": \"" + "x".repeat(20_001) + "\", " + span + "}", "notes"),
                Arguments.of("a NUL in the title", "{\"title\": \"a\\u0000b\", " + span + "}", "title"),
                Arguments.of("a NUL in the place", "{\"title\": \"x\", \"location\": \"a\\u0000b\", " + span + "}",
                        "location"),
                Arguments.of("whole days in a far year",
                        "{\"title\": \"x\", \"startDate\": \"9999-01-01\", \"endDate\": \"9999-01-02\"}",
                        "withinSupportedYears"),
                Arguments.of("whole days before 1900",
                        "{\"title\": \"x\", \"startDate\": \"1899-12-31\", \"endDate\": \"1900-01-02\"}",
                        "withinSupportedYears"),
                Arguments.of("a timed span in a far year",
                        "{\"title\": \"x\", \"startsAt\": \"9999-01-01T00:00:00Z\", \"endsAt\": \"9999-01-01T01:00:00Z\"}",
                        "withinSupportedYears"),
                Arguments.of("a timed span past 2200",
                        "{\"title\": \"x\", \"startsAt\": \"2200-12-31T23:00:00Z\", \"endsAt\": \"2201-01-01T01:00:00Z\"}",
                        "withinSupportedYears"),
                Arguments.of("both an end day and a count in the rule",
                        "{\"title\": \"x\", " + span + ", \"recurrence\": {\"freq\": \"DAILY\", \"interval\": 1, "
                                + "\"untilDate\": \"2030-02-01\", \"count\": 3}}",
                        "recurrence"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("badBodies")
    void aBadBodyIsRefusedWithTheFieldAndNothingIsStored(String name, String json, String field) throws Exception {
        mvc.perform(asOwner(post("/api/events")).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field", org.hamcrest.Matchers.hasItem(startsWith(field))));
        org.assertj.core.api.Assertions.assertThat(eventCount()).isZero();
    }

    @Test
    void aPutIsCheckedLikeAPost() throws Exception {
        String id = create("{\"title\": \"Họp\", " + TIMED + "}");

        mvc.perform(asOwner(put("/api/events/{id}", id))
                        .content("{\"title\": \"Họp\", \"startsAt\": \"" + ENDS + "\", \"endsAt\": \"" + STARTS + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(asOwner(put("/api/events/{id}", id)).content("{\"title\": \"Họp\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.startsAt").value(STARTS));
    }

    @Test
    void aMalformedBodyIsABadRequest() throws Exception {
        mvc.perform(asOwner(post("/api/events"))
                        .content("{\"title\": \"x\", \"startDate\": \"not a date\", \"endDate\": \"2030-01-08\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mvc.perform(asOwner(get("/api/events/{id}", "not-a-uuid"))).andExpect(status().isBadRequest());
    }

    @Test
    void aRuleThatDoesNotFitTheStartIs422() throws Exception {
        // Monday 07/01/2030 09:00 in Vietnam; a Thursday rule does not hold the weekday of the start.
        String thursdays = "{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"THURSDAY\"]}";

        mvc.perform(asOwner(post("/api/events")).content("{\"title\": \"x\", " + TIMED + ", \"recurrence\": " + thursdays + "}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("INVALID_RECURRENCE"));

        String id = create("{\"title\": \"x\", " + TIMED + "}");
        mvc.perform(asOwner(put("/api/events/{id}", id)).content("{\"title\": \"x\", " + TIMED + ", \"recurrence\": " + thursdays + "}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("INVALID_RECURRENCE"));
        org.assertj.core.api.Assertions.assertThat(eventCount()).isEqualTo(1);
    }

    @Test
    void theStartDayOfARuleIsTheDayInTheZoneOfSino() throws Exception {
        // 07/01/2030 20:00 UTC is Tuesday 08/01 03:00 in Vietnam: a Tuesday rule fits, a Monday rule does not.
        String start = "\"startsAt\": \"2030-01-07T20:00:00Z\", \"endsAt\": \"2030-01-07T21:00:00Z\"";
        String tuesdays = "{\"freq\": \"WEEKLY\", \"interval\": 1, \"byWeekdays\": [\"TUESDAY\"]}";

        mvc.perform(asOwner(post("/api/events")).content("{\"title\": \"x\", " + start + ", \"recurrence\": " + tuesdays + "}"))
                .andExpect(status().isCreated());
        mvc.perform(asOwner(post("/api/events")).content("{\"title\": \"x\", " + start + ", \"recurrence\": " + WEEKLY_ON_MONDAY + "}"))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void theAppointmentOfAnotherUserIsNotFoundAndLeftAlone() throws Exception {
        CalendarEvent theirs = service.create(otherUser, new NewEvent("Của người khác", null, null,
                EventTime.timed(java.time.Instant.parse(STARTS), java.time.Instant.parse(ENDS)), null));
        String body = "{\"title\": \"Đổi\", " + TIMED + "}";

        mvc.perform(get("/api/events/{id}", theirs.id()).with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
        mvc.perform(asOwner(put("/api/events/{id}", theirs.id())).content(body)).andExpect(status().isNotFound());
        mvc.perform(asOwner(delete("/api/events/{id}", theirs.id()))).andExpect(status().isNotFound());

        org.assertj.core.api.Assertions.assertThat(service.get(otherUser, theirs.id()).title())
                .isEqualTo("Của người khác");
    }

    @Test
    void aMissingAppointmentIs404() throws Exception {
        mvc.perform(get("/api/events/{id}", UUID.randomUUID()).with(user("owner@sino.test")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
    }

    @Test
    void everyEndpointNeedsSignIn() throws Exception {
        UUID id = UUID.randomUUID();
        String body = "{\"title\": \"x\", " + TIMED + "}";

        mvc.perform(get("/api/events/{id}", id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/events").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/events/{id}", id).with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/events/{id}", id).with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void everyChangeNeedsACsrfToken() throws Exception {
        String id = create("{\"title\": \"x\", " + TIMED + "}");
        String body = "{\"title\": \"y\", " + TIMED + "}";

        mvc.perform(post("/api/events").with(user("owner@sino.test")).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mvc.perform(put("/api/events/{id}", id).with(user("owner@sino.test")).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/events/{id}", id).with(user("owner@sino.test"))).andExpect(status().isForbidden());
        org.assertj.core.api.Assertions.assertThat(eventCount()).isEqualTo(1);
    }

    @Test
    void aChangeThatLostTheRaceIs409() throws Exception {
        String id = create("{\"title\": \"x\", " + TIMED + "}");
        doThrow(new OptimisticLockingFailureException("changed meanwhile")).when(service).replace(any(), any(), any());

        mvc.perform(asOwner(put("/api/events/{id}", id)).content("{\"title\": \"y\", " + TIMED + "}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    }

    @Test
    void aResponseHasExactlyTheFieldsOfTheContract() throws Exception {
        String id = create("{\"title\": \"x\", " + TIMED + "}");

        mvc.perform(get("/api/events/{id}", id).with(user("owner@sino.test")))
                .andExpect(jsonPath("$.keys()", org.hamcrest.Matchers.containsInAnyOrder("id", "title", "startsAt",
                        "endsAt", "startDate", "endDate", "location", "notes", "reminder", "recurrence", "source",
                        "related", "createdAt", "updatedAt")));
    }

    private int eventCount() {
        return jdbc.queryForObject("select count(*) from calendar_event", Integer.class);
    }

}
