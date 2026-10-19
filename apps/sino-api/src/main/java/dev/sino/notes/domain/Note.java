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
 * A note of a Sino user (spec {@code notes}, F15): a body, maybe a title, pinned or not. Mapped onto table
 * {@code note} (V20).
 * <p>
 * The body is kept as typed; the title loses the space at both ends and a blank one is no title. The limits are
 * checked by the API first; here they guard the invariants. "Now" always comes from the caller's {@code Clock}.
 * <p>
 * Pinning is not an edit (D-175): only a change of title or body moves {@link #updatedAt()}. The {@code version} is
 * raised by every change that is written, pinning included.
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

    /**
     * A new note, not pinned.
     *
     * @throws IllegalArgumentException when the body has no character but whitespace or is too long, or the title is
     *         too long
     */
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
     * Sets the title and the body together; a blank title takes the title away. Nothing changes, not even the time of
     * the edit, when both values are the ones the note has.
     *
     * @return {@code false} when the note already had these values
     * @throws IllegalArgumentException when a value breaks a rule; the note is as it was then
     */
    public boolean edit(String title, String body, Instant now) {
        String newTitle = checkedTitle(title);
        String newBody = checkedBody(body);
        if (Objects.equals(newTitle, this.title) && newBody.equals(this.body)) {
            return false;
        }
        this.title = newTitle;
        this.body = newBody;
        this.updatedAt = now;
        return true;
    }

    /**
     * Pins or unpins the note. This is not an edit: the time of the last edit stays.
     *
     * @return {@code false} when the note was already so
     */
    public boolean pin(boolean pinned) {
        if (this.pinned == pinned) {
            return false;
        }
        this.pinned = pinned;
        return true;
    }

    private static String checkedTitle(String title) {
        if (title == null || title.isBlank()) {
            return null;
        }
        String trimmed = title.strip();
        if (trimmed.length() > MAX_TITLE_LENGTH) {
            throw new IllegalArgumentException("a title has at most " + MAX_TITLE_LENGTH + " characters");
        }
        return trimmed;
    }

    private static String checkedBody(String body) {
        if (body == null || body.isBlank()) {
            throw new IllegalArgumentException("a body needs a character that is not whitespace");
        }
        if (body.length() > MAX_BODY_LENGTH) {
            throw new IllegalArgumentException("a body has at most " + MAX_BODY_LENGTH + " characters");
        }
        return body;
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

    /** When the title or body last changed; pinning does not move it. */
    public Instant updatedAt() {
        return updatedAt;
    }

    /** The count of writes; what a client sends back to say which note it read (D-172). */
    public long version() {
        return version;
    }

}
