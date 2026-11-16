package dev.sino.identity.infrastructure;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The picture of a user, table {@code user_avatar}: at most one per user, the user's ID is its key.
 */
@Entity
@Table(name = "user_avatar")
public class UserAvatar {

    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "content", nullable = false)
    private byte[] content;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "sha256", nullable = false)
    private byte[] sha256;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** For JPA. */
    protected UserAvatar() {
    }

    public UserAvatar(UUID userId, byte[] content, String contentType, byte[] sha256, Instant now) {
        this.userId = userId;
        replace(content, contentType, sha256, now);
    }

    public void replace(byte[] content, String contentType, byte[] sha256, Instant now) {
        this.content = content.clone();
        this.contentType = contentType;
        this.sha256 = sha256.clone();
        this.updatedAt = now;
    }

    /** A copy of the bytes. */
    public byte[] content() {
        return content.clone();
    }

    public String contentType() {
        return contentType;
    }

    /** A copy of the 32 bytes of the digest of the file. */
    public byte[] sha256() {
        return sha256.clone();
    }

}
