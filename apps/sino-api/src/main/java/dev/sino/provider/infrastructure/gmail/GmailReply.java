package dev.sino.provider.infrastructure.gmail;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import dev.sino.provider.spi.NormalizedRecipients.Address;

/**
 * A plain text reply as the raw RFC 5322 message Gmail sends (F10, D-133): in the thread of the message it answers
 * ({@code In-Reply-To}, {@code References}). No {@code Message-ID}: Gmail gives what it sends its own (BE-60). Names
 * and subjects come from mail other people sent, so a line break in one is dropped rather than starting a header, and
 * text that is not ASCII becomes RFC 2047 encoded words.
 *
 * @param subject {@code null} leaves the header out
 * @param inReplyTo the {@code Message-ID} of the message it answers; {@code null} for none
 * @param references the {@code References} of that message; {@code null} for none
 */
record GmailReply(String from, List<Address> to, String subject, String inReplyTo, String references, String text) {

    private static final Pattern RE = Pattern.compile("^\\s*re\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern MESSAGE_ID = Pattern.compile("<[^<>\\s]+>");
    // A name of only these needs no quotes (RFC 5322 atext and spaces).
    private static final Pattern PLAIN_NAME = Pattern.compile("[A-Za-z0-9!#$%&'*+/=?^_`{|}~ -]+");
    private static final String CRLF = "\r\n";
    // 39 bytes are 52 base64 characters, a 64-character encoded word: within the 75 of RFC 2047, and "Subject: " with
    // one still fits a 78-character line.
    private static final int WORD_BYTES = 39;
    private static final int LINE = 76;

    /** "Re: " and the subject, unless it already starts so; {@code null} when there is no subject. */
    static String subjectOf(String original) {
        if (original == null) {
            return null;
        }
        String subject = withoutLineBreaks(original).strip();
        return RE.matcher(subject).find() ? subject : "Re: " + subject;
    }

    String mime() {
        StringBuilder mime = new StringBuilder();
        header(mime, "From", withoutLineBreaks(from));
        header(mime, "To", String.join("," + CRLF + " ", to.stream().map(GmailReply::mailbox).toList()));
        if (subject != null) {
            header(mime, "Subject", encoded(subject));
        }
        List<String> answered = idsIn(inReplyTo);
        if (!answered.isEmpty()) {
            List<String> chain = new ArrayList<>(idsIn(references));
            chain.add(answered.getFirst());
            header(mime, "In-Reply-To", answered.getFirst());
            header(mime, "References", String.join(CRLF + " ", chain));
        }
        header(mime, "MIME-Version", "1.0");
        header(mime, "Content-Type", "text/plain; charset=UTF-8");
        header(mime, "Content-Transfer-Encoding", "base64");
        mime.append(CRLF);
        String canonical = text.replace("\r\n", "\n").replace('\r', '\n').replace("\n", CRLF);
        String body = Base64.getEncoder().encodeToString(canonical.getBytes(StandardCharsets.UTF_8));
        for (int start = 0; start < body.length(); start += LINE) {
            mime.append(body, start, Math.min(body.length(), start + LINE)).append(CRLF);
        }
        return mime.toString();
    }

    private static void header(StringBuilder mime, String name, String value) {
        mime.append(name).append(": ").append(value).append(CRLF);
    }

    private static String mailbox(Address address) {
        String email = withoutLineBreaks(address.address()).replaceAll("[\\s<>\"]", "");
        String name = address.name() == null ? "" : withoutLineBreaks(address.name()).strip();
        if (name.isEmpty()) {
            return email;
        }
        if (PLAIN_NAME.matcher(name).matches()) {
            return name + " <" + email + ">";
        }
        if (isAscii(name)) {
            return "\"" + name.replace("\\", "\\\\").replace("\"", "\\\"") + "\" <" + email + ">";
        }
        return encoded(name) + " <" + email + ">";
    }

    // ASCII stays as it is; anything else becomes encoded words of whole characters, one per folded line.
    private static String encoded(String value) {
        if (isAscii(value)) {
            return value;
        }
        List<String> words = new ArrayList<>();
        StringBuilder chunk = new StringBuilder();
        int bytes = 0;
        for (int i = 0; i < value.length(); i = value.offsetByCodePoints(i, 1)) {
            String character = new String(Character.toChars(value.codePointAt(i)));
            int size = character.getBytes(StandardCharsets.UTF_8).length;
            if (bytes + size > WORD_BYTES) {
                words.add(word(chunk.toString()));
                chunk.setLength(0);
                bytes = 0;
            }
            chunk.append(character);
            bytes += size;
        }
        words.add(word(chunk.toString()));
        return String.join(CRLF + " ", words);
    }

    private static String word(String text) {
        return "=?UTF-8?B?" + Base64.getEncoder().encodeToString(text.getBytes(StandardCharsets.UTF_8)) + "?=";
    }

    // Only well formed IDs: anything else around them, a line break included, is left out.
    private static List<String> idsIn(String header) {
        List<String> ids = new ArrayList<>();
        if (header != null) {
            Matcher id = MESSAGE_ID.matcher(header);
            while (id.find()) {
                ids.add(id.group());
            }
        }
        return ids;
    }

    private static String withoutLineBreaks(String value) {
        return value.replaceAll("[\\r\\n\\x00]+", " ");
    }

    private static boolean isAscii(String value) {
        return value.chars().allMatch(c -> c >= 0x20 && c < 0x7f);
    }

}
