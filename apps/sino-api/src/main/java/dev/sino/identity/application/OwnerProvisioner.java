package dev.sino.identity.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * Makes sure the owner from {@code sino.owner.*} exists, once per startup. Runs after Flyway, because runners
 * start only when the context, and with it the migrated database, is ready. Idempotent: the email is the key, a
 * changed display name is written back.
 */
@Component
@EnableConfigurationProperties(OwnerProperties.class)
class OwnerProvisioner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OwnerProvisioner.class);

    private final AppUserRepository users;
    private final OwnerProperties owner;

    OwnerProvisioner(AppUserRepository users, OwnerProperties owner) {
        this.users = users;
        this.owner = owner;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        AppUser user = users.findByEmail(owner.email())
                .orElseGet(() -> new AppUser(owner.email(), owner.displayName()));
        user.rename(owner.displayName());
        user = users.save(user);
        log.info("Owner user {} is ready", user.id());
    }

}
