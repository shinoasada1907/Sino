package dev.sino.provider.spi;

/**
 * Decrypted credentials for one call to a connector. They live only in memory, never appear in an API
 * response or an event, and every implementation masks its secret in {@code toString()}.
 */
public sealed interface ProviderCredentials permits OAuth2Credentials, TokenCredentials {
}
