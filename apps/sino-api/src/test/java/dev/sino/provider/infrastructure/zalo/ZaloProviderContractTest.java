package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

import java.net.URI;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The checks every connector passes (F03), on the Zalo connector against a fake sino-zalo (WireMock). Reading, push
 * and sending are enabled (ZL-08, ZL-09).
 */
class ZaloProviderContractTest extends MessageProviderContractTest {

    private static final UUID ACCOUNT_ID = UUID.fromString("7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51");
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static WireMockServer sinoZalo;

    private ZaloProvider zalo;
    private ZaloProvider withOneBrokenMessage;

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
    void twoSessions() {
        sinoZalo.resetAll();
        sinoZalo.stubFor(put(urlPathEqualTo("/accounts/" + ACCOUNT_ID + "/session"))
                .willReturn(aResponse().withStatus(204)));
        sinoZalo.stubFor(post(urlPathEqualTo("/accounts/" + ACCOUNT_ID + "/messages"))
                .willReturn(aResponse().withStatus(201).withHeader("Content-Type", "application/json")
                        .withBody("{\"msgId\": \"1004\", \"sentAt\": \"2026-10-17T08:05:00Z\"}")));
        sinoZalo.stubFor(get(urlPathEqualTo("/accounts/" + ACCOUNT_ID + "/messages"))
                .willReturn(okJson("""
                        {
                          "conversations": [
                            {"threadId": "200000000000000002", "threadType": "USER", "title": "Nguyễn Văn B",
                             "avatarUrl": null, "participants": [{"id": "200000000000000002", "name": "Nguyễn Văn B"}]}
                          ],
                          "messages": [
                            {"msgId": "1001", "threadId": "200000000000000002", "threadType": "USER",
                             "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                             "zaloType": "webchat", "text": "Trước mốc since", "sentAt": "2026-10-16T12:00:00Z"},
                            {"msgId": "1002", "threadId": "200000000000000002", "threadType": "USER",
                             "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                             "zaloType": "webchat", "text": "Sau mốc since", "sentAt": "2026-10-17T08:00:00Z"}
                          ],
                          "nextCursor": "1002",
                          "hasMore": false
                        }
                        """)));
        sinoZalo.stubFor(get(urlPathEqualTo("/broken/accounts/" + ACCOUNT_ID + "/messages"))
                .willReturn(okJson("""
                        {
                          "conversations": [
                            {"threadId": "200000000000000002", "threadType": "USER", "title": "Nguyễn Văn B",
                             "avatarUrl": null, "participants": [{"id": "200000000000000002", "name": "Nguyễn Văn B"}]}
                          ],
                          "messages": [
                            {"msgId": "1001", "threadId": "200000000000000002", "threadType": "USER",
                             "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                             "zaloType": "webchat", "text": "Tin 1", "sentAt": "2026-10-16T12:00:00Z"},
                            {"msgId": "1002", "threadId": "200000000000000002", "threadType": "USER",
                             "fromId": null, "fromName": "Nguyễn Văn B", "isSelf": false,
                             "zaloType": "webchat", "text": "Tin lỗi", "sentAt": "2026-10-17T01:00:00Z"},
                            {"msgId": "1003", "threadId": "200000000000000002", "threadType": "USER",
                             "fromId": "200000000000000002", "fromName": "Nguyễn Văn B", "isSelf": false,
                             "zaloType": "webchat", "text": "Tin 3", "sentAt": "2026-10-17T08:00:00Z"}
                          ],
                          "nextCursor": "1003",
                          "hasMore": false
                        }
                        """)));
        zalo = new ZaloProvider(new ZaloProperties(true, URI.create(sinoZalo.baseUrl()), SECRET));
        withOneBrokenMessage = new ZaloProvider(
                new ZaloProperties(true, URI.create(sinoZalo.baseUrl() + "/broken"), SECRET));
    }

    @Override
    protected MessageProvider provider() {
        return zalo;
    }

    @Override
    protected MessageProvider providerWithOneBrokenMessage() {
        return withOneBrokenMessage;
    }

    @Override
    protected ProviderContext context() {
        return new ProviderContext(ACCOUNT_ID, "100000000000000001",
                new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-contract-cookie\"}], "
                        + "\"imei\": \"imei-contract\", \"userAgent\": \"Mozilla/5.0 (Sino contract)\"}"));
    }

    @Override
    protected Set<String> expectedMessageIds() {
        return Set.of("1001", "1002");
    }

    @Override
    protected Instant since() {
        return Instant.parse("2026-10-17T00:00:00Z");
    }

}
