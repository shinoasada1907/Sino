package dev.sino.identity.application;

import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.identity.UserDirectory;
import dev.sino.identity.UserSummary;
import dev.sino.identity.infrastructure.AppUserRepository;

/** {@link UserDirectory} over the user table. */
@Service
@Transactional(readOnly = true)
public class UserDirectoryService implements UserDirectory {

    // The ID breaks ties of the same moment: UUIDv7 keeps the order in which users were made.
    private static final Sort OLDEST_FIRST = Sort.by("createdAt", "id");

    private final AppUserRepository users;

    UserDirectoryService(AppUserRepository users) {
        this.users = users;
    }

    @Override
    public List<UserSummary> allUsers() {
        return users.findAll(OLDEST_FIRST).stream()
                .map(user -> new UserSummary(user.id(), user.email(), user.displayName(), user.status().name(),
                        user.createdAt()))
                .toList();
    }

}
