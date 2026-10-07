package dev.sino.provider.spi;

import java.time.Instant;

/**
 * What the provider answered to a send. A status it cannot map becomes {@link MessageStatus#UNKNOWN};
 * {@code sentAt} is optional.
 */
public record SendMessageResult(String externalMessageId, MessageStatus status, Instant sentAt) {

    public SendMessageResult {
        PayloadChecks.requireText(externalMessageId, "externalMessageId");
        status = status == null ? MessageStatus.UNKNOWN : status;
    }

}
