package dev.sino.conversation.api;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.conversation.application.MessageBodies;
import dev.sino.conversation.application.MessageBody;
import dev.sino.conversation.application.MessageCursor;
import dev.sino.conversation.application.MessageFile;
import dev.sino.conversation.application.MessageFiles;
import dev.sino.conversation.application.MessageHistory;
import dev.sino.conversation.application.MessagePage;
import dev.sino.identity.CurrentUser;

/**
 * The messages of one conversation (F06): pages of them, newest first, the full content of one, and its files. The
 * conversation must be in the current user's inbox, archived or not; any other is a 404 like
 * {@code GET /api/conversations/{id}}.
 */
@RestController
@RequestMapping("/api/conversations/{id}/messages")
class ConversationMessagesController {

    private final MessageHistory history;
    private final MessageBodies bodies;
    private final MessageFiles files;
    private final CurrentUser currentUser;

    ConversationMessagesController(MessageHistory history, MessageBodies bodies, MessageFiles files,
            CurrentUser currentUser) {
        this.history = history;
        this.bodies = bodies;
        this.files = files;
        this.currentUser = currentUser;
    }

    /** A {@code cursor} that this API did not hand out, like a {@code limit} out of range, is a 400. */
    @GetMapping
    MessagePageResponse list(@PathVariable UUID id, @RequestParam(required = false) MessageCursor cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        MessagePage page = history.page(currentUser.requireOwnerId(), id, cursor, limit);
        return new MessagePageResponse(page.items().stream().map(MessageResponse::from).toList(),
                page.next() == null ? null : page.next().encode());
    }

    /**
     * Cleaned HTML, never the HTML as sent (D-120). The first request for a message stored before Sino kept HTML reads
     * it again from the provider; when that fails it is a 502 and the web shows the text.
     */
    @GetMapping("/{messageId}/body")
    MessageBodyResponse body(@PathVariable UUID id, @PathVariable UUID messageId) {
        MessageBody body = bodies.body(currentUser.requireOwnerId(), id, messageId);
        return new MessageBodyResponse(body.format().name(), body.html(), body.remoteImages());
    }

    /**
     * A file or an embedded picture of the message, read from the provider and never stored (D-125). Always a download,
     * unless asked {@code inline} for a PNG, JPEG, GIF or WebP picture; either way the browser may not guess another
     * type ({@code nosniff}), and a page opened from it runs nothing on Sino's origin ({@code sandbox}). A picture
     * shown in the mail never changes, so the browser keeps it for a day rather than ask the provider each time the
     * mail is opened; a download is never kept.
     */
    @GetMapping("/{messageId}/attachments/{attachmentId}")
    ResponseEntity<byte[]> file(@PathVariable UUID id, @PathVariable UUID messageId, @PathVariable UUID attachmentId,
            @RequestParam(defaultValue = "false") boolean inline) {
        MessageFile file = files.file(currentUser.requireOwnerId(), id, messageId, attachmentId, inline);
        ContentDisposition.Builder disposition = file.inline() ? ContentDisposition.inline()
                : ContentDisposition.attachment();
        if (file.fileName() != null && !file.fileName().isBlank()) {
            disposition.filename(file.fileName(), StandardCharsets.UTF_8);
        }
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().contentType(mediaTypeOf(file.mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox; default-src 'none'");
        if (file.inline()) {
            response.cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate());
        }
        return response.body(file.content());
    }

    // "image/*" or "*/*" names no type: the browser would have to guess.
    private static MediaType mediaTypeOf(String mimeType) {
        try {
            MediaType type = mimeType == null ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(mimeType);
            return type.isConcrete() ? type : MediaType.APPLICATION_OCTET_STREAM;
        } catch (InvalidMediaTypeException broken) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    record MessagePageResponse(List<MessageResponse> items, String nextCursor) {
    }

    record MessageBodyResponse(String format, String html, boolean remoteImages) {
    }

}
