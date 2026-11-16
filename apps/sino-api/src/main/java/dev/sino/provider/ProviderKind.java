package dev.sino.provider;

/**
 * Whether a provider is a mailbox or a messenger. It decides the screen of all its conversations: Hộp thư for
 * {@code EMAIL}, Tin nhắn for {@code CHAT} (f05c, D-306).
 */
public enum ProviderKind {

    /** Email, such as Gmail: threads with a subject, shown in Hộp thư. */
    EMAIL,

    /** Messaging, such as Zalo or Messenger: chats and groups, shown in Tin nhắn. */
    CHAT

}
