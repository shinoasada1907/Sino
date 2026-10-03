package dev.sino.account.infrastructure.crypto;

import static dev.sino.account.infrastructure.crypto.CredentialField.ACCESS_TOKEN;
import static dev.sino.account.infrastructure.crypto.CredentialField.REFRESH_TOKEN;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CredentialCipherTests {

    // Fake keys, not secrets: the bytes 0..31 and 32 times the byte 2.
    static final String KEY_1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    static final String KEY_2 = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=";

    private static final String TOKEN = "ya29.a0-sample-access-token";
    private static final UUID ACCOUNT_A = UUID.fromString("0192f0a0-0000-7000-8000-00000000000a");
    private static final UUID ACCOUNT_B = UUID.fromString("0192f0a0-0000-7000-8000-00000000000b");

    private final CredentialCipher cipher = cipher("k1", Map.of("k1", KEY_1));

    @Test
    void readsBackWhatItWrote() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThat(value.keyId()).isEqualTo("k1");
        assertThat(cipher.decrypt(value, ACCOUNT_A, ACCESS_TOKEN)).isEqualTo(TOKEN);
    }

    @Test
    void neverStoresThePlaintext() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);
        String storedBytes = new String(Base64.getDecoder().decode(value.ciphertext()), StandardCharsets.ISO_8859_1);

        assertThat(value.ciphertext()).doesNotContain(TOKEN);
        assertThat(storedBytes).doesNotContain(TOKEN);
    }

    @Test
    void storesA12ByteIvAndA16ByteTag() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThat(Base64.getDecoder().decode(value.ciphertext()))
                .hasSize(12 + TOKEN.getBytes(StandardCharsets.UTF_8).length + 16);
    }

    @Test
    void anEmptyValueIsTheShortestValidValue() {
        EncryptedValue empty = cipher.encrypt("", ACCOUNT_A, ACCESS_TOKEN);
        byte[] stored = Base64.getDecoder().decode(empty.ciphertext());
        EncryptedValue oneByteShort = new EncryptedValue("k1",
                Base64.getEncoder().encodeToString(Arrays.copyOf(stored, stored.length - 1)));

        assertThat(stored).hasSize(28);
        assertThat(cipher.decrypt(empty, ACCOUNT_A, ACCESS_TOKEN)).isEmpty();
        assertThatThrownBy(() -> cipher.decrypt(oneByteShort, ACCOUNT_A, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class)
                .hasMessageContaining("too short");
    }

    @Test
    void aTruncatedValueFails() {
        byte[] stored = Base64.getDecoder().decode(cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN).ciphertext());
        EncryptedValue truncated = new EncryptedValue("k1",
                Base64.getEncoder().encodeToString(Arrays.copyOf(stored, stored.length - 1)));

        assertThatThrownBy(() -> cipher.decrypt(truncated, ACCOUNT_A, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void theSameTokenEncryptsDifferentlyEachTime() {
        EncryptedValue first = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);
        EncryptedValue second = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThat(first.ciphertext()).isNotEqualTo(second.ciphertext());
    }

    @ParameterizedTest
    @ValueSource(ints = { 0, 12, -1 })
    void aChangedByteIsDetected(int position) {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);
        byte[] stored = Base64.getDecoder().decode(value.ciphertext());
        int index = position >= 0 ? position : stored.length - 1;
        stored[index] ^= 1;
        EncryptedValue tampered = new EncryptedValue("k1", Base64.getEncoder().encodeToString(stored));

        assertThatThrownBy(() -> cipher.decrypt(tampered, ACCOUNT_A, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void aValueCopiedToAnotherAccountCannotBeRead() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThatThrownBy(() -> cipher.decrypt(value, ACCOUNT_B, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void aValueCopiedToAnotherColumnCannotBeRead() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThatThrownBy(() -> cipher.decrypt(value, ACCOUNT_A, REFRESH_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void oldValuesStayReadableAfterTheActiveKeyChanges() {
        EncryptedValue old = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);
        CredentialCipher rotated = cipher("k2", Map.of("k1", KEY_1, "k2", KEY_2));

        assertThat(rotated.decrypt(old, ACCOUNT_A, ACCESS_TOKEN)).isEqualTo(TOKEN);
        assertThat(rotated.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN).keyId()).isEqualTo("k2");
    }

    @Test
    void anotherKeyCannotRead() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);
        CredentialCipher otherKeyNamedK1 = cipher("k1", Map.of("k1", KEY_2));

        assertThatThrownBy(() -> otherKeyNamedK1.decrypt(value, ACCOUNT_A, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void aValueRelabelledWithAnotherKeyIdFails() {
        CredentialCipher bothKeys = cipher("k1", Map.of("k1", KEY_1, "k2", KEY_2));
        EncryptedValue value = bothKeys.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThatThrownBy(() -> bothKeys.decrypt(new EncryptedValue("k2", value.ciphertext()), ACCOUNT_A,
                ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void anUnknownKeyIdFails() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThatThrownBy(() -> cipher.decrypt(new EncryptedValue("k9", value.ciphertext()), ACCOUNT_A,
                ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class)
                .hasMessageContaining("k9");
    }

    @ParameterizedTest
    @ValueSource(strings = { "not base64 !", "AAAA" })
    void garbageFailsCleanly(String ciphertext) {
        assertThatThrownBy(() -> cipher.decrypt(new EncryptedValue("k1", ciphertext), ACCOUNT_A, ACCESS_TOKEN))
                .isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void theErrorNamesTheAccountButNeverTheValue() {
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThatThrownBy(() -> cipher.decrypt(value, ACCOUNT_B, ACCESS_TOKEN))
                .hasMessageContaining(ACCOUNT_B.toString())
                .hasMessageContaining("access_token")
                .hasMessageNotContaining(value.ciphertext())
                .hasMessageNotContaining(TOKEN);
    }

    @Test
    void refusesWithoutTheActiveKey() {
        assertThatThrownBy(() -> cipher("k2", Map.of("k1", KEY_1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sino.credentials.encryption.keys.k2");
    }

    @Test
    void refusesAKeyOfTheWrongLength() {
        String sixteenBytes = "AAAAAAAAAAAAAAAAAAAAAA==";

        assertThatThrownBy(() -> cipher("k1", Map.of("k1", sixteenBytes)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sino.credentials.encryption.keys.k1")
                .hasMessageNotContaining(sixteenBytes);
    }

    @Test
    void refusesAKeyThatIsNotBase64WithoutQuotingIt() {
        String broken = "secret-key-with-dashes";

        assertThatThrownBy(() -> cipher("k1", Map.of("k1", broken)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sino.credentials.encryption.keys.k1")
                .hasMessageNotContaining(broken)
                .hasNoCause();
    }

    @Test
    void refusesABrokenKeyInAnotherSlot() {
        assertThatThrownBy(() -> cipher("k1", Map.of("k1", KEY_1, "k2", "AAAA")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sino.credentials.encryption.keys.k2");
    }

    @ParameterizedTest
    @ValueSource(strings = { "k1 ", "K1", "key/1", "a-key-id-that-is-longer-than-32-chars" })
    void refusesAKeyIdThatDoesNotFitTheColumn(String keyId) {
        assertThatThrownBy(() -> cipher(keyId, Map.of(keyId, KEY_1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("[a-z0-9_-]{1,32}");
    }

    @Test
    void ignoresAnEmptyKeySlot() {
        CredentialCipher withEmptySlot = cipher("k1", Map.of("k1", KEY_1, "k2", ""));

        assertThat(withEmptySlot.activeKeyId()).isEqualTo("k1");
    }

    @Test
    void neverPrintsKeysOrCiphertext() {
        CredentialEncryptionProperties properties = new CredentialEncryptionProperties("k1", Map.of("k1", KEY_1));
        EncryptedValue value = cipher.encrypt(TOKEN, ACCOUNT_A, ACCESS_TOKEN);

        assertThat(properties.toString()).contains("k1").doesNotContain(KEY_1);
        assertThat(value.toString()).contains("k1").doesNotContain(value.ciphertext());
    }

    private static CredentialCipher cipher(String activeKeyId, Map<String, String> keys) {
        return new CredentialCipher(new CredentialEncryptionProperties(activeKeyId, keys));
    }

}
