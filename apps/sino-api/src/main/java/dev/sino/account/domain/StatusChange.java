package dev.sino.account.domain;

import java.util.Objects;

/**
 * A real change of {@link AccountStatus}. Actions that change nothing return no {@code StatusChange}, so no event
 * is published for them.
 */
public record StatusChange(AccountStatus from, AccountStatus to) {

    public StatusChange {
        Objects.requireNonNull(from, "from must not be null");
        Objects.requireNonNull(to, "to must not be null");
        if (from == to) {
            throw new IllegalArgumentException("A status change needs two different states");
        }
    }

}
