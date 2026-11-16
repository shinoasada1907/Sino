package dev.sino.provider.infrastructure.zalo;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

import dev.sino.provider.spi.AttachmentContent;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * Reads the file of a Zalo message from where Zalo serves it (zalo-send-files, ZF-08), for Sino to hand to the browser
 * without keeping it (D-125). Only an https address on Zalo's own hosts is read, and a redirect is followed only to such
 * an address, at most three times, so a stored address can never make Sino call anything else. A file comes whole into
 * memory, at most {@value #MAX_BYTES} bytes. Failures name the status or the kind of failure, never the address.
 */
final class ZaloFileDownloads {

    static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final Set<Integer> REDIRECTS = Set.of(301, 302, 303, 307, 308);

    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(10)).build();

    AttachmentContent download(String address) {
        String next = ZaloMessageNormalizer.fileAddress(address);
        for (int hop = 0; hop <= MAX_REDIRECTS && next != null; hop++) {
            HttpResponse<InputStream> response = send(next);
            int status = response.statusCode();
            if (REDIRECTS.contains(status)) {
                close(response);
                String from = next;
                next = response.headers().firstValue("Location")
                        .map(location -> ZaloMessageNormalizer.fileAddress(URI.create(from).resolve(location).toString()))
                        .orElse(null);
                continue;
            }
            if (status != 200) {
                close(response);
                throw unavailable("Zalo answered " + status + " for the file");
            }
            byte[] bytes = readAtMost(response.body());
            return new AttachmentContent(bytes, response.headers().firstValue("Content-Type").orElse(null));
        }
        throw unavailable("The file is not on an address of Zalo");
    }

    private HttpResponse<InputStream> send(String address) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(address)).timeout(Duration.ofSeconds(60)).GET().build();
        try {
            return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException failure) {
            throw unavailable("The file could not be read from Zalo: " + failure.getClass().getSimpleName());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw unavailable("Reading the file from Zalo was interrupted");
        }
    }

    private static byte[] readAtMost(InputStream body) {
        try (body) {
            byte[] bytes = body.readNBytes((int) MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw unavailable("The file is larger than Sino carries");
            }
            return bytes;
        } catch (IOException failure) {
            throw unavailable("The file could not be read from Zalo: " + failure.getClass().getSimpleName());
        }
    }

    private static void close(HttpResponse<InputStream> response) {
        try {
            response.body().close();
        } catch (IOException ignored) {
            // Nothing more is read from it.
        }
    }

    private static ProviderException unavailable(String why) {
        return new ProviderException(ProviderErrorCode.PROVIDER_UNAVAILABLE, why);
    }

}
