package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.identity.infrastructure.UserStatus;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class OwnerProvisioningTests {

    @Autowired
    private AppUserRepository users;

    @Autowired
    private OwnerProvisioner provisioner;

    @Test
    void theOwnerExistsAfterStartup() {
        AppUser owner = users.findByEmail("owner@sino.test").orElseThrow();

        assertThat(owner.displayName()).isEqualTo("Test Owner");
        assertThat(owner.status()).isEqualTo(UserStatus.ACTIVE);
        assertThat(owner.id().version()).as("UUIDv7 (D-08)").isEqualTo(7);
    }

    @Test
    void startingAgainCreatesNoSecondOwner() {
        provisioner.run(null);

        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    @Transactional // rolled back, so the other tests still see the configured name
    void aChangedDisplayNameIsWrittenBack() {
        new OwnerProvisioner(users, new OwnerProperties("owner@sino.test", "Renamed Owner", null)).run(null);

        assertThat(users.findByEmail("owner@sino.test")).get()
                .extracting(AppUser::displayName).isEqualTo("Renamed Owner");
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void theDatabaseRejectsASecondUserWithTheSameEmail() {
        assertThatThrownBy(() -> users.saveAndFlush(new AppUser("owner@sino.test", "Copy")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

}
