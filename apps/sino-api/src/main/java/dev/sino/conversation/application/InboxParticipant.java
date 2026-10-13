package dev.sino.conversation.application;

/** A person of a conversation; {@code self} is the connected account. */
public record InboxParticipant(String externalId, String name, String avatarUrl, boolean self) {
}
