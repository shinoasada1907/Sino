package dev.sino.provider.spi;

/**
 * A message read again for what an earlier import did not keep (F06, D-122): its HTML body as the provider gives it,
 * never cleaned ({@code null} when it has none), and its addressees ({@code null} when the connector cannot tell).
 */
public record MessageContent(String htmlContent, NormalizedRecipients recipients) {
}
