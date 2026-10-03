package dev.sino.account.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import dev.sino.provider.ProviderType;

class ConnectedAccountTests {

    private static final UUID OWNER = UUID.fromString("0192f0a0-0000-7000-8000-000000000001");
    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final String EMOJI = "😀";

    enum Action {

        RECONNECT(account -> account.reconnect("Alice", null)),
        DISABLE(ConnectedAccount::disable),
        ENABLE(ConnectedAccount::enable),
        AUTH_EXPIRED(ConnectedAccount::markAuthExpired),
        DEGRADED(ConnectedAccount::markDegraded),
        ERROR(ConnectedAccount::markError),
        HEALTHY(ConnectedAccount::markHealthy);

        private final Function<ConnectedAccount, Optional<StatusChange>> apply;

        Action(Function<ConnectedAccount, Optional<StatusChange>> apply) {
            this.apply = apply;
        }

    }

    // The transition table of the F02 design, cell by cell: state before | action | state after ("—" = no-op).
    @ParameterizedTest(name = "{0} + {1} -> {2}")
    @CsvSource(delimiter = '|', textBlock = """
            CONNECTED    | RECONNECT    | CONNECTED
            CONNECTED    | DISABLE      | DISABLED
            CONNECTED    | ENABLE       | —
            CONNECTED    | AUTH_EXPIRED | AUTH_EXPIRED
            CONNECTED    | DEGRADED     | DEGRADED
            CONNECTED    | ERROR        | ERROR
            CONNECTED    | HEALTHY      | —
            DEGRADED     | RECONNECT    | CONNECTED
            DEGRADED     | DISABLE      | DISABLED
            DEGRADED     | ENABLE       | —
            DEGRADED     | AUTH_EXPIRED | AUTH_EXPIRED
            DEGRADED     | DEGRADED     | —
            DEGRADED     | ERROR        | ERROR
            DEGRADED     | HEALTHY      | CONNECTED
            AUTH_EXPIRED | RECONNECT    | CONNECTED
            AUTH_EXPIRED | DISABLE      | DISABLED
            AUTH_EXPIRED | ENABLE       | —
            AUTH_EXPIRED | AUTH_EXPIRED | —
            AUTH_EXPIRED | DEGRADED     | —
            AUTH_EXPIRED | ERROR        | —
            AUTH_EXPIRED | HEALTHY      | —
            ERROR        | RECONNECT    | CONNECTED
            ERROR        | DISABLE      | DISABLED
            ERROR        | ENABLE       | —
            ERROR        | AUTH_EXPIRED | AUTH_EXPIRED
            ERROR        | DEGRADED     | DEGRADED
            ERROR        | ERROR        | —
            ERROR        | HEALTHY      | CONNECTED
            DISABLED     | RECONNECT    | CONNECTED
            DISABLED     | DISABLE      | —
            DISABLED     | ENABLE       | CONNECTED
            DISABLED     | AUTH_EXPIRED | —
            DISABLED     | DEGRADED     | —
            DISABLED     | ERROR        | —
            DISABLED     | HEALTHY      | —
            """)
    void followsTheTransitionTable(AccountStatus from, Action action, String after) {
        ConnectedAccount account = accountIn(from);

        Optional<StatusChange> change = action.apply.apply(account);

        if (after.equals("—") || AccountStatus.valueOf(after) == from) {
            assertThat(change).isEmpty();
            assertThat(account.status()).isEqualTo(from);
        } else {
            AccountStatus to = AccountStatus.valueOf(after);
            assertThat(change).contains(new StatusChange(from, to));
            assertThat(account.status()).isEqualTo(to);
        }
    }

    @Test
    void aNewAccountIsConnectedAndSyncs() {
        ConnectedAccount account = ConnectedAccount.register(OWNER, GMAIL, "alice@example.com", " Alice ",
                "https://example.com/a.png");

        assertThat(account.ownerId()).isEqualTo(OWNER);
        assertThat(account.provider()).isEqualTo(GMAIL);
        assertThat(account.externalAccountId()).isEqualTo("alice@example.com");
        assertThat(account.displayName()).isEqualTo("Alice");
        assertThat(account.avatarUrl()).isEqualTo("https://example.com/a.png");
        assertThat(account.status()).isEqualTo(AccountStatus.CONNECTED);
        assertThat(account.syncEnabled()).isTrue();
        assertThat(account.lastSyncedAt()).isNull();
    }

    @Test
    void refusesMissingData() {
        assertThatThrownBy(() -> ConnectedAccount.register(null, GMAIL, "alice", "Alice", null))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> ConnectedAccount.register(OWNER, null, "alice", "Alice", null))
                .isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> ConnectedAccount.register(OWNER, GMAIL, " ", "Alice", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ConnectedAccount.register(OWNER, GMAIL, "alice", " ", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void shortensALongNameFromTheProvider() {
        ConnectedAccount account = ConnectedAccount.register(OWNER, GMAIL, "alice", "a".repeat(120), null);

        assertThat(account.displayName()).hasSize(ConnectedAccount.MAX_DISPLAY_NAME_LENGTH);
    }

    @Test
    void shortensWithoutCuttingAnEmojiInHalf() {
        ConnectedAccount account = ConnectedAccount.register(OWNER, GMAIL, "alice", "a".repeat(99) + EMOJI + EMOJI,
                null);

        assertThat(account.displayName()).isEqualTo("a".repeat(99) + EMOJI);
    }

    @Test
    void reconnectRefreshesTheDataFromTheProvider() {
        ConnectedAccount account = accountIn(AccountStatus.AUTH_EXPIRED);
        account.rename("Work");

        account.reconnect("Alice B", "https://example.com/b.png");

        assertThat(account.displayName()).isEqualTo("Alice B");
        assertThat(account.avatarUrl()).isEqualTo("https://example.com/b.png");
    }

    @Test
    void renameTrims() {
        ConnectedAccount account = accountIn(AccountStatus.CONNECTED);

        account.rename("  Gmail Work ");

        assertThat(account.displayName()).isEqualTo("Gmail Work");
    }

    @Test
    void renameAcceptsOneHundredCharacters() {
        ConnectedAccount account = accountIn(AccountStatus.CONNECTED);

        account.rename("a".repeat(100));
        assertThat(account.displayName()).hasSize(100);

        account.rename(EMOJI.repeat(100));
        assertThat(account.displayName()).isEqualTo(EMOJI.repeat(100));
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void renameRefusesABlankName(String name) {
        ConnectedAccount account = accountIn(AccountStatus.CONNECTED);

        assertThatThrownBy(() -> account.rename(name)).isInstanceOf(IllegalArgumentException.class);
        assertThat(account.displayName()).isEqualTo("Alice");
    }

    @Test
    void renameRefusesMoreThanOneHundredCharacters() {
        ConnectedAccount account = accountIn(AccountStatus.CONNECTED);

        assertThatThrownBy(() -> account.rename("a".repeat(101))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> account.rename(EMOJI.repeat(101))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void pausingSyncKeepsTheStatus() {
        ConnectedAccount account = accountIn(AccountStatus.DEGRADED);

        account.pauseSync();
        assertThat(account.syncEnabled()).isFalse();
        assertThat(account.status()).isEqualTo(AccountStatus.DEGRADED);

        account.resumeSync();
        assertThat(account.syncEnabled()).isTrue();
    }

    @Test
    void aStatusChangeNeedsTwoDifferentStates() {
        assertThatThrownBy(() -> new StatusChange(AccountStatus.CONNECTED, AccountStatus.CONNECTED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static ConnectedAccount accountIn(AccountStatus status) {
        ConnectedAccount account = ConnectedAccount.register(OWNER, GMAIL, "alice@example.com", "Alice", null);
        switch (status) {
            case CONNECTED -> {
            }
            case DEGRADED -> account.markDegraded();
            case AUTH_EXPIRED -> account.markAuthExpired();
            case ERROR -> account.markError();
            case DISABLED -> account.disable();
        }
        assertThat(account.status()).isEqualTo(status);
        return account;
    }

}
