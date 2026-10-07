package dev.sino.provider.spi;

/**
 * The connected account as the provider describes it. {@code avatarUrl} is optional.
 */
public record AccountProfile(String externalAccountId, String displayName, String avatarUrl) {

    public AccountProfile {
        PayloadChecks.requireText(externalAccountId, "externalAccountId");
        PayloadChecks.requireText(displayName, "displayName");
    }

}
