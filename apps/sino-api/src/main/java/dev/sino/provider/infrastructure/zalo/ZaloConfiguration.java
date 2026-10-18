package dev.sino.provider.infrastructure.zalo;

import java.net.URI;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The Zalo connector is always registered, turned off unless {@code SINO_ZALO_ENABLED} is true (D-272, D-286): off,
 * its accounts stay readable and nothing calls sino-zalo. On, it needs the secret it shares with sino-zalo and an
 * http(s) address for it (D-282): anything missing stops the startup with a message that names the setting, never its
 * value. The switch reads like any Spring boolean ({@code true}, {@code on}, {@code yes}, {@code 1}); anything else
 * stops the startup.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ZaloProperties.class)
class ZaloConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger(ZaloConfiguration.class);
    // Counted as sino-zalo counts it (apps/sino-zalo/src/config.ts): in UTF-8 bytes.
    private static final int MIN_SECRET_BYTES = 32;

    static void check(ZaloProperties properties) {
        if (properties.secret() == null) {
            throw new IllegalStateException("SINO_ZALO_SECRET (sino.zalo.secret) is missing while SINO_ZALO_ENABLED "
                    + "is true: set the secret sino-zalo was given, or turn Zalo off");
        }
        // It goes in an HTTP header: the JDK refuses anything else there, with the header in its error message.
        if (!properties.secret().chars().allMatch(c -> c > ' ' && c < 0x7f)) {
            throw new IllegalStateException("SINO_ZALO_SECRET (sino.zalo.secret) may only hold visible ASCII "
                    + "characters, no space, such as the base64url secret .env.example shows how to make");
        }
        if (properties.secret().getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("SINO_ZALO_SECRET (sino.zalo.secret) must be at least " + MIN_SECRET_BYTES
                    + " bytes, the same value as SINO_ZALO_SECRET of sino-zalo");
        }
        URI url = properties.url();
        boolean http = "http".equalsIgnoreCase(url.getScheme()) || "https".equalsIgnoreCase(url.getScheme());
        if (!http || url.getHost() == null) {
            throw new IllegalStateException("SINO_ZALO_URL (sino.zalo.url) must be an http(s) address such as "
                    + ZaloProperties.SINO_ZALO_ON_THIS_MACHINE);
        }
    }

    @Bean
    ZaloProvider zaloProvider(ZaloProperties properties) {
        if (properties.enabled()) {
            check(properties);
        } else {
            LOG.info("Zalo is off: set SINO_ZALO_ENABLED=true and SINO_ZALO_SECRET to connect personal Zalo accounts "
                    + "through sino-zalo");
        }
        return new ZaloProvider(properties);
    }

}
