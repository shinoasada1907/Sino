package dev.sino.account.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.provider.ProviderType;

/**
 * Removed accounts (D-13 B) stay in the table, so every query the API uses says {@code RemovedAtIsNull} in its
 * name. Only the lookup by unique key also sees removed accounts, so that connecting one again brings it back.
 */
public interface ConnectedAccountRepository extends JpaRepository<ConnectedAccount, UUID> {

    /** The accounts of one user that are not removed, oldest first. */
    List<ConnectedAccount> findByOwnerIdAndRemovedAtIsNullOrderByCreatedAtAscIdAsc(UUID ownerId);

    /** The account with this ID, only when it belongs to this user and is not removed. */
    Optional<ConnectedAccount> findByIdAndOwnerIdAndRemovedAtIsNull(UUID id, UUID ownerId);

    /** The account behind the unique key {@code (user_id, provider, external_account_id)}, removed or not. */
    Optional<ConnectedAccount> findByOwnerIdAndProviderAndExternalAccountId(UUID ownerId, ProviderType provider,
            String externalAccountId);

}
