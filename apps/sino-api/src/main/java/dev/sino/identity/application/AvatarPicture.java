package dev.sino.identity.application;

/**
 * The picture of a user as {@code GET /api/profile/avatar} sends it. {@code etag} is quoted, ready for the header.
 */
public record AvatarPicture(String contentType, byte[] content, String etag) {
}
