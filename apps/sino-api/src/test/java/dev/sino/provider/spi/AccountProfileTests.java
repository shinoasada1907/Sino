package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AccountProfileTests {

    @Test
    void theAvatarAndTheAddressAreOptional() {
        AccountProfile profile = new AccountProfile("1157", "Alice", null, null);

        assertThat(profile.externalAccountId()).isEqualTo("1157");
        assertThat(profile.avatarUrl()).isNull();
        assertThat(profile.address()).isNull();
    }

    @Test
    void keepsTheAddress() {
        AccountProfile profile = new AccountProfile("1157", "Alice", null, "alice@example.com");

        assertThat(profile.address()).isEqualTo("alice@example.com");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingExternalAccountId(String externalAccountId) {
        assertRejectedAsInvalidPayload(() -> new AccountProfile(externalAccountId, "Alice", null, null));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingDisplayName(String displayName) {
        assertRejectedAsInvalidPayload(() -> new AccountProfile("1157", displayName, null, null));
    }

}
