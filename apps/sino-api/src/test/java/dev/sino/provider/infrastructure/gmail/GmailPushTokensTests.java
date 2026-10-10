package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatNoException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.function.Consumer;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.OctetSequenceKey;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;

import dev.sino.common.error.SinoException;

/**
 * The token Cloud Pub/Sub sends with each push (D-76): only one Google signed for the push subscription passes. Keys
 * made here stand for Google's; most tests hand them over directly, the last ones fetch them from a fake Google
 * (WireMock), as the application does.
 */
@ExtendWith(OutputCaptureExtension.class)
class GmailPushTokensTests {

    private static final String AUDIENCE = "https://sino.test/api/webhooks/gmail";
    private static final String SERVICE_ACCOUNT = "gmail-push@sino-test.iam.gserviceaccount.com";
    private static final GmailProperties.PubSub PUBSUB = new GmailProperties.PubSub(
            "projects/sino-test/topics/gmail", AUDIENCE, SERVICE_ACCOUNT, null);

    private static RSAKey google;
    private static RSAKey stranger;
    private static WireMockServer googleCerts;

    private final GmailPushTokens tokens = new GmailPushTokens(PUBSUB, new ImmutableJWKSet<>(new JWKSet(
            google.toPublicJWK())));

    @BeforeAll
    static void makeKeysAndStartGoogle() throws JOSEException {
        google = new RSAKeyGenerator(2048).keyID("google-key-1").generate();
        stranger = new RSAKeyGenerator(2048).keyID("google-key-1").generate();
        googleCerts = new WireMockServer(options().dynamicPort());
        googleCerts.start();
    }

    @AfterAll
    static void stopGoogle() {
        googleCerts.stop();
    }

    @BeforeEach
    void forgetRequests() {
        googleCerts.resetAll();
    }

    @Test
    void aTokenGoogleSignedForTheSubscriptionPasses() throws JOSEException {
        assertThatNoException().isThrownBy(() -> tokens.check("Bearer " + token(claims -> {
        })));
        assertThatNoException().isThrownBy(() -> tokens.check("bearer " + token(claims -> {
        })));
    }

    @Test
    void bothWaysGoogleWritesItsIssuerPass() throws JOSEException {
        String shortIssuer = token(claims -> claims.issuer("accounts.google.com"));

        assertThatNoException().isThrownBy(() -> tokens.check("Bearer " + shortIssuer));
    }

    @Test
    void anAudienceAmongOthersPasses() throws JOSEException {
        String twoAudiences = token(claims -> claims.audience(List.of("https://elsewhere.test", AUDIENCE)));

        assertThatNoException().isThrownBy(() -> tokens.check("Bearer " + twoAudiences));
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "Bearer not-a-token", "Bearer a.b.c" })
    void aRequestWithoutAUsableTokenIsRefused(String authorization) {
        assertThatTokenIsRefused(authorization.isEmpty() ? null : authorization);
    }

    @Test
    void aTokenSignedWithAnotherKeyIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(stranger, claims -> {
        }));
    }

    // Even when the key set holds the shared secret under the token's key id: only RS256 is taken.
    @Test
    void aTokenSignedWithASharedSecretIsRefused() throws JOSEException {
        OctetSequenceKey secret = new OctetSequenceKey.Builder(
                "a-shared-secret-of-at-least-32-bytes!".getBytes(StandardCharsets.UTF_8)).keyID("shared-1").build();
        GmailPushTokens withSecret = new GmailPushTokens(PUBSUB, new ImmutableJWKSet<>(new JWKSet(List.of(
                google.toPublicJWK(), secret))));
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).keyID("shared-1").build(),
                claims(claims -> {
                }));
        jwt.sign(new MACSigner(secret));

        assertThatExceptionOfType(SinoException.class).isThrownBy(() -> withSecret.check("Bearer " + jwt.serialize()))
                .satisfies(refused -> assertThat(refused.errorCode().code()).isEqualTo("PUSH_TOKEN_INVALID"));
    }

    // A setting that does not match the push subscription refuses every push of Google: said, by the check only.
    @Test
    void aGoogleTokenForAnotherSetupIsSaidOnceAMinuteByItsClaimOnly(CapturedOutput output) throws JOSEException {
        String elsewhere = token(claims -> claims.audience("https://elsewhere.test"));

        assertThatTokenIsRefused("Bearer " + elsewhere);
        assertThatTokenIsRefused("Bearer " + elsewhere);

        assertThat(output.getAll().split("Gmail pushes signed by Google are refused", -1)).as("once").hasSize(2);
        assertThat(output.getAll()).contains("The aud claim is not valid").doesNotContain("elsewhere.test")
                .doesNotContain(AUDIENCE).doesNotContain(elsewhere);
    }

    @Test
    void aTokenThatIsNotGooglesIsNotWarnedAbout(CapturedOutput output) throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(stranger, claims -> {
        }));
        assertThatTokenIsRefused(null);

        assertThat(output.getAll()).doesNotContain("Gmail pushes signed by Google are refused")
                .doesNotContain("cannot be fetched");
    }

    @Test
    void anUnsignedTokenIsRefused() {
        assertThatTokenIsRefused("Bearer " + new PlainJWT(claims(claims -> {
        })).serialize());
    }

    @Test
    void anExpiredTokenIsRefused() throws JOSEException {
        Instant twoMinutesAgo = Instant.now().minusSeconds(120);

        assertThatTokenIsRefused("Bearer " + token(claims -> claims.expirationTime(Date.from(twoMinutesAgo))));
    }

    @Test
    void aTokenWithoutExpiryIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.expirationTime(null)));
    }

    @Test
    void aTokenNotValidYetIsRefused() throws JOSEException {
        Instant inFiveMinutes = Instant.now().plusSeconds(300);

        assertThatTokenIsRefused("Bearer " + token(claims -> claims.notBeforeTime(Date.from(inFiveMinutes))));
    }

    @Test
    void aTokenOfAnotherIssuerIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.issuer("https://accounts.google.test")));
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.issuer(null)));
    }

    @Test
    void aTokenForAnotherAudienceIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.audience("https://elsewhere.test")));
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.audience((String) null)));
    }

    @Test
    void aTokenOfAnotherServiceAccountIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.claim("email",
                "someone@other-project.iam.gserviceaccount.com")));
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.claim("email", null)));
    }

    @Test
    void aTokenWhoseEmailIsNotVerifiedIsRefused() throws JOSEException {
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.claim("email_verified", false)));
        assertThatTokenIsRefused("Bearer " + token(claims -> claims.claim("email_verified", null)));
    }

    @Test
    void googleKeysAreFetchedOnceForManyTokens() throws JOSEException {
        googleCerts.stubFor(get(urlPathEqualTo("/certs")).willReturn(okJson(new JWKSet(google).toString())));
        GmailPushTokens fetching = fetchingFrom(googleCerts.baseUrl() + "/certs");

        for (int i = 0; i < 3; i++) {
            String valid = token(claims -> {
            });
            assertThatNoException().isThrownBy(() -> fetching.check("Bearer " + valid));
        }

        googleCerts.verify(1, getRequestedFor(urlPathEqualTo("/certs")));
    }

    @Test
    void tokensNamingUnknownKeysCannotMakeSinoAskGoogleEveryTime() throws JOSEException {
        googleCerts.stubFor(get(urlPathEqualTo("/certs")).willReturn(okJson(new JWKSet(google).toString())));
        GmailPushTokens fetching = fetchingFrom(googleCerts.baseUrl() + "/certs");

        for (int i = 0; i < 5; i++) {
            RSAKey unknown = new RSAKeyGenerator(2048).keyID("unknown-" + i).generate();
            assertThatExceptionOfType(SinoException.class)
                    .isThrownBy(() -> fetching.check("Bearer " + token(unknown, claims -> {
                    })))
                    .satisfies(refused -> assertThat(refused.errorCode().code()).isEqualTo("PUSH_TOKEN_INVALID"));
        }

        assertThat(googleCerts.countRequestsMatching(getRequestedFor(urlPathEqualTo("/certs")).build()).getCount())
                .as("at most one fetch and one refresh").isLessThanOrEqualTo(2);
    }

    @Test
    void whenGoogleKeysCannotBeFetchedTheNoticeIsAskedAgainLater(CapturedOutput output) throws JOSEException {
        googleCerts.stubFor(get(urlPathEqualTo("/certs")).willReturn(aResponse().withStatus(503)));
        GmailPushTokens fetching = fetchingFrom(googleCerts.baseUrl() + "/certs");
        String valid = token(claims -> {
        });

        assertThatExceptionOfType(SinoException.class).isThrownBy(() -> fetching.check("Bearer " + valid))
                .satisfies(unavailable -> assertThat(unavailable.errorCode().code())
                        .isEqualTo("PUSH_KEYS_UNAVAILABLE"))
                .withMessageNotContaining(valid);
        assertThatExceptionOfType(SinoException.class).isThrownBy(() -> fetching.check("Bearer " + valid));

        assertThat(output.getAll().split("Google's signing keys cannot be fetched", -1)).as("said once").hasSize(2);
        assertThat(output.getAll()).doesNotContain(valid);
    }

    private ThrowableAssertAlternative<SinoException> assertThatTokenIsRefused(String authorization) {
        return assertThatExceptionOfType(SinoException.class).isThrownBy(() -> tokens.check(authorization))
                .satisfies(refused -> assertThat(refused.errorCode().code()).isEqualTo("PUSH_TOKEN_INVALID"))
                .withMessageNotContaining("eyJ");
    }

    private static GmailPushTokens fetchingFrom(String jwkSetUri) {
        return new GmailPushTokens(new GmailProperties.PubSub(PUBSUB.topic(), AUDIENCE, SERVICE_ACCOUNT,
                URI.create(jwkSetUri)));
    }

    /** A token as Pub/Sub sends it, signed with Google's key, changed by {@code change}. */
    static String token(Consumer<JWTClaimsSet.Builder> change) throws JOSEException {
        return token(google, change);
    }

    static String token(RSAKey key, Consumer<JWTClaimsSet.Builder> change) throws JOSEException {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID())
                .type(JOSEObjectType.JWT).build(), claims(change));
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private static JWTClaimsSet claims(Consumer<JWTClaimsSet.Builder> change) {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer("https://accounts.google.com")
                .audience(AUDIENCE)
                .subject("110000000000000000001")
                .claim("azp", "110000000000000000001")
                .claim("email", SERVICE_ACCOUNT)
                .claim("email_verified", true)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(3600)));
        change.accept(claims);
        return claims.build();
    }

}
