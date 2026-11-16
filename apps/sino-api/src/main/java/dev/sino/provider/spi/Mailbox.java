package dev.sino.provider.spi;

/**
 * The folder a provider keeps a message in (D-498). Only providers with folders report one; a chat connector leaves
 * {@code NormalizedMessage#mailbox} null.
 */
public enum Mailbox {
    INBOX,
    ARCHIVE,
    SPAM,
    TRASH
}
