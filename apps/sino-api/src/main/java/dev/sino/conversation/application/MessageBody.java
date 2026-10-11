package dev.sino.conversation.application;

/**
 * The full content of one message for the web (F06 design, Contract API): cleaned HTML, never the HTML as sent, and
 * whether it has pictures from the web. A {@code TEXT} message has no HTML.
 */
public record MessageBody(BodyFormat format, String html, boolean remoteImages) {
}
