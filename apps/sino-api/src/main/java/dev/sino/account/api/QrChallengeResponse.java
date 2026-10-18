package dev.sino.account.api;

import java.time.Instant;

/** The code to show: {@code qrImage} is a PNG in base64, scannable until {@code expiresAt}. */
record QrChallengeResponse(String loginId, String qrImage, Instant expiresAt) {
}
