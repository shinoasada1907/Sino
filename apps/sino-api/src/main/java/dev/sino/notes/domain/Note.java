package dev.sino.notes.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * A note of a Sino user (spec {@code notes}, F15): a {@linkplain NoteKind#TEXT text} note with a body as the user typed
 * it, or a {@linkplain NoteKind#DIAGRAM diagram} note with a {@link Diagram} and an empty body (D-179); maybe a title,
 * maybe pinned. Not tied to a message yet (D-170). Mapped onto table {@code note} (V20).
 * <p>
 * The limits are checked by the API first; here they guard the invariants, so a caller that is not the REST layer
 * cannot store what the database would refuse. Lengths count UTF-16 units, as the web's {@code maxLength} does. "Now"
 * always comes from the caller.
 */
@Entity
@Table(name = "note")
public class Note {

    public static final int MAX_TITLE_LENGTH = 200;
    public static final int MAX_BODY_LENGTH = 20_000;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, updatable = false)
    private NoteKind kind;

    @Column(name = "title")
    private String title;

    /** The text of a text note; empty for a diagram note. */
    @Column(name = "body", nullable = false)
    private String body;

    /** The whole diagram of a diagram note, kept as one jsonb document; {@code null} for a text note. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "diagram")
    private Diagram diagram;

    @Column(name = "pinned", nullable = false)
    private boolean pinned;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Note() {
    }

    /** A new text note, not pinned. A blank title is no title (D-174). */
    public static Note createText(UUID ownerId, String title, String body, Instant now) {
        Note note = created(ownerId, NoteKind.TEXT, title, now);
        note.body = checkedBody(body);
        return note;
    }

    /** A new diagram note, not pinned, with an empty body (D-179). A blank title is no title. */
    public static Note createDiagram(UUID ownerId, String title, Diagram diagram, Instant now) {
        Note note = created(ownerId, NoteKind.DIAGRAM, title, now);
        note.body = "";
        note.diagram = Objects.requireNonNull(diagram, "diagram");
        return note;
    }

    private static Note created(UUID ownerId, NoteKind kind, String title, Instant now) {
        Note note = new Note();
        note.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        note.kind = kind;
        note.title = checkedTitle(title);
        note.createdAt = now;
        note.updatedAt = now;
        return note;
    }

    /**
     * Changes the title, the body or the diagram; a {@code null} argument leaves that field as it is, a blank title
     * removes the title. All are checked before any changes. The body belongs to a text note and the diagram to a
     * diagram note; naming the other one is refused. The diagram is replaced as a whole, and an equal one is no
     * change. The time of the edit moves only when a value changes.
     *
     * @return {@code false} when nothing changed
     */
    public boolean edit(String title, String body, Diagram diagram, Instant now) {
        if (body != null && kind != NoteKind.TEXT) {
            throw new IllegalArgumentException("only a text note has a body");
        }
        if (diagram != null && kind != NoteKind.DIAGRAM) {
            throw new IllegalArgumentException("only a diagram note has a diagram");
        }
        String newTitle = title == null ? this.title : checkedTitle(title);
        String newBody = body == null ? this.body : checkedBody(body);
        Diagram newDiagram = diagram == null ? this.diagram : diagram;
        if (Objects.equals(newTitle, this.title) && newBody.equals(this.body)
                && Objects.equals(newDiagram, this.diagram)) {
            return false;
        }
        this.title = newTitle;
        this.body = newBody;
        this.diagram = newDiagram;
        this.updatedAt = now;
        return true;
    }

    /**
     * Pins or unpins the note. A pin is not an edit: the time of the edit stays (D-175); the version still moves.
     *
     * @return {@code false} when the note already was so
     */
    public boolean pin(boolean pinned) {
        if (this.pinned == pinned) {
            return false;
        }
        this.pinned = pinned;
        return true;
    }

    /**
     * Whether {@code text} has a character that is not a space. A space is what Java's {@code isBlank} or a browser's
     * {@code trim} counts as one, so a body the web sees as empty is empty here too (a no-break space pasted from a web
     * page, the ideographic space of a CJK keyboard, a byte order mark). The REST layer checks with this method rather
     * than {@code @NotBlank}, which follows {@code isBlank} only.
     */
    public static boolean hasText(String text) {
        return text != null && text.codePoints().anyMatch(c -> !isSpace(c));
    }

    private static boolean isSpace(int codePoint) {
        return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == '﻿';
    }

    private static String checkedTitle(String title) {
        if (!hasText(title)) {
            return null;
        }
        String trimmed = stripped(title);
        if (trimmed.length() > MAX_TITLE_LENGTH || hasNul(trimmed)) {
            throw new IllegalArgumentException("a title has at most " + MAX_TITLE_LENGTH + " characters and no NUL");
        }
        return trimmed;
    }

    private static String checkedBody(String body) {
        Objects.requireNonNull(body, "body");
        if (!hasText(body) || body.length() > MAX_BODY_LENGTH || hasNul(body)) {
            throw new IllegalArgumentException("a body has text, at most " + MAX_BODY_LENGTH + " characters and no NUL");
        }
        return body;
    }

    /** {@code text} without the spaces of {@link #hasText} at its two ends. */
    private static String stripped(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isSpace(text.codePointAt(start))) {
            start += Character.charCount(text.codePointAt(start));
        }
        while (end > start && isSpace(text.codePointBefore(end))) {
            end -= Character.charCount(text.codePointBefore(end));
        }
        return text.substring(start, end);
    }

    /** PostgreSQL refuses the NUL character in text, which would end as a 500 instead of a refused note. */
    private static boolean hasNul(String text) {
        return text.indexOf('\0') >= 0;
    }

    public UUID id() {
        return id;
    }

    public UUID ownerId() {
        return ownerId;
    }

    public NoteKind kind() {
        return kind;
    }

    /** {@code null} when the note has no title. */
    public String title() {
        return title;
    }

    /** The text of a text note; empty for a diagram note. */
    public String body() {
        return body;
    }

    /** {@code null} for a text note. */
    public Diagram diagram() {
        return diagram;
    }

    public boolean pinned() {
        return pinned;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }

    public long version() {
        return version;
    }

}
