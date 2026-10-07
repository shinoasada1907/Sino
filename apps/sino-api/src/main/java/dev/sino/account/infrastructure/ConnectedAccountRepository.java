package dev.sino.account.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import dev.sino.account.domain.ConnectedAccount;
import dev.sino.provider.ProviderType;

public interface ConnectedAccountRepository extends JpaRepository<ConnectedAccount, UUID> {

    /** The accounts of one user, oldest first. */
    List<ConnectedAccount> findByOwnerIdOrderByCreatedAtAscIdAsc(UUID ownerId);

    /** The account with this ID, only when it belongs to this user. */
    Optional<ConnectedAccount> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The account behind the unique key {@code (user_id, provider, external_account_id)}. */
    Optional<ConnectedAccount> findByOwnerIdAndProviderAndExternalAccountId(UUID ownerId, ProviderType provider,
            String externalAccountId);

}
