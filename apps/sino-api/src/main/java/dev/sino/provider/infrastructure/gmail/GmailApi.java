package dev.sino.provider.infrastructure.gmail;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriBuilder;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * The calls Sino makes to Google for Gmail: the OpenID user info and the Gmail API v1, each with a time limit, so a
 * hanging Google cannot hold a thread. Every failure becomes a {@link ProviderException} (F04b design, section 4)
 * whose message names the failure only: never the token, never what Google sent back.
 */
class GmailApi {

    static final int PAGE_SIZE = 50;

    private static final String USER = "/gmail/v1/users/me";
    private static final Object[] CHANGES = { "messageAdded", "labelAdded", "labelRemoved" };
    // A 403 for a quota is throttling, not a refusal; what tells them apart is only in the body.
    private static final Pattern QUOTA = Pattern.compile(
            "\"reason\"\\s*:\\s*\"(?:rateLimitExceeded|userRateLimitExceeded)\""
                    + "|\"status\"\\s*:\\s*\"RESOURCE_EXHAUSTED\"");
    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT =
            new ParameterizedTypeReference<>() {
            };

    private final URI userInfoUri;
    private final RestClient google;
    private final RestClient files;

    /**
     * @param readTimeout until the whole answer is read, not between two reads: Spring's JDK client closes the body
     *        when it is up
     * @param fileTimeout the same for the content of a file, which may be 25 MB
     */
    GmailApi(URI userInfoUri, URI gmailApiUri, Duration connectTimeout, Duration readTimeout, Duration fileTimeout) {
        this.userInfoUri = userInfoUri;
        HttpClient client = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
        this.google = clientOf(gmailApiUri, client, readTimeout);
        this.files = clientOf(gmailApiUri, client, fileTimeout);
    }

    private static RestClient clientOf(URI gmailApiUri, HttpClient client, Duration timeout) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(client);
        requestFactory.setReadTimeout(timeout);
        return RestClient.builder().baseUrl(gmailApiUri.toString()).requestFactory(requestFactory).build();
    }

    /** The OpenID Connect user info of the token's account, as JSON. */
    Map<String, Object> userInfo(String accessToken) {
        return call(() -> google.get().uri(userInfoUri).headers(bearer(accessToken)).retrieve().body(JSON_OBJECT));
    }

    Profile profile(String accessToken) {
        return call(() -> answer(google.get().uri(USER + "/profile").headers(bearer(accessToken)).retrieve()
                .body(Profile.class)));
    }

    /**
     * One page of the mailbox's messages, newest first; only those since {@code since} when it is given (Gmail
     * counts in whole seconds).
     *
     * @throws ProviderException with {@code CURSOR_EXPIRED} when Gmail no longer accepts {@code pageToken} (400)
     */
    MessageList messages(String accessToken, Instant since, String pageToken) {
        return list(accessToken, since, pageToken, PAGE_SIZE);
    }

    /**
     * Gmail's estimate of how many messages there are since {@code since}, from a list of one message; null when
     * Gmail leaves it out.
     */
    Long estimate(String accessToken, Instant since) {
        return list(accessToken, since, null, 1).resultSizeEstimate();
    }

    /**
     * One page of the changes since {@code startHistoryId}: new messages and labels added or removed.
     *
     * @throws ProviderException with {@code CURSOR_EXPIRED} when Gmail no longer keeps those changes (404) or no
     *         longer accepts {@code pageToken} (400)
     */
    HistoryPage history(String accessToken, String startHistoryId, String pageToken) {
        return call(() -> {
            try {
                return answer(google.get().uri(uri -> withPageToken(uri.path(USER + "/history")
                        .queryParam("startHistoryId", startHistoryId)
                        .queryParam("historyTypes", CHANGES)
                        .queryParam("maxResults", PAGE_SIZE), pageToken))
                        .headers(bearer(accessToken)).retrieve().body(HistoryPage.class));
            } catch (RestClientResponseException failure) {
                if (failure.getStatusCode().value() == 404) {
                    throw new ProviderException(ProviderErrorCode.CURSOR_EXPIRED,
                            "Gmail no longer keeps the changes since this cursor (404)");
                }
                throw pageTokenRefused(failure, pageToken);
            }
        });
    }

    /**
     * Asks Gmail to publish every change of the mailbox to the Pub/Sub {@code topic}, with no label filter, or renews
     * that (D-76). Gmail refuses a topic it cannot publish to (400 or 403).
     */
    Watch watch(String accessToken, String topic) {
        return call(() -> answer(google.post().uri(USER + "/watch").headers(bearer(accessToken))
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("topicName", topic)).retrieve()
                .body(Watch.class)));
    }

    /** The whole message ({@code format=full}); empty when it was deleted meanwhile (404). */
    Optional<GmailMessage> message(String accessToken, String id) {
        return call(() -> {
            try {
                return Optional.ofNullable(google.get().uri(uri -> uri.path(USER + "/messages/{id}")
                        .queryParam("format", "full").build(id)).headers(bearer(accessToken)).retrieve()
                        .body(GmailMessage.class));
            } catch (RestClientResponseException failure) {
                if (failure.getStatusCode().value() == 404) {
                    return Optional.empty();
                }
                throw failure;
            }
        });
    }

    /**
     * The content of a file of a message that Gmail keeps apart, by the {@code attachmentId} of this read of the
     * message: base64url in {@code data}.
     */
    Attachment attachment(String accessToken, String messageId, String attachmentId) {
        return call(() -> answer(files.get().uri(uri -> uri.path(USER + "/messages/{id}/attachments/{attachmentId}")
                .build(messageId, attachmentId)).headers(bearer(accessToken)).retrieve().body(Attachment.class)));
    }

    private MessageList list(String accessToken, Instant since, String pageToken, int maxResults) {
        return call(() -> {
            try {
                return answer(google.get().uri(uri -> withPageToken(uri.path(USER + "/messages")
                        .queryParam("maxResults", maxResults)
                        .queryParamIfPresent("q", Optional.ofNullable(since).map(at -> "after:" + at.getEpochSecond())),
                        pageToken)).headers(bearer(accessToken)).retrieve().body(MessageList.class));
            } catch (RestClientResponseException failure) {
                throw pageTokenRefused(failure, pageToken);
            }
        });
    }

    private static Consumer<HttpHeaders> bearer(String accessToken) {
        return headers -> headers.setBearerAuth(accessToken);
    }

    // As a URI variable, so the token is sent exactly as Gmail wrote it, whatever characters it has.
    private static URI withPageToken(UriBuilder uri, String pageToken) {
        return pageToken == null ? uri.build()
                : uri.queryParam("pageToken", "{pageToken}").build(Map.of("pageToken", pageToken));
    }

    // A page token Gmail no longer accepts ends the cursor; the caller starts again rather than failing forever.
    private static RuntimeException pageTokenRefused(RestClientResponseException failure, String pageToken) {
        if (failure.getStatusCode().value() == 400 && pageToken != null) {
            return new ProviderException(ProviderErrorCode.CURSOR_EXPIRED,
                    "Gmail no longer accepts the page token of this cursor (400)");
        }
        return failure;
    }

    private static <T> T answer(T body) {
        if (body == null) {
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, "Google sent an empty answer");
        }
        return body;
    }

    private static <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientResponseException failure) {
            throw failureFor(failure);
        } catch (ResourceAccessException failure) {
            throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                    "Google could not be reached or did not answer in time");
        } catch (RestClientException failure) {
            // Reading the body can also fail midway (connection lost, read timeout): that is not a broken answer.
            if (brokeOff(failure)) {
                throw new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE,
                        "The connection to Google broke off while reading its answer");
            }
            throw new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED,
                    "Google sent an answer Sino cannot read");
        }
    }

    private static boolean brokeOff(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof IOException) {
                return true;
            }
        }
        return false;
    }

    // The body is read only to tell a quota from a refusal; it never goes into the message.
    private static ProviderException failureFor(RestClientResponseException failure) {
        int code = failure.getStatusCode().value();
        if (code == 401) {
            return new ProviderException(ProviderErrorCode.AUTH_EXPIRED, "Google refused the access token (401)");
        }
        if (code == 429 || (code == 403 && QUOTA.matcher(failure.getResponseBodyAsString()).find())) {
            return ProviderException.rateLimited("Google is throttling Sino (" + code + ")",
                    retryAfter(failure.getResponseHeaders()));
        }
        if (failure.getStatusCode().is5xxServerError()) {
            return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, "Google answered " + code);
        }
        return new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Google refused the request (" + code + ")");
    }

    // Only the delay-seconds form of Retry-After; a date or anything else means "not said".
    private static Duration retryAfter(HttpHeaders headers) {
        String value = headers == null ? null : headers.getFirst(HttpHeaders.RETRY_AFTER);
        if (value == null || !value.strip().matches("\\d{1,9}")) {
            return null;
        }
        long seconds = Long.parseLong(value.strip());
        return seconds > 0 ? Duration.ofSeconds(seconds) : null;
    }

    private static <T> List<T> withoutNulls(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).toList();
    }

    /** {@code messagesTotal} counts every message of the mailbox, drafts, spam and trash too. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Profile(String emailAddress, String historyId, Long messagesTotal) {
    }

    /**
     * When the watch stops unless renewed: {@code expiration} is milliseconds since the epoch, written as a string
     * like every 64-bit number of Google's APIs.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Watch(String historyId, String expiration) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Attachment(Long size, String data) {
    }

    /** {@code resultSizeEstimate} is Gmail's rough count of every message the query matches, on all pages. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record MessageList(List<MessageRef> messages, String nextPageToken, Long resultSizeEstimate) {

        MessageList {
            messages = withoutNulls(messages);
        }

        List<String> ids() {
            return messages.stream().map(MessageRef::id).filter(Objects::nonNull).toList();
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record MessageRef(String id) {
    }

    /** Gmail leaves {@code history} out when nothing changed. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record HistoryPage(List<HistoryRecord> history, String nextPageToken) {

        HistoryPage {
            history = withoutNulls(history);
        }

        /** The messages these changes touched, in order, each as often as it was touched. */
        List<String> ids() {
            return history.stream().flatMap(HistoryRecord::ids).toList();
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record HistoryRecord(List<MessageChange> messagesAdded, List<MessageChange> labelsAdded,
            List<MessageChange> labelsRemoved) {

        HistoryRecord {
            messagesAdded = withoutNulls(messagesAdded);
            labelsAdded = withoutNulls(labelsAdded);
            labelsRemoved = withoutNulls(labelsRemoved);
        }

        Stream<String> ids() {
            return Stream.of(messagesAdded, labelsAdded, labelsRemoved).flatMap(List::stream)
                    .map(MessageChange::message).filter(Objects::nonNull).map(MessageRef::id)
                    .filter(Objects::nonNull);
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record MessageChange(MessageRef message) {
    }

}
