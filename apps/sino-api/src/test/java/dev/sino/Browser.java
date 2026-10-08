package dev.sino;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.jayway.jsonpath.JsonPath;

/**
 * Just enough of a browser for tests against a real server: keeps cookies, sends the CSRF token back as a header
 * when asked, and never follows a redirect, so a test sees a 302 itself. Public so that the tests of every module
 * can use it.
 */
public final class Browser {

    private final HttpClient http = HttpClient.newHttpClient();
    private final String baseUrl;
    private final Map<String, String> cookies = new LinkedHashMap<>();
    private final Map<String, String> extraHeaders = new LinkedHashMap<>();

    public Browser(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public Browser withCookie(String name, String value) {
        cookies.put(name, value);
        return this;
    }

    public Browser withHeader(String name, String value) {
        extraHeaders.put(name, value);
        return this;
    }

    public String cookie(String name) {
        return cookies.get(name);
    }

    public void forget(String name) {
        cookies.remove(name);
    }

    public Response get(String path) {
        return send("GET", path, null, false);
    }

    /** Gets a CSRF token first, as the web app does, then signs in. */
    public Response signIn(String email, String password, boolean rememberMe) {
        if (!cookies.containsKey("XSRF-TOKEN")) {
            get("/api/auth/me");
        }
        return send("POST", "/api/auth/login", loginJson(email, password, rememberMe), true);
    }

    public Response send(String method, String path, String json, boolean withCsrfToken) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("Accept", "application/json")
                .method(method, json == null ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(json));
        if (json != null) {
            request.header("Content-Type", "application/json");
        }
        if (!cookies.isEmpty()) {
            request.header("Cookie", String.join("; ", cookies.entrySet().stream()
                    .map(cookie -> cookie.getKey() + "=" + cookie.getValue()).toList()));
        }
        if (withCsrfToken && cookies.containsKey("XSRF-TOKEN")) {
            request.header("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
        }
        extraHeaders.forEach(request::header);
        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            response.headers().allValues("Set-Cookie").forEach(this::remember);
            return new Response(response.statusCode(), response.headers().map(), response.body());
        } catch (IOException | InterruptedException e) {
            throw new IllegalStateException("Request failed: " + method + " " + path, e);
        }
    }

    private void remember(String setCookie) {
        String pair = setCookie.split(";", 2)[0];
        String name = pair.substring(0, pair.indexOf('='));
        String value = pair.substring(pair.indexOf('=') + 1);
        boolean deleted = setCookie.toLowerCase().contains("max-age=0") || value.isEmpty();
        if (deleted) {
            cookies.remove(name);
        } else {
            cookies.put(name, value);
        }
    }

    public static String loginJson(String email, String password, boolean rememberMe) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"rememberMe\":" + rememberMe + "}";
    }

    /** One HTTP response, with its Set-Cookie headers kept as they came. */
    public record Response(int status, Map<String, List<String>> headers, String body) {

        public Optional<String> header(String name) {
            return headers.entrySet().stream().filter(entry -> entry.getKey().equalsIgnoreCase(name))
                    .flatMap(entry -> entry.getValue().stream()).findFirst();
        }

        public Optional<String> setCookie(String name) {
            return headers.entrySet().stream().filter(entry -> entry.getKey().equalsIgnoreCase("Set-Cookie"))
                    .flatMap(entry -> entry.getValue().stream())
                    .filter(cookie -> cookie.startsWith(name + "=")).findFirst();
        }

        public String json(String path) {
            return JsonPath.read(body, path);
        }

        public Object value(String path) {
            return JsonPath.read(body, path);
        }

    }

}
