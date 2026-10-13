package dev.sino.account;

import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;

/**
 * What another module does with the connector of an account, through {@link ProviderAccess}. It runs a second time
 * when the provider refused the token the first time, so it must be safe to repeat.
 */
@FunctionalInterface
public interface ProviderCall<T> {

    T apply(MessageProvider connector, ProviderContext context);

}
