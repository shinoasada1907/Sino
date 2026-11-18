package dev.sino.provider.infrastructure.zalo;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Message;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Quoted;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.QuotedMessage;
import dev.sino.provider.spi.SendMessageCommand;
import dev.sino.provider.spi.TokenCredentials;
import tools.jackson.databind.json.JsonMapper;

/** Quoting a Zalo message (zalo-quote-reply, QR-02, D-504, D-505): what is stored from Zalo and what is sent. */
class ZaloQuoteTests {

    private static final UUID ACCOUNT_ID = UUID.fromString("4a8b9c10-3c5d-4e6f-8071-2b3c4d5e6f70");
    private static final String SECRET = "sino-zalo-test-secret-0123456789abcdef";
    private static final String MESSAGES = "/accounts/" + ACCOUNT_ID + "/messages";
    private static final String SELF = "100000000000000001";
    private static final String FRIEND = "200000000000000002";
    private static final String SENT_AT = "2026-10-17T08:30:00Z";
    private static final UUID CLIENT_MESSAGE_ID = UUID.fromString("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b");
    private static final ProviderContext CONTEXT = new ProviderContext(ACCOUNT_ID, SELF,
            new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-quote-cookie\"}], "
                    + "\"imei\": \"imei-quote\", \"userAgent\": \"Mozilla/5.0 (Sino quote)\"}"));
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static WireMockServer sinoZalo;

    private ZaloProvider zalo;

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
    void resetServer() {
        sinoZalo.resetAll();
        sinoZalo.stubFor(post(urlPathEqualTo(MESSAGES)).willReturn(aResponse().withStatus(201)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"msgId\": \"1004\", \"sentAt\": \"2026-10-17T08:05:00Z\"}")));
        zalo = new ZaloProvider(new ZaloProperties(true, URI.create(sinoZalo.baseUrl()), SECRET));
    }

    @Test
    void aMessageThatQuotesAnotherStoresItsIdAndAPreview() {
        Quoted quoted = new Quoted("1001", "5001", FRIEND, "Bình", "Chiều nay họp", "text", "1747200000000");

        NormalizedMessage message = ZaloMessageNormalizer.normalize(reply(quoted), SELF);

        assertThat(message.replyToExternalMessageId()).isEqualTo("1001");
        assertThat(message.metadata()).containsEntry(NormalizedMessage.QUOTE_SENDER, "Bình")
                .containsEntry(NormalizedMessage.QUOTE_TEXT, "Chiều nay họp")
                .containsEntry(NormalizedMessage.QUOTE_KIND, "text");
    }

    @Test
    void aLongPreviewIsCutAndAnUnknownKindBecomesOther() {
        Quoted quoted = new Quoted("1001", "5001", FRIEND, "Bình", "x".repeat(300), "hologram", null);

        NormalizedMessage message = ZaloMessageNormalizer.normalize(reply(quoted), SELF);

        assertThat(message.metadata().get(NormalizedMessage.QUOTE_TEXT)).hasSize(120);
        assertThat(message.metadata()).containsEntry(NormalizedMessage.QUOTE_KIND, "other");
    }

    @Test
    void aQuoteWithoutAUsableIdIsNotKept() {
        NormalizedMessage message = ZaloMessageNormalizer.normalize(
                reply(new Quoted("12 34", null, FRIEND, "Bình", "Chiều nay họp", "text", null)), SELF);

        assertThat(message.replyToExternalMessageId()).isNull();
        assertThat(message.metadata()).doesNotContainKey(NormalizedMessage.QUOTE_KIND);
    }

    @Test
    void whatQuotingNeedsIsStoredNextToTheCliMsgId() throws Exception {
        Message text = new Message("1001", FRIEND, "USER", FRIEND, "Bình", false, "webchat", "Chào", SENT_AT, null,
                null, null, "5001", 3600, JSON.readTree("{\"mentions\": []}"), null, null, null);
        Message photo = new Message("1002", FRIEND, "USER", FRIEND, "Bình", false, "chat.photo", null, SENT_AT, null,
                new ZaloClient.Photo("https://example.test/p.jpg", null, null), null, "5002", 0, null,
                JSON.readTree("{\"href\": \"https://example.test/p.jpg\"}"), null, null);

        Map<String, String> textMeta = ZaloMessageNormalizer.normalize(text, SELF).metadata();
        Map<String, String> photoMeta = ZaloMessageNormalizer.normalize(photo, SELF).metadata();

        assertThat(textMeta).containsEntry(NormalizedMessage.TTL, "3600")
                .containsEntry(NormalizedMessage.MSG_TYPE, "webchat")
                .containsEntry(NormalizedMessage.PROPERTY_EXT, "{\"mentions\":[]}")
                .doesNotContainKey(NormalizedMessage.RAW_CONTENT);
        assertThat(photoMeta).containsEntry(NormalizedMessage.MSG_TYPE, "chat.photo")
                .containsKey(NormalizedMessage.RAW_CONTENT);
        assertThat(zalo.canQuote(textMeta)).isTrue();
        assertThat(zalo.canQuote(photoMeta)).isTrue();
    }

    @Test
    void aMessageIsQuotableOnlyWithWhatZaloNeedsToRebuildIt() {
        assertThat(zalo.canQuote(Map.of())).isFalse();
        assertThat(zalo.canQuote(null)).isFalse();
        assertThat(zalo.canQuote(Map.of("cliMsgId", "5001", "ttl", "0"))).isFalse();
        assertThat(zalo.canQuote(Map.of("cliMsgId", "5001", "ttl", "0", "msgType", "chat.photo"))).isFalse();
        assertThat(zalo.canQuote(Map.of("cliMsgId", "5001", "ttl", "0", "msgType", "webchat"))).isTrue();
    }

    @Test
    void aTextReplySendsTheQuoteSinoZaloNeeds() {
        QuotedMessage quoted = new QuotedMessage("1001", FRIEND, "Chiều nay họp", Instant.ofEpochMilli(1747200000000L),
                Map.of("cliMsgId", "5001", "ttl", "0", "msgType", "webchat", "propertyExt", "{\"a\":1}"));

        zalo.sendMessage(CONTEXT, new SendMessageCommand(FRIEND, ConversationType.DIRECT, "Ok", "1001", List.of(),
                CLIENT_MESSAGE_ID, null, null, null, quoted));

        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES)).withRequestBody(equalToJson("""
                {
                  "threadId": "200000000000000002",
                  "threadType": "USER",
                  "text": "Ok",
                  "clientMessageId": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
                  "quote": {"msgId": "1001", "cliMsgId": "5001", "uidFrom": "200000000000000002",
                            "ts": "1747200000000", "ttl": 0, "msgType": "webchat", "content": "Chiều nay họp",
                            "propertyExt": {"a": 1}}
                }
                """)));
    }

    @Test
    void aQuotedPhotoIsSentWithItsRawContent() {
        QuotedMessage quoted = new QuotedMessage("1002", FRIEND, "", Instant.ofEpochMilli(1747200000000L),
                Map.of("cliMsgId", "5002", "ttl", "0", "msgType", "chat.photo",
                        "rawContent", "{\"href\":\"https://example.test/p.jpg\"}"));

        zalo.sendMessage(CONTEXT, new SendMessageCommand(FRIEND, ConversationType.DIRECT, "Ok", "1002", List.of(),
                CLIENT_MESSAGE_ID, null, null, null, quoted));

        sinoZalo.verify(postRequestedFor(urlPathEqualTo(MESSAGES)).withRequestBody(equalToJson("""
                {"quote": {"msgId": "1002", "msgType": "chat.photo",
                           "content": {"href": "https://example.test/p.jpg"}}}
                """, true, true)));
    }

    private static Message reply(Quoted quoted) {
        return new Message("1003", FRIEND, "USER", FRIEND, "Bình", false, "webchat", "Ok", SENT_AT, null, null, null,
                "5003", 0, null, null, quoted, null);
    }

}
