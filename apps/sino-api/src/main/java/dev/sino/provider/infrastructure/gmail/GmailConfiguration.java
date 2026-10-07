package dev.sino.provider.infrastructure.gmail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.util.StringUtils;

/**
 * Gmail is on only when Sino has a Google OAuth client, so the app, the tests and CI run without a Google project.
 * Half a client (an id without its secret, or the reverse) stops the startup. The {@code account} module finds the
 * client by its registration id; Spring Boot's own OAuth2 client support stays off (D-38).
 */
@Configuration(proxyBeanMethods = false)
class GmailConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(GmailConfiguration.class);
    private static final String CLIENT_ID = "sino.google.client-id";
    private static final String CLIENT_SECRET = "sino.google.client-secret";

    @Configuration(proxyBeanMethods = false)
    @Conditional(GoogleClientGiven.class)
    @EnableConfigurationProperties(GmailProperties.class)
    static class On {

        private final GmailProperties properties;

        On(GmailProperties properties) {
            // Checked by hand: the messages name the setting, never its value.
            if (!StringUtils.hasText(properties.clientId())) {
                throw new IllegalStateException("SINO_GOOGLE_CLIENT_ID (" + CLIENT_ID + ") is missing while "
                        + "SINO_GOOGLE_CLIENT_SECRET is set: set both, or neither to turn Gmail off");
            }
            if (!StringUtils.hasText(properties.clientSecret())) {
                throw new IllegalStateException("SINO_GOOGLE_CLIENT_SECRET (" + CLIENT_SECRET + ") is missing while "
                        + "SINO_GOOGLE_CLIENT_ID is set: set both, or neither to turn Gmail off");
            }
            this.properties = properties;
        }

        // The redirect URI of Google's template stays unused: the account module sets the real one on each request.
        @Bean
        ClientRegistration googleClientRegistration() {
            return CommonOAuth2Provider.GOOGLE.getBuilder(GmailProvider.REGISTRATION_ID)
                    .clientId(properties.clientId())
                    .clientSecret(properties.clientSecret())
                    .scope(GmailProvider.SCOPES)
                    .authorizationUri(properties.authorizationUri().toString())
                    .tokenUri(properties.tokenUri().toString())
                    .userInfoUri(properties.userInfoUri().toString())
                    .build();
        }

        @Bean
        GmailProvider gmailProvider() {
            return new GmailProvider(properties);
        }

    }

    @Configuration(proxyBeanMethods = false)
    @Conditional(GoogleClientMissing.class)
    static class Off {

        Off() {
            LOG.info("Gmail is off: set SINO_GOOGLE_CLIENT_ID and SINO_GOOGLE_CLIENT_SECRET to connect Gmail accounts");
        }

    }

    static class GoogleClientGiven implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return StringUtils.hasText(context.getEnvironment().getProperty(CLIENT_ID))
                    || StringUtils.hasText(context.getEnvironment().getProperty(CLIENT_SECRET));
        }

    }

    static class GoogleClientMissing implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return !new GoogleClientGiven().matches(context, metadata);
        }

    }

}
