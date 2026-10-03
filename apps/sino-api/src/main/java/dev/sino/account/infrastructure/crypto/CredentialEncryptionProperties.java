package dev.sino.account.infrastructure.crypto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Credential encryption keys (D-11): base64 of 32 random bytes per key ID, and the ID used for new values. The key
 * values are checked by {@link CredentialCipher}, not here: Bean Validation failures print the rejected value.
 */
@Validated
@ConfigurationProperties("sino.credentials.encryption")
record CredentialEncryptionProperties(@NotBlank String activeKeyId, Map<String, String> keys) {

    CredentialEncryptionProperties {
        keys = keys == null ? Map.of() : Map.copyOf(keys);
    }

    @Override
    public String toString() {
        return "CredentialEncryptionProperties[activeKeyId=" + activeKeyId + ", keys=" + keys.keySet() + "]";
    }

}
