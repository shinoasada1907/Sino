package dev.sino.settings.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import dev.sino.TestcontainersConfiguration;

/**
 * The settings API through HTTP on the whole application and a real PostgreSQL: real security, real owner lookup, real
 * rows (spec {@code user-settings}, D-401, D-402).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class SettingsApiTests {

    private static final String DEFAULTS = """
            {"theme": "SYSTEM", "dateFormat": "DMY", "motion": "FULL",
             "notifications": {"newMessages": true, "importantOnly": false, "syncErrors": true,
                               "newRegistrations": true, "reminders": true, "scheduledFailed": true},
             "quietHours": {"start": "22:00", "end": "07:00"}, "timeZone": "Asia/Ho_Chi_Minh", "morningTime": "09:00",
             "defaultReminderMinutes": 15, "weekStart": "MONDAY"}
            """;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void startFromNoSettings() {
        jdbc.update("delete from user_settings");
    }

    private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
        return request.with(user("owner@sino.test")).with(csrf());
    }

    private static MockHttpServletRequestBuilder change(String json) {
        return asOwner(patch("/api/settings")).contentType(APPLICATION_JSON).content(json);
    }

    private int rows() {
        return JdbcTestUtils.countRowsInTable(jdbc, "user_settings");
    }

    // ----- read -----

    @Test
    void aUserWhoChangedNothingGetsTheDefaultsAndNothingIsWritten() throws Exception {
        mvc.perform(asOwner(get("/api/settings")))
                .andExpect(status().isOk())
                .andExpect(content().json(DEFAULTS, true));

        assertThat(rows()).isZero();
    }

    @Test
    void nobodySignedInGetsNoSettings() throws Exception {
        mvc.perform(get("/api/settings")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/settings").with(csrf()).contentType(APPLICATION_JSON).content("{\"theme\": \"DARK\"}"))
                .andExpect(status().isUnauthorized());

        assertThat(rows()).isZero();
    }

    @Test
    void aChangeNeedsTheCsrfToken() throws Exception {
        mvc.perform(patch("/api/settings").with(user("owner@sino.test")).contentType(APPLICATION_JSON)
                .content("{\"theme\": \"DARK\"}"))
                .andExpect(status().isForbidden());

        assertThat(rows()).isZero();
    }

    // ----- change -----

    @Test
    void aChangeAnswersWithTheWholeSettingsAndIsKept() throws Exception {
        mvc.perform(change("{\"theme\": \"DARK\", \"weekStart\": \"SUNDAY\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.theme").value("DARK"))
                .andExpect(jsonPath("$.weekStart").value("SUNDAY"))
                .andExpect(jsonPath("$.dateFormat").value("DMY"))
                .andExpect(jsonPath("$.morningTime").value("09:00"));

        mvc.perform(asOwner(get("/api/settings")))
                .andExpect(jsonPath("$.theme").value("DARK"))
                .andExpect(jsonPath("$.weekStart").value("SUNDAY"))
                .andExpect(jsonPath("$.quietHours.start").value("22:00"));
        assertThat(rows()).isOne();
    }

    @Test
    void everySettingCanBeChangedAtOnce() throws Exception {
        String everything = """
                {"theme": "LIGHT", "dateFormat": "LONG", "motion": "REDUCED",
                 "notifications": {"newMessages": false, "importantOnly": true, "syncErrors": false,
                                   "newRegistrations": false, "reminders": false, "scheduledFailed": false},
                 "quietHours": {"start": "23:30", "end": "06:15"}, "timeZone": "Europe/Paris", "morningTime": "05:00",
                 "defaultReminderMinutes": 1440, "weekStart": "SUNDAY"}
                """;

        mvc.perform(change(everything)).andExpect(status().isOk()).andExpect(content().json(everything, true));
        mvc.perform(asOwner(get("/api/settings"))).andExpect(content().json(everything, true));
    }

    @Test
    void oneSwitchChangesAndTheOtherFiveStay() throws Exception {
        mvc.perform(change("{\"notifications\": {\"importantOnly\": true}}")).andExpect(status().isOk());

        mvc.perform(change("{\"notifications\": {\"newRegistrations\": false}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notifications.newRegistrations").value(false))
                .andExpect(jsonPath("$.notifications.importantOnly").value(true))
                .andExpect(jsonPath("$.notifications.newMessages").value(true))
                .andExpect(jsonPath("$.notifications.syncErrors").value(true))
                .andExpect(jsonPath("$.notifications.reminders").value(true))
                .andExpect(jsonPath("$.notifications.scheduledFailed").value(true));
        mvc.perform(asOwner(get("/api/settings")))
                .andExpect(jsonPath("$.notifications.newRegistrations").value(false))
                .andExpect(jsonPath("$.notifications.importantOnly").value(true));
    }

    @Test
    void nullTurnsQuietHoursAndTheReminderOffAndTheyCanComeBack() throws Exception {
        mvc.perform(change("{\"quietHours\": null, \"defaultReminderMinutes\": null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quietHours").value(nullValue()))
                .andExpect(jsonPath("$.defaultReminderMinutes").value(nullValue()));
        mvc.perform(asOwner(get("/api/settings")))
                .andExpect(jsonPath("$.quietHours").value(nullValue()))
                .andExpect(jsonPath("$.defaultReminderMinutes").value(nullValue()));

        mvc.perform(change("{\"quietHours\": {\"start\": \"12:00\", \"end\": \"13:30\"}, \"defaultReminderMinutes\": 5}"))
                .andExpect(jsonPath("$.quietHours.start").value("12:00"))
                .andExpect(jsonPath("$.quietHours.end").value("13:30"))
                .andExpect(jsonPath("$.defaultReminderMinutes").value(5));
    }

    @Test
    void anEmptyChangeAnswersWithTheSettingsAndWritesNothing() throws Exception {
        mvc.perform(change("{}")).andExpect(status().isOk()).andExpect(content().json(DEFAULTS, true));
        mvc.perform(change("{\"notifications\": {}}")).andExpect(status().isOk());

        assertThat(rows()).isZero();
    }

    @Test
    void aJsonMergePatchIsTakenToo() throws Exception {
        mvc.perform(asOwner(patch("/api/settings")).contentType(MediaType.valueOf("application/merge-patch+json"))
                .content("{\"motion\": \"OFF\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.motion").value("OFF"));
    }

    // ----- refused -----

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', textBlock = """
            {"theme": "PURPLE"}                                        | theme
            {"theme": "dark"}                                          | theme
            {"theme": 1}                                               | theme
            {"theme": null}                                            | theme
            {"dateFormat": "YMD"}                                      | dateFormat
            {"motion": false}                                          | motion
            {"weekStart": "TUESDAY"}                                   | weekStart
            {"timeZone": "Asia/Hanoi_Not_A_Zone"}                      | timeZone
            {"timeZone": "+07:00"}                                     | timeZone
            {"timeZone": null}                                         | timeZone
            {"morningTime": "04:59"}                                   | morningTime
            {"morningTime": "12:01"}                                   | morningTime
            {"morningTime": "9:00"}                                    | morningTime
            {"morningTime": "09:00:00"}                                | morningTime
            {"morningTime": "24:00"}                                   | morningTime
            {"morningTime": null}                                      | morningTime
            {"defaultReminderMinutes": 7}                              | defaultReminderMinutes
            {"defaultReminderMinutes": "15"}                           | defaultReminderMinutes
            {"defaultReminderMinutes": 15.5}                           | defaultReminderMinutes
            {"defaultReminderMinutes": 0}                              | defaultReminderMinutes
            {"quietHours": "22:00-07:00"}                              | quietHours
            {"quietHours": {"start": "22:00", "end": "22:00"}}         | quietHours
            {"quietHours": {"start": "22:00"}}                         | quietHours.end
            {"quietHours": {"start": "25:00", "end": "07:00"}}         | quietHours.start
            {"quietHours": {"start": "22:00", "end": "07:00", "x": 1}} | quietHours.x
            {"notifications": null}                                    | notifications
            {"notifications": true}                                    | notifications
            {"notifications": {"newMessages": "yes"}}                  | notifications.newMessages
            {"notifications": {"newMessages": null}}                   | notifications.newMessages
            {"notifications": {"sound": true}}                         | notifications.sound
            {"colour": "red"}                                          | colour
            {"language": "vi", "theme": "DARK"}                        | language
            """)
    void aWrongValueOrAnUnknownNameIsAFieldErrorAndNothingIsWritten(String json, String field) throws Exception {
        mvc.perform(change(json))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors", hasSize(1)))
                .andExpect(jsonPath("$.errors[0].field").value(field));

        assertThat(rows()).isZero();
    }

    @Test
    void everyBrokenRuleIsListedAndTheGoodPartsAreNotKept() throws Exception {
        mvc.perform(change("""
                {"theme": "DARK", "timeZone": "Mars/Olympus", "notifications": {"reminders": 1, "beep": true},
                 "defaultReminderMinutes": 45}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[*].field").value(containsInAnyOrder("timeZone",
                        "notifications.reminders", "notifications.beep", "defaultReminderMinutes")));

        mvc.perform(asOwner(get("/api/settings"))).andExpect(jsonPath("$.theme").value("SYSTEM"));
        assertThat(rows()).isZero();
    }

    @Test
    void aMessageDoesNotRepeatWhatWasSent() throws Exception {
        mvc.perform(change("{\"${1+1}\": 1, \"{jakarta.validation.constraints.NotNull.message}\": 2}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[*].message").value(containsInAnyOrder("is not a setting",
                        "is not a setting")));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            not json
            []
            "DARK"
            {"theme": "DARK"
            """)
    void aBodyThatIsNotAJsonObjectCannotBeRead(String body) throws Exception {
        mvc.perform(asOwner(patch("/api/settings")).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        assertThat(rows()).isZero();
    }

    @Test
    void anEmptyBodyCannotBeRead() throws Exception {
        mvc.perform(asOwner(patch("/api/settings")).contentType(APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    // ----- at the same time -----

    private static final List<String> ELEVEN_CHANGES = List.of(
            "{\"theme\": \"DARK\"}",
            "{\"dateFormat\": \"ISO\"}",
            "{\"motion\": \"REDUCED\"}",
            "{\"notifications\": {\"newMessages\": false}}",
            "{\"notifications\": {\"importantOnly\": true}}",
            "{\"notifications\": {\"reminders\": false}}",
            "{\"quietHours\": null}",
            "{\"timeZone\": \"Asia/Tokyo\"}",
            "{\"morningTime\": \"07:30\"}",
            "{\"defaultReminderMinutes\": 60}",
            "{\"weekStart\": \"SUNDAY\"}");

    private static final String ALL_ELEVEN = """
            {"theme": "DARK", "dateFormat": "ISO", "motion": "REDUCED",
             "notifications": {"newMessages": false, "importantOnly": true, "syncErrors": true,
                               "newRegistrations": true, "reminders": false, "scheduledFailed": true},
             "quietHours": null, "timeZone": "Asia/Tokyo", "morningTime": "07:30",
             "defaultReminderMinutes": 60, "weekStart": "SUNDAY"}
            """;

    @Test
    void firstChangesMadeAtTheSameMomentAreAllKept() throws Exception {
        sendAtOnce(ELEVEN_CHANGES);

        mvc.perform(asOwner(get("/api/settings"))).andExpect(content().json(ALL_ELEVEN, true));
        assertThat(rows()).isOne();
    }

    @Test
    void changesOfStoredSettingsMadeAtTheSameMomentAreAllKept() throws Exception {
        mvc.perform(change("{\"theme\": \"LIGHT\"}")).andExpect(status().isOk());

        sendAtOnce(ELEVEN_CHANGES);

        mvc.perform(asOwner(get("/api/settings"))).andExpect(content().json(ALL_ELEVEN, true));
        assertThat(rows()).isOne();
    }

    /** Sends every change from a thread of its own, all let go at the same moment, and expects each to be taken. */
    private void sendAtOnce(List<String> changes) throws Exception {
        CyclicBarrier together = new CyclicBarrier(changes.size());
        ExecutorService pool = Executors.newFixedThreadPool(changes.size());
        try {
            List<Future<Integer>> statuses = new ArrayList<>();
            for (String json : changes) {
                Callable<Integer> send = () -> {
                    together.await(10, TimeUnit.SECONDS);
                    return mvc.perform(change(json)).andReturn().getResponse().getStatus();
                };
                statuses.add(pool.submit(send));
            }
            for (Future<Integer> sent : statuses) {
                assertThat(sent.get(30, TimeUnit.SECONDS)).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }
    }

}
