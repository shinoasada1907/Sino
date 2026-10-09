package dev.sino.provider.infrastructure.gmail;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What Sino reads in mail headers, written here rather than pulling in a mail library (D-61 keeps jsoup as the
 * only new dependency): RFC 2047 encoded words, and the mailboxes of an address header.
 */
final class MailHeaders {

    // =?charset?B|Q?text?=, RFC 2047 section 2. The charset may carry a language after '*' (RFC 2231).
    private static final Pattern ENCODED_WORD = Pattern.compile("=\\?([^?\\s]+)\\?([BbQq])\\?([^?\\s]*)\\?=");

    private MailHeaders() {
    }

    /**
     * {@code value} with its encoded words decoded. Adjacent words in the same charset are decoded together, so a
     * character split across two words comes out whole; the space between two encoded words is dropped (RFC 2047
     * section 6.2). A word with an unknown charset or broken content is left as it is.
     */
    static String decode(String value) {
        if (value == null || !value.contains("=?")) {
            return value;
        }
        StringBuilder text = new StringBuilder();
        Pending pending = new Pending();
        Matcher word = ENCODED_WORD.matcher(value);
        int end = 0;
        while (word.find()) {
            String between = value.substring(end, word.start());
            end = word.end();
            Charset charset = charsetOf(word.group(1));
            byte[] bytes = charset == null ? null : bytesOf(word.group(2), word.group(3));
            boolean followsAWord = pending.charset != null && between.isBlank();
            if (bytes == null) {
                pending.flushInto(text);
                text.append(between).append(word.group());
            } else if (followsAWord && charset.equals(pending.charset)) {
                pending.bytes.writeBytes(bytes);
            } else {
                pending.flushInto(text);
                if (!followsAWord) {
                    text.append(between);
                }
                pending.charset = charset;
                pending.bytes.writeBytes(bytes);
            }
        }
        pending.flushInto(text);
        return text.append(value, end, value.length()).toString();
    }

    /**
     * The mailboxes of an address header such as From, To or Cc, in order, emails in lower case. Understands quoted
     * and encoded display names, angle addresses, comments and groups; skips an entry without an address.
     */
    static List<Mailbox> mailboxes(String header) {
        if (header == null) {
            return List.of();
        }
        List<Mailbox> mailboxes = new ArrayList<>();
        // A '(' that never closes is not a comment ("Bob :-( <bob@x>"): read it again as plain text.
        for (String entry : entriesOf(header, true).orElseGet(() -> entriesOf(header, false).orElseThrow())) {
            mailboxOf(entry).ifPresent(mailboxes::add);
        }
        return mailboxes;
    }

    // Splits at ',' and ';' outside quotes and angle brackets. Structured, it also drops comments and a group name
    // ("Team:"), and is empty when a comment never ends; plain, '(' and ':' are ordinary characters.
    private static Optional<List<String>> entriesOf(String header, boolean structured) {
        List<String> entries = new ArrayList<>();
        StringBuilder entry = new StringBuilder();
        boolean quoted = false;
        boolean angle = false;
        int comment = 0;
        for (int i = 0; i < header.length(); i++) {
            char c = header.charAt(i);
            if (quoted) {
                entry.append(c);
                if (c == '\\' && i + 1 < header.length()) {
                    entry.append(header.charAt(++i));
                } else if (c == '"') {
                    quoted = false;
                }
            } else if (comment > 0) {
                comment += c == '(' ? 1 : c == ')' ? -1 : 0;
            } else if (structured && c == '(') {
                comment = 1;
            } else if (c == '"') {
                quoted = true;
                entry.append(c);
            } else if (angle) {
                angle = c != '>';
                entry.append(c);
            } else if (c == '<') {
                angle = true;
                entry.append(c);
            } else if (c == ',' || c == ';') {
                entries.add(entry.toString());
                entry.setLength(0);
            } else if (structured && c == ':') {
                entry.setLength(0);
            } else {
                entry.append(c);
            }
        }
        entries.add(entry.toString());
        return comment > 0 ? Optional.empty() : Optional.of(entries);
    }

    private static Optional<Mailbox> mailboxOf(String entry) {
        String text = entry.strip();
        int open = text.lastIndexOf('<');
        int close = text.lastIndexOf('>');
        String email = open >= 0 && close > open ? text.substring(open + 1, close).strip() : text;
        if (!isAddress(email)) {
            return Optional.empty();
        }
        String name = open > 0 ? nameOf(text.substring(0, open)) : null;
        return Optional.of(new Mailbox(email.toLowerCase(Locale.ROOT), name));
    }

    private static boolean isAddress(String email) {
        int at = email.indexOf('@');
        return at > 0 && at == email.lastIndexOf('@') && at < email.length() - 1
                && email.chars().noneMatch(c -> Character.isWhitespace(c) || c == '"' || c == '<' || c == '>');
    }

    // Unquoted, unescaped and decoded; empty means none.
    private static String nameOf(String raw) {
        String name = raw.strip();
        if (name.length() >= 2 && name.startsWith("\"") && name.endsWith("\"")) {
            name = name.substring(1, name.length() - 1).replaceAll("\\\\(.)", "$1");
        }
        name = decode(name).strip();
        return name.isEmpty() ? null : name;
    }

    private static Charset charsetOf(String name) {
        int language = name.indexOf('*');
        try {
            return Charset.forName(language < 0 ? name : name.substring(0, language));
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }

    // Null when the encoded text is broken.
    private static byte[] bytesOf(String encoding, String encoded) {
        try {
            return encoding.equalsIgnoreCase("B") ? Base64.getDecoder().decode(encoded) : quotedPrintable(encoded);
        } catch (IllegalArgumentException broken) {
            return null;
        }
    }

    // The "Q" encoding: '_' is a space, "=XX" a byte in hex, anything else itself.
    private static byte[] quotedPrintable(String encoded) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = 0; i < encoded.length(); i++) {
            char c = encoded.charAt(i);
            if (c == '_') {
                bytes.write(' ');
            } else if (c == '=') {
                if (i + 2 >= encoded.length()) {
                    throw new IllegalArgumentException("A cut escape");
                }
                bytes.write(HexFormat.fromHexDigits(encoded, i + 1, i + 3));
                i += 2;
            } else {
                bytes.write(c);
            }
        }
        return bytes.toByteArray();
    }

    /** One mailbox of an address header; {@code name} is optional. */
    record Mailbox(String email, String name) {
    }

    /** The bytes of adjacent encoded words, decoded together once the run ends. */
    private static final class Pending {

        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Charset charset;

        void flushInto(StringBuilder text) {
            if (charset != null) {
                text.append(bytes.toString(charset));
                bytes.reset();
                charset = null;
            }
        }

    }

}
