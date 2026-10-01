package dev.sino.provider.spi;

/**
 * Delivery state of a message as the provider reports it (02B).
 */
public enum MessageStatus {

    PENDING,
    SENT,
    DELIVERED,
    READ,
    FAILED,

    /** The provider's state has no Sino equivalent. */
    UNKNOWN

}
