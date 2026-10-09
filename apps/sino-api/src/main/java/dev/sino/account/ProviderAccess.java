package dev.sino.account;

import java.util.UUID;

/**
 * The only way for another module to call the connector of an account (D-62). The account module loads and
 * decrypts the credential, refreshes an OAuth2 access token that is about to expire, and refreshes once more when
 * the provider refuses the token, so tokens never leave this module (D-15). Call it outside a transaction: it
 * talks to the provider.
 */
public interface ProviderAccess {

    /**
     * Runs {@code call} with the connector of the account and a context holding a credential the provider should
     * accept.
     *
     * @return what {@code call} returned
     * @throws dev.sino.common.error.SinoException with {@code ACCOUNT_NOT_FOUND} when there is no such account or it
     *         was removed, or with {@code UNKNOWN_PROVIDER} when its connector is gone
     * @throws dev.sino.provider.spi.ProviderException with {@code AUTH_EXPIRED} when the account has to be
     *         reconnected (its status is then {@link AccountStatus#AUTH_EXPIRED}, unless the user turned it off:
     *         a DISABLED account stays DISABLED); with {@code PROVIDER_UNAVAILABLE} when the account changed during
     *         the call, so trying again uses what is stored now; with another code when a refresh failed for another
     *         reason, the status left as it was; or whatever {@code call} throws
     * @throws IllegalStateException when called inside a transaction
     */
    <T> T call(UUID accountId, ProviderCall<T> call);

}
