package dev.sino.conversation.application;

/**
 * The content of one file or embedded picture of a message, on its way to the browser (F06, D-125), with the type
 * and name Sino stored; {@code inline} when it is shown inside the mail rather than downloaded.
 */
public record MessageFile(byte[] content, String mimeType, String fileName, boolean inline) {
}
