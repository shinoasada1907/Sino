package dev.sino.conversation.application;

/** Whether the user can reply in a conversation from Sino, and if not, what would change that (F10, D-130). */
public enum ReplyState {

    READY,

    /** The provider sends, but the account has not granted the scopes to send: reconnecting grants them. */
    NEEDS_PERMISSION,

    /** The account must be reconnected or enabled first. */
    ACCOUNT_UNAVAILABLE,

    /** The provider does not send from Sino at all; the user replies in the provider's own app. */
    NOT_SUPPORTED

}
