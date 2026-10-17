package dev.sino.provider.infrastructure.zalo;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.net.URI;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.MessageProviderContractTest;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.TokenCredentials;

/**
 * The checks every connector passes (F03), on the Zalo connector. It declares no capability yet, so the kit checks
 * that reading, sending and push are refused without a call to sino-zalo; the checks of each capability start to run
 * on it once the capability is declared.
 */
class ZaloProviderContractTest extends MessageProviderContractTest {

    // A port nothing listens on, not the sino-zalo of this machine: a call that should not leave fails the test.
    private final ZaloProvider zalo = new ZaloProvider(new ZaloProperties(true, URI.create("http://127.0.0.1:"
            + closedPort()), "sino-zalo-test-secret-0123456789abcdef"));

    @Override
    protected MessageProvider provider() {
        return zalo;
    }

    @Override
    protected MessageProvider providerWithOneBrokenMessage() {
        return zalo;
    }

    @Override
    protected ProviderContext context() {
        return new ProviderContext(UUID.fromString("7b0d1c1e-4f43-4a57-9d55-0e0d3a1f0b51"), "100000000000000001",
                new TokenCredentials("{\"cookie\": [{\"key\": \"zpw_sek\", \"value\": \"zpw-contract-cookie\"}], "
                        + "\"imei\": \"imei-contract\", \"userAgent\": \"Mozilla/5.0 (Sino contract)\"}"));
    }

    @Override
    protected Set<String> expectedMessageIds() {
        return Set.of();
    }

    @Override
    protected Instant since() {
        return Instant.parse("2026-10-17T00:00:00Z");
    }

    private static int closedPort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

}
