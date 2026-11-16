package dev.sino.settings.application;

import java.util.UUID;

import org.springframework.stereotype.Service;

import dev.sino.account.AccountDirectory;
import dev.sino.account.AccountSummary;
import dev.sino.conversation.ConversationStats;
import dev.sino.sticker.StickerStats;

/**
 * How much Sino keeps for a user, read through the public API of the modules that keep it (spec {@code user-settings},
 * D-403). The accounts are those of the account list, so {@code messages} is the sum of the {@code storedMessages} that
 * each account shows; what is still stored of a removed account is not counted. Read one account at a time, which is
 * nothing for a few accounts.
 */
@Service
public class StoredDataService {

    private final AccountDirectory accounts;
    private final ConversationStats conversations;
    private final StickerStats stickers;

    StoredDataService(AccountDirectory accounts, ConversationStats conversations, StickerStats stickers) {
        this.accounts = accounts;
        this.conversations = conversations;
        this.stickers = stickers;
    }

    public StoredData of(UUID ownerId) {
        long messages = 0;
        long bytes = stickers.storedBytes(ownerId);
        for (AccountSummary account : accounts.accountsOf(ownerId)) {
            messages += conversations.storedMessages(account.id());
            bytes += conversations.storedBytes(account.id());
        }
        return new StoredData(messages, bytes);
    }

}
