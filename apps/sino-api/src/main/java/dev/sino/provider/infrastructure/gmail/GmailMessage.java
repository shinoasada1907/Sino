package dev.sino.provider.infrastructure.gmail;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A message as the Gmail API returns it with {@code format=full}, only the fields Sino reads. {@code internalDate}
 * is when Gmail received or sent it, in epoch milliseconds, sent as a string. Holes in the JSON (a {@code null} in
 * a list, a header without value) are dropped here, so one odd message cannot break the reading of a page.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record GmailMessage(String id, String threadId, List<String> labelIds, String internalDate, Part payload) {

    // A line break followed by a space or tab continues the header (RFC 5322 section 2.2.3).
    private static final Pattern FOLD = Pattern.compile("\\r?\\n(?=[ \\t])");

    GmailMessage {
        labelIds = withoutNulls(labelIds);
    }

    private static <T> List<T> withoutNulls(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).toList();
    }

    /** One MIME part; a {@code multipart/*} part holds its children in {@code parts}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Part(String partId, String mimeType, String filename, List<Header> headers, Body body, List<Part> parts) {

        Part {
            headers = withoutNulls(headers);
            parts = withoutNulls(parts);
        }

        /** The value of the first header with this name (whatever its case) and a value, unfolded. */
        Optional<String> header(String name) {
            return headers.stream().filter(header -> name.equalsIgnoreCase(header.name()) && header.value() != null)
                    .map(header -> FOLD.matcher(header.value()).replaceAll("")).findFirst();
        }

    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Header(String name, String value) {
    }

    /** {@code data} is the content in base64url; a large body or a file has an {@code attachmentId} instead. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Body(String attachmentId, Long size, String data) {
    }

}
