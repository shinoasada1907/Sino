package dev.sino.account.domain;

import static dev.sino.account.domain.AccountStatus.AUTH_EXPIRED;
import static dev.sino.account.domain.AccountStatus.CONNECTED;
import static dev.sino.account.domain.AccountStatus.DEGRADED;
import static dev.sino.account.domain.AccountStatus.DISABLED;
import static dev.sino.account.domain.AccountStatus.ERROR;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
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

import org.hibernate.annotations.UuidGenerator;

import dev.sino.provider.ProviderType;

/**
 * One account of one provider that belongs to a Sino user, for example "Gmail personal". The aggregate root of the
 * account module: every change of status goes through its methods, which follow the transition table of the F02
 * design. A method that changes the status returns the {@link StatusChange}; one that changes nothing returns
 * empty. Mapped straight onto table {@code connected_account} (BE-11).
 */
@Entity
@Table(name = "connected_account")
public class ConnectedAccount {

    public static final int MAX_DISPLAY_NAME_LENGTH = 100;

    @Id
    @UuidGenerator(style = UuidGenerator.Style.VERSION_7)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "provider", nullable = false, updatable = false)
    private ProviderType provider;

    @Column(name = "external_account_id", nullable = false, updatable = false)
    private String externalAccountId;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private AccountStatus status;

    @Column(name = "sync_enabled", nullable = false)
    private boolean syncEnabled;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /** For persistence. */
    protected ConnectedAccount() {
    }

    private ConnectedAccount(UUID ownerId, ProviderType provider, String externalAccountId, String displayName,
            String avatarUrl) {
        this.ownerId = Objects.requireNonNull(ownerId, "ownerId must not be null");
        this.provider = Objects.requireNonNull(provider, "provider must not be null");
        if (externalAccountId == null || externalAccountId.isBlank()) {
            throw new IllegalArgumentException("externalAccountId must not be blank");
        }
        this.externalAccountId = externalAccountId;
        this.displayName = nameFromProvider(displayName);
        this.avatarUrl = avatarUrl;
        this.status = CONNECTED;
        this.syncEnabled = true;
    }

    /** A newly connected account. The display name comes from the provider. */
    public static ConnectedAccount register(UUID ownerId, ProviderType provider, String externalAccountId,
            String displayName, String avatarUrl) {
        return new ConnectedAccount(ownerId, provider, externalAccountId, displayName, avatarUrl);
    }

    /** The user connected the same account again: fresh display data from the provider, back to CONNECTED. */
    public Optional<StatusChange> reconnect(String displayName, String avatarUrl) {
        this.displayName = nameFromProvider(displayName);
        this.avatarUrl = avatarUrl;
        return moveTo(CONNECTED, EnumSet.allOf(AccountStatus.class));
    }

    public Optional<StatusChange> disable() {
        return moveTo(DISABLED, EnumSet.of(CONNECTED, DEGRADED, AUTH_EXPIRED, ERROR));
    }

    public Optional<StatusChange> enable() {
        return moveTo(CONNECTED, EnumSet.of(DISABLED));
    }

    public Optional<StatusChange> markAuthExpired() {
        return moveTo(AUTH_EXPIRED, EnumSet.of(CONNECTED, DEGRADED, ERROR));
    }

    public Optional<StatusChange> markDegraded() {
        return moveTo(DEGRADED, EnumSet.of(CONNECTED, ERROR));
    }

    public Optional<StatusChange> markError() {
        return moveTo(ERROR, EnumSet.of(CONNECTED, DEGRADED));
    }

    /** A sync worked again. Does not clear AUTH_EXPIRED: only a reconnect brings new credentials. */
    public Optional<StatusChange> markHealthy() {
        return moveTo(CONNECTED, EnumSet.of(DEGRADED, ERROR));
    }

    /** A name chosen by the user: 1 to 100 characters after trimming. */
    public void rename(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("displayName must not be blank");
        }
        String trimmed = displayName.trim();
        if (characters(trimmed) > MAX_DISPLAY_NAME_LENGTH) {
            throw new IllegalArgumentException("displayName must be at most " + MAX_DISPLAY_NAME_LENGTH
                    + " characters");
        }
        this.displayName = trimmed;
    }

    /** Stops automatic sync only; the account and its messages stay visible. */
    public void pauseSync() {
        this.syncEnabled = false;
    }

    public void resumeSync() {
        this.syncEnabled = true;
    }

    public UUID id() {
        return id;
    }

    public UUID ownerId() {
        return ownerId;
    }

    public ProviderType provider() {
        return provider;
    }

    public String externalAccountId() {
        return externalAccountId;
    }

    public String displayName() {
        return displayName;
    }

    public String avatarUrl() {
        return avatarUrl;
    }

    public AccountStatus status() {
        return status;
    }

    public boolean syncEnabled() {
        return syncEnabled;
    }

    public Instant lastSyncedAt() {
        return lastSyncedAt;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
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

    private Optional<StatusChange> moveTo(AccountStatus target, Set<AccountStatus> allowedFrom) {
        if (status == target || !allowedFrom.contains(status)) {
            return Optional.empty();
        }
        StatusChange change = new StatusChange(status, target);
        status = target;
        return Optional.of(change);
    }

    // A provider name is trimmed and shortened rather than refused, so an odd name never blocks a connection.
    private static String nameFromProvider(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("displayName must not be blank");
        }
        String trimmed = displayName.trim();
        return characters(trimmed) > MAX_DISPLAY_NAME_LENGTH
                ? trimmed.substring(0, trimmed.offsetByCodePoints(0, MAX_DISPLAY_NAME_LENGTH))
                : trimmed;
    }

    // Code points, as PostgreSQL counts varchar(100); an emoji is two Java chars but one character.
    private static int characters(String text) {
        return text.codePointCount(0, text.length());
    }

}
