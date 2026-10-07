/**
 * Contract between the core and the provider connectors: the data a connector returns and the errors it
 * reports. Normalized types check themselves when they are created: missing required data throws a
 * {@link dev.sino.provider.spi.ProviderException} with
 * {@link dev.sino.provider.spi.ProviderErrorCode#PAYLOAD_NORMALIZATION_FAILED}, a value the provider cannot
 * map becomes {@code UNKNOWN}, and lists and maps are copied read-only ({@code null} means empty).
 */
@NamedInterface("spi")
package dev.sino.provider.spi;

import org.springframework.modulith.NamedInterface;
