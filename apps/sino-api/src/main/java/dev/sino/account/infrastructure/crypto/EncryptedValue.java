package dev.sino.account.infrastructure.crypto;

/**
 * A credential value as stored: the ID of the key that encrypted it and {@code base64(IV ‖ ciphertext ‖ tag)}.
 */
public record EncryptedValue(String keyId, String ciphertext) {

    public EncryptedValue {
        if (keyId == null || keyId.isBlank()) {
            throw new IllegalArgumentException("keyId must not be blank");
        }
        if (ciphertext == null || ciphertext.isBlank()) {
            throw new IllegalArgumentException("ciphertext must not be blank");
        }
    }

    @Override
    public String toString() {
        return "EncryptedValue[keyId=" + keyId + ", ciphertext=****]";
    }

}
