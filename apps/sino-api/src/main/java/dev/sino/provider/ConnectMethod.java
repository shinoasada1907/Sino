package dev.sino.provider;

/**
 * How an account of a provider is connected (D-285), so the web knows which step to show.
 */
public enum ConnectMethod {

    /** Through the provider's consent page, such as Gmail. */
    OAUTH2,

    /** By a QR code the user scans in the provider's own app, such as Zalo. */
    QR

}
