package dev.sino.provider.infrastructure.zalo;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.ErrorCode;
import dev.sino.common.error.SinoException;

/** Answers of the Zalo webhook (D-277, ZL-08) when a request does not carry the shared secret. */
enum ZaloWebhookErrorCode implements ErrorCode {

    /** Missing or wrong {@code Authorization: Bearer <SINO_ZALO_SECRET>} header. */
    PUSH_TOKEN_INVALID(ErrorCategory.UNAUTHENTICATED);

    private final ErrorCategory category;

    ZaloWebhookErrorCode(ErrorCategory category) {
        this.category = category;
    }

    @Override
    public ErrorCategory category() {
        return category;
    }

    static SinoException tokenInvalid() {
        return new SinoException(PUSH_TOKEN_INVALID, "The request carries no valid token of sino-zalo.");
    }

}
