package dev.sino.identity.application;

/**
 * What {@code PATCH /api/profile} asks for. A {@code null} field stays as it is; an empty one clears an optional
 * field (and is refused for the display name).
 */
public record ProfileChange(String displayName, String phoneNumber, String jobTitle, String location, String bio) {
}
