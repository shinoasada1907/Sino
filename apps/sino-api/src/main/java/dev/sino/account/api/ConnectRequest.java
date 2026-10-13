package dev.sino.account.api;

import java.util.UUID;

/** Body of a connect: {@code accountId} names the account to reconnect; without it a new account is connected. */
record ConnectRequest(UUID accountId) {
}
