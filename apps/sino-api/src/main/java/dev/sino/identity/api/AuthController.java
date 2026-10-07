package dev.sino.identity.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.RememberMeServices;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.identity.application.SignInService;

/**
 * Browser sign-in (D-22 A). Sign-out is {@code POST /api/auth/logout}, handled by Spring Security's logout filter.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

    private final SignInService signIn;
    private final RememberMeServices rememberMeServices;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
    private final SessionAuthenticationStrategy newSessionId = new ChangeSessionIdAuthenticationStrategy();

    AuthController(SignInService signIn, RememberMeServices rememberMeServices) {
        this.signIn = signIn;
        this.rememberMeServices = rememberMeServices;
    }

    /** Public, so the browser can ask "am I signed in?" and get its CSRF cookie; 401 when nobody is signed in. */
    @GetMapping("/me")
    MeResponse me(Authentication authentication) {
        if (authentication == null) {
            throw new AuthenticationCredentialsNotFoundException("Not signed in");
        }
        return MeResponse.from(signIn.profileOf(authentication.getName()));
    }

    /**
     * Checks the password, then gives the browser a session under a new ID (against session fixation) and, when
     * asked, a remember-me cookie.
     */
    @PostMapping("/login")
    ResponseEntity<Void> login(@Valid @RequestBody LoginRequest login, HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = signIn.authenticate(login.email(), login.password());

        newSessionId.onAuthentication(authentication, request, response);
        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        contextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        if (login.keepSignedIn()) {
            // No credentials in the token: the services sign the cookie with their own stand-in for the password.
            rememberMeServices.loginSuccess(request, response, UsernamePasswordAuthenticationToken.authenticated(
                    authentication.getName(), null, authentication.getAuthorities()));
        }
        return ResponseEntity.noContent().build();
    }

}
