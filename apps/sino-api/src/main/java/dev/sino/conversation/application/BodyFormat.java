package dev.sino.conversation.application;

/** What Sino keeps of a message's body (F06, D-122). */
public enum BodyFormat {

    /**
     * The message has no HTML, it was too long to keep, or its provider cannot give it again: its text is all there
     * is.
     */
    TEXT,

    /** Its HTML is kept, and shown cleaned. */
    HTML,

    /** Stored before Sino kept HTML: read again from the provider the first time it is opened. */
    UNCHECKED

}
