package dev.sino.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.lang.reflect.RecordComponent;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import dev.sino.provider.ProviderType;

class AccountSummaryTests {

    private static final UUID ID = UUID.fromString("0199c7a0-0000-7000-8000-000000000001");
    private static final ProviderType GMAIL = ProviderType.of("gmail");

    @Test
    void carriesNoCredentialAndNoProfileData() {
        assertThat(AccountSummary.class.getRecordComponents()).extracting(RecordComponent::getName)
                .containsExactly("id", "provider", "status", "externalAccountId");
    }

    @Test
    void everyFieldIsRequired() {
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(null, GMAIL, AccountStatus.CONNECTED, "a@gmail.test"))
                .withMessageContaining("id");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, null, AccountStatus.CONNECTED, "a@gmail.test"))
                .withMessageContaining("provider");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, GMAIL, null, "a@gmail.test"))
                .withMessageContaining("status");
        assertThatNullPointerException()
                .isThrownBy(() -> new AccountSummary(ID, GMAIL, AccountStatus.CONNECTED, null))
                .withMessageContaining("externalAccountId");
    }

}
