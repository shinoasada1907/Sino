package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.PushRegistration;
import dev.sino.provider.spi.SkippedItem;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.provider.spi.TokenCredentials;

/** Reading buffered Zalo messages and registering the session watch against a fake sino-zalo (WireMock, ZL-08). */
class ZaloFetchUpdatesTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("3e7f48b2-9c14-4d0e-8f2a-1b3c5d7e9f01");
    private static final String OWN_ID = "100000000000000001";
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String SESSION_JSON = """
            {"cookie": [{"key": "zpw_sek", "value": "zpw-fetch-test"}], "imei": "imei-fetch", "userAgent": "UA"}
            """;
    private static final String MESSAGES_PATH = "/accounts/" + ACCOUNT_ID + "/messages";
    private static final String SESSION_PATH = "/accounts/" + ACCOUNT_ID + "/session";
    private static final Instant SINCE = Instant.parse("2026-10-17T08:00:00Z");

    private static WireMockServer sinoZalo;

    @BeforeAll
    static void startSinoZalo() {
        sinoZalo = new WireMockServer(options().dynamicPort());
        sinoZalo.start();
    }

    @AfterAll
    static void stopSinoZalo() {
        sinoZalo.stop();
    }

    @BeforeEach
    void resetSinoZalo() {
        sinoZalo.resetAll();
    }

    @Test
    void theFirstSyncWithoutSinceKeepsEveryMessageAndAdvancesTheCursor() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH)).willReturn(okJson(samplePage("1002", false))));

        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("1001", "1002");
        assertThat(batch.conversations()).extracting(NormalizedConversation::externalConversationId)
                .containsExactly("200000000000000002");
        assertThat(batch.skipped()).isEmpty();
        assertThat(batch.hasMore()).isFalse();
        assertThat(batch.nextCursor()).isEqualTo(new SyncCursor("1002"));
        sinoZalo.verify(getRequestedFor(urlPathEqualTo(MESSAGES_PATH))
                .withQueryParam("after", absent())
                .withQueryParam("limit", equalTo("100"))
                .withHeader("Authorization", equalTo("Bearer " + SECRET)));
    }

    @Test
    void theFirstSyncWithSinceLeavesOutMessagesOlderThanSince() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH)).willReturn(okJson(samplePage("1002", false))));

        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial(SINCE));

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("1002");
        assertThat(batch.conversations()).singleElement().satisfies(conversation -> {
            assertThat(conversation.externalConversationId()).isEqualTo("200000000000000002");
            assertThat(conversation.lastActivityAt()).isEqualTo(Instant.parse("2026-10-17T08:05:00Z"));
        });
        assertThat(batch.nextCursor()).isEqualTo(new SyncCursor("1002"));
    }

    @Test
    void aSubsequentSyncPassesTheSavedCursorAndKeepsTheNewCursor() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH))
                .withQueryParam("after", equalTo("1002"))
                .willReturn(okJson("""
                        {
                          "conversations": [
                            {"threadId": "300000000000000003", "threadType": "GROUP", "title": "Nhóm A",
                             "avatarUrl": null, "participants": [{"id": "200000000000000002", "name": "Bình"}]}
                          ],
                          "messages": [
                            {"msgId": "1003", "threadId": "300000000000000003", "threadType": "GROUP",
                             "fromId": "200000000000000002", "fromName": "Bình", "isSelf": false,
                             "zaloType": "chat.sticker", "text": null, "sentAt": "2026-10-17T08:10:00Z"}
                          ],
                          "nextCursor": "1003",
                          "hasMore": true
                        }
                        """)));

        SyncBatch batch = provider().fetchUpdates(context(), new SyncCursor("1002"));

        assertThat(batch.messages()).singleElement().satisfies(message -> {
            assertThat(message.externalMessageId()).isEqualTo("1003");
            assertThat(message.textContent()).isEqualTo("[Sticker]");
            assertThat(message.metadata()).containsEntry("zaloType", "chat.sticker");
        });
        assertThat(batch.hasMore()).isTrue();
        assertThat(batch.nextCursor()).isEqualTo(new SyncCursor("1003"));
    }

    @Test
    void aBrokenMessageIsRecordedAsSkippedWithoutFailingTheBatch() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH)).willReturn(okJson("""
                {
                  "conversations": [
                    {"threadId": "200000000000000002", "threadType": "USER", "title": "Bình",
                     "avatarUrl": null, "participants": [{"id": "200000000000000002", "name": "Bình"}]}
                  ],
                  "messages": [
                    {"msgId": "1001", "threadId": "200000000000000002", "threadType": "USER",
                     "fromId": "200000000000000002", "fromName": "Bình", "isSelf": false,
                     "zaloType": "webchat", "text": "Tin hợp lệ", "sentAt": "2026-10-17T08:00:00Z"},
                    {"msgId": "1002", "threadId": "200000000000000002", "threadType": "USER",
                     "fromId": null, "fromName": "Bình", "isSelf": false,
                     "zaloType": "webchat", "text": "Thiếu fromId", "sentAt": "2026-10-17T08:01:00Z"}
                  ],
                  "nextCursor": "1002",
                  "hasMore": false
                }
                """)));

        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("1001");
        assertThat(batch.skipped()).singleElement().satisfies(skipped -> {
            assertThat(skipped.kind()).isEqualTo(SkippedItem.Kind.MESSAGE);
            assertThat(skipped.externalId()).isEqualTo("1002");
            assertThat(skipped.reason()).isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        });
    }

    @Test
    void registerPushHandsSinoZaloTheSessionAndExpiresInThreeDays() {
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));
        Instant before = Instant.now();

        PushRegistration registration = provider().registerPush(context()).orElseThrow();

        Instant after = Instant.now();
        assertThat(registration.address()).isEqualTo(OWN_ID);
        assertThat(registration.expiresAt()).isBetween(before.plus(Duration.ofDays(3)), after.plus(Duration.ofDays(3)));
        sinoZalo.verify(putRequestedFor(urlPathEqualTo(SESSION_PATH))
                .withHeader("Authorization", equalTo("Bearer " + SECRET))
                .withRequestBody(equalToJson("{\"session\": " + SESSION_JSON + "}")));
    }

    @Test
    void registerPushWithoutOwnIdFailsBeforeCallingSinoZalo() {
        ProviderContext withoutOwnId = new ProviderContext(ACCOUNT_ID, " ", new TokenCredentials(SESSION_JSON));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().registerPush(withoutOwnId))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
        sinoZalo.verify(0, putRequestedFor(urlPathEqualTo(SESSION_PATH)));
    }

    @Test
    void anEmptyFirstPageWithNullNextCursorReturnsTheInitialCursor() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH)).willReturn(okJson("""
                {"conversations": [], "messages": [], "nextCursor": null, "hasMore": false}
                """)));

        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial(SINCE));

        assertThat(batch.messages()).isEmpty();
        assertThat(batch.conversations()).isEmpty();
        assertThat(batch.nextCursor()).isEqualTo(SyncCursor.initial());
    }

    @Test
    void aMissingOrEndedSessionAtSinoZaloPutsTheStoredSessionAndRetriesOnce() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH))
                .inScenario("restart")
                .whenScenarioStateIs("Started")
                .willReturn(aResponse().withStatus(404).withHeader("Content-Type", "application/json")
                        .withBody("{\"code\": \"UNKNOWN_ACCOUNT\", \"message\": \"No session\"}"))
                .willSetStateTo("session-restored"));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH)).willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH))
                .inScenario("restart")
                .whenScenarioStateIs("session-restored")
                .willReturn(okJson(samplePage("1002", false))));

        SyncBatch batch = provider().fetchUpdates(context(), SyncCursor.initial());

        assertThat(batch.messages()).extracting(NormalizedMessage::externalMessageId).containsExactly("1001", "1002");
        sinoZalo.verify(1, putRequestedFor(urlPathEqualTo(SESSION_PATH)));
        sinoZalo.verify(2, getRequestedFor(urlPathEqualTo(MESSAGES_PATH)));
    }

    @Test
    void anEndedSessionWhosePutAlsoReturns410FailsWithAuthExpired() {
        sinoZalo.stubFor(get(urlPathEqualTo(MESSAGES_PATH))
                .willReturn(aResponse().withStatus(410).withHeader("Content-Type", "application/json")
                        .withBody("{\"code\": \"SESSION_ENDED\", \"message\": \"Kicked\"}")));
        sinoZalo.stubFor(put(urlPathEqualTo(SESSION_PATH))
                .willReturn(aResponse().withStatus(410).withHeader("Content-Type", "application/json")
                        .withBody("{\"code\": \"SESSION_ENDED\", \"message\": \"Rejected\"}")));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> provider().fetchUpdates(context(), SyncCursor.initial()))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.AUTH_EXPIRED);
    }

    private static ZaloProvider provider() {
        return new ZaloProvider(new ZaloProperties(true, URI.create(sinoZalo.baseUrl()), SECRET));
    }

    private static ProviderContext context() {
        return new ProviderContext(ACCOUNT_ID, OWN_ID, new TokenCredentials(SESSION_JSON));
    }

    private static String samplePage(String nextCursor, boolean hasMore) {
        return """
                {
                  "conversations": [
                    {"threadId": "200000000000000002", "threadType": "USER", "title": "Nguyễn Văn B",
                     "avatarUrl": "https://ava.zalo.test/b.jpg",
                     "participants": [{"id": "200000000000000002", "name": "Nguyễn Văn B"}]}
                  ],
                  "messages": [
                    {"msgId": "1001", "threadId": "200000000000000002", "threadType": "USER",
                     "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                     "zaloType": "webchat", "text": "Tin cũ trước 08:00", "sentAt": "2026-10-17T07:55:00Z"},
                    {"msgId": "1002", "threadId": "200000000000000002", "threadType": "USER",
                     "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                     "zaloType": "webchat", "text": "Tin mới sau 08:00", "sentAt": "2026-10-17T08:05:00Z"}
                  ],
                  "nextCursor": "%s",
                  "hasMore": %s
                }
                """.formatted(nextCursor, hasMore);
    }

}
