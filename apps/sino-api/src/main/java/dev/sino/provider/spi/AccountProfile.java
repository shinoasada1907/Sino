package dev.sino.provider.spi;

/**
 * The connected account as the provider describes it. {@code avatarUrl} and {@code address} are optional;
 * {@code address} is where others reach the account, such as the email address of a mailbox.
 */
public record AccountProfile(String externalAccountId, String displayName, String avatarUrl, String address) {

    public AccountProfile {
        PayloadChecks.requireText(externalAccountId, "externalAccountId");
        PayloadChecks.requireText(displayName, "displayName");
    }

}
