package dev.sino.provider;

import java.util.Map;
import java.util.Set;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import dev.sino.provider.spi.OAuth2Connection;

/**
 * Connectors that send or not, for the tests of F10 (D-130). {@link #MAIL} connects with the Google client of the
 * test (set {@link #CLIENT_ID} and {@link #CLIENT_SECRET}), asks for {@link #SEND_SCOPE} without requiring it, and
 * may send only with it. Test classes that import this with the same properties share one application context.
 */
@TestConfiguration(proxyBeanMethods = false)
public class SendingProviders {

    public static final String MAIL = "fake-mail";
    public static final String READER = "fake-read";
    public static final String CHAT = "fake-chat";
    public static final String PICTURE_CHAT = "fake-picture-chat";
    public static final String READ_SCOPE = "mail.read";
    public static final String SEND_SCOPE = "mail.send";
    // The Google client MAIL connects with; fake values, not secrets.
    public static final String CLIENT_ID = "sino.google.client-id=1234567890-test.apps.googleusercontent.test";
    public static final String CLIENT_SECRET = "sino.google.client-secret=GOCSPX-test-client-secret-value";

    /** Sends over OAuth2, once the account granted {@link #SEND_SCOPE}. */
    @Bean
    FakeMessageProvider mailProvider() {
        return FakeMessageProvider.builder(MAIL)
                .capabilities(ProviderCapability.READ_MESSAGES, ProviderCapability.SEND_MESSAGES)
                .oauth2(new OAuth2Connection("google", Set.of("openid", READ_SCOPE, SEND_SCOPE), Set.of(READ_SCOPE),
                        Set.of(SEND_SCOPE), Map.of(), null))
                .build();
    }

    /** Never sends. */
    @Bean
    FakeMessageProvider readerProvider() {
        return FakeMessageProvider.builder(READER).build();
    }

    /** Sends text and pictures without OAuth2 (D-349). */
    @Bean
    FakeMessageProvider pictureChatProvider() {
        return FakeMessageProvider.builder(PICTURE_CHAT)
                .capabilities(ProviderCapability.READ_MESSAGES, ProviderCapability.SEND_MESSAGES,
                        ProviderCapability.SEND_IMAGES)
                .build();
    }

    /** Sends without OAuth2, so without any scope to check. */
    @Bean
    FakeMessageProvider chatProvider() {
        return FakeMessageProvider.builder(CHAT)
                .capabilities(ProviderCapability.READ_MESSAGES, ProviderCapability.SEND_MESSAGES)
                .build();
    }

}
