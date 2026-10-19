package dev.sino.notes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.stream.Collectors;
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

import dev.sino.TestcontainersConfiguration;
import dev.sino.common.error.SinoException;
import dev.sino.notes.domain.BlockColor;
import dev.sino.notes.domain.Diagram;
import dev.sino.notes.domain.DiagramBlock;
import dev.sino.notes.domain.DiagramLink;
import dev.sino.notes.domain.Note;
import dev.sino.notes.domain.NoteKind;
import dev.sino.notes.domain.NotesErrorCode;
import dev.sino.notes.domain.Side;
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

    @Autowired
    private NoteService service;

    @Autowired
    private NoteRepository notes;

    @Autowired
    private MovableClock clock;

    @Autowired
    private JdbcTemplate jdbc;

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

    private Note create(String body) {
        return service.create(owner, NewNote.text(null, body));
    }

    private Note stored(UUID id) {
        return notes.findById(id).orElseThrow();
    }

    private long version(UUID id) {
        return jdbc.queryForObject("select version from note where id = ?", Long.class, id);
    }

    private void later(Duration duration) {
        clock.set(clock.instant().plus(duration));
    }

    private static Consumer<Throwable> notFound() {
        return e -> assertThat(e).isInstanceOfSatisfying(SinoException.class,
                sino -> assertThat(sino.errorCode()).isEqualTo(NotesErrorCode.NOTE_NOT_FOUND));
    }

    @Test
    void createsAStandaloneNoteOfTheOwner() {
        Note note = service.create(owner, NewNote.text("  ", "Gọi lại cho phòng khám"));

        Note stored = stored(note.id());
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.title()).isNull();
        assertThat(stored.body()).isEqualTo("Gọi lại cho phòng khám");
        assertThat(stored.pinned()).isFalse();
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY);
        assertThat(version(note.id())).isZero();
        assertThat(note.version()).isZero();
    }

    @Test
    void listsTheNotesOfTheOwnerNewestEditFirst() {
        Note clause = create("Điều khoản 4");
        later(Duration.ofMinutes(1));
        Note trip = create("Chuyến đi Đà Lạt");
        later(Duration.ofMinutes(1));
        Note insurance = create("Số hợp đồng bảo hiểm");
        UUID stranger = insertUser("stranger@sino.test");
        service.create(stranger, NewNote.text(null, "Của người khác"));
        later(Duration.ofMinutes(1));
        service.update(owner, clause.id(), new NoteChange(0, null, "Điều khoản 4: 10 ngày", null));

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(clause.id(), insurance.id(), trip.id());
    }

    @Test
    void notesEditedAtTheSameMomentListTheNewestFirst() {
        Note first = create("Một");
        Note second = create("Hai");

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(second.id(), first.id());
    }

    @Test
    void anEditWithTheVersionReadIsSavedAndRaisesTheVersion() {
        Note note = create("Thời hạn 15 ngày");
        later(Duration.ofHours(1));

        Note saved = service.update(owner, note.id(), new NoteChange(0, "Điều khoản 4", "Thời hạn 10 ngày", null));

        assertThat(saved.version()).isEqualTo(1);
        Note stored = stored(note.id());
        assertThat(stored.title()).isEqualTo("Điều khoản 4");
        assertThat(stored.body()).isEqualTo("Thời hạn 10 ngày");
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY.plus(Duration.ofHours(1)));
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void anEditOverAnOlderVersionIsRefusedAndWritesNothing() {
        Note note = create("Thời hạn 15 ngày");
        service.update(owner, note.id(), new NoteChange(0, null, "Sửa ở điện thoại", null));

        assertThatThrownBy(() -> service.update(owner, note.id(), new NoteChange(0, null, "Sửa ở tab cũ", null)))
                .isInstanceOf(OptimisticLockingFailureException.class);

        assertThat(stored(note.id()).body()).isEqualTo("Sửa ở điện thoại");
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void aPinOverAnOlderVersionIsRefusedToo() {
        Note note = create("Danh sách mua cho bà");
        service.update(owner, note.id(), new NoteChange(0, null, "Thêm trà sen", null));

        assertThatThrownBy(() -> service.update(owner, note.id(), new NoteChange(0, null, null, true)))
                .isInstanceOf(OptimisticLockingFailureException.class);

        assertThat(stored(note.id()).pinned()).isFalse();
    }

    @Test
    void aPinKeepsTheTimeOfTheEditAndRaisesTheVersion() {
        Note note = create("Danh sách mua cho bà");
        later(Duration.ofDays(1));

        Note pinned = service.update(owner, note.id(), new NoteChange(0, null, null, true));

        assertThat(pinned.pinned()).isTrue();
        assertThat(pinned.version()).isEqualTo(1);
        assertThat(stored(note.id()).updatedAt()).isEqualTo(FRIDAY);
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void aChangeThatChangesNothingKeepsTheVersionAndTheTimeOfTheEdit() {
        Note note = service.create(owner, NewNote.text("Điều khoản 4", "Thời hạn 15 ngày"));
        later(Duration.ofHours(1));

        Note same = service.update(owner, note.id(), new NoteChange(0, "Điều khoản 4", "Thời hạn 15 ngày", false));

        assertThat(same.version()).isZero();
        assertThat(version(note.id())).isZero();
        assertThat(stored(note.id()).updatedAt()).isEqualTo(FRIDAY);
    }

    @Test
    void twoSavesOfTheSameVersionAtTheSameTimeEndInOneRefusal() throws InterruptedException {
        Note note = create("Thời hạn 15 ngày");
        CountDownLatch checked = new CountDownLatch(1);
        CountDownLatch goOn = new CountDownLatch(1);
        // The save of tab A passes the version check, then waits on its reading of the clock while the save of tab B,
        // made over the same version, commits. Tab A only fails when it writes.
        clock.pauseNextReading(checked, goOn);
        CompletableFuture<Note> tabA = CompletableFuture.supplyAsync(() -> service.update(owner, note.id(),
                new NoteChange(0, null, "Sửa ở tab A", null)));
        assertThat(checked.await(10, TimeUnit.SECONDS)).isTrue();

        service.update(owner, note.id(), new NoteChange(0, null, "Sửa ở tab B", null));
        goOn.countDown();

        assertThatThrownBy(tabA::join).hasCauseInstanceOf(OptimisticLockingFailureException.class);
        assertThat(stored(note.id()).body()).isEqualTo("Sửa ở tab B");
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void anEditAndAPinInOneChangeRaiseTheVersionOnce() {
        Note note = create("Danh sách mua cho bà");
        later(Duration.ofHours(1));

        Note saved = service.update(owner, note.id(), new NoteChange(0, null, "Thêm trà sen", true));

        assertThat(saved.version()).isEqualTo(1);
        assertThat(version(note.id())).isEqualTo(1);
        Note stored = stored(note.id());
        assertThat(stored.pinned()).isTrue();
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY.plus(Duration.ofHours(1)));
    }

    @Test
    void anEmptyTitleIsStoredAsNoTitle() {
        Note note = service.create(owner, NewNote.text("Điều khoản 4", "Thời hạn 15 ngày"));

        service.update(owner, note.id(), new NoteChange(0, "", null, null));

        assertThat(jdbc.queryForObject("select title from note where id = ?", String.class, note.id())).isNull();
        assertThat(version(note.id())).isEqualTo(1);
    }

    // PostgreSQL keeps microseconds; what a save answers must be what a later read gives (review BE-90).
    @Test
    void theTimesOfANoteAreTheOnesTheDatabaseKeeps() {
        clock.set(FRIDAY.plusNanos(123_456_789));
        Note created = create("Thời hạn 15 ngày");
        assertThat(created.createdAt()).isEqualTo(FRIDAY.plusNanos(123_456_000)).isEqualTo(stored(created.id()).createdAt());

        clock.set(FRIDAY.plusSeconds(60).plusNanos(987_654_321));
        Note saved = service.update(owner, created.id(), new NoteChange(0, null, "Thời hạn 10 ngày", null));
        assertThat(saved.updatedAt()).isEqualTo(FRIDAY.plusSeconds(60).plusNanos(987_654_000))
                .isEqualTo(stored(created.id()).updatedAt());
    }

    @Test
    void deletesANote() {
        Note note = create("Ý tưởng chuyến đi Đà Lạt");

        service.delete(owner, note.id());

        assertThat(notes.count()).isZero();
        assertThatThrownBy(() -> service.get(owner, note.id())).satisfies(notFound());
    }

    @Test
    void aNoteOfAnotherUserIsNotFound() {
        UUID stranger = insertUser("stranger@sino.test");
        Note theirs = service.create(stranger, NewNote.text("Của người khác", "Không được đọc"));
        UUID id = theirs.id();

        assertThatThrownBy(() -> service.get(owner, id)).satisfies(notFound());
        // A wrong version says nothing either: the note is not found before its version is looked at.
        assertThatThrownBy(() -> service.update(owner, id, new NoteChange(7, null, "Đổi", null))).satisfies(notFound());
        assertThatThrownBy(() -> service.delete(owner, id)).satisfies(notFound());
        assertThat(service.list(owner)).isEmpty();
        assertThat(stored(id).body()).isEqualTo("Không được đọc");
    }

    @Test
    void aMissingNoteIsNotFound() {
        UUID missing = UUID.randomUUID();

        assertThatThrownBy(() -> service.get(owner, missing)).satisfies(notFound());
        // A save of a note deleted elsewhere: the web offers to keep the text as a new note (D-178).
        assertThatThrownBy(() -> service.update(owner, missing, new NoteChange(0, null, "Đổi", null)))
                .satisfies(notFound());
        assertThatThrownBy(() -> service.delete(owner, missing)).satisfies(notFound());
    }

    // ----- diagram notes (D-179) -----

    private static final UUID BLOCK_1 = UUID.fromString("00000000-0000-7000-8000-000000000001");
    private static final UUID BLOCK_2 = UUID.fromString("00000000-0000-7000-8000-000000000002");
    private static final UUID BLOCK_3 = UUID.fromString("00000000-0000-7000-8000-000000000003");
    private static final UUID LINK_1 = UUID.fromString("00000000-0000-7000-8000-0000000000a1");

    /** Two blocks and an arrow, with the values that are hardest to keep through JSON: unicode, a quote, a decimal. */
    private static Diagram trip() {
        DiagramBlock main = new DiagramBlock(BLOCK_1, 120.5, -33.25, "Chuyến đi Đà Lạt 🌸\n\"tháng 12\"",
                BlockColor.YELLOW, true);
        DiagramBlock stay = new DiagramBlock(BLOCK_2, 1234.5678901234, 400, "Thuê homestay", BlockColor.DEFAULT, false);
        DiagramLink arrow = new DiagramLink(LINK_1, BLOCK_1, Side.BOTTOM, BLOCK_2, Side.TOP, "ở đâu");
        return new Diagram(List.of(main, stay), List.of(arrow));
    }

    private Note createDiagram(Diagram diagram) {
        return service.create(owner, NewNote.diagram("Kế hoạch chuyến đi", diagram));
    }

    @Test
    void aDiagramNoteIsStoredWholeAndReadBackEqual() {
        Note note = createDiagram(trip());

        Note stored = stored(note.id());
        assertThat(stored.kind()).isEqualTo(NoteKind.DIAGRAM);
        assertThat(stored.title()).isEqualTo("Kế hoạch chuyến đi");
        assertThat(stored.body()).isEmpty();
        assertThat(stored.diagram()).isEqualTo(trip());
        assertThat(stored.ownerId()).isEqualTo(owner);
        assertThat(stored.createdAt()).isEqualTo(FRIDAY);
        assertThat(version(note.id())).isZero();
    }

    @Test
    void theDiagramIsAJsonbDocumentOfTheContractOfD211() {
        Note note = createDiagram(trip());

        assertThat(jdbc.queryForObject("select kind from note where id = ?", String.class, note.id()))
                .isEqualTo("DIAGRAM");
        assertThat(jdbc.queryForObject("select jsonb_array_length(diagram -> 'blocks') from note where id = ?",
                Integer.class, note.id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select diagram -> 'links' -> 0 ->> 'fromSide' from note where id = ?",
                String.class, note.id())).isEqualTo("BOTTOM");
        assertThat(jdbc.queryForObject("select diagram -> 'blocks' -> 0 ->> 'color' from note where id = ?",
                String.class, note.id())).isEqualTo("YELLOW");
        assertThat(jdbc.queryForObject("select diagram -> 'links' -> 0 ->> 'label' from note where id = ?",
                String.class, note.id())).isEqualTo("ở đâu");
    }

    @Test
    void theListHoldsTextAndDiagramNotesWithTheirContent() {
        Note text = create("Gọi lại cho phòng khám");
        later(Duration.ofMinutes(1));
        Note diagram = createDiagram(trip());

        assertThat(service.list(owner)).extracting(Note::id).containsExactly(diagram.id(), text.id());
        assertThat(service.list(owner).get(0).diagram()).isEqualTo(trip());
        assertThat(service.list(owner).get(1).diagram()).isNull();
    }

    @Test
    void anEditOfTheDiagramReplacesItWholeAndRaisesTheVersion() {
        Note note = createDiagram(trip());
        later(Duration.ofHours(1));
        Diagram other = new Diagram(List.of(new DiagramBlock(BLOCK_3, 0, 0, "Chỉ còn một khối", BlockColor.RED, true)),
                List.of());

        Note saved = service.update(owner, note.id(),
                new NoteChange(0, null, null, null, other));

        assertThat(saved.version()).isEqualTo(1);
        Note stored = stored(note.id());
        assertThat(stored.diagram()).isEqualTo(other);
        assertThat(stored.title()).isEqualTo("Kế hoạch chuyến đi");
        assertThat(stored.updatedAt()).isEqualTo(FRIDAY.plus(Duration.ofHours(1)));
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void theSameDiagramSentAgainChangesNothing() {
        Note note = createDiagram(trip());
        later(Duration.ofHours(1));

        // The web sends the whole diagram at every autosave; an equal copy is not an edit.
        Note same = service.update(owner, note.id(), new NoteChange(0, null, null, null, trip()));

        assertThat(same.version()).isZero();
        assertThat(version(note.id())).isZero();
        assertThat(stored(note.id()).updatedAt()).isEqualTo(FRIDAY);
    }

    @Test
    void aDiagramOverAnOlderVersionIsRefusedAndTheStoredDiagramStays() {
        Note note = createDiagram(trip());
        service.update(owner, note.id(), new NoteChange(0, "Sửa ở điện thoại", null, null));
        Diagram stale = new Diagram(List.of(new DiagramBlock(BLOCK_3, 0, 0, "Từ tab cũ", BlockColor.RED, false)),
                List.of());

        assertThatThrownBy(() -> service.update(owner, note.id(), new NoteChange(0, null, null, null, stale)))
                .isInstanceOf(OptimisticLockingFailureException.class);

        assertThat(stored(note.id()).diagram()).isEqualTo(trip());
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void theTitleOfADiagramNoteIsEditedAndPinnedWithoutTouchingTheDiagram() {
        Note note = createDiagram(trip());
        later(Duration.ofHours(1));

        Note saved = service.update(owner, note.id(), new NoteChange(0, "Đà Lạt", null, true));

        assertThat(saved.version()).isEqualTo(1);
        Note stored = stored(note.id());
        assertThat(stored.title()).isEqualTo("Đà Lạt");
        assertThat(stored.pinned()).isTrue();
        assertThat(stored.diagram()).isEqualTo(trip());
    }

    @Test
    void aPinOfADiagramNoteKeepsTheTimeOfTheEdit() {
        Note note = createDiagram(trip());
        later(Duration.ofDays(1));

        service.update(owner, note.id(), new NoteChange(0, null, null, true));

        assertThat(stored(note.id()).updatedAt()).isEqualTo(FRIDAY);
        assertThat(version(note.id())).isEqualTo(1);
    }

    @Test
    void aDiagramForATextNoteIsRefusedAndNothingIsWritten() {
        Note note = create("Gọi lại cho phòng khám");

        assertThatThrownBy(() -> service.update(owner, note.id(), new NoteChange(0, null, null, null, trip())))
                .satisfies(kindMismatch());

        assertThat(stored(note.id()).diagram()).isNull();
        assertThat(version(note.id())).isZero();
    }

    @Test
    void aBodyForADiagramNoteIsRefusedAndNothingIsWritten() {
        Note note = createDiagram(trip());

        assertThatThrownBy(() -> service.update(owner, note.id(), new NoteChange(0, null, "Chữ", null)))
                .satisfies(kindMismatch());

        assertThat(stored(note.id()).body()).isEmpty();
        assertThat(stored(note.id()).diagram()).isEqualTo(trip());
        assertThat(version(note.id())).isZero();
    }

    @Test
    void aNoteOfAnotherUserIsNotFoundBeforeItsKindIsLookedAt() {
        UUID stranger = insertUser("stranger@sino.test");
        Note theirs = service.create(stranger, NewNote.diagram("Của người khác", trip()));
        UUID id = theirs.id();

        assertThatThrownBy(() -> service.update(owner, id, new NoteChange(0, null, "Chữ", null)))
                .satisfies(notFound());
        assertThatThrownBy(() -> service.get(owner, id)).satisfies(notFound());
        assertThat(service.list(owner)).isEmpty();
    }

    private static Consumer<Throwable> kindMismatch() {
        return e -> assertThat(e).isInstanceOfSatisfying(SinoException.class,
                sino -> assertThat(sino.errorCode()).isEqualTo(NotesErrorCode.NOTE_KIND_MISMATCH));
    }

    static Stream<Arguments> brokenRows() {
        return Stream.of(
                Arguments.of("an empty body", Map.of("body", ""), "note_text_ck"),
                Arguments.of("a body of spaces", Map.of("body", "   "), "note_text_ck"),
                Arguments.of("a body over 20 000 characters", Map.of("body", "x".repeat(20_001)),
                        "note_body_length_ck"),
                Arguments.of("an empty title", Map.of("title", ""), "note_title_blank_ck"),
                Arguments.of("a title of spaces", Map.of("title", "  "), "note_title_blank_ck"),
                Arguments.of("a title over 200 characters", Map.of("title", "x".repeat(201)),
                        "character varying(200)"),
                Arguments.of("an unknown kind", Map.of("kind", "MEMO"), "note_kind_ck"),
                Arguments.of("a text note with a diagram", Map.of("diagram", NO_BLOCKS), "note_text_ck"),
                Arguments.of("a diagram note with a body", Map.of("kind", "DIAGRAM", "body", "x", "diagram", NO_BLOCKS),
                        "note_diagram_ck"),
                Arguments.of("a diagram note without a diagram", Map.of("kind", "DIAGRAM", "body", ""),
                        "note_diagram_ck"),
                Arguments.of("a diagram that is not an object", Map.of("kind", "DIAGRAM", "body", "", "diagram", "[]"),
                        "note_diagram_ck"));
    }

    private static final String NO_BLOCKS = "{\"blocks\": [], \"links\": []}";

    @ParameterizedTest(name = "{0}")
    @MethodSource("brokenRows")
    void theDatabaseRefusesANoteThatBreaksItsRules(String name, Map<String, Object> changes, String refusedBy) {
        assertThatThrownBy(() -> insertRow(changes)).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(refusedBy);
        assertThat(notes.count()).isZero();
    }

    @Test
    void theDatabaseTakesANoteWithoutATitleAndTheLongestBody() {
        insertRow(Map.of("body", "x".repeat(20_000)));
        insertRow(Map.of("title", "x".repeat(200)));

        assertThat(notes.count()).isEqualTo(2);
    }

    @Test
    void theDatabaseTakesADiagramNoteWithAnEmptyBody() {
        insertRow(Map.of("kind", "DIAGRAM", "body", "", "diagram", NO_BLOCKS));

        assertThat(notes.count()).isEqualTo(1);
    }

    @Test
    void aRowWithoutAKindIsATextNote() {
        insertRow(Map.of());

        assertThat(jdbc.queryForObject("select kind from note", String.class)).isEqualTo("TEXT");
    }

    private void insertRow(Map<String, Object> changes) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", UUID.randomUUID());
        row.put("user_id", owner);
        row.put("body", "x");
        row.put("created_at", Timestamp.from(FRIDAY));
        row.put("updated_at", Timestamp.from(FRIDAY));
        row.put("version", 0);
        row.putAll(changes);
        // A text parameter is not taken for a jsonb column unless it says so.
        String placeholders = row.keySet().stream().map(column -> column.equals("diagram") ? "?::jsonb" : "?")
                .collect(Collectors.joining(", "));
        String sql = "insert into note (" + String.join(", ", row.keySet()) + ") values (" + placeholders + ")";
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
        private final AtomicReference<CountDownLatch[]> pause = new AtomicReference<>();

        MovableClock(Instant start) {
            this.now = start;
        }

        void set(Instant instant) {
            now = instant;
        }

        /** The next reading of the clock counts {@code reached} down, then waits for {@code release}. */
        void pauseNextReading(CountDownLatch reached, CountDownLatch release) {
            pause.set(new CountDownLatch[] { reached, release });
        }

        @Override
        public Instant instant() {
            CountDownLatch[] latches = pause.getAndSet(null);
            if (latches != null) {
                latches[0].countDown();
                try {
                    latches[1].await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
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
