package dev.sino.provider.infrastructure.gmail;

import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;

import dev.sino.provider.infrastructure.gmail.GmailMessage.Part;
import dev.sino.provider.infrastructure.gmail.MailHeaders.Mailbox;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageContent;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
import dev.sino.provider.spi.NormalizedRecipients;
import dev.sino.provider.spi.NormalizedRecipients.Address;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;

/**
 * Turns Gmail messages ({@code format=full}) into Sino's normalized types (F04b design, "Chuẩn hóa"), and the
 * messages of a batch into one conversation per thread. Never calls Google. A message it cannot normalize fails
 * with {@code PAYLOAD_NORMALIZATION_FAILED}, whose message never repeats the mail's content or addresses. Text it
 * hands out has no NUL character, which PostgreSQL cannot store.
 */
final class GmailMessageNormalizer {

    static final int MAX_TEXT_LENGTH = 100_000;
    /** The id of the file when the whole mail is one file: Gmail gives the top part an empty {@code partId}. */
    static final String ROOT_PART_ID = "root";
    static final String RFC_MESSAGE_ID = "rfcMessageId";

    private static final String SENT = "SENT";
    private static final String UNREAD = "UNREAD";
    // The tabs Gmail sorts bulk mail into; a list mail it keeps in Primary still has List-Unsubscribe (RFC 2369).
    private static final Set<String> BULK_LABELS = Set.of("CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL",
            "CATEGORY_UPDATES", "CATEGORY_FORUMS");
    // "Re:", "RE:", "Fwd:", "FW:", "TL:" (Vietnamese "trả lời"), with a count such as "Re[2]:", repeated.
    private static final Pattern REPLY_PREFIXES = Pattern.compile("^(?:\\s*(?:re|fwd?|tl)(?:\\[\\d+])?\\s*:)+\\s*",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHARSET = Pattern.compile("charset\\s*=\\s*\"?([^\";\\s]+)",
            Pattern.CASE_INSENSITIVE);

    private GmailMessageNormalizer() {
    }

    /**
     * @param selfEmail the email of the connected account, which marks the participant that is the account itself
     * @throws ProviderException with {@code PAYLOAD_NORMALIZATION_FAILED} when the message has no id, thread,
     *         payload, sender address or date, or a body that is not base64url
     */
    static NormalizedGmailMessage normalize(GmailMessage message, String selfEmail) {
        Part payload = message.payload();
        if (payload == null) {
            throw invalid("The message has no payload");
        }
        Instant sentAt = sentAtOf(message.internalDate());
        Mailbox sender = payload.header("From").map(MailHeaders::mailboxes).orElse(List.of()).stream().findFirst()
                .orElseThrow(() -> invalid("The message has no From address"));
        boolean sent = message.labelIds().contains(SENT);
        String html = htmlOf(payload);
        List<NormalizedAttachment> attachments = filesOf(payload, html);
        String subject = payload.header("Subject").map(MailHeaders::decode).map(GmailMessageNormalizer::withoutNul)
                .filter(text -> !text.isBlank()).orElse(null);
        Map<String, String> metadata = new LinkedHashMap<>();
        if (subject != null) {
            metadata.put(NormalizedMessage.SUBJECT, subject);
        }
        payload.header("Message-ID").ifPresent(id -> metadata.put(RFC_MESSAGE_ID, id.strip()));
        if (message.labelIds().stream().anyMatch(BULK_LABELS::contains)
                || payload.header("List-Unsubscribe").isPresent()) {
            metadata.put(NormalizedMessage.BULK, "true");
        }

        NormalizedMessage normalized = new NormalizedMessage(message.id(), message.threadId(), sender.email(),
                sent ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
                attachments.stream().anyMatch(file -> file.contentId() == null) ? MessageType.MIXED : MessageType.TEXT,
                textOf(payload),
                sent ? MessageStatus.SENT : MessageStatus.UNKNOWN, !message.labelIds().contains(UNREAD), null, sentAt,
                attachments, metadata, recipientsOf(payload), html);
        return new NormalizedGmailMessage(normalized, titleOf(subject), participantsOf(payload, selfEmail, sent));
    }

    /**
     * What the import of an early version did not keep (F06, D-122): the HTML body, the addressees, and the files and
     * embedded pictures as {@link #normalize} gives them now.
     *
     * @throws ProviderException with {@code PAYLOAD_NORMALIZATION_FAILED} when the message has no payload or its HTML
     *         is not base64url
     */
    static MessageContent content(GmailMessage message) {
        if (message.payload() == null) {
            throw invalid("The message has no payload");
        }
        String html = htmlOf(message.payload());
        return new MessageContent(html, recipientsOf(message.payload()), filesOf(message.payload(), html));
    }

    /** The part of the message with this external ID, as {@link #normalize} names files and embedded pictures. */
    static Optional<Part> partOf(GmailMessage message, String externalAttachmentId) {
        return message.payload() == null ? Optional.empty() : partOf(message.payload(), externalAttachmentId);
    }

    /**
     * @throws ProviderException with {@code PAYLOAD_NORMALIZATION_FAILED} when the content is not base64url
     */
    static byte[] bytesOf(String data) {
        try {
            return Base64.getUrlDecoder().decode(data);
        } catch (IllegalArgumentException broken) {
            throw invalid("A part is not valid base64url");
        }
    }

    private static Optional<Part> partOf(Part part, String externalAttachmentId) {
        if (idOf(part).equals(externalAttachmentId)) {
            return Optional.of(part);
        }
        for (Part child : part.parts()) {
            Optional<Part> found = partOf(child, externalAttachmentId);
            if (found.isPresent()) {
                return found;
            }
        }
        return Optional.empty();
    }

    /**
     * One conversation per thread, in the order the threads first appear: the title of the latest message, everyone
     * who took part once (with a name if any message gave one), and the time of the latest message.
     */
    static List<NormalizedConversation> threadsOf(List<NormalizedGmailMessage> messages) {
        Map<String, List<NormalizedGmailMessage>> threads = new LinkedHashMap<>();
        for (NormalizedGmailMessage message : messages) {
            threads.computeIfAbsent(message.message().externalConversationId(), id -> new ArrayList<>()).add(message);
        }
        return threads.entrySet().stream().map(thread -> threadOf(thread.getKey(), thread.getValue())).toList();
    }

    private static NormalizedConversation threadOf(String threadId, List<NormalizedGmailMessage> messages) {
        NormalizedGmailMessage latest = messages.stream()
                .max(Comparator.comparing(message -> message.message().sentAt())).orElseThrow();
        Map<String, NormalizedParticipant> participants = new LinkedHashMap<>();
        for (NormalizedGmailMessage message : messages) {
            for (NormalizedParticipant participant : message.participants()) {
                participants.merge(participant.externalParticipantId(), participant,
                        (known, again) -> known.displayName() != null ? known : again);
            }
        }
        return new NormalizedConversation(threadId, ConversationType.THREAD, latest.title(), null,
                List.copyOf(participants.values()), latest.message().sentAt());
    }

    private static Instant sentAtOf(String internalDate) {
        try {
            return Instant.ofEpochMilli(Long.parseLong(internalDate));
        } catch (NumberFormatException missingOrBroken) {
            throw invalid("The message has no usable internalDate");
        }
    }

    // Everyone in From, To and Cc once, in that order; the first name given for an address wins. The sender of a
    // sent message is the account itself, also when it wrote from an alias.
    private static List<NormalizedParticipant> participantsOf(Part payload, String selfEmail, boolean sent) {
        Map<String, NormalizedParticipant> participants = new LinkedHashMap<>();
        for (String header : List.of("From", "To", "Cc")) {
            for (Mailbox mailbox : MailHeaders.mailboxes(payload.header(header).orElse(null))) {
                boolean self = mailbox.email().equalsIgnoreCase(selfEmail) || (sent && header.equals("From"));
                participants.putIfAbsent(mailbox.email(), new NormalizedParticipant(mailbox.email(),
                        nameOf(mailbox), null, self));
            }
        }
        return List.copyOf(participants.values());
    }

    private static NormalizedRecipients recipientsOf(Part payload) {
        return new NormalizedRecipients(addressesOf(payload, "To"), addressesOf(payload, "Cc"),
                addressesOf(payload, "Reply-To"));
    }

    private static List<Address> addressesOf(Part payload, String header) {
        return MailHeaders.mailboxes(payload.header(header).orElse(null)).stream()
                .map(mailbox -> new Address(nameOf(mailbox), withoutNul(mailbox.email()))).toList();
    }

    private static String nameOf(Mailbox mailbox) {
        String name = withoutNul(mailbox.name());
        return name == null || name.isBlank() ? null : name;
    }

    private static String titleOf(String subject) {
        if (subject == null) {
            return null;
        }
        String title = REPLY_PREFIXES.matcher(subject).replaceFirst("").strip();
        return title.isEmpty() ? null : title;
    }

    /** The text of {@code message} as Sino stores it; {@code null} when it has none or Gmail gave it unreadable. */
    static String text(GmailMessage message) {
        try {
            return message.payload() == null ? null : textOf(message.payload());
        } catch (ProviderException unreadable) {
            return null;
        }
    }

    /** {@code text} as {@link #text} reads it once Gmail has sent it: one kind of line break, no trailing blanks. */
    static String asSent(String text) {
        return cut(withoutNul(text).replace("\r\n", "\n").replace('\r', '\n').stripTrailing());
    }

    // The first text/plain body that is not a file, else the text of the first text/html one.
    private static String textOf(Part payload) {
        return firstBody(payload, "text/plain").map(GmailMessageNormalizer::contentOf)
                .or(() -> firstBody(payload, "text/html").map(part -> HtmlText.of(contentOf(part))))
                .map(text -> withoutNul(text).replace("\r\n", "\n").stripTrailing())
                .map(GmailMessageNormalizer::cut)
                .orElse(null);
    }

    // The first text/html body that is not a file, as the sender wrote it; never cleaned here (F06, D-120).
    private static String htmlOf(Part payload) {
        return firstBody(payload, "text/html").map(GmailMessageNormalizer::contentOf)
                .map(GmailMessageNormalizer::withoutNul).filter(html -> !html.isBlank()).orElse(null);
    }

    // Depth first, in the order of the message; a body Gmail keeps elsewhere (attachmentId, no data) is skipped, and so
    // is what a file or a forwarded message (message/rfc822) holds: that is not this message's body.
    private static Optional<Part> firstBody(Part part, String mimeType) {
        if (mimeType.equalsIgnoreCase(part.mimeType()) && !isFile(part) && part.body() != null
                && part.body().data() != null) {
            return Optional.of(part);
        }
        if (isFile(part) || "message/rfc822".equalsIgnoreCase(part.mimeType())) {
            return Optional.empty();
        }
        for (Part child : part.parts()) {
            Optional<Part> body = firstBody(child, mimeType);
            if (body.isPresent()) {
                return body;
            }
        }
        return Optional.empty();
    }

    private static String contentOf(Part part) {
        byte[] bytes;
        try {
            bytes = Base64.getUrlDecoder().decode(part.body().data());
        } catch (IllegalArgumentException broken) {
            throw invalid("A body part is not valid base64url");
        }
        return new String(bytes, charsetOf(part));
    }

    // The charset of the part's Content-Type; UTF-8 when there is none or Java does not know it.
    private static Charset charsetOf(Part part) {
        Optional<Matcher> charset = part.header("Content-Type").map(CHARSET::matcher).filter(Matcher::find);
        try {
            return charset.isPresent() ? Charset.forName(charset.get().group(1)) : StandardCharsets.UTF_8;
        } catch (IllegalArgumentException unknown) {
            return StandardCharsets.UTF_8;
        }
    }

    // Never splits a character made of two chars (an emoji, for example).
    private static String cut(String text) {
        if (text.length() <= MAX_TEXT_LENGTH) {
            return text;
        }
        int end = Character.isHighSurrogate(text.charAt(MAX_TEXT_LENGTH - 1)) ? MAX_TEXT_LENGTH - 1 : MAX_TEXT_LENGTH;
        return text.substring(0, end);
    }

    // An embedded image that the HTML body shows by its Content-ID ("cid:") and that a browser may show is an embedded
    // picture (F06), small enough to come inside the message or not; one per Content-ID, as one id shows one picture.
    // Any other embedded image is a file, so nothing the sender put in the mail is lost, and so is any part with a file
    // name that Gmail keeps as an attachment. partId, not attachmentId: Gmail is reported to change attachmentId on
    // every messages.get (BE-39).
    private static List<NormalizedAttachment> filesOf(Part payload, String html) {
        List<Part> parts = new ArrayList<>();
        collectParts(payload, parts);
        // Only mail with an embedded image needs its HTML read.
        Set<String> shown = parts.stream().anyMatch(GmailMessageNormalizer::isEmbeddedImage) ? shownIdsOf(html)
                : Set.of();
        Set<String> pictures = new HashSet<>();
        List<NormalizedAttachment> files = new ArrayList<>();
        for (Part part : parts) {
            String contentId = isEmbeddedImage(part) ? contentIdOf(part) : null;
            if (contentId != null && NormalizedAttachment.isPicture(part.mimeType())
                    && shown.contains(contentId.toLowerCase(Locale.ROOT)) && pictures.add(contentId)) {
                files.add(attachmentOf(part, contentId));
            } else if (isEmbeddedImage(part)
                    || isFile(part) && part.body() != null && part.body().attachmentId() != null) {
                files.add(attachmentOf(part, null));
            }
        }
        return files;
    }

    private static void collectParts(Part part, List<Part> parts) {
        parts.add(part);
        for (Part child : part.parts()) {
            collectParts(child, parts);
        }
    }

    private static NormalizedAttachment attachmentOf(Part part, String contentId) {
        return new NormalizedAttachment(idOf(part), fileNameOf(part), part.mimeType(), part.body().size(), null, null,
                contentId);
    }

    // The Content-IDs the HTML shows in an <img>, read as Sino's cleaning reads them (MailHtml): "cid:" in any case,
    // the id as written and with its %XX escapes decoded (RFC 2392), in lower case.
    private static Set<String> shownIdsOf(String html) {
        if (html == null) {
            return Set.of();
        }
        Set<String> ids = new HashSet<>();
        for (Element image : Jsoup.parse(html).select("img[src]")) {
            String src = image.attr("src");
            if (src.regionMatches(true, 0, "cid:", 0, 4)) {
                String id = src.substring(4);
                ids.add(id.toLowerCase(Locale.ROOT));
                ids.add(withoutEscapes(id).toLowerCase(Locale.ROOT));
            }
        }
        return ids;
    }

    private static String withoutEscapes(String id) {
        try {
            return URLDecoder.decode(id.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException broken) {
            return id;
        }
    }

    // An image the sender put in the mail by its Content-ID, not as an attachment, with content.
    private static boolean isEmbeddedImage(Part part) {
        return part.header("Content-ID").isPresent() && !isAttachment(part) && part.mimeType() != null
                && part.mimeType().toLowerCase(Locale.ROOT).startsWith("image/") && part.body() != null
                && (part.body().attachmentId() != null || part.body().data() != null);
    }

    private static String idOf(Part part) {
        return part.partId() == null || part.partId().isBlank() ? ROOT_PART_ID : part.partId();
    }

    private static String fileNameOf(Part part) {
        String name = withoutNul(MailHeaders.decode(part.filename()));
        return name == null || name.isBlank() ? null : name;
    }

    // "<logo@shop>" in the header, "cid:logo@shop" in the HTML; null for "<>", which names nothing.
    private static String contentIdOf(Part part) {
        String id = withoutNul(part.header("Content-ID").orElseThrow().strip());
        id = id.startsWith("<") && id.endsWith(">") ? id.substring(1, id.length() - 1).strip() : id;
        return id.isEmpty() ? null : id;
    }

    private static boolean isFile(Part part) {
        return part.filename() != null && !part.filename().isBlank();
    }

    private static boolean isAttachment(Part part) {
        return part.header("Content-Disposition")
                .map(disposition -> disposition.strip().toLowerCase(Locale.ROOT).startsWith("attachment"))
                .orElse(false);
    }

    private static String withoutNul(String text) {
        return text == null ? null : text.replace("\u0000", "");
    }

    private static ProviderException invalid(String reason) {
        return new ProviderException(ProviderErrorCode.PAYLOAD_NORMALIZATION_FAILED, reason);
    }

}
