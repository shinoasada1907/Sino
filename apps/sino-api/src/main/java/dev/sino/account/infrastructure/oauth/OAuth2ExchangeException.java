package dev.sino.account.infrastructure.oauth;

import java.io.Serial;

/** The code could not be exchanged for tokens. The message names the failure only, never a code or a token. */
public class OAuth2ExchangeException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    OAuth2ExchangeException(String message) {
        super(message);
    }

}
