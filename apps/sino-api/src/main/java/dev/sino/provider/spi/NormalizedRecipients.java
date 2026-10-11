package dev.sino.provider.spi;

import java.util.List;

/**
 * Who an email was addressed to: To and Cc in the order of their headers, and where replies go (Reply-To). An empty
 * list means no address could be read there: the header is missing, empty, or a group without members such as
 * {@code undisclosed-recipients:;}. A connector that cannot tell gives no recipients at all.
 */
public record NormalizedRecipients(List<Address> to, List<Address> cc, List<Address> replyTo) {

    public NormalizedRecipients {
        to = PayloadChecks.copyOf(to, "to");
        cc = PayloadChecks.copyOf(cc, "cc");
        replyTo = PayloadChecks.copyOf(replyTo, "replyTo");
    }

    /** One mailbox: its address, and the display name when the header gives one. */
    public record Address(String name, String address) {

        public Address {
            PayloadChecks.requireText(address, "address");
        }

    }

}
