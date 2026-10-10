package dev.sino.provider.infrastructure.gmail;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

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
 * Half a client (an id without its secret, or the reverse) stops the startup, and so does half the setup of Gmail's
 * notices (D-76): the Pub/Sub topic, audience and service account go together, and with them comes the webhook. The
 * {@code account} module finds the client by its registration id; Spring Boot's own OAuth2 client support stays off
 * (D-38).
 */
@Configuration(proxyBeanMethods = false)
class GmailConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(GmailConfiguration.class);
    private static final String CLIENT_ID = "sino.google.client-id";
    private static final String CLIENT_SECRET = "sino.google.client-secret";
    private static final Pattern PUBSUB_TOPIC = Pattern.compile("projects/[^/\\s]+/topics/[^/\\s]+");
    private static final String PUBSUB_TOPIC_SETTING = "sino.google.pubsub.topic";

    // Half a push setup would register watches whose notices nobody can check: all three settings, or none.
    static void checkPubSub(GmailProperties.PubSub pubsub) {
        Map<String, String> settings = new LinkedHashMap<>();
        settings.put("SINO_GOOGLE_PUBSUB_TOPIC", pubsub.topic());
        settings.put("SINO_GOOGLE_PUBSUB_AUDIENCE", pubsub.audience());
        settings.put("SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT", pubsub.serviceAccount());
        List<String> missing = settings.entrySet().stream().filter(setting -> setting.getValue() == null)
                .map(Map.Entry::getKey).toList();
        if (missing.size() == settings.size()) {
            LOG.info("Gmail is only polled for new mail: set SINO_GOOGLE_PUBSUB_TOPIC, SINO_GOOGLE_PUBSUB_AUDIENCE "
                    + "and SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT for Gmail to tell Sino");
            return;
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException(String.join(", ", missing) + " missing: the Gmail notice settings "
                    + String.join(", ", settings.keySet()) + " go together; set all three, or none to only poll "
                    + "Gmail");
        }
        if (!PUBSUB_TOPIC.matcher(pubsub.topic()).matches()) {
            throw new IllegalStateException("SINO_GOOGLE_PUBSUB_TOPIC (sino.google.pubsub.topic) must look like "
                    + "projects/<project id>/topics/<topic name>");
        }
        if (!pubsub.serviceAccount().contains("@")) {
            throw new IllegalStateException("SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT (sino.google.pubsub.service-account)"
                    + " must be the email of the push subscription's service account");
        }
    }

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
            checkPubSub(properties.pubsub());
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

    static class PubSubGiven implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return StringUtils.hasText(context.getEnvironment().getProperty(PUBSUB_TOPIC_SETTING));
        }

    }

    static class GoogleClientMissing implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return !new GoogleClientGiven().matches(context, metadata);
        }

    }

}
