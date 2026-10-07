package dev.sino.identity.application;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

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
    private final LoginAttempts attempts;
    private final AppUserRepository users;

    SignInService(AuthenticationManager authenticationManager, LoginAttempts attempts, AppUserRepository users) {
        this.authenticationManager = authenticationManager;
        this.attempts = attempts;
        this.users = users;
    }

    /**
     * A locked email is refused before the password is even compared, so a locked account tells nothing about
     * whether a guess was right.
     *
     * @return the authenticated owner
     * @throws SinoException with {@link IdentityErrorCode#INVALID_CREDENTIALS} and {@code remainingAttempts} for a
     *         wrong email or password alike, or {@link IdentityErrorCode#LOGIN_LOCKED} and
     *         {@code retryAfterSeconds} while the email is locked (D-35)
     */
    public Authentication authenticate(String email, String password) {
        Optional<Duration> locked = attempts.lockedFor(email);
        if (locked.isPresent()) {
            throw lockedFor(locked.get());
        }
        try {
            Authentication authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(email, password));
            attempts.recordSuccess(email);
            return authentication;
        } catch (BadCredentialsException e) {
            int remainingAttempts = attempts.recordFailure(email);
            if (remainingAttempts == 0) {
                throw lockedFor(LoginAttempts.LOCK_TIME);
            }
            throw new SinoException(IdentityErrorCode.INVALID_CREDENTIALS, "Email or password is incorrect.",
                    Map.of("remainingAttempts", remainingAttempts));
        }
    }

    /** The signed-in user by the name of its authentication (the owner's email). */
    public OwnerProfile profileOf(String email) {
        return users.findByEmail(email)
                .map(user -> new OwnerProfile(user.email(), user.displayName()))
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("No such user"));
    }

    // Whole seconds, rounded up, so the client never retries a moment too early.
    private static SinoException lockedFor(Duration remaining) {
        long seconds = remaining.toSeconds() + (remaining.toNanosPart() > 0 ? 1 : 0);
        return new SinoException(IdentityErrorCode.LOGIN_LOCKED, "Too many failed sign-ins. Try again later.",
                Map.of("retryAfterSeconds", seconds));
    }

    /** What the web app may know about the signed-in user. */
    public record OwnerProfile(String email, String displayName) {
    }

}
