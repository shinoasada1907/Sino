package dev.sino.provider.spi;

import java.time.Instant;

/**
 * The provider notifies Sino of changes to the account until {@code expiresAt} (D-76). Its notices carry
 * {@code address}, the provider's own name for the mailbox, by which Sino finds the account again. The address is
 * never printed: it names a person.
 */
public record PushRegistration(String address, Instant expiresAt) {

    public PushRegistration {
        PayloadChecks.requireText(address, "address");
        PayloadChecks.requireValue(expiresAt, "expiresAt");
    }

    @Override
    public String toString() {
        return "PushRegistration[address=****, expiresAt=" + expiresAt + "]";
    }

}
