package dev.sino.identity;

import java.util.UUID;

/**
 * Who is calling the API. Business code asks this instead of reading the security context. In the MVP every
 * authenticated caller is the owner configured in {@code sino.owner.*} (D-02, D-10).
 */
public interface CurrentUser {

    /**
     * The ID of the caller's {@code app_user}.
     *
     * @throws IllegalStateException when nobody is authenticated
     */
    UUID requireOwnerId();

}
