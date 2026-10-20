package dev.sino.conversation.api;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import dev.sino.conversation.application.MessageBodies;
import dev.sino.conversation.application.MessageBody;
import dev.sino.conversation.application.MessageCursor;
import dev.sino.conversation.application.MessageFile;
import dev.sino.conversation.application.MessageFiles;
import dev.sino.conversation.application.MessageHistory;
import dev.sino.conversation.application.MessagePage;
import dev.sino.conversation.application.ReplyService;
import dev.sino.conversation.application.ReplyService.Sent;
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
    private final ReplyService replies;
    private final CurrentUser currentUser;

    ConversationMessagesController(MessageHistory history, MessageBodies bodies, MessageFiles files,
            ReplyService replies, CurrentUser currentUser) {
        this.history = history;
        this.bodies = bodies;
        this.files = files;
        this.replies = replies;
        this.currentUser = currentUser;
    }

    /**
     * Sends a reply (F10), a text or a sticker of the user's library (ZS-05): {@code 201} with the message, or {@code 200}
     * with it when this {@code clientMessageId} was sent before (D-131). The addressees are worked out here, never taken
     * from the request (D-133).
     */
    @PostMapping
    ResponseEntity<MessageResponse> send(@PathVariable UUID id, @Valid @RequestBody SendRequest request) {
        Sent sent = request.stickerId() == null
                ? replies.send(currentUser.requireOwnerId(), id, request.text(), request.clientMessageId())
                : replies.sendSticker(currentUser.requireOwnerId(), id, request.stickerId(),
                        request.clientMessageId());
        return ResponseEntity.status(sent.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(MessageResponse.from(sent.message()));
    }

    /** Discards a message Sino failed to send. */
    @DeleteMapping("/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void discard(@PathVariable UUID id, @PathVariable UUID messageId) {
        replies.discard(currentUser.requireOwnerId(), id, messageId);
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

    /**
     * {@code clientMessageId}: made by the web for each message and sent again unchanged when it retries. Exactly one of
     * {@code text} and {@code stickerId}: a text, or a sticker of the library (ZS-05, D-351).
     */
    record SendRequest(@Size(max = 100_000) String text, UUID stickerId, @NotNull UUID clientMessageId) {

        @AssertTrue(message = "send either a text or a sticker, not both and not neither")
        boolean isTextOrSticker() {
            return stickerId == null ? text != null && !text.isBlank() : text == null;
        }

    }

    record MessageBodyResponse(String format, String html, boolean remoteImages) {
    }

}
