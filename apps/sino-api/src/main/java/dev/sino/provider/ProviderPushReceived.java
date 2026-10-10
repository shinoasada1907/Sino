package dev.sino.provider;

import java.time.Instant;
import java.util.Objects;

/**
 * A provider told Sino that the mailbox with this address changed (D-76), after the connector checked the notice
 * really came from the provider. Only a signal: whoever listens finds the accounts watched under the address and
 * reads their changes itself. The address names a person, so it is never printed.
 */
public record ProviderPushReceived(ProviderType provider, String address, Instant receivedAt) {

    public ProviderPushReceived {
        Objects.requireNonNull(provider, "provider must not be null");
        Objects.requireNonNull(address, "address must not be null");
        Objects.requireNonNull(receivedAt, "receivedAt must not be null");
    }

    @Override
    public String toString() {
        return "ProviderPushReceived[provider=" + provider + ", address=****, receivedAt=" + receivedAt + "]";
    }

}
