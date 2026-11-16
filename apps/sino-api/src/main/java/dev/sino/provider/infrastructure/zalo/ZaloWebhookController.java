package dev.sino.provider.infrastructure.zalo;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
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
 * Where {@code sino-zalo} notifies Sino of new buffered messages (D-277, ZL-08): {@code POST /api/webhooks/zalo},
 * authenticated by {@code Authorization: Bearer <SINO_ZALO_SECRET>} without session or CSRF token. Reads at most
 * {@link #MAX_BODY_BYTES} bytes and publishes {@link ProviderPushReceived} with {@code ownId} so {@code PushNotices}
 * wakes {@code ImportRunner}.
 */
@RestController
class ZaloWebhookController {

    static final int MAX_BODY_BYTES = 1024;

    private static final Logger log = LoggerFactory.getLogger(ZaloWebhookController.class);
    private static final String BEARER_PREFIX = "Bearer ";
    private static final int MAX_OWN_ID_LENGTH = 200;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ZaloProperties properties;
    private final ApplicationEventPublisher events;

    ZaloWebhookController(ZaloProperties properties, ApplicationEventPublisher events) {
        this.properties = properties;
        this.events = events;
    }

    @PostMapping("/api/webhooks/zalo")
    ResponseEntity<Void> receive(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            InputStream body) {
        checkSecret(authorization);
        byte[] read;
        try {
            read = body.readNBytes(MAX_BODY_BYTES + 1);
        } catch (IOException brokeOff) {
            log.warn("A Zalo notice broke off while being read: {}", brokeOff.getClass().getSimpleName());
            return ResponseEntity.badRequest().build();
        }
        Optional<String> ownId = ownIdOf(read);
        if (ownId.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        events.publishEvent(new ProviderPushReceived(ZaloProvider.TYPE, ownId.get(), Instant.now()));
        return ResponseEntity.noContent().build();
    }

    private void checkSecret(String authorization) {
        String expected = properties.secret();
        if (!properties.enabled() || expected == null || authorization == null
                || !authorization.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            throw ZaloWebhookErrorCode.tokenInvalid();
        }
        String given = authorization.substring(BEARER_PREFIX.length()).strip();
        if (given.isEmpty() || !MessageDigest.isEqual(
                given.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8))) {
            throw ZaloWebhookErrorCode.tokenInvalid();
        }
    }

    private static Optional<String> ownIdOf(byte[] body) {
        if (body.length > MAX_BODY_BYTES) {
            log.warn("A Zalo notice with a valid token exceeded {} bytes: rejected", MAX_BODY_BYTES);
            return Optional.empty();
        }
        try {
            Notice notice = JSON.readValue(body, Notice.class);
            String ownId = notice == null || notice.ownId() == null ? null : notice.ownId().strip();
            if (ownId == null || ownId.isEmpty() || ownId.length() > MAX_OWN_ID_LENGTH) {
                log.warn("A Zalo notice with a valid token carried no usable ownId: rejected");
                return Optional.empty();
            }
            return Optional.of(ownId);
        } catch (JacksonException broken) {
            log.warn("A Zalo notice with a valid token could not be parsed ({}): rejected",
                    broken.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Notice(String accountId, String ownId) {
    }

}
