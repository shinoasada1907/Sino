package dev.sino.account.api;

/** Where the browser goes next: the provider's consent page. */
record ConnectResponse(String authorizationUrl) {
}
