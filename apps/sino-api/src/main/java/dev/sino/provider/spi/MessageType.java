package dev.sino.provider.spi;

/**
 * Kind of message content, the same for every provider (02B).
 */
public enum MessageType {

    TEXT,
    IMAGE,
    FILE,
    AUDIO,
    VIDEO,

    /** Written by the provider rather than a person, for example "Alice joined the group". */
    SYSTEM,

    /** More than one kind of content in the same message. */
    MIXED,

    /** The provider's kind has no Sino equivalent. */
    UNKNOWN

}
