package dev.sino.provider.spi;

import java.util.List;

/**
 * A message read again for what an earlier import did not keep (F06, D-122): its HTML body as the provider gives it,
 * never cleaned ({@code null} when it has none), its addressees ({@code null} when the connector cannot tell), and its
 * files and embedded pictures as an import gives them now (an earlier import may have left some out).
 */
public record MessageContent(String htmlContent, NormalizedRecipients recipients,
        List<NormalizedAttachment> attachments) {

    public MessageContent {
        attachments = PayloadChecks.copyOf(attachments, "attachments");
    }

}
