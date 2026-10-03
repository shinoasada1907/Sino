package dev.sino.account.infrastructure.crypto;

import java.util.UUID;

/**
 * A stored credential could not be decrypted: it was changed, moved to another account or column, or its key is
 * gone. A server-side failure (500); the message names the account, column and key ID, never the value.
 */
public class CredentialDecryptionException extends RuntimeException {

    CredentialDecryptionException(UUID accountId, CredentialField field, String keyId, String reason,
            Throwable cause) {
        super("Could not decrypt " + field.column() + " of account " + accountId + " with key '" + keyId + "': "
                + reason, cause);
    }

}
