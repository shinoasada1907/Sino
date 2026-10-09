package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.havingExactly;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.assertj.core.api.ThrowableAssertAlternative;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.matching.StringValuePattern;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Reading mail: the Gmail connector against a fake Gmail API (WireMock) serving the hand-made samples of
 * {@code src/test/resources/gmail}.
 */
class GmailSyncTests {

    private static final String API = "/gmail/v1/users/me";
    private static final String ACCESS_TOKEN = "ya29.gmail-sync-access-token";
    private static final String SELF = "owner@gmail.test";
    // The samples: id, thread and internalDate.
    private static final String REPORT = "18f0a1b2c3d4e5f6"; // alternative.json, thread-report, 1759996800000
    private static final String NEWS = "18f0a1b2c3d4e5f7"; // html-only.json, thread-news, 1760000400000
    private static final String CAFE = "18f0a1b2c3d4e5f9"; // latin1.json
    private static final String NO_FROM = "18f0a1b2c3d4e5fb"; // no-from.json
    // Between REPORT and NEWS.
    private static final Instant SINCE = Instant.ofEpochSecond(1759998600L);
    private static final String AFTER_SINCE = "after:1759998600";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static WireMockServer gmail;

    @BeforeAll
    static void startGmail() {
        gmail = new WireMockServer(options().dynamicPort());
        gmail.start();
    }

    @AfterAll
    static void stopGmail() {
        gmail.stop();
    }

    @BeforeEach
    void forgetEarlierCalls() {
        gmail.resetAll();
    }

    @Test
    void theFirstSyncAsksForTheMailSinceTheMomentFiftyAtATime() {
        profile("", "1000");
        list("", equalTo(AFTER_SINCE), absent(), "page-2", NEWS, CAFE);
        message("", NEWS, "html-only.json");
        message("", CAFE, "latin1.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), SyncCursor.initial(SINCE));

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS, CAFE);
        assertThat(batch.conversations()).extracting(NormalizedConversation::externalConversationId)
                .containsExactly("thread-news", "thread-cafe");
        assertThat(batch.skipped()).isEmpty();
        assertThat(batch.hasMore()).isTrue();
        assertThat(batch.nextCursor().value()).isEqualTo("v1|list|1000|1759998600000|page-2");
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages")).withQueryParam("q", equalTo(AFTER_SINCE))
                .withQueryParam("maxResults", equalTo("50"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages/" + NEWS))
                .withQueryParam("format", equalTo("full")));
    }

    @Test
    void theAccountIsItselfInItsMail() {
        profile("", "1000");
        list("", absent(), absent(), null, REPORT);
        message("", REPORT, "alternative.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.conversations().getFirst().participants()).filteredOn(NormalizedParticipant::self)
                .extracting(NormalizedParticipant::externalParticipantId).containsExactly(SELF);
    }

    @Test
    void theLastPageOfTheFirstSyncMovesOnToTheChangesSinceItStarted() {
        // New mail arrived since the first sync started at 1000: it is read as a change, from 1000.
        profile("", "2000");
        list("", equalTo(AFTER_SINCE), equalTo("page-2"), null, NEWS);
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|list|1000|1759998600000|page-2"));

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(batch.hasMore()).isFalse();
        assertThat(batch.nextCursor().value()).isEqualTo("v1|history|1000|1759998600000");
    }

    @Test
    void aFirstSyncWithoutAMomentReadsTheWholeMailboxPageAfterPage() {
        profile("", "1000");
        list("", absent(), absent(), "page-2", REPORT);
        list("", absent(), equalTo("page-2"), null, NEWS);
        message("", REPORT, "alternative.json");
        message("", NEWS, "html-only.json");

        SyncBatch first = gmailAt("").fetchUpdates(context(), SyncCursor.initial());
        SyncBatch second = gmailAt("").fetchUpdates(context(), first.nextCursor());

        assertThat(first.nextCursor().value()).isEqualTo("v1|list|1000|-|page-2");
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(second.nextCursor().value()).isEqualTo("v1|history|1000|-");
    }

    @Test
    void aProfileWithoutHistoryIdCannotStartAFirstSync() {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(okJson("{\"emailAddress\": \"" + SELF + "\"}")));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void changesAreReadFromTheHistoryEachMessageOnce() {
        profile("", "1010");
        history("", "1000", absent(), """
                {"history": [
                  {"id": "1001", "messagesAdded": [{"message": {"id": "%1$s", "threadId": "thread-report"}}]},
                  {"id": "1002", "labelsRemoved": [{"message": {"id": "%2$s", "threadId": "thread-news"},
                                                    "labelIds": ["UNREAD"]}]},
                  {"id": "1003", "labelsAdded": [{"message": {"id": "%1$s", "threadId": "thread-report"},
                                                  "labelIds": ["IMPORTANT"]}]}],
                 "historyId": "1010"}
                """.formatted(REPORT, NEWS));
        message("", REPORT, "alternative.json");
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(REPORT, NEWS);
        assertThat(batch.messages().get(1).read()).as("UNREAD was removed").isTrue();
        assertThat(batch.hasMore()).isFalse();
        assertThat(batch.nextCursor().value()).isEqualTo("v1|history|1010|-");
        gmail.verify(1, getRequestedFor(urlPathEqualTo(API + "/messages/" + REPORT)));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/history")).withQueryParam("startHistoryId", equalTo("1000"))
                .withQueryParam("historyTypes", havingExactly("messageAdded", "labelAdded", "labelRemoved"))
                .withQueryParam("maxResults", equalTo("50")));
    }

    @Test
    void moreChangesComeOnTheNextPage() {
        profile("", "1020");
        history("", "1000", absent(), """
                {"history": [{"id": "1001", "messagesAdded": [{"message": {"id": "%s"}}]}],
                 "nextPageToken": "h-2", "historyId": "1020"}
                """.formatted(REPORT));
        history("", "1000", equalTo("h-2"), """
                {"history": [{"id": "1015", "messagesAdded": [{"message": {"id": "%s"}}]}], "historyId": "1020"}
                """.formatted(NEWS));
        message("", REPORT, "alternative.json");
        message("", NEWS, "html-only.json");

        SyncBatch first = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));
        SyncBatch second = gmailAt("").fetchUpdates(context(), first.nextCursor());

        assertThat(first.hasMore()).isTrue();
        assertThat(first.nextCursor().value()).as("the run ends at 1020, read before its first page")
                .isEqualTo("v1|history|1000|-|1020|h-2");
        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(second.hasMore()).isFalse();
        assertThat(second.nextCursor().value()).isEqualTo("v1|history|1020|-");
    }

    @Test
    void noChangesMoveTheCursorToTheLatestHistoryId() {
        profile("", "1005");
        history("", "1000", absent(), "{\"historyId\": \"1005\"}");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));

        assertThat(batch.messages()).isEmpty();
        assertThat(batch.conversations()).isEmpty();
        assertThat(batch.hasMore()).isFalse();
        assertThat(batch.nextCursor().value()).isEqualTo("v1|history|1005|-");
    }

    @Test
    void aChangeWithoutAMessageIsIgnored() {
        profile("", "1005");
        history("", "1000", absent(), """
                {"history": [null, {"id": "1004", "labelsAdded": [{"labelIds": ["STARRED"]}, null]}],
                 "historyId": "1005"}
                """);

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));

        assertThat(batch.messages()).isEmpty();
        assertThat(batch.nextCursor().value()).isEqualTo("v1|history|1005|-");
        gmail.verify(0, getRequestedFor(urlPathMatching(API + "/messages/.+")));
    }

    @Test
    void aProfileWithoutUsableHistoryIdCannotFollowChanges() {
        profile("", "soon");
        history("", "1000", absent(), "{\"historyId\": \"1005\"}");

        assertThatSyncFails(new SyncCursor("v1|history|1000|-"), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aRunOfHistoryPagesEndsAtTheHistoryIdSeenBeforeItsFirstPage() {
        profile("", "1020");
        history("", "1000", absent(), """
                {"history": [{"id": "1001", "messagesAdded": [{"message": {"id": "%s"}}]}],
                 "nextPageToken": "h-2", "historyId": "1020"}
                """.formatted(REPORT));
        message("", REPORT, "alternative.json");
        SyncBatch first = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));
        // Mail keeps changing while the run pages on: Gmail is at 1100 when the last page comes.
        profile("", "1100");
        history("", "1000", equalTo("h-2"), "{\"historyId\": \"1100\"}");

        SyncBatch last = gmailAt("").fetchUpdates(context(), first.nextCursor());

        assertThat(last.nextCursor().value()).as("1020 to 1100 is read next time, not lost")
                .isEqualTo("v1|history|1020|-");
    }

    @Test
    void changesLeaveOutMailOlderThanTheChosenMoment() {
        profile("", "1010");
        history("", "1000", absent(), """
                {"history": [
                  {"id": "1001", "labelsRemoved": [{"message": {"id": "%s"}, "labelIds": ["UNREAD"]}]},
                  {"id": "1002", "messagesAdded": [{"message": {"id": "%s"}}]}],
                 "historyId": "1010"}
                """.formatted(REPORT, NEWS));
        message("", REPORT, "alternative.json");
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|1759998600000"));

        assertThat(batch.messages()).as("the old report only had a label changed")
                .extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(batch.conversations()).extracting(NormalizedConversation::externalConversationId)
                .containsExactly("thread-news");
        assertThat(batch.nextCursor().value()).isEqualTo("v1|history|1010|1759998600000");
    }

    @Test
    void mailFromJustBeforeTheMomentIsLeftOutEvenWhenGmailSendsIt() {
        // Gmail's after: counts in seconds: half a second before the moment, NEWS still comes back.
        Instant halfASecondAfterNews = Instant.ofEpochMilli(1760000400500L);
        profile("", "1000");
        list("", equalTo("after:1760000400"), absent(), null, NEWS);
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), SyncCursor.initial(halfASecondAfterNews));

        assertThat(batch.messages()).isEmpty();
        assertThat(batch.conversations()).isEmpty();
    }

    @Test
    void anEmptyAnswerIsAnAnswerSinoCannotRead() {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(aResponse().withStatus(200)
                .withHeader("Content-Type", "application/json")));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(200).withHeader("Content-Type", "application/json"));
        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aConnectionBrokenInTheMiddleOfAMessageIsNotABrokenMessage() {
        profile("", "1000");
        list("", absent(), absent(), null, REPORT);
        // The headers come at once, the body slower than the read timeout (2 s): the read breaks off midway.
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + REPORT))
                .willReturn(okJson(sample("alternative.json")).withChunkedDribbleDelay(8, 4000)));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void aPageTokenGmailNoLongerAcceptsExpiresTheCursor() {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(400));
        history("", "1000", equalTo("h-2"), "{}");
        gmail.stubFor(get(urlPathEqualTo(API + "/history")).willReturn(aResponse().withStatus(400)));

        assertThatSyncFails(new SyncCursor("v1|list|1000|-|page-2"), ProviderErrorCode.CURSOR_EXPIRED);
        assertThatSyncFails(new SyncCursor("v1|history|1000|-|1020|h-2"), ProviderErrorCode.CURSOR_EXPIRED);
        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.REQUEST_REJECTED);
    }

    @Test
    void aPageTokenIsSentExactlyAsGmailWroteIt() {
        profile("", "1000");
        list("", absent(), absent(), "a+b/c{d}=", REPORT);
        list("", absent(), equalTo("a+b/c{d}="), null, NEWS);
        message("", REPORT, "alternative.json");
        message("", NEWS, "html-only.json");

        SyncBatch first = gmailAt("").fetchUpdates(context(), SyncCursor.initial());
        SyncBatch second = gmailAt("").fetchUpdates(context(), first.nextCursor());

        assertThat(second.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
    }

    @Test
    void aHistoryIdGmailNoLongerKeepsExpiresTheCursor() {
        profile("", "9000");
        gmail.stubFor(get(urlPathEqualTo(API + "/history")).willReturn(aResponse().withStatus(404)));

        assertThatSyncFails(new SyncCursor("v1|history|1000|-"), ProviderErrorCode.CURSOR_EXPIRED);
    }

    @Test
    void aMessageDeletedMeanwhileIsLeftOut() {
        profile("", "1000");
        list("", absent(), absent(), null, REPORT, NEWS);
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + REPORT)).willReturn(aResponse().withStatus(404)));
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(batch.skipped()).isEmpty();
    }

    @Test
    void draftsSpamAndTrashAreLeftOut() {
        profile("", "1010");
        history("", "1000", absent(), """
                {"history": [{"id": "1001", "messagesAdded": [{"message": {"id": "draft-1"}},
                    {"message": {"id": "spam-1"}}, {"message": {"id": "trash-1"}}, {"message": {"id": "%s"}}]}],
                 "historyId": "1010"}
                """.formatted(REPORT));
        messageAs("", "draft-1", "alternative.json", "DRAFT");
        messageAs("", "spam-1", "alternative.json", "SPAM", "UNREAD");
        messageAs("", "trash-1", "alternative.json", "TRASH");
        message("", REPORT, "alternative.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), new SyncCursor("v1|history|1000|-"));

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(REPORT);
        assertThat(batch.skipped()).isEmpty();
    }

    @Test
    void aMessageSinoCannotReadIsSkippedAndTheOthersAreKept() {
        profile("", "1000");
        list("", absent(), absent(), null, REPORT, NEWS);
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + REPORT)).willReturn(aResponse().withStatus(200)
                .withHeader("Content-Type", "application/json").withBody("not json")));
        message("", NEWS, "html-only.json");

        SyncBatch batch = gmailAt("").fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly(NEWS);
        assertThat(batch.skipped()).singleElement().satisfies(item -> {
            assertThat(item.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
            assertThat(item.externalId()).isEqualTo(REPORT);
            assertThat(item.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        });
    }

    @Test
    void aFailureInTheMiddleOfAPageFailsTheWholeCall() {
        profile("", "1000");
        list("", absent(), absent(), null, REPORT, NEWS);
        message("", REPORT, "alternative.json");
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + NEWS)).willReturn(aResponse().withStatus(503)));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(strings = { "\"reason\": \"userRateLimitExceeded\"", "\"reason\": \"rateLimitExceeded\"" })
    void aQuotaRefusalIsRateLimiting(String reason) {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(403).withHeader("Content-Type", "application/json").withBody("""
                {"error": {"code": 403, "message": "Quota exceeded for ya29.leaked",
                  "errors": [{"domain": "usageLimits", %s, "message": "Quota exceeded"}],
                  "status": "PERMISSION_DENIED"}}
                """.formatted(reason)));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.RATE_LIMITED)
                .withMessageNotContaining("ya29.leaked").withMessageNotContaining("Quota exceeded");
    }

    @Test
    void anExhaustedResourceIsRateLimitingToo() {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(403).withHeader("Content-Type", "application/json").withBody("""
                {"error": {"code": 403, "message": "Resource has been exhausted", "status": "RESOURCE_EXHAUSTED"}}
                """));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.RATE_LIMITED);
    }

    @Test
    void anotherRefusalIsARejectedRequest() {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(403).withHeader("Content-Type", "application/json").withBody("""
                {"error": {"code": 403, "message": "Request had insufficient authentication scopes.",
                  "errors": [{"domain": "global", "reason": "insufficientPermissions"}],
                  "status": "PERMISSION_DENIED"}}
                """));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.REQUEST_REJECTED)
                .withMessageNotContaining("insufficient");
    }

    @Test
    void throttlingCarriesTheWaitGmailAskedFor() {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(429).withHeader("Retry-After", "30"));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.RATE_LIMITED)
                .satisfies(failure -> assertThat(failure.retryAfter()).contains(Duration.ofSeconds(30)));
    }

    @Test
    void aRefusedTokenMeansTheAuthorizationExpired() {
        gmail.stubFor(get(urlPathEqualTo(API + "/profile")).willReturn(aResponse().withStatus(401)));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.AUTH_EXPIRED);
    }

    @Test
    void anUnreadablePageFailsTheCall() {
        profile("", "1000");
        answerTheListWith(aResponse().withStatus(200).withHeader("Content-Type", "application/json")
                .withBody("not json"));

        assertThatSyncFails(SyncCursor.initial(), ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @ParameterizedTest
    @ValueSource(strings = { "page-1", "v2|history|1000|-", "v1|history|", "v1|history|abc|-", "v1|history|1000",
        "v1|history|1000|", "v1|history|1000|-|1020", "v1|history|1000|-|x|h-2",
        "v1|list|1000|-|", "v1|list|1000|yesterday|page-2", "v1|list|1000|-", "v1|list|x|-|page-2" })
    void aCursorGmailDidNotWriteIsRejectedWithoutAskingGmail(String value) {
        assertThatSyncFails(new SyncCursor(value), ProviderErrorCode.REQUEST_REJECTED);
        gmail.verify(0, anyRequestedFor(anyUrl()));
    }

    @Nested
    class Contract extends MessageProviderContractTest {

        private final GmailProvider mailbox = gmailAt("");
        private final GmailProvider withABrokenMessage = gmailAt("/broken");

        @BeforeEach
        void twoMailboxes() {
            profile("", "1000");
            list("", absent(), absent(), null, REPORT, NEWS);
            list("", equalTo(AFTER_SINCE), absent(), null, NEWS);
            message("", REPORT, "alternative.json");
            message("", NEWS, "html-only.json");
            profile("/broken", "2000");
            list("/broken", absent(), absent(), null, REPORT, NO_FROM, CAFE);
            message("/broken", REPORT, "alternative.json");
            message("/broken", NO_FROM, "no-from.json");
            message("/broken", CAFE, "latin1.json");
        }

        @Override
        protected MessageProvider provider() {
            return mailbox;
        }

        @Override
        protected MessageProvider providerWithOneBrokenMessage() {
            return withABrokenMessage;
        }

        @Override
        protected ProviderContext context() {
            return GmailSyncTests.context();
        }

        @Override
        protected Set<String> expectedMessageIds() {
            return Set.of(REPORT, NEWS);
        }

        @Override
        protected Instant since() {
            return SINCE;
        }

    }

    private static GmailProvider gmailAt(String base) {
        return new GmailProvider(URI.create(gmail.baseUrl() + "/v1/userinfo"), URI.create(gmail.baseUrl() + base),
                URI.create(gmail.baseUrl() + "/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(2));
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), "110248495921238986420", new OAuth2Credentials(ACCESS_TOKEN,
                null, Set.of("openid", "https://www.googleapis.com/auth/gmail.readonly")));
    }

    private static ThrowableAssertAlternative<ProviderException> assertThatSyncFails(SyncCursor cursor,
            ProviderErrorCode code) {
        return assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailAt("").fetchUpdates(context(), cursor))
                .satisfies(failure -> assertThat(failure.errorCode()).isEqualTo(code))
                .withMessageNotContaining(ACCESS_TOKEN);
    }

    private static void profile(String base, String historyId) {
        gmail.stubFor(get(urlPathEqualTo(base + API + "/profile")).willReturn(okJson("""
                {"emailAddress": "%s", "messagesTotal": 3, "threadsTotal": 2, "historyId": "%s"}
                """.formatted(SELF, historyId))));
    }

    // One page of messages.list; q and pageToken say what the request must carry (absent() when nothing).
    private static void list(String base, StringValuePattern q, StringValuePattern pageToken, String nextPageToken,
            String... ids) {
        StringBuilder messages = new StringBuilder();
        for (String id : ids) {
            messages.append(messages.isEmpty() ? "" : ", ").append("{\"id\": \"").append(id)
                    .append("\", \"threadId\": \"t-").append(id).append("\"}");
        }
        String next = nextPageToken == null ? "" : ", \"nextPageToken\": \"" + nextPageToken + "\"";
        gmail.stubFor(get(urlPathEqualTo(base + API + "/messages")).withQueryParam("q", q)
                .withQueryParam("pageToken", pageToken)
                .willReturn(okJson("{\"messages\": [" + messages + "]" + next + ", \"resultSizeEstimate\": "
                        + ids.length + "}")));
    }

    private static void answerTheListWith(ResponseDefinitionBuilder response) {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages")).willReturn(response));
    }

    private static void history(String base, String startHistoryId, StringValuePattern pageToken, String json) {
        gmail.stubFor(get(urlPathEqualTo(base + API + "/history"))
                .withQueryParam("startHistoryId", equalTo(startHistoryId)).withQueryParam("pageToken", pageToken)
                .willReturn(okJson(json)));
    }

    private static void message(String base, String id, String sample) {
        gmail.stubFor(get(urlPathEqualTo(base + API + "/messages/" + id)).withQueryParam("format", equalTo("full"))
                .willReturn(okJson(sample(sample))));
    }

    // A sample under another id and with other labels.
    private static void messageAs(String base, String id, String sample, String... labels) {
        ObjectNode message = (ObjectNode) JSON.readTree(sample(sample));
        message.put("id", id);
        ArrayNode labelIds = message.putArray("labelIds");
        for (String label : labels) {
            labelIds.add(label);
        }
        gmail.stubFor(get(urlPathEqualTo(base + API + "/messages/" + id)).willReturn(okJson(message.toString())));
    }

    private static String sample(String name) {
        try (InputStream json = GmailSyncTests.class.getResourceAsStream("/gmail/" + name)) {
            return new String(json.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

}
