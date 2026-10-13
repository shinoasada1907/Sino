package dev.sino.provider.spi;

/**
 * The content of one attachment as the provider gives it (F06, D-125), with the type the provider says it has
 * ({@code null} when it says none). Sino never stores it: it goes straight to the browser.
 */
public record AttachmentContent(byte[] content, String mimeType) {

    public AttachmentContent {
        PayloadChecks.requireValue(content, "content");
    }

}
