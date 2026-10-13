package dev.sino.provider.infrastructure.gmail;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.github.tomakehurst.wiremock.WireMockServer;

import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/** Reading one message again for its content (F06, D-122), against a fake Gmail API (WireMock). */
class GmailContentTests {

    private static final String API = "/gmail/v1/users/me";
    private static final String ACCESS_TOKEN = "ya29.gmail-content-access-token";
    private static final String ID = "18f0a1b2c3d4e5f6";

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
    void readsTheHtmlAndTheAddresseesOfOneMessageAgain() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("alternative.json"))));

        MessageContent content = gmailProvider().fetchMessageContent(context(), ID).orElseThrow();

        assertThat(content.htmlContent()).isEqualTo("<div>HTML version</div>");
        assertThat(content.recipients().to()).containsExactly(new Address(null, "owner@gmail.test"),
                new Address("Trần, Bình", "binh@example.com"));
        assertThat(content.recipients().cc()).containsExactly(new Address(null, "chi@example.com"));
        gmail.verify(exactly(1), anyRequestedFor(anyUrl()));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages/" + ID))
                .withQueryParam("format", equalTo("full"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
    }

    @Test
    void aMessageWithoutHtmlHasNone() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("latin1.json"))));

        assertThat(gmailProvider().fetchMessageContent(context(), ID).orElseThrow().htmlContent()).isNull();
    }

    @Test
    void aMessageGmailNoLongerHasGivesNothing() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(aResponse().withStatus(404)));

        assertThat(gmailProvider().fetchMessageContent(context(), ID)).isEmpty();
    }

    @Test
    void gmailOutOfServiceIsAProviderThatCannotBeReached() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(aResponse().withStatus(503)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailProvider().fetchMessageContent(context(), ID))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    @Test
    void aMessageWithoutPayloadCannotBeRead() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson("""
                {"id": "18f0a1b2c3d4e5f6", "threadId": "thread-report"}
                """)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailProvider().fetchMessageContent(context(), ID))
                .extracting(ProviderException::errorCode)
                .isEqualTo(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED);
    }

    @Test
    void aFileGmailKeepsApartIsAskedForByTheIdItHasNow() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("mixed-sent.json"))));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID + "/attachments/ANGjdJ-contract-pdf"))
                .willReturn(okJson("""
                        {"size": 8, "data": "JVBERi0xLjc="}
                        """)));

        AttachmentContent file = gmailProvider().fetchAttachment(context(), ID, "1");

        assertThat(new String(file.content(), StandardCharsets.UTF_8)).isEqualTo("%PDF-1.7");
        assertThat(file.mimeType()).isEqualTo("application/pdf");
        gmail.verify(exactly(2), anyRequestedFor(anyUrl()));
        gmail.verify(getRequestedFor(urlPathEqualTo(API + "/messages/" + ID + "/attachments/ANGjdJ-contract-pdf"))
                .withHeader("Authorization", equalTo("Bearer " + ACCESS_TOKEN)));
    }

    @Test
    void aSmallPartInsideTheMessageNeedsNoSecondCall() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("mixed-sent.json"))));

        AttachmentContent part = gmailProvider().fetchAttachment(context(), ID, "0.0.0");

        assertThat(new String(part.content(), StandardCharsets.UTF_8)).isEqualTo("Gửi anh hợp đồng và ghi chú.");
        assertThat(part.mimeType()).isEqualTo("text/plain");
        gmail.verify(exactly(1), anyRequestedFor(anyUrl()));
    }

    @Test
    void aMailThatIsOneFileGivesThatFileByTheIdOfItsTopPart() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson("""
                {"id": "18f0a1b2c3d4e5f6", "threadId": "thread-scan", "labelIds": ["INBOX"],
                 "internalDate": "1760000000000",
                 "payload": {"partId": "", "mimeType": "application/pdf", "filename": "scan.pdf",
                   "headers": [{"name": "From", "value": "scanner@example.com"}],
                   "body": {"attachmentId": "ANGjdJ-scan", "size": 8}}}
                """)));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID + "/attachments/ANGjdJ-scan")).willReturn(okJson("""
                {"size": 8, "data": "JVBERi0xLjc="}
                """)));

        AttachmentContent file = gmailProvider().fetchAttachment(context(), ID, GmailMessageNormalizer.ROOT_PART_ID);

        assertThat(new String(file.content(), StandardCharsets.UTF_8)).isEqualTo("%PDF-1.7");
        assertThat(file.mimeType()).isEqualTo("application/pdf");
    }

    @Test
    void aLargeFileMayTakeLongerThanAnyOtherCallToGmail() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("mixed-sent.json"))));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID + "/attachments/ANGjdJ-contract-pdf"))
                .willReturn(okJson("""
                        {"size": 8, "data": "JVBERi0xLjc="}
                        """).withChunkedDribbleDelay(4, 3000)));

        AttachmentContent file = gmailProvider().fetchAttachment(context(), ID, "1");

        assertThat(new String(file.content(), StandardCharsets.UTF_8))
                .as("3 s of content, past the 2 s every other call has").isEqualTo("%PDF-1.7");
    }

    @Test
    void aPartOrAMessageGmailNoLongerHasIsRefused() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("mixed-sent.json"))));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/gone")).willReturn(aResponse().withStatus(404)));

        for (String[] ids : new String[][] { { ID, "9" }, { "gone", "1" } }) {
            assertThatExceptionOfType(ProviderException.class)
                    .isThrownBy(() -> gmailProvider().fetchAttachment(context(), ids[0], ids[1]))
                    .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.REQUEST_REJECTED);
        }
    }

    @Test
    void gmailOutOfServiceWhileGivingTheFileIsAProviderThatCannotBeReached() {
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID)).willReturn(okJson(sample("mixed-sent.json"))));
        gmail.stubFor(get(urlPathEqualTo(API + "/messages/" + ID + "/attachments/ANGjdJ-contract-pdf"))
                .willReturn(aResponse().withStatus(503)));

        assertThatExceptionOfType(ProviderException.class)
                .isThrownBy(() -> gmailProvider().fetchAttachment(context(), ID, "1"))
                .extracting(ProviderException::errorCode).isEqualTo(ProviderErrorCode.PROVIDER_UNAVAILABLE);
    }

    private static String sample(String name) {
        try (InputStream in = GmailContentTests.class.getResourceAsStream("/gmail/" + name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static GmailProvider gmailProvider() {
        return new GmailProvider(URI.create(gmail.baseUrl() + "/v1/userinfo"), URI.create(gmail.baseUrl()),
                URI.create(gmail.baseUrl() + "/revoke"), Duration.ofSeconds(1), Duration.ofSeconds(2));
    }

    private static ProviderContext context() {
        return new ProviderContext(UUID.randomUUID(), "110248495921238986420", new OAuth2Credentials(ACCESS_TOKEN,
                null, Set.of("openid", "https://www.googleapis.com/auth/gmail.readonly")));
    }

}
