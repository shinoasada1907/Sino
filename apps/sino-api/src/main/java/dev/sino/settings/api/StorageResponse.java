package dev.sino.settings.api;

import dev.sino.settings.application.StoredData;

/** Body of {@code GET /api/settings/storage} (D-403): {@code {messages, bytes}}; the web shows the bytes in MB. */
record StorageResponse(long messages, long bytes) {

    static StorageResponse from(StoredData stored) {
        return new StorageResponse(stored.messages(), stored.bytes());
    }

}
