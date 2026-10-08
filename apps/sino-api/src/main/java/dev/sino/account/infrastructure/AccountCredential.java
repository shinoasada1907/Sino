package dev.sino.account.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import dev.sino.account.infrastructure.crypto.EncryptedValue;

/**
 * The stored credential of one account, table {@code account_credential}. Holds ciphertext only and never leaves
 * the account module; {@link CredentialStore} is the only way in or out.
 */
@Entity
@Table(name = "account_credential")
class AccountCredential {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "account_id", nullable = false, updatable = false)
    private UUID accountId;

    @Enumerated(EnumType.STRING)
    @Column(name = "credential_type", nullable = false)
    private CredentialType type;

    @Column(name = "access_token_enc", nullable = false)
    private String accessTokenEnc;

    @Column(name = "refresh_token_enc")
    private String refreshTokenEnc;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "scopes", nullable = false)
    private List<String> scopes;

    @Column(name = "encryption_key_id", nullable = false)
    private String encryptionKeyId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /** For JPA. */
    protected AccountCredential() {
    }

    AccountCredential(UUID accountId) {
        this.accountId = Objects.requireNonNull(accountId, "accountId must not be null");
    }

    /**
     * Replaces every stored value at once. All secrets must come from the same key, which becomes the key ID of
     * the row; that is what keeps {@code encryption_key_id} true after a key rotation.
     */
    void replace(CredentialType type, EncryptedValue accessToken, EncryptedValue refreshToken, Instant expiresAt,
            List<String> scopes) {
        Objects.requireNonNull(accessToken, "accessToken must not be null");
        if (refreshToken != null && !refreshToken.keyId().equals(accessToken.keyId())) {
            throw new IllegalArgumentException("All secrets of a credential must use the same key");
        }
        this.type = Objects.requireNonNull(type, "type must not be null");
        this.accessTokenEnc = accessToken.ciphertext();
        this.refreshTokenEnc = refreshToken == null ? null : refreshToken.ciphertext();
        this.expiresAt = expiresAt;
        this.scopes = List.copyOf(scopes);
        this.encryptionKeyId = accessToken.keyId();
    }

    UUID accountId() {
        return accountId;
    }

    CredentialType type() {
        return type;
    }

    EncryptedValue accessToken() {
        return new EncryptedValue(encryptionKeyId, accessTokenEnc);
    }

    Optional<EncryptedValue> refreshToken() {
        return Optional.ofNullable(refreshTokenEnc).map(ciphertext -> new EncryptedValue(encryptionKeyId, ciphertext));
    }

    Instant expiresAt() {
        return expiresAt;
    }

    List<String> scopes() {
        return scopes;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

}
