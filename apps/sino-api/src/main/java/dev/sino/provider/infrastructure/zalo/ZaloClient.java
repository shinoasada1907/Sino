package dev.sino.provider.infrastructure.zalo;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.TokenCredentials;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The calls Sino makes to sino-zalo (contract API in the design of F09), each with the shared secret and a time limit.
 * Every failure becomes a {@link ProviderException} by the table D-281, whose message names the failure only: never
 * the secret, the session or what sino-zalo sent back. When sino-zalo has no session for the account (it restarted)
 * or an ended one (perhaps older than the stored one), a read, a send or a lookup hands it the stored session and runs
 * once more (D-277, D-289): both answers mean nothing was done, so a send that may have gone is never repeated.
 * Turned off, it sends nothing at all (D-286).
 */
class ZaloClient {

    private static final Logger LOG = LoggerFactory.getLogger(ZaloClient.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ACCOUNT = "/accounts/{accountId}";
    static final String CANNOT_TELL_MESSAGE = "sino-zalo cannot tell whether the message went out (409)";

    private final boolean enabled;
    private final RestClient reading;
    private final RestClient slow;

    /**
     * @param readTimeout until the whole answer is read, for every call but the slow ones
     * @param slowTimeout the same for a send and for the start of a QR login, which must be above the 10 s sino-zalo
     *        waits for Zalo to send, so a slow send comes back as its 504 (D-280), and the 15 s it waits for a QR code
     */
    ZaloClient(URI url, String secret, boolean enabled, Duration connectTimeout, Duration readTimeout,
            Duration slowTimeout) {
        this.enabled = enabled;
        // sino-zalo speaks HTTP/1.1 on this machine: asking it to upgrade to HTTP/2 would serve nothing.
        HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(connectTimeout)
                .build();
        this.reading = clientOf(url, secret, client, readTimeout);
        this.slow = clientOf(url, secret, client, slowTimeout);
    }

    private static RestClient clientOf(URI url, String secret, HttpClient client, Duration timeout) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(client);
        requestFactory.setReadTimeout(timeout);
        return RestClient.builder().baseUrl(url.toString()).requestFactory(requestFactory)
                .defaultHeaders(headers -> {
                    if (secret != null) {
                        headers.setBearerAuth(secret);
                    }
                }).build();
    }

    /**
     * Gives sino-zalo the account's stored session: it starts the session and its listener, or does nothing when it
     * already holds that very session (D-289).
     *
     * @throws ProviderException with {@code AUTH_EXPIRED} when Zalo ended that session or it cannot be used
     */
    void putSession(ProviderContext context) {
        requireOn();
        UUID accountId = accountIdOf(context);
        Map<String, JsonNode> body = Map.of("session", storedSession(context));
        call(Call.SESSION, () -> reading.put().uri(ACCOUNT + "/session", accountId)
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().toBodilessEntity());
    }

    /** Ends the account's session at sino-zalo (D-284); sino-zalo answers 204 also when it holds none. */
    void deleteSession(ProviderContext context) {
        requireOn();
        UUID accountId = accountIdOf(context);
        call(Call.SESSION, () -> reading.delete().uri(ACCOUNT + "/session", accountId).retrieve().toBodilessEntity());
    }

    /** Starts a QR login (D-275): sino-zalo answers once Zalo gave the code, within 15 seconds. */
    Login startLogin() {
        requireOn();
        return call(Call.READ, () -> answer(slow.post().uri("/logins").retrieve().body(Login.class)));
    }

    /**
     * Where the QR login is, or empty when sino-zalo does not know it: it restarted, or forgot the login after
     * handing over its session or five minutes on.
     */
    Optional<LoginView> login(String loginId) {
        requireOn();
        return call(Call.READ, () -> {
            try {
                return Optional.of(answer(reading.get().uri("/logins/{loginId}", loginId).retrieve()
                        .body(LoginView.class)));
            } catch (RestClientResponseException failure) {
                if (failure.getStatusCode().value() == 404 && "UNKNOWN_LOGIN".equals(codeOf(failure))) {
                    return Optional.empty();
                }
                throw failure;
            }
        });
    }

    /** Ends the QR login at Zalo; sino-zalo answers 204 also when it does not know it. */
    void cancelLogin(String loginId) {
        requireOn();
        call(Call.READ, () -> reading.delete().uri("/logins/{loginId}", loginId).retrieve().toBodilessEntity());
    }

    /** The account's messages after {@code after}, a Zalo {@code msgId}, or from the first one sino-zalo holds. */
    MessagePage messages(ProviderContext context, String after, int limit) {
        UUID accountId = accountIdOf(context);
        return inSession(context, Call.READ, () -> answer(reading.get().uri(uri -> uri.path(ACCOUNT + "/messages")
                .queryParamIfPresent("after", Optional.ofNullable(after)).queryParam("limit", limit).build(accountId))
                .retrieve().body(MessagePage.class)));
    }

    /**
     * Sends a text once per {@code clientMessageId}: asked again, sino-zalo answers what it sent the first time. A
     * refusal leaves it unsent with the usual codes; when it may have gone (a 5xx, no answer in time, a connection
     * that broke off after the request left) the code is {@code OUTCOME_UNKNOWN} (D-135, D-281).
     */
    Sent send(ProviderContext context, SendRequest request) {
        UUID accountId = accountIdOf(context);
        return inSession(context, Call.SEND, () -> {
            Sent sent = slow.post().uri(ACCOUNT + "/messages", accountId).contentType(MediaType.APPLICATION_JSON)
                    .body(request).retrieve().body(Sent.class);
            if (sent == null || sent.msgId() == null || sent.msgId().isBlank()) {
                throw new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN,
                        "sino-zalo accepted the message but sent back no ID");
            }
            return sent;
        });
    }

    /**
     * Zalo's IDs of the messages that may be the one sent with {@code clientMessageId}; empty only when sino-zalo
     * knows it did not go out.
     *
     * @throws ProviderException with {@code PROVIDER_UNAVAILABLE} when sino-zalo cannot tell (409), never an empty list
     */
    List<String> lookup(ProviderContext context, LookupRequest request) {
        UUID accountId = accountIdOf(context);
        LookupBody body = new LookupBody(request.threadId(), request.clientMessageId(), request.text(),
                request.after().toString());
        return inSession(context, Call.READ, () -> {
            Found found = answer(reading.post().uri(ACCOUNT + "/sent/lookup", accountId)
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(Found.class));
            if (found.msgIds() == null) {
                throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                        "sino-zalo answered the lookup without msgIds");
            }
            return found.msgIds().stream().filter(Objects::nonNull).toList();
        });
    }

    /**
     * Whether a call that failed without an answer certainly did not leave ({@code PROVIDER_UNAVAILABLE}: no
     * connection was made) or may have reached sino-zalo ({@code OUTCOME_UNKNOWN}).
     */
    static ProviderErrorCode sendFailure(RestClientException failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConnectException || cause instanceof HttpConnectTimeoutException
                    || cause instanceof UnknownHostException) {
                return ProviderErrorCode.PROVIDER_UNAVAILABLE;
            }
        }
        return ProviderErrorCode.OUTCOME_UNKNOWN;
    }

    static boolean cannotTell(ProviderException failure) {
        return failure.errorCode() == ProviderErrorCode.PROVIDER_UNAVAILABLE
                && CANNOT_TELL_MESSAGE.equals(failure.getMessage());
    }

    private <T> T inSession(ProviderContext context, Call kind, Supplier<T> request) {
        requireOn();
        try {
            return call(kind, request);
        } catch (NoSession first) {
            putSession(context);
            try {
                return call(kind, request);
            } catch (NoSession again) {
                throw again.ended
                        ? new ProviderException(ProviderErrorCode.AUTH_EXPIRED,
                                "Zalo ended the session sino-zalo was just given (410)")
                        : new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                                "sino-zalo lost the session it was just given (404)");
            }
        }
    }

    private static <T> T call(Call kind, Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientResponseException failure) {
            throw failureFor(kind, failure);
        } catch (RestClientException failure) {
            throw withoutAnswer(kind, failure);
        } catch (IllegalArgumentException unsendable) {
            // The JDK refuses a header it cannot send and writes the header, secret and all, into its message.
            throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "Sino could not build its request to sino-zalo");
        }
    }

    private static RuntimeException failureFor(Call kind, RestClientResponseException failure) {
        int status = failure.getStatusCode().value();
        String code = codeOf(failure);
        if (status == 401) {
            // A setup mistake, not a reason to give up the account: retrying works once the secrets match.
            LOG.error("sino-zalo refused Sino's secret (401): SINO_ZALO_SECRET must be the same for sino-api and "
                    + "sino-zalo");
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "sino-zalo refused Sino's secret (401)");
        }
        if (kind == Call.SESSION && status == 410) {
            return new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "Zalo ended the stored session (410)");
        }
        // Another scan gives a session sino-zalo can use; sending this one again cannot. Logged with sino-zalo's code
        // in case Sino itself built the body wrong, which no scan would fix.
        if (kind == Call.SESSION && status == 400) {
            LOG.warn("sino-zalo cannot use the stored Zalo session (400, {})", code);
            return new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "sino-zalo cannot use the stored session (400)");
        }
        if (kind != Call.SESSION && status == 404 && "UNKNOWN_ACCOUNT".equals(code)) {
            return new NoSession(false);
        }
        if (kind != Call.SESSION && status == 410 && "SESSION_ENDED".equals(code)) {
            return new NoSession(true);
        }
        if (status == 429) {
            return ProviderException.rateLimited("sino-zalo sends at most one message a second per account (429)",
                    null);
        }
        if (status == 409) {
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, CANNOT_TELL_MESSAGE);
        }
        if (failure.getStatusCode().is5xxServerError()) {
            return kind == Call.SEND
                    ? new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN,
                            "sino-zalo answered " + status + " to the send")
                    : new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "sino-zalo answered " + status);
        }
        if (status == 422) {
            return new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Zalo refused the message (422)");
        }
        return new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "sino-zalo refused the request (" + status + ")");
    }

    private static ProviderException withoutAnswer(Call kind, RestClientException failure) {
        if (kind == Call.SEND) {
            return sendFailure(failure) == ProviderErrorCode.PROVIDER_UNAVAILABLE
                    ? new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "sino-zalo could not be reached to send")
                    : new ProviderException(ProviderErrorCode.OUTCOME_UNKNOWN, "No answer from sino-zalo to the send");
        }
        // Reading the body can also fail midway (connection lost, read timeout): that is not a broken answer.
        if (failure instanceof ResourceAccessException || brokeOff(failure)) {
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "sino-zalo could not be reached or did not answer in time");
        }
        return new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                "sino-zalo sent an answer Sino cannot read");
    }

    private static boolean brokeOff(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof IOException) {
                return true;
            }
        }
        return false;
    }

    // sino-zalo's own error code ({"code": ..., "message": ...}), or null for any other body.
    private static String codeOf(RestClientResponseException failure) {
        try {
            Problem problem = JSON.readValue(failure.getResponseBodyAsString(), Problem.class);
            return problem == null ? null : problem.code();
        } catch (JacksonException unreadable) {
            return null;
        }
    }

    // The session is kept as the JSON sino-zalo gave at the QR login (D-274) and goes back to it as that JSON.
    private static JsonNode storedSession(ProviderContext context) {
        if (context.credentials() instanceof TokenCredentials credentials) {
            try {
                JsonNode session = JSON.readTree(credentials.token());
                if (session.isObject()) {
                    return session;
                }
            } catch (JacksonException unreadable) {
                // Told below, without the text.
            }
        }
        throw new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "The stored Zalo session is not a JSON object");
    }

    private void requireOn() {
        if (!enabled) {
            throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Zalo is turned off (SINO_ZALO_ENABLED)");
        }
    }

    private static UUID accountIdOf(ProviderContext context) {
        return Objects.requireNonNull(context.accountId(), "A call to sino-zalo needs the account's ID");
    }

    private static <T> T answer(T body) {
        if (body == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "sino-zalo sent an empty answer");
        }
        return body;
    }

    private static <T> List<T> withoutNulls(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).toList();
    }

    private enum Call {
        READ, SEND, SESSION
    }

    // sino-zalo holds no session for the account (404) or an ended one (410): never leaves this class.
    private static final class NoSession extends RuntimeException {

        private final boolean ended;

        NoSession(boolean ended) {
            super(null, null, false, false);
            this.ended = ended;
        }

    }

    enum ThreadType {
        USER, GROUP
    }

    record SendRequest(String threadId, ThreadType threadType, String text, String clientMessageId) {
    }

    record LookupRequest(String threadId, String clientMessageId, String text, Instant after) {
    }

    private record LookupBody(String threadId, String clientMessageId, String text, String after) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Problem(String code) {
    }

    /** A QR login just started: the code as a PNG in base64, scannable until {@code expiresAt}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Login(String loginId, String qrImage, Instant expiresAt) {
    }

    /**
     * Where a QR login is: {@code state} is {@code WAITING}, {@code SCANNED} (with {@code displayName}), {@code DONE}
     * (with {@code profile} and {@code session}, once), {@code EXPIRED}, {@code DECLINED} or {@code FAILED}.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record LoginView(String state, String displayName, Profile profile, JsonNode session) {

        // The session is the account's credential: never in a log line.
        @Override
        public String toString() {
            return "LoginView[state=" + state + ", displayName=" + displayName + ", profile=" + profile
                    + ", session=" + (session == null ? null : "****") + "]";
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Profile(String ownId, String displayName, String avatarUrl) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Sent(String msgId, Instant sentAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Found(List<String> msgIds) {
    }

    /**
     * One page of the account's messages. Kept as sino-zalo writes them, text for text: whether one of them can be
     * shown is decided message by message when they are normalized, so one odd message does not fail the page.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record MessagePage(List<Conversation> conversations, List<Message> messages, String nextCursor, boolean hasMore) {

        MessagePage {
            conversations = withoutNulls(conversations);
            messages = withoutNulls(messages);
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Conversation(String threadId, String threadType, String title, String avatarUrl,
            List<Participant> participants) {

        Conversation {
            participants = withoutNulls(participants);
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Participant(String id, String name) {
    }

    /**
     * {@code text} is null when the message is not text; {@code sentAt} is ISO-8601; {@code sticker} is null unless
     * the message is a sticker whose content named one.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Message(String msgId, String threadId, String threadType, String fromId, String fromName, boolean isSelf,
            String zaloType, String text, String sentAt, Sticker sticker) {

        Message(String msgId, String threadId, String threadType, String fromId, String fromName, boolean isSelf,
                String zaloType, String text, String sentAt) {
            this(msgId, threadId, threadType, fromId, fromName, isSelf, zaloType, text, sentAt, null);
        }

    }

    /**
     * {@code url} is null when sino-zalo could not get the picture from Zalo; {@code sprite} is null unless the
     * sticker moves.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Sticker(String id, String catId, Integer type, String url, StickerSprite sprite) {

        Sticker(String id, String catId, Integer type, String url) {
            this(id, catId, type, url, null);
        }

    }

    /** The sprite sheet of a sticker that moves: frames side by side in one row, one run lasting {@code durationMs}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record StickerSprite(String url, Integer frames, Integer durationMs) {
    }

}
