package dev.sino.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.lang.reflect.RecordComponent;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.provider.ProviderType;

class AccountSummaryTests {

    private static final UUID ID = UUID.fromString("0199c7a0-0000-7000-8000-000000000001");
    private static final UUID OWNER = UUID.fromString("0199c7a0-0000-7000-8000-000000000002");
    private static final ProviderType GMAIL = ProviderType.of("gmail");

    @Test
    void carriesNoCredentialAndNoProfileData() {
        assertThat(AccountSummary.class.getRecordComponents()).extracting(RecordComponent::getName)
                .containsExactly("id", "ownerId", "provider", "status", "externalAccountId", "syncEnabled");
    }

    @Test
    void everyFieldIsRequired() {
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(null, OWNER, GMAIL, AccountStatus.CONNECTED, "a@gmail.test", true))
                .withMessageContaining("id");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, null, GMAIL, AccountStatus.CONNECTED, "a@gmail.test", true))
                .withMessageContaining("ownerId");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, OWNER, null, AccountStatus.CONNECTED, "a@gmail.test", true))
                .withMessageContaining("provider");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, OWNER, GMAIL, null, "a@gmail.test", true))
                .withMessageContaining("status");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, OWNER, GMAIL, AccountStatus.CONNECTED, null, true))
                .withMessageContaining("externalAccountId");
    }

}
