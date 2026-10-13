package dev.sino.admin.application;

import java.time.Instant;
import java.util.UUID;

/**
 * A connected account as the admin sees it: metadata, the number of stored messages and how its reading goes. Never
 * a message, a credential or the provider's own ID (D-264).
 */
public record AccountView(UUID id, UUID ownerId, String provider, String address, String status,
        boolean syncEnabled, Instant createdAt, long storedMessages, SyncView sync) {
}
