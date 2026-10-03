package dev.sino.account.infrastructure.crypto;

/**
 * Which credential column a value belongs to. Part of the associated data, so a value encrypted for one column
 * cannot be read from another.
 */
public enum CredentialField {

    /** The access token, or the single token of a {@code TOKEN} credential. */
    ACCESS_TOKEN("access_token"),

    REFRESH_TOKEN("refresh_token");

    private final String column;

    CredentialField(String column) {
        this.column = column;
    }

    public String column() {
        return column;
    }

}
