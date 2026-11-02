package dev.sino.conversation.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;

import dev.sino.conversation.application.InboxCounts;
import dev.sino.conversation.application.InboxCursor;
import dev.sino.conversation.application.InboxPage;
import dev.sino.conversation.application.InboxService;
import dev.sino.conversation.application.InboxView;
import dev.sino.identity.CurrentUser;

/**
 * The inbox screen (F05, FR-02): pages of conversations, their counts, one conversation, and marking it read or
 * archived in Sino. Always scoped to the current user's accounts that are neither removed nor disabled.
 */
@RestController
@RequestMapping("/api/conversations")
class ConversationsController {

    private final InboxService inbox;
    private final CurrentUser currentUser;

    ConversationsController(InboxService inbox, CurrentUser currentUser) {
        this.inbox = inbox;
        this.currentUser = currentUser;
    }

    /** A {@code cursor} that this API did not hand out, like a {@code view} or {@code limit} out of range, is a 400. */
    @GetMapping
    ConversationPageResponse list(
            @RequestParam(defaultValue = "all") @Pattern(regexp = InboxView.PARAMETER_VALUES) String view,
            @RequestParam(required = false) String provider, @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) InboxCursor cursor,
            @RequestParam(defaultValue = "30") @Min(1) @Max(100) int limit) {
        InboxPage page = inbox.page(currentUser.requireOwnerId(), InboxView.of(view), provider, accountId, cursor,
                limit);
        return new ConversationPageResponse(page.items().stream().map(ConversationResponse::from).toList(),
                page.next() == null ? null : page.next().encode());
    }

    @GetMapping("/counts")
    CountsResponse counts() {
        InboxCounts counts = inbox.counts(currentUser.requireOwnerId());
        return new CountsResponse(counts.unread(), counts.unreadByProvider(), counts.needsReply(),
                counts.withAttachments(), 0, 0);
    }

    @GetMapping("/{id}")
    ConversationDetailResponse get(@PathVariable UUID id) {
        return ConversationDetailResponse.from(inbox.detail(currentUser.requireOwnerId(), id));
    }

    /**
     * Fields that are not given stay as they are, but one must be. {@code read} and {@code archived} are never sent
     * to the provider (D-67); {@code nickname} is the exception (zalo-nicknames, D-416).
     */
    @PatchMapping("/{id}")
    ConversationResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateConversationRequest request) {
        return ConversationResponse.from(inbox.change(currentUser.requireOwnerId(), id, request.read(),
                request.archived(), request.nicknameGiven(), request.nicknameValue()));
    }

    record ConversationPageResponse(List<ConversationResponse> items, String nextCursor) {
    }

    /** Conversations that are not archived; {@code byProvider} counts the unread ones. */
    record CountsResponse(long unread, Map<String, Long> byProvider, long needsReply, long withAttachments,
            long scheduled, long snoozed) {
    }

    /**
     * {@code nickname} is typed {@link JsonNode}, not {@code String} (D-421): Jackson leaves a field the body does
     * not name as Java {@code null}, but reads an explicit {@code "nickname": null} as a node that {@link #isNull()}
     * says so, which is how {@link #nicknameGiven()} tells "not sent" from "sent null" (D-416) without a separate
     * flag in the body.
     */
    record UpdateConversationRequest(Boolean read, Boolean archived, JsonNode nickname) {

        /** The longest nickname Sino takes until NK-01 reports Zalo's real limit (D-414, agent chốt). */
        static final int MAX_NICKNAME_LENGTH = 50;

        private static final java.util.regex.Pattern CONTROL_CHARACTERS = java.util.regex.Pattern.compile("\\p{Cc}");

        @AssertTrue(message = "read, archived or nickname must be given")
        boolean isChange() {
            return read != null || archived != null || nicknameGiven();
        }

        @AssertTrue(message = "nickname must be a string of at most 50 characters, or null")
        boolean isNicknameShaped() {
            if (!nicknameGiven() || nickname.isNull()) {
                return true;
            }
            return nickname.isString()
                    && normalize(nickname.stringValue()).codePointCount(0, normalize(nickname.stringValue()).length())
                            <= MAX_NICKNAME_LENGTH;
        }

        /** Whether {@code nickname} was in the body at all; see the class note. */
        boolean nicknameGiven() {
            return nickname != null;
        }

        /** The normalized nickname, or {@code null} to clear it (D-414); meaningless unless {@link #nicknameGiven()}. */
        String nicknameValue() {
            if (nickname == null || nickname.isNull() || !nickname.isString()) {
                return null;
            }
            String normalized = normalize(nickname.stringValue());
            return normalized.isEmpty() ? null : normalized;
        }

        // Trimmed, control characters removed (D-414); Zalo's own limit is unconfirmed, so this stops short of it.
        private static String normalize(String raw) {
            return CONTROL_CHARACTERS.matcher(raw.strip()).replaceAll("");
        }

    }

}
