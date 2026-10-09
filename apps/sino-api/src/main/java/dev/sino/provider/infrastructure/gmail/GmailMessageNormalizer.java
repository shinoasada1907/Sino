package dev.sino.provider.infrastructure.gmail;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import dev.sino.provider.infrastructure.gmail.GmailMessage.Part;
import dev.sino.provider.infrastructure.gmail.MailHeaders.Mailbox;
import dev.sino.provider.spi.ConversationType;
import dev.sino.provider.spi.MessageDirection;
import dev.sino.provider.spi.MessageStatus;
import dev.sino.provider.spi.MessageType;
import dev.sino.provider.spi.NormalizedAttachment;
import dev.sino.provider.spi.NormalizedConversation;
import dev.sino.provider.spi.NormalizedMessage;
import dev.sino.provider.spi.NormalizedParticipant;
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
    static final String SUBJECT = "subject";
    static final String RFC_MESSAGE_ID = "rfcMessageId";

    private static final String SENT = "SENT";
    private static final String UNREAD = "UNREAD";
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
        List<NormalizedAttachment> attachments = new ArrayList<>();
        collectFiles(payload, attachments);
        String subject = payload.header("Subject").map(MailHeaders::decode).map(GmailMessageNormalizer::withoutNul)
                .orElse(null);
        Map<String, String> metadata = new LinkedHashMap<>();
        if (subject != null) {
            metadata.put(SUBJECT, subject);
        }
        payload.header("Message-ID").ifPresent(id -> metadata.put(RFC_MESSAGE_ID, id.strip()));

        NormalizedMessage normalized = new NormalizedMessage(message.id(), message.threadId(), sender.email(),
                sent ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
                attachments.isEmpty() ? MessageType.TEXT : MessageType.MIXED, textOf(payload),
                sent ? MessageStatus.SENT : MessageStatus.UNKNOWN, !message.labelIds().contains(UNREAD), null, sentAt,
                attachments, metadata);
        return new NormalizedGmailMessage(normalized, titleOf(subject), participantsOf(payload, selfEmail, sent));
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

    // The first text/plain body that is not a file, else the text of the first text/html one.
    private static String textOf(Part payload) {
        return firstBody(payload, "text/plain").map(GmailMessageNormalizer::contentOf)
                .or(() -> firstBody(payload, "text/html").map(part -> HtmlText.of(contentOf(part))))
                .map(text -> withoutNul(text).replace("\r\n", "\n").stripTrailing())
                .map(GmailMessageNormalizer::cut)
                .orElse(null);
    }

    // Depth first, in the order of the message; a body Gmail keeps elsewhere (attachmentId, no data) is skipped.
    private static Optional<Part> firstBody(Part part, String mimeType) {
        if (mimeType.equalsIgnoreCase(part.mimeType()) && !isFile(part) && part.body() != null
                && part.body().data() != null) {
            return Optional.of(part);
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

    // Every part with a file name that Gmail keeps as an attachment, except an image embedded in the HTML body.
    private static void collectFiles(Part part, List<NormalizedAttachment> files) {
        boolean file = isFile(part) && part.body() != null && part.body().attachmentId() != null && !isEmbedded(part);
        if (file) {
            // partId, not attachmentId: Gmail is reported to change attachmentId on every messages.get (BE-39 checks).
            String id = part.partId() == null || part.partId().isBlank() ? ROOT_PART_ID : part.partId();
            files.add(new NormalizedAttachment(id, withoutNul(MailHeaders.decode(part.filename())), part.mimeType(),
                    part.body().size(), null, null));
        }
        for (Part child : part.parts()) {
            collectFiles(child, files);
        }
    }

    private static boolean isFile(Part part) {
        return part.filename() != null && !part.filename().isBlank();
    }

    // An image the HTML shows by its Content-ID ("cid:"), unless the sender marked it as an attachment.
    private static boolean isEmbedded(Part part) {
        return part.header("Content-ID").isPresent() && !part.header("Content-Disposition")
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
