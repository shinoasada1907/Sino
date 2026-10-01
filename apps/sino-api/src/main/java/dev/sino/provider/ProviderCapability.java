package dev.sino.provider;

/**
 * Something a provider can do. A connector declares only the capabilities it really supports, and callers
 * check them before calling an operation (FR-06).
 */
public enum ProviderCapability {

    /** Fetch conversations and messages through {@code fetchUpdates}. */
    READ_MESSAGES,

    /** Send messages and replies through {@code sendMessage}. */
    SEND_MESSAGES,

    /** Normalized messages carry attachment metadata. */
    ATTACHMENTS,

    /** Sync the read state back to the provider. */
    MARK_READ,

    /** Reactions on messages. */
    REACTIONS,

    /** The provider pushes changes to us instead of only being polled. */
    PUSH_WEBHOOK,

    /** The provider groups messages into threads or reply chains. */
    THREADS

}
