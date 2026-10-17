package dev.sino.account.api;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

import dev.sino.account.application.QrConnectStatus;

/**
 * Where a QR connect is: {@code state}, with {@code displayName} once scanned, {@code accountId} and
 * {@code reconnected} once done, and {@code code} once failed; the other fields are left out.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
record QrStatusResponse(String state, String displayName, UUID accountId, Boolean reconnected, String code) {

    static QrStatusResponse from(QrConnectStatus status) {
        return new QrStatusResponse(status.state().name(), status.displayName(), status.accountId(),
                status.reconnected(), status.code() == null ? null : status.code().name());
    }

}
