package dev.sino.account.application;

import java.io.Serial;

/** A connect that ended with {@link #code()} instead of an account. */
public class ConnectFailure extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private final ConnectErrorCode code;

    ConnectFailure(ConnectErrorCode code) {
        super(code.name());
        this.code = code;
    }

    public ConnectErrorCode code() {
        return code;
    }

}
