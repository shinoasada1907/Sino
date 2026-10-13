package dev.sino.identity.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings of browser sign-in (D-22). The remember-me key (D-34) signs the "keep me signed in" cookie; it is
 * checked by {@link LoginSettings}.
 */
@ConfigurationProperties("sino.auth")
record AuthProperties(String rememberMeKey) {

    @Override
    public String toString() {
        return "AuthProperties[rememberMeKey=****]";
    }

}
