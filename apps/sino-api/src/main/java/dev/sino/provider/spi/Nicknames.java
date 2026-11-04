package dev.sino.provider.spi;

import java.util.Map;

/**
 * Nicknames of a chat provider's friends (zalo-nicknames, D-414, D-417): a provider with
 * {@link dev.sino.provider.ProviderCapability#NICKNAMES} has one, through {@link MessageProvider#nicknames()}.
 * {@code friendId} is the provider's ID of the friend, the same as {@code externalConversationId} of their 1-1 chat
 * (D-416). Call both outside a transaction: they ask the provider.
 */
public interface Nicknames {

    /**
     * Sets or clears the nickname of {@code friendId} at the provider; {@code nickname} null or blank clears it
     * (D-414). The caller strips and normalizes {@code nickname} first.
     *
     * @throws ProviderException with {@code REQUEST_REJECTED} when the provider refused it (not a friend, or a
     *         nickname it does not accept), or another code when it could not be reached
     */
    void set(ProviderContext context, String friendId, String nickname);

    /**
     * Every nickname the provider's account has set, by {@code friendId}; a friend with none is left out, never
     * given as a blank value.
     *
     * @throws ProviderException when the provider could not be reached
     */
    Map<String, String> list(ProviderContext context);

}
