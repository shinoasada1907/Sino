package dev.sino.conversation.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import dev.sino.conversation.application.InboxMessage;
import dev.sino.conversation.application.InboxMessage.Address;
import dev.sino.conversation.application.InboxMessage.File;
import dev.sino.conversation.application.InboxMessage.Sender;

/**
 * One message in the list of a conversation (F06 design, Contract API); never its HTML. {@code bodyFormat} is
 * {@code TEXT} for every message until Sino keeps the HTML of mail (BE-55).
 */
record MessageResponse(UUID id, String direction, String status, Instant sentAt, Sender sender, List<Address> to,
        List<Address> cc, String subject, String text, String bodyFormat, boolean read, List<File> attachments) {

    static MessageResponse from(InboxMessage message) {
        return new MessageResponse(message.id(), message.direction().name(), message.status().name(),
                message.sentAt(), message.sender(), message.to(), message.cc(), message.subject(), message.text(),
                "TEXT", message.read(), message.attachments());
    }

}
