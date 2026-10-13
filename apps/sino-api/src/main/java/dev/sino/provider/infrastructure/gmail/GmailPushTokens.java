package dev.sino.provider.infrastructure.gmail;

import java.net.MalformedURLException;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtAudienceValidator;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.jwk.source.RateLimitReachedException;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;

import dev.sino.common.error.SinoException;

/**
 * Checks the OIDC token Cloud Pub/Sub sends with each push of Gmail's notices (D-76): signed with one of Google's
 * keys (RS256), not expired ({@code exp} required), issued by Google, for the configured audience, and for the push
 * subscription's service account with a verified email. Sino keeps no secret of Google's for this: Google's public
 * keys are fetched and kept 5 minutes, and fetched at most twice every 30 seconds, so a token naming an unknown key
 * cannot make Sino call Google on every request. A refusal is never silent: a token Google signed that fails a check
 * (a wrong audience or service account in the settings) and keys that cannot be fetched are said at most once a
 * minute, by the name of the check only; tokens that are not Google's are only DEBUG, since anyone can send them.
 */
final class GmailPushTokens {

    static final Set<String> GOOGLE_ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

    private static final Logger log = LoggerFactory.getLogger(GmailPushTokens.class);
    private static final Duration KEYS_TIMEOUT = Duration.ofSeconds(5);
    private static final int KEYS_SIZE_LIMIT = 50 * 1024;

    private final JwtDecoder decoder;
    private final AtMostEveryMinute refusalsSaid = new AtMostEveryMinute();
    private final AtMostEveryMinute keyFailuresSaid = new AtMostEveryMinute();

    GmailPushTokens(GmailProperties.PubSub pubsub) {
        this(pubsub, keysOf(pubsub));
    }

    GmailPushTokens(GmailProperties.PubSub pubsub, JWKSource<SecurityContext> keys) {
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withJwkSource(keys).build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator();
        timestamps.setAllowEmptyExpiryClaim(false);
        List<OAuth2TokenValidator<Jwt>> validators = List.of(timestamps,
                new JwtClaimValidator<String>(JwtClaimNames.ISS, GOOGLE_ISSUERS::contains),
                new JwtAudienceValidator(pubsub.audience()),
                new JwtClaimValidator<Object>("email", pubsub.serviceAccount()::equals),
                new JwtClaimValidator<Object>("email_verified", verified -> Boolean.TRUE.equals(verified)));
        nimbus.setJwtValidator(new DelegatingOAuth2TokenValidator<>(validators));
        this.decoder = nimbus;
    }

    /**
     * Checks the {@code Authorization} header of a push.
     *
     * @throws SinoException with {@code PUSH_TOKEN_INVALID} (401) when it carries no token Google gave the push
     *         subscription, or {@code PUSH_KEYS_UNAVAILABLE} (503) when Google's keys cannot be fetched, so Pub/Sub
     *         sends the notice again later
     */
    void check(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            log.debug("A Gmail push without a bearer token was refused");
            throw GmailPushErrorCode.tokenInvalid();
        }
        try {
            decoder.decode(authorization.substring(7).strip());
        } catch (JwtValidationException refused) {
            // Signed by Google but not for this subscription: most likely a setting that does not match Google's.
            if (refusalsSaid.due()) {
                log.warn("Gmail pushes signed by Google are refused ({}): check SINO_GOOGLE_PUBSUB_AUDIENCE and "
                        + "SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT against the push subscription", checksFailed(refused));
            }
            throw GmailPushErrorCode.tokenInvalid();
        } catch (BadJwtException invalid) {
            log.debug("A Gmail push with a token that is not Google's was refused");
            throw GmailPushErrorCode.tokenInvalid();
        } catch (JwtException keys) {
            // The rate limit refused to fetch the keys again: the token names a key that is not among those fetched
            // lately, or the last fetches failed, which was said then.
            if (causedBy(keys, RateLimitReachedException.class)) {
                log.debug("A Gmail push naming an unknown key was refused");
                throw GmailPushErrorCode.tokenInvalid();
            }
            if (keyFailuresSaid.due()) {
                log.warn("Google's signing keys cannot be fetched, Gmail pushes are refused for now: {}",
                        keys.getMessage());
            }
            throw GmailPushErrorCode.keysUnavailable();
        }
    }

    // The descriptions of the failed checks name the claim only, never its value.
    private static String checksFailed(JwtValidationException refused) {
        return refused.getErrors().stream().map(OAuth2Error::getDescription).collect(Collectors.joining("; "));
    }

    // No refresh ahead of time: it keeps a thread that nothing would stop when the application restarts.
    private static JWKSource<SecurityContext> keysOf(GmailProperties.PubSub pubsub) {
        try {
            int timeout = (int) KEYS_TIMEOUT.toMillis();
            return JWKSourceBuilder.<SecurityContext>create(pubsub.jwkSetUri().toURL(),
                    new DefaultResourceRetriever(timeout, timeout, KEYS_SIZE_LIMIT)).refreshAheadCache(false).build();
        } catch (MalformedURLException e) {
            throw new IllegalStateException("sino.google.pubsub.jwk-set-uri is not a URL", e);
        }
    }

    private static boolean causedBy(Throwable failure, Class<? extends Throwable> type) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (type.isInstance(cause)) {
                return true;
            }
        }
        return false;
    }

    /** Lets a repeated warning through once a minute at most. */
    private static final class AtMostEveryMinute {

        private static final long MINUTE = Duration.ofMinutes(1).toNanos();

        private final AtomicLong last = new AtomicLong(System.nanoTime() - 2 * MINUTE);

        boolean due() {
            long now = System.nanoTime();
            long previous = last.get();
            return now - previous >= MINUTE && last.compareAndSet(previous, now);
        }

    }

}
