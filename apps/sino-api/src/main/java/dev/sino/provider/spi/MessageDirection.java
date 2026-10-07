package dev.sino.provider.spi;

/**
 * Whether the connected account received or sent the message. Always known, so there is no {@code UNKNOWN}.
 */
public enum MessageDirection {

    INBOUND,
    OUTBOUND

}
