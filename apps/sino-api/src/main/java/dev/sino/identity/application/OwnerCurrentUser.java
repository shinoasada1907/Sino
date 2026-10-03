package dev.sino.identity.application;

import java.util.UUID;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import dev.sino.identity.CurrentUser;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * MVP {@link CurrentUser}: every authenticated caller is the configured owner (D-02 A). The owner's ID is looked
 * up once and then kept, since it never changes while the application runs.
 */
@Component
class OwnerCurrentUser implements CurrentUser {

    private final AppUserRepository users;
    private final OwnerProperties owner;
    private volatile UUID ownerId;

    OwnerCurrentUser(AppUserRepository users, OwnerProperties owner) {
        this.users = users;
        this.owner = owner;
    }

    @Override
    public UUID requireOwnerId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            throw new IllegalStateException("No authenticated user");
        }
        UUID id = ownerId;
        if (id == null) {
            id = users.findIdByEmail(owner.email())
                    .orElseThrow(() -> new IllegalStateException("The owner user has not been created yet"));
            ownerId = id;
        }
        return id;
    }

}
