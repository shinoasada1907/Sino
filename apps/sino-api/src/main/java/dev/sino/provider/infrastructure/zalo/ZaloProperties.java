package dev.sino.provider.infrastructure.zalo;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Personal Zalo through the sino-zalo service ({@code sino.zalo.*}, F09): off unless {@code enabled} (D-272), where
 * sino-zalo listens, and the secret both services share (D-282). One constructor only: with another one, binding may
 * pick it and lose settings.
 */
@ConfigurationProperties("sino.zalo")
record ZaloProperties(boolean enabled, URI url, String secret) {

    // The address and port sino-zalo listens on by default (apps/sino-zalo/README.md).
    static final URI SINO_ZALO_ON_THIS_MACHINE = URI.create("http://127.0.0.1:8090");

    ZaloProperties {
        url = url == null ? SINO_ZALO_ON_THIS_MACHINE : url;
        secret = secret == null || secret.isBlank() ? null : secret;
    }

    @Override
    public String toString() {
        return "ZaloProperties[enabled=" + enabled + ", url=" + url + ", secret=****]";
    }

}
