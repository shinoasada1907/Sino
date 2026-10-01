package dev.sino.provider.spi;

import static dev.sino.provider.spi.PayloadAssertions.assertRejectedAsInvalidPayload;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AccountProfileTests {

    @Test
    void theAvatarIsOptional() {
        AccountProfile profile = new AccountProfile("alice@example.com", "Alice", null);

        assertThat(profile.externalAccountId()).isEqualTo("alice@example.com");
        assertThat(profile.avatarUrl()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingExternalAccountId(String externalAccountId) {
        assertRejectedAsInvalidPayload(() -> new AccountProfile(externalAccountId, "Alice", null));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void rejectsAMissingDisplayName(String displayName) {
        assertRejectedAsInvalidPayload(() -> new AccountProfile("alice@example.com", displayName, null));
    }

}
