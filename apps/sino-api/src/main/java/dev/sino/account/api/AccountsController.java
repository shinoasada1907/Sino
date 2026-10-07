package dev.sino.account.api;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.account.application.AccountQueryService;
import dev.sino.account.domain.ConnectedAccount;
import dev.sino.identity.CurrentUser;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.spi.MessageProvider;

/**
 * Read side of the Account Management screen (02C §8). Always scoped to the current user.
 */
@RestController
@RequestMapping("/api/accounts")
class AccountsController {

    private final AccountQueryService accounts;
    private final ProviderRegistry providers;
    private final CurrentUser currentUser;

    AccountsController(AccountQueryService accounts, ProviderRegistry providers, CurrentUser currentUser) {
        this.accounts = accounts;
        this.providers = providers;
        this.currentUser = currentUser;
    }

    /** Oldest first. */
    @GetMapping
    List<AccountResponse> list() {
        return accounts.list(currentUser.requireOwnerId()).stream().map(this::toResponse).toList();
    }

    @GetMapping("/{id}")
    AccountResponse get(@PathVariable UUID id) {
        return toResponse(accounts.get(currentUser.requireOwnerId(), id));
    }

    // find, not get: an account outlives a removed connector and must still be listed, just without capabilities.
    private AccountResponse toResponse(ConnectedAccount account) {
        ProviderCapabilities capabilities = providers.find(account.provider())
                .map(MessageProvider::capabilities)
                .orElseGet(() -> ProviderCapabilities.of());
        return AccountResponse.from(account, capabilities);
    }

}
