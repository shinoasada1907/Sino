package dev.sino.notes.api;

/** Checks shared by the request bodies of the notes. */
final class Texts {

    /**
     * No NUL character (U+0000): PostgreSQL refuses it in {@code text} and {@code varchar}, which would end as a 500
     * instead of a 400 (as in the planner, review BE-71).
     */
    static final String WITHOUT_NUL = "[^\\x00]*";

    static final String WITHOUT_NUL_MESSAGE = "must not contain the NUL character";

    private Texts() {
    }

}
