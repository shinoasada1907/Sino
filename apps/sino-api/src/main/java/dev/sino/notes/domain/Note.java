package dev.sino.notes.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.UuidGenerator;

/**
 * A text note of a Sino user (spec {@code notes}, F15): a body as the user typed it, maybe a title, maybe pinned. Not
 * tied to a message yet (D-170). Mapped onto table {@code note} (V20).
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

    @Column(name = "title")
    private String title;

    @Column(name = "body", nullable = false)
    private String body;

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

    /** A new note, not pinned. A blank title is no title (D-174). */
    public static Note create(UUID ownerId, String title, String body, Instant now) {
        Note note = new Note();
        note.ownerId = Objects.requireNonNull(ownerId, "ownerId");
        note.title = checkedTitle(title);
        note.body = checkedBody(body);
        note.createdAt = now;
        note.updatedAt = now;
        return note;
    }

    /**
     * Changes the title and the body; a {@code null} argument leaves that field as it is, a blank title removes the
     * title. Both are checked before either changes. The time of the edit moves only when a value changes.
     *
     * @return {@code false} when nothing changed
     */
    public boolean edit(String title, String body, Instant now) {
        String newTitle = title == null ? this.title : checkedTitle(title);
        String newBody = body == null ? this.body : checkedBody(body);
        if (Objects.equals(newTitle, this.title) && newBody.equals(this.body)) {
            return false;
        }
        this.title = newTitle;
        this.body = newBody;
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

    /** {@code null} when the note has no title. */
    public String title() {
        return title;
    }

    public String body() {
        return body;
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
