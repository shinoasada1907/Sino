package dev.sino.conversation.application;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderType;

/**
 * Whether the conversations of an account are email or chat (f05c, D-306): the kind its provider declares, the same
 * for every conversation of the provider whatever its {@code ConversationType}. A provider with no connector in the
 * registry counts as {@link ProviderKind#EMAIL} (D-308, today only Gmail without its Google settings), and says so
 * once per run at {@code WARN}.
 */
@Component
class ConversationKinds {

    private static final Logger log = LoggerFactory.getLogger(ConversationKinds.class);

    private final ProviderRegistry registry;
    private final Set<ProviderType> warned = ConcurrentHashMap.newKeySet();

    ConversationKinds(ProviderRegistry registry) {
        this.registry = registry;
    }

    ProviderKind of(ProviderType provider) {
        return registry.find(provider).map(connector -> connector.kind()).orElseGet(() -> {
            if (warned.add(provider)) {
                log.warn("No connector for provider '{}': its conversations count as {}", provider.value(),
                        ProviderKind.EMAIL);
            }
            return ProviderKind.EMAIL;
        });
    }

    /**
     * The accounts of the given kind, in their order; every account when {@code kind} is null. The one place that
     * decides which accounts a request is about, so a page and the counts beside it never disagree.
     */
    Map<UUID, ProviderType> ofKind(Map<UUID, ProviderType> accounts, ProviderKind kind) {
        if (kind == null) {
            return accounts;
        }
        return accounts.entrySet().stream().filter(account -> of(account.getValue()) == kind)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (first, again) -> first,
                        java.util.LinkedHashMap::new));
    }

}
