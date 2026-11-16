package dev.sino.account.application;

import dev.sino.provider.spi.QrChallenge;

/** A QR connect just started: what the session keeps, and the code the browser shows. */
public record QrConnectStart(PendingQrConnect pending, QrChallenge challenge) {
}
