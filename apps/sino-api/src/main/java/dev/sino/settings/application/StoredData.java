package dev.sino.settings.application;

/**
 * What Sino keeps for a user (D-403): {@code messages}, the mail and chat messages of every account, and about how many
 * {@code bytes} they and the stickers take in the database.
 */
public record StoredData(long messages, long bytes) {
}
