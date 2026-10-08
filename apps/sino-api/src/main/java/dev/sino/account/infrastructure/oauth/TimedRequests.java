package dev.sino.account.infrastructure.oauth;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;

/** HTTP for the calls to a provider's OAuth endpoints: none may hold a request thread longer than its timeouts. */
final class TimedRequests {

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

    private TimedRequests() {
    }

    static ClientHttpRequestFactory factory(Duration connectTimeout, Duration readTimeout) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(connectTimeout).build());
        factory.setReadTimeout(readTimeout);
        return factory;
    }

}
