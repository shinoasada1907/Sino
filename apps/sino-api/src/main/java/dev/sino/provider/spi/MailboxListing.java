package dev.sino.provider.spi;

import java.util.List;
import java.util.Objects;

/**
 * The provider's IDs of the messages it keeps outside the inbox, as {@link MessageProvider#listMailboxes} found them
 * (D-501): in spam, in trash, and archived (neither of those nor in the inbox). Mail sent and left alone is in none.
 */
public record MailboxListing(List<String> spam, List<String> trash, List<String> archive) {

    public MailboxListing {
        spam = List.copyOf(Objects.requireNonNull(spam, "spam must not be null"));
        trash = List.copyOf(Objects.requireNonNull(trash, "trash must not be null"));
        archive = List.copyOf(Objects.requireNonNull(archive, "archive must not be null"));
    }

}
