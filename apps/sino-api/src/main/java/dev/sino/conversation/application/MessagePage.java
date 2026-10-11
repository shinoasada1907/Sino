package dev.sino.conversation.application;

import java.util.List;

/** A page of a conversation's messages, newest first; {@code next} is null on the last page. */
public record MessagePage(List<InboxMessage> items, MessageCursor next) {
}
