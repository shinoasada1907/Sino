package dev.sino.account.api;

import java.util.UUID;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

/**
 * Body of a QR connect: {@code acceptRisk} says the user read that this way in is unofficial and may get the account
 * locked (D-272); {@code accountId} names the account to reconnect, without it a new account is connected.
 */
record QrConnectRequest(@NotNull @AssertTrue Boolean acceptRisk, UUID accountId) {
}
