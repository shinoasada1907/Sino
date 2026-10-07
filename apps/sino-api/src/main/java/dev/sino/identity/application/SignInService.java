package dev.sino.identity.application;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import dev.sino.common.error.SinoException;
import dev.sino.identity.infrastructure.AppUserRepository;

/**
 * Checks who signs in and who is signed in. The web layer turns a successful sign-in into a session and cookies.
 */
@Service
public class SignInService {

    private final AuthenticationManager authenticationManager;
    private final AppUserRepository users;

    SignInService(AuthenticationManager authenticationManager, AppUserRepository users) {
        this.authenticationManager = authenticationManager;
        this.users = users;
    }

    /**
     * @return the authenticated owner
     * @throws SinoException with {@link IdentityErrorCode#INVALID_CREDENTIALS} for a wrong email or password alike
     */
    public Authentication authenticate(String email, String password) {
        try {
            return authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email,
                    password));
        } catch (BadCredentialsException e) {
            throw new SinoException(IdentityErrorCode.INVALID_CREDENTIALS, "Email or password is incorrect.");
        }
    }

    /** The signed-in user by the name of its authentication (the owner's email). */
    public OwnerProfile profileOf(String email) {
        return users.findByEmail(email)
                .map(user -> new OwnerProfile(user.email(), user.displayName()))
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("No such user"));
    }

    /** What the web app may know about the signed-in user. */
    public record OwnerProfile(String email, String displayName) {
    }

}
