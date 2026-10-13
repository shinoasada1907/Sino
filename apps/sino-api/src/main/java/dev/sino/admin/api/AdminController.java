package dev.sino.admin.api;

import java.time.Clock;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.admin.application.AdminQueries;

/**
 * The API of the person who runs Sino (D-260): read only, numbers and statuses, never mail (D-264). Only a caller
 * with the role {@code ADMIN} gets here; the security chain answers everyone else with 401 or 403 (D-263).
 */
@RestController
@RequestMapping("/api/admin")
class AdminController {

    private final AdminQueries queries;
    private final Clock clock;

    AdminController(AdminQueries queries, Clock clock) {
        this.queries = queries;
        this.clock = clock;
    }

    /** Who is signed in as admin; the admin's counterpart of {@code GET /api/auth/me} (D-262). */
    @GetMapping("/me")
    AdminMeResponse me(Authentication authentication) {
        return new AdminMeResponse(authentication.getName());
    }

    @GetMapping("/overview")
    OverviewResponse overview() {
        return OverviewResponse.from(clock.instant(), queries.overview());
    }

    @GetMapping("/users")
    UsersResponse users() {
        return new UsersResponse(clock.instant(), queries.users());
    }

    @GetMapping("/accounts")
    AccountsResponse accounts() {
        return new AccountsResponse(clock.instant(), queries.accounts());
    }

}
