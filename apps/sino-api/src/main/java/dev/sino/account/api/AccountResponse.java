package dev.sino.account.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;

/**
 * One account in the account API. Mapped field by field, so no credential and no internal field (owner, version)
 * can reach the client. Capabilities are their UPPER_SNAKE_CASE names.
 */
record AccountResponse(UUID id, String provider, String externalAccountId, String displayName, String avatarUrl,
        String status, boolean syncEnabled, Instant lastSyncedAt, List<String> capabilities, Instant createdAt,
        Instant updatedAt) {

    static AccountResponse from(ConnectedAccount account, ProviderCapabilities capabilities) {
        List<String> capabilityNames = capabilities.values().stream()
                .map(ProviderCapability::name)
                .toList();
        return new AccountResponse(account.id(), account.provider().value(), account.externalAccountId(),
                account.displayName(), account.avatarUrl(), account.status().name(), account.syncEnabled(),
                account.lastSyncedAt(), capabilityNames, account.createdAt(), account.updatedAt());
    }

}
