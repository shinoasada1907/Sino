package dev.sino.provider.spi;

/**
 * Metadata of an attachment. Downloading the content is not part of the contract yet (F06).
 */
public record NormalizedAttachment(String externalAttachmentId, String fileName, String mimeType, Long sizeBytes,
        String remoteUrl, String thumbnailUrl) {

    public NormalizedAttachment {
        PayloadChecks.requireText(externalAttachmentId, "externalAttachmentId");
    }

}
