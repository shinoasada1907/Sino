package dev.sino.account.application;

import java.util.Objects;
import java.util.UUID;

/**
 * Where a QR connect is, as the web shows it (D-275): {@code displayName} once scanned, {@code accountId} and
 * {@code reconnected} once done, {@code code} once failed.
 */
public record QrConnectStatus(State state, String displayName, UUID accountId, Boolean reconnected,
        ConnectErrorCode code) {

    public enum State {
        WAITING, SCANNED, DONE, EXPIRED, DECLINED, FAILED
    }

    public QrConnectStatus {
        Objects.requireNonNull(state, "state must not be null");
    }

    static QrConnectStatus waiting() {
        return new QrConnectStatus(State.WAITING, null, null, null, null);
    }

    static QrConnectStatus scanned(String displayName) {
        return new QrConnectStatus(State.SCANNED, displayName, null, null, null);
    }

    static QrConnectStatus done(UUID accountId, boolean reconnected) {
        return new QrConnectStatus(State.DONE, null, accountId, reconnected, null);
    }

    static QrConnectStatus ended(State state) {
        return new QrConnectStatus(state, null, null, null, null);
    }

    static QrConnectStatus failed(ConnectErrorCode code) {
        return new QrConnectStatus(State.FAILED, null, null, null, code);
    }

    /** Over: the login will not change any more, so the session forgets it. */
    public boolean over() {
        return state != State.WAITING && state != State.SCANNED;
    }

}
