package dev.sino.provider.infrastructure.gmail;

import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.SyncCursor;

/**
 * Where a Gmail sync stands, kept in {@link SyncCursor#value()} (F04b design, section 3). {@code since} is the
 * moment the user chose for the first sync (epoch milliseconds, or "-" for all mail); it stays in every cursor, so mail
 * from before it never comes in, not even when a later change touches it.
 * <ul>
 * <li>{@code v1|list|<historyId>|<since>|<pageToken>}: the first sync pages through {@code messages.list};
 * {@code historyId} is the mailbox's when it started, so mail arriving meanwhile is read as a change afterwards.
 * <li>{@code v1|history|<historyId>|<since>}: the changes since {@code historyId}.
 * <li>{@code v1|history|<historyId>|<since>|<endHistoryId>|<pageToken>}: the same, on a later page; the run ends
 * at {@code endHistoryId}, the mailbox's history id read before its first page.
 * </ul>
 * "v1" lets a later format replace this one.
 */
record GmailCursor(boolean listing, String historyId, Instant since, String endHistoryId, String pageToken) {

    // Fifteen digits of milliseconds reach the year 33 000: enough, and never too big for a long or an Instant.
    private static final String SINCE = "(-|\\d{1,15})";
    private static final Pattern LIST = Pattern.compile("v1\\|list\\|(\\d{1,20})\\|" + SINCE + "\\|([^|]+)");
    private static final Pattern HISTORY = Pattern.compile(
            "v1\\|history\\|(\\d{1,20})\\|" + SINCE + "(?:\\|(\\d{1,20})\\|([^|]+))?");

    /** The first page of a first sync, which starts at the mailbox's current history id. */
    static GmailCursor firstSync(String historyId, Instant since) {
        return new GmailCursor(true, historyId, since, null, null);
    }

    static GmailCursor changesSince(String historyId, Instant since) {
        return new GmailCursor(false, historyId, since, null, null);
    }

    /**
     * @throws ProviderException with {@code REQUEST_REJECTED} when {@code value} is not a cursor this connector wrote
     */
    static GmailCursor of(String value) {
        Matcher list = LIST.matcher(value);
        if (list.matches()) {
            return new GmailCursor(true, list.group(1), sinceOf(list.group(2)), null, list.group(3));
        }
        Matcher history = HISTORY.matcher(value);
        if (history.matches()) {
            return new GmailCursor(false, history.group(1), sinceOf(history.group(2)), history.group(3),
                    history.group(4));
        }
        throw new ProviderException(ProviderErrorCode.REQUEST_REJECTED, "Unknown Gmail cursor");
    }

    /** The same position, on the page {@code pageToken}; {@code endHistoryId} only while following changes. */
    GmailCursor onPage(String endHistoryId, String pageToken) {
        return new GmailCursor(listing, historyId, since, endHistoryId, pageToken);
    }

    SyncCursor toSyncCursor() {
        String millis = since == null ? "-" : Long.toString(since.toEpochMilli());
        if (listing) {
            return new SyncCursor("v1|list|" + historyId + "|" + millis + "|" + pageToken);
        }
        String page = pageToken == null ? "" : "|" + endHistoryId + "|" + pageToken;
        return new SyncCursor("v1|history|" + historyId + "|" + millis + page);
    }

    private static Instant sinceOf(String millis) {
        return millis.equals("-") ? null : Instant.ofEpochMilli(Long.parseLong(millis));
    }

}
