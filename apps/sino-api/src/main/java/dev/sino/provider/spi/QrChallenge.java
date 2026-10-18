package dev.sino.provider.spi;

import java.time.Instant;
import java.util.Objects;

/**
 * A login waiting for its QR code to be scanned: {@code qrImage} is the code as a PNG, in base64, and the code stops
 * working at {@code expiresAt}.
 */
public record QrChallenge(String loginId, String qrImage, Instant expiresAt) {

    public QrChallenge {
        PayloadChecks.requireText(loginId, "loginId");
        PayloadChecks.requireText(qrImage, "qrImage");
        Objects.requireNonNull(expiresAt, "expiresAt must not be null");
    }

    // A few kilobytes of base64 have no place in a log line.
    @Override
    public String toString() {
        return "QrChallenge[loginId=" + loginId + ", expiresAt=" + expiresAt + "]";
    }

}
