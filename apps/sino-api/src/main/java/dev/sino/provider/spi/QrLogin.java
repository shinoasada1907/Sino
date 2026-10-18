package dev.sino.provider.spi;

/**
 * How a connector is connected by a QR code the user scans in the provider's own app (D-275). The {@code account}
 * module drives it: it starts a login, asks where it is until it ends, and cancels it when the user gives up; it, not
 * the connector, registers the account. Every call may throw a {@link ProviderException}.
 */
public interface QrLogin {

    /** A new login and the QR code to scan. */
    QrChallenge start();

    /**
     * Where the login is. {@link QrLoginState.Done} comes once: the connector forgets the login after it, and so it
     * does once the login ended otherwise or is unknown to it ({@link QrLoginState.Failed}).
     */
    QrLoginState status(String loginId);

    /** Ends the login; nothing happens when it is over or unknown. */
    void cancel(String loginId);

}
