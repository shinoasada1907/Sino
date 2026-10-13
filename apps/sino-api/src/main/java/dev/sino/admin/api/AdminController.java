package dev.sino.admin.api;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The API of the person who runs Sino (D-260). Only a caller with the role {@code ADMIN} gets here; the security
 * chain answers everyone else with 401 or 403 (D-263).
 */
@RestController
@RequestMapping("/api/admin")
class AdminController {

    /** Who is signed in as admin; the admin's counterpart of {@code GET /api/auth/me} (D-262). */
    @GetMapping("/me")
    AdminMeResponse me(Authentication authentication) {
        return new AdminMeResponse(authentication.getName());
    }

}
