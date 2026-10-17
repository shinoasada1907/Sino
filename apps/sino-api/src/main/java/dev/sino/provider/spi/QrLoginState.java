package dev.sino.provider.spi;

import java.util.Objects;

/**
 * Where a QR login is (D-275). Only {@link Done} carries the account and its credential, which print masked like every
 * credential; {@link Failed} says why for the log only, never for the user.
 */
public sealed interface QrLoginState {

    /** The code is shown and nobody has scanned it yet. */
    record Waiting() implements QrLoginState {
    }

    /** Scanned by {@code displayName}, who has not confirmed on the phone yet. */
    record Scanned(String displayName) implements QrLoginState {
    }

    /** Confirmed: the account and the credential Sino keeps for it. */
    record Done(AccountProfile profile, ProviderCredentials credentials) implements QrLoginState {

        public Done {
            Objects.requireNonNull(profile, "profile must not be null");
            Objects.requireNonNull(credentials, "credentials must not be null");
        }

    }

    /** The code ran out before anyone confirmed. */
    record Expired() implements QrLoginState {
    }

    /** The user said no on the phone. */
    record Declined() implements QrLoginState {
    }

    /** The login broke off, or the connector does not know it (any more). */
    record Failed(String reason) implements QrLoginState {
    }

}
