package dev.sino.provider.spi;

import java.util.Locale;
import java.util.Set;

/**
 * Metadata of an attachment. One with a {@code contentId} is a picture the HTML of the message shows by that id
 * ({@code cid:}), one of {@link #PICTURE_TYPES}, and not a file of the message (F06); {@code null} for a file. An
 * embedded picture the HTML does not show, or that a browser may not show safely, is a file.
 */
public record NormalizedAttachment(String externalAttachmentId, String fileName, String mimeType, Long sizeBytes,
        String remoteUrl, String thumbnailUrl, String contentId) {

    /** The pictures a browser shows and never runs; an SVG can carry script (D-125). */
    public static final Set<String> PICTURE_TYPES = Set.of("image/png", "image/jpeg", "image/gif", "image/webp");

    public NormalizedAttachment {
        PayloadChecks.requireText(externalAttachmentId, "externalAttachmentId");
    }

    /** Whether the type, in any case and with any parameters ({@code image/png; name=logo.png}), is a picture. */
    public static boolean isPicture(String mimeType) {
        return mimeType != null
                && PICTURE_TYPES.contains(mimeType.split(";", 2)[0].strip().toLowerCase(Locale.ROOT));
    }

}
