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
 * start only when the context, and with it the migrated database, is ready. Idempotent: the email is the key. The
 * configured display name is used only when the owner is created; after that the stored name wins, because the user
 * edits it on the Profile screen (D-476).
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
        AppUser user = users.findByEmail(owner.email()).orElse(null);
        if (user == null) {
            user = users.save(new AppUser(owner.email(), owner.displayName()));
        } else if (!user.displayName().equals(owner.displayName())) {
            log.info("Owner user {} keeps its stored display name; SINO_OWNER_DISPLAY_NAME differs and only applies "
                    + "when the owner is first created, change the name on the Profile screen", user.id());
        }
        log.info("Owner user {} is ready", user.id());
    }

}
