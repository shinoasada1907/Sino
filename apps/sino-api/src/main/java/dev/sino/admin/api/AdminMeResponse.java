package dev.sino.admin.api;

/**
 * Body of {@code GET /api/admin/me}: the email the admin signed in with.
 */
record AdminMeResponse(String email) {
}
