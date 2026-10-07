package dev.sino.account.infrastructure;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface AccountCredentialRepository extends JpaRepository<AccountCredential, UUID> {

    Optional<AccountCredential> findByAccountId(UUID accountId);

    void deleteByAccountId(UUID accountId);

}
