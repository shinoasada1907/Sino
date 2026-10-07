package dev.sino.provider.spi;

/**
 * Kind of conversation, the same for every provider (02B).
 */
public enum ConversationType {

    DIRECT,
    GROUP,
    THREAD,
    CHANNEL,

    /** The provider's kind has no Sino equivalent. */
    UNKNOWN

}
