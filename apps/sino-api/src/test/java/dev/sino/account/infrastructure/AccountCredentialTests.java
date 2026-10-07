package dev.sino.account.infrastructure;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.account.infrastructure.crypto.EncryptedValue;

class AccountCredentialTests {

    @Test
    void allSecretsOfARowMustUseTheSameKey() {
        AccountCredential row = new AccountCredential(UUID.randomUUID());

        assertThatThrownBy(() -> row.replace(CredentialType.OAUTH2, new EncryptedValue("k2", "new-access"),
                new EncryptedValue("k1", "old-refresh"), null, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

}
