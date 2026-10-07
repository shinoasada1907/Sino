package dev.sino.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;

import org.junit.jupiter.api.Test;

/**
 * The events are the public API of the account module: other modules may store and log them, so each one carries
 * IDs, the provider, states and a time only (spec "Event của account"), never a credential or profile data.
 */
class AccountEventsTests {

    @Test
    void accountConnectedHoldsOnlyIdsProviderFlagAndTime() {
        assertThat(componentsOf(AccountConnected.class))
                .containsExactly("accountId", "ownerId", "provider", "reconnected", "occurredAt");
    }

    @Test
    void accountStatusChangedHoldsOnlyTheIdBothStatesAndTime() {
        assertThat(componentsOf(AccountStatusChanged.class)).containsExactly("accountId", "from", "to", "occurredAt");
    }

    @Test
    void accountRemovedHoldsOnlyIdsProviderAndTime() {
        assertThat(componentsOf(AccountRemoved.class)).containsExactly("accountId", "ownerId", "provider", "occurredAt");
    }

    private static String[] componentsOf(Class<? extends Record> event) {
        RecordComponent[] components = event.getRecordComponents();
        String[] names = new String[components.length];
        for (int i = 0; i < components.length; i++) {
            names[i] = components[i].getName();
        }
        return names;
    }

}
