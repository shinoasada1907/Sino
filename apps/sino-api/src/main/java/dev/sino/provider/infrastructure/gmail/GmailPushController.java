package dev.sino.provider.infrastructure.gmail;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import dev.sino.provider.ProviderPushReceived;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Where Cloud Pub/Sub pushes Gmail's notices (D-76): {@code POST /api/webhooks/gmail}, with no session and no CSRF
 * token. A push without a token Google gave the subscription gets 401 and nothing else happens. A notice is only a
 * signal: its mailbox address goes out as {@link ProviderPushReceived}, whoever listens reads the changes itself, and
 * its {@code historyId} is not used. A notice that cannot be read is still taken (204): it would never read better,
 * and Pub/Sub would send it again for days. Neither the address nor anything of the body is logged. Exists only with
 * the Pub/Sub settings (404 otherwise).
 */
@RestController
@Conditional({ GmailConfiguration.GoogleClientGiven.class, GmailConfiguration.PubSubGiven.class })
class GmailPushController {

    static final int MAX_BODY_BYTES = 64 * 1024;

    private static final Logger log = LoggerFactory.getLogger(GmailPushController.class);
    private static final int MAX_ADDRESS_LENGTH = 320;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final GmailPushTokens tokens;
    private final ApplicationEventPublisher events;

    // Checked here too: this bean may be made before GmailConfiguration.On, and half a setup must stop the start the
    // same way.
    GmailPushController(GmailProperties properties, ApplicationEventPublisher events) {
        GmailConfiguration.checkPubSub(properties.pubsub());
        this.tokens = new GmailPushTokens(properties.pubsub());
        this.events = events;
    }

    // The body is read only once the token passed, and only so far: a stranger cannot make Sino read megabytes. A push
    // that breaks off while being read gets 400, and Pub/Sub sends it again.
    @PostMapping("/api/webhooks/gmail")
    ResponseEntity<Void> receive(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            InputStream body) {
        tokens.check(authorization);
        byte[] read;
        try {
            read = body.readNBytes(MAX_BODY_BYTES + 1);
        } catch (IOException brokeOff) {
            log.warn("A Gmail notice broke off while being read: {}", brokeOff.getClass().getSimpleName());
            return ResponseEntity.badRequest().build();
        }
        addressOf(read).ifPresent(address -> events.publishEvent(
                new ProviderPushReceived(GmailProvider.TYPE, address, Instant.now())));
        return ResponseEntity.noContent().build();
    }

    private static Optional<String> addressOf(byte[] body) {
        if (body.length > MAX_BODY_BYTES) {
            return unreadable("longer than " + MAX_BODY_BYTES + " bytes");
        }
        try {
            PushRequest push = JSON.readValue(body, PushRequest.class);
            String data = push == null || push.message() == null ? null : push.message().data();
            if (data == null) {
                return unreadable("no message data");
            }
            Notice notice = JSON.readValue(base64(data), Notice.class);
            String address = notice == null ? null : notice.emailAddress();
            if (address == null || address.isBlank() || address.length() > MAX_ADDRESS_LENGTH) {
                return unreadable("no mailbox address");
            }
            return Optional.of(address.strip());
        } catch (JacksonException | IllegalArgumentException broken) {
            // The class only: the message of a parse failure can quote the body.
            return unreadable(broken.getClass().getSimpleName());
        }
    }

    // Pub/Sub writes standard base64; the URL-safe alphabet is taken too.
    private static byte[] base64(String data) {
        try {
            return Base64.getDecoder().decode(data);
        } catch (IllegalArgumentException standard) {
            return Base64.getUrlDecoder().decode(data);
        }
    }

    private static Optional<String> unreadable(String why) {
        log.warn("A Gmail notice with a valid token could not be read ({}): taken and dropped", why);
        return Optional.empty();
    }

    /** What Pub/Sub pushes: {@code {"message": {"data": <base64>, "messageId", ...}, "subscription"}}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record PushRequest(Message message) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Message(String data) {
    }

    /** What Gmail publishes: {@code {"emailAddress", "historyId"}}; only the address is used. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Notice(String emailAddress) {
    }

}
