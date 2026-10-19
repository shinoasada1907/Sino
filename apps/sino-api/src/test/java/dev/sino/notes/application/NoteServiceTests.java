package dev.sino.notes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.ApplicationModuleTest.BootstrapMode;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.jdbc.JdbcTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.SinoException;
import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NotesErrorCode;
import dev.sino.notes.infrastructure.NoteRepository;

/**
 * Module test of the notes on a real PostgreSQL. The test methods are not transactional, so every call commits or
 * rolls back as it would in the application. The clock is moved by hand.
 */
@ApplicationModuleTest(mode = BootstrapMode.DIRECT_DEPENDENCIES)
@Import({ TestcontainersConfiguration.class, NoteServiceTests.Clocks.class })
@ActiveProfiles("test")
class NoteServiceTests {

    // Friday 02/10/2026 14:05 in Vietnam, the time of the canvas.
    private static final Instant FRIDAY = Instant.parse("2026-10-02T07:05:00Z");
    private static final Instant LATER = FRIDAY.plusSeconds(3600);

    @Autowired
    private NoteService service;

    @Autowired
    private NoteRepository notes;

    @Autowired
    private MovableClock clock;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TransactionTemplate transactions;

    private UUID owner;

    @BeforeEach
    void createOwner() {
        JdbcTestUtils.deleteFromTables(jdbc, "note", "app_user");
        owner = insertUser("owner@sino.test");
        clock.set(FRIDAY);
    }

    private UUID insertUser(String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, status, created_at, updated_at) "
                + "values (?, ?, 'Owner', 'ACTIVE', now(), now())", id, email);
        return id;
    }

    private Note create(String title, String body) {
        return service.create(owner, new NewNote(title, body));
    }

    private Note stored(Note note) {
        return notes.findById(note.id()).orElseThrow();
    }

    @Test
    void createsANoteThatIsNotPinned() {
        Note note = create("  Phòng khám ", "Gọi lại\n  cho phòng khám ");

        assertThat(note.version()).isZero();
        Note stored = stored(note);
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.title()).isEqualTo("Phòng khám");
        assertThat(stored.body()).isEqualTo("Gọi lại\n  cho phòng khám ");
        assertThat(stored.pinned()).isFalse();
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY);
        assertThat(stored.version()).isZero();
    }

    @Test
    void aNoteWithoutATitleIsStoredWithoutOne() {
        assertThat(stored(create("   ", "Mang theo CCCD")).title()).isNull();
        assertThat(stored(create(null, "Mang theo CCCD")).title()).isNull();
    }

    @Test
    void listsOnlyTheNotesOfTheOwnerAndTheLastEditedFirst() {
        Note oldest = create("A", "một");
        clock.set(FRIDAY.plusSeconds(60));
        Note middle = create("B", "hai");
        clock.set(FRIDAY.plusSeconds(120));
        Note newest = create("C", "ba");
        UUID other = insertUser("other@sino.test");
        service.create(other, new NewNote("Của người khác", "x"));

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(newest.id(), middle.id(), oldest.id());

        clock.set(FRIDAY.plusSeconds(180));
        service.update(owner, oldest.id(), 0, new NoteChange(null, "một, sửa", null));

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(oldest.id(), newest.id(), middle.id());
    }

    @Test
    void notesEditedAtTheSameTimeComeLargestIdFirst() {
        UUID first = UUID.fromString("00000000-0000-7000-8000-000000000001");
        UUID second = UUID.fromString("00000000-0000-7000-8000-000000000002");
        UUID third = UUID.fromString("00000000-0000-7000-8000-000000000003");
        insertRow(Map.of("id", second));
        insertRow(Map.of("id", third));
        insertRow(Map.of("id", first));

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(third, second, first);
    }

    @Test
    void savesANewBodyAndRaisesTheVersion() {
        Note note = create("Phòng khám", "Gọi lại");
        clock.set(LATER);

        Note updated = service.update(owner, note.id(), 0, new NoteChange(null, "Gọi lại sau 5 giờ", null));

        assertThat(updated.body()).isEqualTo("Gọi lại sau 5 giờ");
        assertThat(updated.title()).isEqualTo("Phòng khám");
        assertThat(updated.updatedAt()).isEqualTo(LATER);
        assertThat(updated.version()).isEqualTo(1);
        Note stored = stored(note);
        assertThat(stored.body()).isEqualTo("Gọi lại sau 5 giờ");
        assertThat(stored.updatedAt()).isEqualTo(LATER);
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(stored.version()).isEqualTo(1);
    }

    @Test
    void aTitleOfEmptyTextTakesTheTitleAwayAndAMissingFieldStaysAsItIs() {
        Note note = create("Phòng khám", "Gọi lại");
        clock.set(LATER);

        Note updated = service.update(owner, note.id(), 0, new NoteChange("", null, null));

        assertThat(updated.title()).isNull();
        assertThat(updated.body()).isEqualTo("Gọi lại");
        assertThat(stored(note).title()).isNull();
        assertThat(stored(note).updatedAt()).isEqualTo(LATER);
    }

    @Test
    void pinningIsNotAnEditButRaisesTheVersion() {
        Note note = create("Phòng khám", "Gọi lại");
        clock.set(LATER);

        Note pinned = service.update(owner, note.id(), 0, new NoteChange(null, null, true));

        assertThat(pinned.pinned()).isTrue();
        assertThat(pinned.updatedAt()).isEqualTo(FRIDAY);
        assertThat(pinned.version()).isEqualTo(1);
        assertThat(stored(note).updatedAt()).isEqualTo(FRIDAY);
        assertThat(stored(note).version()).isEqualTo(1);

        Note unpinned = service.update(owner, note.id(), 1, new NoteChange(null, null, false));

        assertThat(unpinned.pinned()).isFalse();
        assertThat(unpinned.version()).isEqualTo(2);
        assertThat(stored(note).updatedAt()).isEqualTo(FRIDAY);
    }

    @Test
    void aChangeToTheSameValuesKeepsTheVersionAndTheTimeOfTheEdit() {
        Note note = create("Phòng khám", "Gọi lại");
        clock.set(LATER);

        Note same = service.update(owner, note.id(), 0, new NoteChange("Phòng khám", "Gọi lại", false));

        assertThat(same.version()).isZero();
        assertThat(same.updatedAt()).isEqualTo(FRIDAY);
        assertThat(stored(note).version()).isZero();
        assertThat(stored(note).updatedAt()).isEqualTo(FRIDAY);
    }

    @Test
    void anOlderOrNewerVersionIsRefusedAndNothingIsWritten() {
        Note note = create("Phòng khám", "Gọi lại");
        service.update(owner, note.id(), 0, new NoteChange(null, "Gọi lại sau 5 giờ", null));
        clock.set(LATER);

        assertThatThrownBy(() -> service.update(owner, note.id(), 0, new NoteChange("Khác", "Của tab cũ", true)))
                .isInstanceOf(OptimisticLockingFailureException.class);
        assertThatThrownBy(() -> service.update(owner, note.id(), 5, new NoteChange("Khác", "Của tab lạ", true)))
                .isInstanceOf(OptimisticLockingFailureException.class);

        Note stored = stored(note);
        assertThat(stored.title()).isEqualTo("Phòng khám");
        assertThat(stored.body()).isEqualTo("Gọi lại sau 5 giờ");
        assertThat(stored.pinned()).isFalse();
        assertThat(stored.version()).isEqualTo(1);
    }

    @Test
    void aStaleVersionIsRefusedEvenWhenTheChangeChangesNothing() {
        Note note = create("Phòng khám", "Gọi lại");
        service.update(owner, note.id(), 0, new NoteChange(null, "Gọi lại sau 5 giờ", null));

        assertThatThrownBy(() -> service.update(owner, note.id(), 0, new NoteChange(null, null, null)))
                .isInstanceOf(OptimisticLockingFailureException.class);
    }

    @Test
    void aSaveOverAnOlderReadIsRefusedByTheDatabaseToo() {
        Note note = create("Hợp đồng", "Bản đầu");

        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            Note stale = notes.findById(note.id()).orElseThrow();
            // Another request changes the note in its own transaction while this one still holds the old read.
            CompletableFuture.runAsync(() -> service.update(owner, note.id(), 0, new NoteChange(null, "Ở nơi khác", null)))
                    .join();
            stale.edit(stale.title(), "Ở đây", FRIDAY);
            notes.flush();
        })).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(stored(note).body()).isEqualTo("Ở nơi khác");
    }

    @Test
    void twoSavesFromTheSameVersionAtOnceLeaveOneConflict() throws Exception {
        Note note = create("Hợp đồng", "Bản đầu");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Note>> saves = Stream.of("Của tab một", "Của tab hai")
                    .map(body -> pool.submit(() -> {
                        start.await();
                        return service.update(owner, note.id(), 0, new NoteChange(null, body, null));
                    }))
                    .toList();
            start.countDown();

            int saved = 0;
            int refused = 0;
            for (Future<Note> save : saves) {
                try {
                    save.get();
                    saved++;
                } catch (ExecutionException e) {
                    assertThat(e.getCause()).isInstanceOf(OptimisticLockingFailureException.class);
                    refused++;
                }
            }
            assertThat(saved).isEqualTo(1);
            assertThat(refused).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(stored(note).version()).isEqualTo(1);
    }

    @Test
    void aNoteOfAnotherUserIsNotFoundInEveryCommand() {
        UUID other = insertUser("other@sino.test");
        Note theirs = service.create(other, new NewNote("Của người khác", "Riêng tư"));
        UUID id = theirs.id();

        List<Runnable> calls = List.of(() -> service.get(owner, id),
                () -> service.update(owner, id, 0, new NoteChange("Của tôi", "Chiếm", true)),
                () -> service.delete(owner, id));
        for (Runnable call : calls) {
            assertThatThrownBy(call::run).isInstanceOfSatisfying(SinoException.class,
                    e -> assertThat(e.errorCode()).isEqualTo(NotesErrorCode.NOTE_NOT_FOUND));
        }
        Note stored = stored(theirs);
        assertThat(stored.title()).isEqualTo("Của người khác");
        assertThat(stored.body()).isEqualTo("Riêng tư");
        assertThat(stored.pinned()).isFalse();
        assertThat(stored.version()).isZero();
    }

    @Test
    void aMissingNoteIsNotFound() {
        assertThatThrownBy(() -> service.get(owner, UUID.randomUUID())).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(NotesErrorCode.NOTE_NOT_FOUND));
    }

    @Test
    void deletingRemovesTheNoteForGood() {
        Note note = create("Phòng khám", "Gọi lại");
        Note kept = create("Giữ lại", "x");

        service.delete(owner, note.id());

        assertThat(notes.findById(note.id())).isEmpty();
        assertThatThrownBy(() -> service.get(owner, note.id())).isInstanceOfSatisfying(SinoException.class,
                e -> assertThat(e.errorCode()).isEqualTo(NotesErrorCode.NOTE_NOT_FOUND));
        assertThat(service.list(owner)).extracting(Note::id).containsExactly(kept.id());
    }

    static Stream<Arguments> brokenRows() {
        return Stream.of(
                Arguments.of("a body of spaces", Map.of("body", "   "), "note_body_not_blank_ck"),
                Arguments.of("an empty body", Map.of("body", ""), "note_body_not_blank_ck"),
                Arguments.of("a body over 20000 characters", Map.of("body", "x".repeat(20_001)),
                        "note_body_length_ck"),
                Arguments.of("a title of spaces", Map.of("title", "  "), "note_title_not_blank_ck"),
                Arguments.of("an empty title", Map.of("title", ""), "note_title_not_blank_ck"),
                Arguments.of("a title over 200 characters", Map.of("title", "x".repeat(201)),
                        "character varying(200)"),
                Arguments.of("a user that does not exist", Map.of("user_id", UUID.randomUUID()), "note_user_fk"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("brokenRows")
    void theDatabaseRefusesANoteThatBreaksItsRules(String name, Map<String, Object> changes, String refusedBy) {
        assertThatThrownBy(() -> insertRow(changes)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(refusedBy);
        assertThat(notes.count()).isZero();
    }

    @Test
    void theDatabaseTakesTheLimits() {
        insertRow(Map.of("body", "x".repeat(20_000), "title", "y".repeat(200)));
        insertRow(Map.of("pinned", true));

        assertThat(notes.count()).isEqualTo(2);
    }

    private void insertRow(Map<String, Object> changes) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("user_id", owner);
        row.put("body", "x");
        row.put("pinned", false);
        row.put("created_at", Timestamp.from(FRIDAY));
        row.put("updated_at", Timestamp.from(FRIDAY));
        row.put("version", 0);
        row.putAll(changes);
        String sql = "insert into note (" + String.join(", ", row.keySet()) + ") values ("
                + "?, ".repeat(row.size() - 1) + "?)";
        jdbc.update(sql, row.values().toArray());
    }

    /** The clock of these tests, moved by hand. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Clocks {

        @Bean
        @Primary
        MovableClock movableClock() {
            return new MovableClock(FRIDAY);
        }

    }

    static final class MovableClock extends Clock {

        private volatile Instant now;

        MovableClock(Instant start) {
            this.now = start;
        }

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

    }

}
