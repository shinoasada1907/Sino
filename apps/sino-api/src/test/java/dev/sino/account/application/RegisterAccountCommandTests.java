package dev.sino.account.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.OAuth2Credentials;

class RegisterAccountCommandTests {

    @Test
    void neverPrintsASecret() {
        RegisterAccountCommand command = new RegisterAccountCommand(UUID.randomUUID(), ProviderType.of("gmail"),
                new AccountProfile("me@gmail.com", "Me", null),
                new OAuth2Credentials("ya29.sample-access-token", null, Set.of()), "1//sample-refresh-token");

        assertThat(command.toString())
                .contains("me@gmail.com")
                .doesNotContain("ya29.sample-access-token")
                .doesNotContain("1//sample-refresh-token");
    }

}
