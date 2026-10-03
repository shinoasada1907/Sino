package dev.sino.account.infrastructure;

import static dev.sino.account.infrastructure.crypto.CredentialField.REFRESH_TOKEN;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import dev.sino.TestcontainersConfiguration;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.account.infrastructure.crypto.CredentialCipher;
import dev.sino.account.infrastructure.crypto.CredentialDecryptionException;
import dev.sino.account.infrastructure.crypto.CredentialEncryptionProperties;
import dev.sino.account.infrastructure.crypto.EncryptedValue;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.TokenCredentials;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ TestcontainersConfiguration.class, CredentialStore.class, CredentialCipher.class })
@ActiveProfiles("test")
class CredentialStoreTests {

    // Fake keys, not secrets. k1 is the active key of the test profile.
    private static final String KEY_1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    private static final String KEY_2 = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=";

    private static final String ACCESS = "ya29.sample-access-token";
    private static final String REFRESH = "1//sample-refresh-token";
    private static final OAuth2Credentials OAUTH = new OAuth2Credentials(ACCESS,
            Instant.parse("2026-10-03T10:15:30Z"), Set.of("gmail.readonly", "gmail.send"));

    @Autowired
    private CredentialStore store;

    @Autowired
    private AccountCredentialRepository credentialRows;

    @Autowired
    private ConnectedAccountRepository accounts;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID accountA;
    private UUID accountB;

    @BeforeEach
    void createAccounts() {
        UUID owner = users.save(new AppUser("alice@example.com", "Alice")).id();
        ProviderType gmail = ProviderType.of("gmail");
        accountA = accounts.save(ConnectedAccount.register(owner, gmail, "a@gmail.com", "A", null)).id();
        accountB = accounts.save(ConnectedAccount.register(owner, gmail, "b@gmail.com", "B", null)).id();
    }

    @Test
    void readsBackAnOAuth2Credential() {
        store.save(accountA, OAUTH, REFRESH);
        clearCache();

        assertThat(store.load(accountA)).contains(OAUTH);
    }

    @Test
    void readsBackAToken() {
        store.save(accountA, new TokenCredentials("bot-token-123"), null);
        clearCache();

        assertThat(store.load(accountA)).contains(new TokenCredentials("bot-token-123"));
    }

    @Test
    void neverWritesASecretInPlainText() {
        store.save(accountA, OAUTH, REFRESH);
        clearCache();

        String row = jdbc.queryForObject("select row_to_json(c)::text from account_credential c where account_id = ?",
                String.class, accountA);

        assertThat(row).doesNotContain(ACCESS).doesNotContain(REFRESH)
                .contains("\"encryption_key_id\":\"k1\"")
                .contains("gmail.readonly");
    }

    @Test
    void aSecondSaveReplacesTheWholeCredential() {
        store.save(accountA, OAUTH, REFRESH);
        OAuth2Credentials renewed = new OAuth2Credentials("ya29.new-access-token", null, Set.of("gmail.readonly"));

        store.save(accountA, renewed, null);
        clearCache();

        assertThat(store.load(accountA)).contains(renewed);
        assertThat(jdbc.queryForObject("select count(*) from account_credential where account_id = ?", Long.class,
                accountA)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select refresh_token_enc from account_credential where account_id = ?",
                String.class, accountA)).isNull();
    }

    @Test
    void aCiphertextCopiedToAnotherAccountCannotBeRead() {
        store.save(accountA, OAUTH, REFRESH);
        store.save(accountB, new OAuth2Credentials("ya29.b-token", null, Set.of()), null);
        clearCache();

        jdbc.update("update account_credential set access_token_enc = "
                + "(select access_token_enc from account_credential where account_id = ?) where account_id = ?",
                accountA, accountB);

        assertThatThrownBy(() -> store.load(accountB)).isInstanceOf(CredentialDecryptionException.class);
    }

    @Test
    void afterAKeyRotationASaveMovesEverySecretToTheNewKey() {
        store.save(accountA, OAUTH, REFRESH);
        clearCache();
        CredentialCipher rotatedCipher = new CredentialCipher(
                new CredentialEncryptionProperties("k2", Map.of("k1", KEY_1, "k2", KEY_2)));
        CredentialStore rotated = new CredentialStore(credentialRows, rotatedCipher);

        assertThat(rotated.load(accountA)).as("still readable with the old key").contains(OAUTH);

        rotated.save(accountA, new OAuth2Credentials("ya29.after-rotation", null, Set.of()), REFRESH);
        clearCache();

        Map<String, Object> row = jdbc.queryForMap(
                "select encryption_key_id, refresh_token_enc from account_credential where account_id = ?", accountA);
        assertThat(row.get("encryption_key_id")).isEqualTo("k2");
        assertThat(rotatedCipher.decrypt(new EncryptedValue("k2", (String) row.get("refresh_token_enc")), accountA,
                REFRESH_TOKEN)).isEqualTo(REFRESH);
    }

    @Test
    void deletingTheAccountDeletesItsCredential() {
        store.save(accountA, OAUTH, REFRESH);
        clearCache();

        jdbc.update("delete from connected_account where id = ?", accountA);

        assertThat(store.load(accountA)).isEmpty();
    }

    @Test
    void deleteRemovesTheCredential() {
        store.save(accountA, OAUTH, REFRESH);

        store.delete(accountA);
        clearCache();

        assertThat(store.load(accountA)).isEmpty();
    }

    @Test
    void anAccountWithoutCredentialHasNone() {
        assertThat(store.load(accountB)).isEmpty();
    }

    @Test
    void aTokenCredentialHasNoRefreshToken() {
        assertThatThrownBy(() -> store.save(accountA, new TokenCredentials("bot-token-123"), REFRESH))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageNotContaining(REFRESH);
    }

    @Test
    void aFailedSaveNeverShowsTheSecrets() {
        UUID noSuchAccount = UUID.randomUUID();

        assertThatThrownBy(() -> {
            store.save(noSuchAccount, OAUTH, REFRESH);
            entityManager.flush();
        }).satisfies(failure -> assertThat(stackTraceOf(failure))
                .contains("account_credential_account_fk")
                .doesNotContain(ACCESS)
                .doesNotContain(REFRESH));
    }

    @Test
    void theDatabaseRefusesAnUnknownCredentialType() {
        store.save(accountA, OAUTH, REFRESH);
        clearCache();

        assertThatThrownBy(() -> jdbc.update(
                "update account_credential set credential_type = 'PASSWORD' where account_id = ?", accountA))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("account_credential_type_ck");
    }

    private void clearCache() {
        entityManager.flush();
        entityManager.clear();
    }

    private static String stackTraceOf(Throwable failure) {
        StringWriter out = new StringWriter();
        failure.printStackTrace(new PrintWriter(out));
        return out.toString();
    }

}
