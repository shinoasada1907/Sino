package dev.sino.provider.infrastructure.gmail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeFalse;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import dev.sino.account.ProviderAccess;
import dev.sino.provider.infrastructure.gmail.GmailMessage.Part;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.OAuth2Credentials;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;
import dev.sino.sync.application.ImportResumer;

/**
 * Reads the Gmail account connected on this machine (D-58): run by hand with {@code ./mvnw test -Preal-gmail}, never
 * in CI, with the {@code local} profile ({@code .env}, the Compose database). Prints counts only, never mail
 * content, subjects or addresses. Skipped when no Gmail account is connected.
 */
@Tag("real-gmail")
// The default mock web environment: the security setup needs a web context, but no port is opened.
// No automatic sync: the backend on 8080, if it runs, keeps the mailbox up to date on its own.
@SpringBootTest(properties = "sino.sync.live.scheduled=false")
@ActiveProfiles("local")
class RealGmailTests {

    private static final Duration WINDOW = Duration.ofDays(7);
    private static final List<String> REPORT = List.of("messages read", "messages with embedded images",
            "... not from a mailing list (more likely pasted by a person)", "messages with attachments",
            "... whose attachmentId changed on a second read", "messages with a forwarded message as a file",
            "... whose inner parts Gmail shows", "messages with a folded header value");
    // Listing a large mailbox page after page stops here (100 pages).
    private static final long LISTED_AT_MOST = 5_000;

    @Autowired
    private ProviderAccess access;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectProvider<GmailProperties> gmail;

    // An import running in the backend on 8080 stays that backend's: this process must not go on with it as well.
    @MockitoBean
    private ImportResumer resumer;

    @Test
    void readsTheLastSevenDaysOfTheConnectedMailbox() {
        UUID account = connectedGmailAccount();
        Instant since = Instant.now().minus(WINDOW);

        SyncBatch batch = access.call(account,
                (connector, context) -> connector.fetchUpdates(context, SyncCursor.initial(since)));

        List<NormalizedMessage> messages = batch.messages();
        Map<String, Object> counts = new TreeMap<>();
        counts.put("messages", messages.size());
        counts.put("conversations", batch.conversations().size());
        counts.put("skipped", batch.skipped().size());
        counts.put("more pages", batch.hasMore());
        counts.put("messages with text", messages.stream().filter(message -> hasText(message.textContent())).count());
        counts.put("messages sent by the account", messages.stream()
                .filter(message -> message.direction() == MessageDirection.OUTBOUND).count());
        counts.put("messages with files", messages.stream().filter(message -> !message.attachments().isEmpty())
                .count());
        counts.put("subjects still encoded", messages.stream().map(message -> message.metadata().get("subject"))
                .filter(RealGmailTests::encoded).count());
        counts.put("names still encoded", batch.conversations().stream()
                .flatMap(conversation -> conversation.participants().stream())
                .map(NormalizedParticipant::displayName).filter(RealGmailTests::encoded).count());
        counts.put("conversations with the account in them", batch.conversations().stream()
                .filter(conversation -> conversation.participants().stream().anyMatch(NormalizedParticipant::self))
                .count());
        print("first page of the last 7 days", counts);

        assumeFalse(messages.isEmpty(), "No mail in the last 7 days: nothing to check");
        assertThat(messages).allSatisfy(message -> assertThat(message.sentAt()).isAfterOrEqualTo(since));
        assertThat((long) counts.get("messages with text")).as("most messages have text")
                .isGreaterThan(messages.size() / 2);
        assertThat(counts.get("subjects still encoded")).isEqualTo(0L);
        assertThat(counts.get("names still encoded")).isEqualTo(0L);
        assertThat(batch.nextCursor().value()).startsWith("v1|");
    }

    /**
     * What the F04b design left to real Gmail: does {@code attachmentId} change between two reads of a message (why
     * files use {@code partId}), how many messages embed images (left out of the files), forwarded messages as
     * files ({@code message/rfc822}), folded header values. Counts only; nothing is asserted.
     */
    @Test
    void reportsWhatGmailReallySends() {
        UUID account = connectedGmailAccount();
        Instant since = Instant.now().minus(WINDOW);
        GmailApi api = gmailApi();

        Map<String, Object> counts = access.call(account, (connector, context) -> {
            String token = ((OAuth2Credentials) context.credentials()).accessToken();
            Map<String, Object> found = new LinkedHashMap<>();
            REPORT.forEach(key -> found.put(key, 0L));
            for (String id : api.messages(token, since, null).ids()) {
                api.message(token, id).ifPresent(message -> count(api, token, message, found));
            }
            return found;
        });
        print("what Gmail really sends, first page of the last 7 days", counts);
    }

    /**
     * What the BE-40 review left to real Gmail: how close the estimates of the "Đồng bộ" step are to the messages an
     * import lists (spam and trash left out). For 30 and 90 days the estimate is Gmail's {@code resultSizeEstimate};
     * for the whole mailbox it is the profile's {@code messagesTotal}, next to the list's own estimate. Counts only;
     * nothing is asserted.
     */
    @Test
    void reportsHowCloseTheEstimatesAre() {
        UUID account = connectedGmailAccount();
        GmailApi api = gmailApi();
        Instant now = Instant.now();

        Map<String, Object> counts = access.call(account, (connector, context) -> {
            String token = ((OAuth2Credentials) context.credentials()).accessToken();
            Map<String, Object> found = new LinkedHashMap<>();
            for (int days : new int[] { 30, 90 }) {
                Instant since = now.minus(Duration.ofDays(days));
                found.put(days + " days: estimate shown (resultSizeEstimate)", api.estimate(token, since));
                found.put(days + " days: messages listed", listed(api, token, since));
            }
            found.put("whole mailbox: estimate shown (messagesTotal)", api.profile(token).messagesTotal());
            found.put("whole mailbox: resultSizeEstimate of the list", api.estimate(token, null));
            found.put("whole mailbox: messages listed", listed(api, token, null));
            return found;
        });
        print("estimates against the messages an import lists", counts);
    }

    // The IDs an import reads, counted page after page like it lists them.
    private static String listed(GmailApi api, String token, Instant since) {
        long count = 0;
        String page = null;
        do {
            GmailApi.MessageList list = api.messages(token, since, page);
            count += list.ids().size();
            page = list.nextPageToken();
        } while (page != null && count < LISTED_AT_MOST);
        return page == null ? String.valueOf(count) : "more than " + count;
    }

    private GmailApi gmailApi() {
        GmailProperties properties = gmail.getIfAvailable();
        assumeTrue(properties != null, "Gmail is off: set the Google client in .env");
        return new GmailApi(properties.userInfoUri(), properties.gmailApiUri(), GmailProvider.CONNECT_TIMEOUT,
                GmailProvider.READ_TIMEOUT, GmailProvider.FILE_READ_TIMEOUT);
    }

    private static void count(GmailApi api, String token, GmailMessage message, Map<String, Object> found) {
        if (message.payload() == null) {
            return;
        }
        List<Part> parts = partsOf(message.payload());
        increment(found, "messages read");
        if (parts.stream().anyMatch(RealGmailTests::isEmbeddedImage)) {
            increment(found, "messages with embedded images");
            if (message.payload().header("List-Unsubscribe").isEmpty()) {
                increment(found, "... not from a mailing list (more likely pasted by a person)");
            }
        }
        if (parts.stream().anyMatch(part -> "message/rfc822".equalsIgnoreCase(part.mimeType()))) {
            increment(found, "messages with a forwarded message as a file");
            if (parts.stream().anyMatch(part -> "message/rfc822".equalsIgnoreCase(part.mimeType())
                    && !part.parts().isEmpty())) {
                increment(found, "... whose inner parts Gmail shows");
            }
        }
        if (message.payload().headers().stream().map(GmailMessage.Header::value).filter(Objects::nonNull)
                .anyMatch(value -> value.contains("\n"))) {
            increment(found, "messages with a folded header value");
        }
        Map<String, String> files = attachmentIds(parts);
        if (!files.isEmpty()) {
            increment(found, "messages with attachments");
            Optional<GmailMessage> again = api.message(token, message.id());
            if (again.isPresent() && !attachmentIds(partsOf(again.get().payload())).equals(files)) {
                increment(found, "... whose attachmentId changed on a second read");
            }
        }
    }

    private UUID connectedGmailAccount() {
        List<UUID> accounts = jdbc.queryForList("select id from connected_account where provider = 'gmail' "
                + "and removed_at is null and status <> 'AUTH_EXPIRED' order by updated_at desc", UUID.class);
        assumeFalse(accounts.isEmpty(), "Connect a Gmail account on this machine first (README, Gmail)");
        return accounts.getFirst();
    }

    private static List<Part> partsOf(Part part) {
        List<Part> parts = new ArrayList<>();
        if (part != null) {
            parts.add(part);
            part.parts().forEach(child -> parts.addAll(partsOf(child)));
        }
        return parts;
    }

    private static boolean isEmbeddedImage(Part part) {
        return part.mimeType() != null && part.mimeType().toLowerCase(Locale.ROOT).startsWith("image/")
                && part.header("Content-ID").isPresent() && !part.header("Content-Disposition")
                        .map(disposition -> disposition.strip().toLowerCase(Locale.ROOT).startsWith("attachment"))
                        .orElse(false);
    }

    private static Map<String, String> attachmentIds(List<Part> parts) {
        Map<String, String> ids = new HashMap<>();
        for (Part part : parts) {
            if (part.body() != null && part.body().attachmentId() != null && part.filename() != null
                    && !part.filename().isBlank()) {
                ids.put(part.partId(), part.body().attachmentId());
            }
        }
        return ids;
    }

    private static boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    private static boolean encoded(String text) {
        return text != null && text.contains("=?");
    }

    private static void increment(Map<String, Object> counts, String key) {
        counts.merge(key, 1L, (a, b) -> (long) a + (long) b);
    }

    private static void print(String title, Map<String, Object> counts) {
        System.out.println("[real-gmail] " + title);
        counts.forEach((name, value) -> System.out.println("[real-gmail]   " + name + ": " + value));
    }

}
