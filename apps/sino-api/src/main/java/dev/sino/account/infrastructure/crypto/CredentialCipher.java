package dev.sino.account.infrastructure.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Encrypts credential values with AES-256-GCM before they reach the database (D-11). Every value gets a fresh
 * 12-byte IV, and its associated data binds it to one account and one column, so a changed or moved ciphertext
 * fails to decrypt. New values use the active key; old values are read with the key ID stored next to them. The
 * keys are checked when the application starts.
 */
@Component
@EnableConfigurationProperties(CredentialEncryptionProperties.class)
public class CredentialCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final Pattern KEY_ID = Pattern.compile("[a-z0-9_-]{1,32}");
    // Scoped to the table and versioned, so another encrypted table or a later format cannot accept these values.
    private static final String AAD_PREFIX = "sino:account_credential:v1:";

    private final SecureRandom random = new SecureRandom();
    private final Map<String, SecretKey> keys;
    private final String activeKeyId;

    public CredentialCipher(CredentialEncryptionProperties properties) {
        checkKeyId(properties.activeKeyId());
        Map<String, SecretKey> decoded = new HashMap<>();
        // A blank slot is a key ID declared in the configuration but not set in this environment.
        properties.keys().forEach((id, value) -> {
            checkKeyId(id);
            if (value != null && !value.isBlank()) {
                decoded.put(id, decode(id, value));
            }
        });
        if (!decoded.containsKey(properties.activeKeyId())) {
            throw new IllegalStateException("The active credential key '" + properties.activeKeyId()
                    + "' is not configured: set sino.credentials.encryption.keys." + properties.activeKeyId());
        }
        this.keys = Map.copyOf(decoded);
        this.activeKeyId = properties.activeKeyId();
    }

    /** The key ID new values are encrypted with. */
    public String activeKeyId() {
        return activeKeyId;
    }

    public EncryptedValue encrypt(String plaintext, UUID accountId, CredentialField field) {
        Objects.requireNonNull(plaintext, "plaintext must not be null");
        byte[] iv = new byte[IV_BYTES];
        random.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(associatedData(accountId, field));
            byte[] sealed = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] stored = ByteBuffer.allocate(IV_BYTES + sealed.length).put(iv).put(sealed).array();
            return new EncryptedValue(activeKeyId, Base64.getEncoder().encodeToString(stored));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("AES-GCM encryption failed", e);
        }
    }

    public String decrypt(EncryptedValue value, UUID accountId, CredentialField field) {
        Objects.requireNonNull(value, "value must not be null");
        byte[] associatedData = associatedData(accountId, field);
        SecretKey key = keys.get(value.keyId());
        if (key == null) {
            throw new CredentialDecryptionException(accountId, field, value.keyId(), "unknown key ID", null);
        }
        byte[] stored;
        try {
            stored = Base64.getDecoder().decode(value.ciphertext());
        } catch (IllegalArgumentException e) {
            throw new CredentialDecryptionException(accountId, field, value.keyId(), "not base64", null);
        }
        if (stored.length < IV_BYTES + TAG_BITS / 8) {
            throw new CredentialDecryptionException(accountId, field, value.keyId(), "too short", null);
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, stored, 0, IV_BYTES));
            cipher.updateAAD(associatedData);
            byte[] plaintext = cipher.doFinal(stored, IV_BYTES, stored.length - IV_BYTES);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new CredentialDecryptionException(accountId, field, value.keyId(), "integrity check failed", e);
        }
    }

    private static byte[] associatedData(UUID accountId, CredentialField field) {
        Objects.requireNonNull(accountId, "accountId must not be null");
        Objects.requireNonNull(field, "field must not be null");
        return (AAD_PREFIX + accountId + ":" + field.column()).getBytes(StandardCharsets.UTF_8);
    }

    // Not trimmed: "k1 " from a .env file would silently become a different key ID.
    private static void checkKeyId(String id) {
        if (id == null || !KEY_ID.matcher(id).matches()) {
            throw new IllegalStateException("Credential key ID '" + id + "' must match " + KEY_ID.pattern()
                    + " (it is stored in a varchar(32) column)");
        }
    }

    private static SecretKey decode(String id, String base64) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            // Not chained: the decoder's message quotes a character of the key.
            throw new IllegalStateException("sino.credentials.encryption.keys." + id + " is not valid base64");
        }
        if (bytes.length != KEY_BYTES) {
            throw new IllegalStateException("sino.credentials.encryption.keys." + id + " must decode to "
                    + KEY_BYTES + " bytes, not " + bytes.length + " (generate one with: openssl rand -base64 32)");
        }
        SecretKey key = new SecretKeySpec(bytes, "AES");
        Arrays.fill(bytes, (byte) 0);
        return key;
    }

}
