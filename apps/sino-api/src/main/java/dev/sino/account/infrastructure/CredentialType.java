package dev.sino.account.infrastructure;

/**
 * Stored form of the credential kinds of the provider contract (D-14).
 */
public enum CredentialType {

    /** {@code OAuth2Credentials}: access token, optional refresh token, expiry and scopes. */
    OAUTH2,

    /** {@code TokenCredentials}: one long-lived token, kept in the access token column. */
    TOKEN

}
