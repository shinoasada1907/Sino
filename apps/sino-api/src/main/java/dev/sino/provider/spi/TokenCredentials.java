package dev.sino.provider.spi;

/**
 * A single long-lived token, for example a bot token.
 */
public record TokenCredentials(String token) implements ProviderCredentials {

    public TokenCredentials {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("token must not be blank");
        }
    }

    @Override
    public String toString() {
        return "TokenCredentials[token=****]";
    }

}
