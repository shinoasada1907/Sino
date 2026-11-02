package dev.sino.provider.infrastructure.zalo;

import java.util.LinkedHashMap;
import java.util.Map;

import dev.sino.provider.infrastructure.zalo.ZaloClient.AliasItem;
import dev.sino.provider.spi.Nicknames;
import dev.sino.provider.spi.ProviderContext;

/**
 * Nicknames of Zalo friends through sino-zalo's {@code /aliases} (zalo-nicknames, D-415, D-417): a blank or null
 * nickname clears the one stored instead of setting it, since sino-zalo takes a separate {@code DELETE} for that.
 */
class ZaloNicknames implements Nicknames {

    private final ZaloClient client;

    ZaloNicknames(ZaloClient client) {
        this.client = client;
    }

    @Override
    public void set(ProviderContext context, String friendId, String nickname) {
        if (nickname == null || nickname.isBlank()) {
            client.deleteAlias(context, friendId);
        } else {
            client.putAlias(context, friendId, nickname);
        }
    }

    @Override
    public Map<String, String> list(ProviderContext context) {
        Map<String, String> aliases = new LinkedHashMap<>();
        for (AliasItem item : client.aliases(context)) {
            if (item.friendId() != null && item.alias() != null) {
                aliases.put(item.friendId(), item.alias());
            }
        }
        return aliases;
    }

}
