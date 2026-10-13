package dev.sino.conversation.application;

import java.util.List;

/** One page of the inbox; {@code next} is null on the last page. */
public record InboxPage(List<InboxItem> items, InboxCursor next) {
}
