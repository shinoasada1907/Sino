package dev.sino.provider.infrastructure.gmail;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Sino's Google OAuth client ({@code sino.google.*}). Without client id and secret Gmail is off. The addresses
 * default to Google's; only tests change them.
 */
@ConfigurationProperties("sino.google")
record GmailProperties(String clientId, String clientSecret, URI authorizationUri, URI tokenUri, URI userInfoUri,
        URI revocationUri) {

    // From https://accounts.google.com/.well-known/openid-configuration
    static final URI GOOGLE_AUTHORIZATION = URI.create("https://accounts.google.com/o/oauth2/v2/auth");
    static final URI GOOGLE_TOKEN = URI.create("https://oauth2.googleapis.com/token");
    static final URI GOOGLE_USER_INFO = URI.create("https://openidconnect.googleapis.com/v1/userinfo");
    static final URI GOOGLE_REVOCATION = URI.create("https://oauth2.googleapis.com/revoke");

    GmailProperties {
        authorizationUri = authorizationUri == null ? GOOGLE_AUTHORIZATION : authorizationUri;
        tokenUri = tokenUri == null ? GOOGLE_TOKEN : tokenUri;
        userInfoUri = userInfoUri == null ? GOOGLE_USER_INFO : userInfoUri;
        revocationUri = revocationUri == null ? GOOGLE_REVOCATION : revocationUri;
    }

    @Override
    public String toString() {
        return "GmailProperties[clientId=" + clientId + ", clientSecret=****, authorizationUri=" + authorizationUri
                + ", tokenUri=" + tokenUri + ", userInfoUri=" + userInfoUri + ", revocationUri=" + revocationUri
                + "]";
    }

}
