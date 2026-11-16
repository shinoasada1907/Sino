package dev.sino.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import dev.sino.TestcontainersConfiguration;
import dev.sino.identity.infrastructure.AppUser;
import dev.sino.identity.infrastructure.AppUserRepository;
import dev.sino.identity.infrastructure.UserStatus;

@ExtendWith(OutputCaptureExtension.class)
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
    void theConfiguredNameCreatesTheOwnerOnTheFirstStart() {
        new OwnerProvisioner(users, new OwnerProperties("first@sino.test", "First Name", null)).run(null);

        assertThat(users.findByEmail("first@sino.test")).get()
                .extracting(AppUser::displayName, AppUser::status)
                .containsExactly("First Name", UserStatus.ACTIVE);
    }

    @Test
    @Transactional // rolled back, so the other tests still see the configured name
    void aNameEditedOnTheWebSurvivesARestartWithAnotherConfiguredName(CapturedOutput output) {
        AppUser owner = users.findByEmail("owner@sino.test").orElseThrow();
        owner.updateProfile("Edited On Web", null, null, null, null);
        users.saveAndFlush(owner);

        new OwnerProvisioner(users, new OwnerProperties("owner@sino.test", "Renamed By Config", null)).run(null);

        assertThat(users.findByEmail("owner@sino.test")).get()
                .extracting(AppUser::displayName).isEqualTo("Edited On Web");
        assertThat(users.count()).isEqualTo(1);
        assertThat(output).contains("keeps its stored display name");
    }

    @Test
    @Transactional
    void aRestartWithTheSameNameLogsNoWarningAboutIt(CapturedOutput output) {
        provisioner.run(null);

        assertThat(output).doesNotContain("keeps its stored display name");
    }

    @Test
    void theNewProfileColumnsAreNullForTheOwner() {
        AppUser owner = users.findByEmail("owner@sino.test").orElseThrow();

        assertThat(owner.phoneNumber()).isNull();
        assertThat(owner.jobTitle()).isNull();
        assertThat(owner.location()).isNull();
        assertThat(owner.bio()).isNull();
    }

    @Test
    void theDatabaseRejectsASecondUserWithTheSameEmail() {
        assertThatThrownBy(() -> users.saveAndFlush(new AppUser("owner@sino.test", "Copy")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

}
