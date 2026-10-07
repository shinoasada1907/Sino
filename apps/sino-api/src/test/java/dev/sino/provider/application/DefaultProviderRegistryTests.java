package dev.sino.provider.application;

import static dev.sino.provider.ProviderCapability.READ_MESSAGES;
import static dev.sino.provider.ProviderCapability.SEND_MESSAGES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import dev.sino.common.error.ErrorCategory;
import dev.sino.common.error.SinoException;
import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderDescriptor;
import dev.sino.provider.ProviderRegistry;
import dev.sino.provider.ProviderRegistryErrorCode;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

class DefaultProviderRegistryTests {

    private static final ProviderType GMAIL = ProviderType.of("gmail");
    private static final ProviderType TELEGRAM = ProviderType.of("telegram");

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(DefaultProviderRegistry.class);

    @Test
    void withoutConnectorsNothingIsSupported() {
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of());

        assertThat(registry.descriptors()).isEmpty();
        assertThat(registry.isSupported(GMAIL)).isFalse();
        assertThat(registry.find(GMAIL)).isEmpty();
    }

    @Test
    void resolvesItsOnlyConnector() {
        MessageProvider gmail = new StubProvider("gmail");
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of(gmail));

        assertThat(registry.get(GMAIL)).isSameAs(gmail);
        assertThat(registry.find(GMAIL)).containsSame(gmail);
        assertThat(registry.isSupported(GMAIL)).isTrue();
    }

    @Test
    void resolvesEachConnectorByItsType() {
        MessageProvider gmail = new StubProvider("gmail");
        MessageProvider telegram = new StubProvider("telegram");
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of(gmail, telegram));

        assertThat(registry.get(GMAIL)).isSameAs(gmail);
        assertThat(registry.get(TELEGRAM)).isSameAs(telegram);
    }

    @Test
    void refusesTwoConnectorsWithTheSameType() {
        List<MessageProvider> providers = List.of(new StubProvider("gmail"), new NamedStubProvider("gmail", "Gmail"));

        assertThatThrownBy(() -> new DefaultProviderRegistry(providers))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("'gmail'")
                .hasMessageContaining(StubProvider.class.getName())
                .hasMessageContaining(NamedStubProvider.class.getName());
    }

    @Test
    void refusesAConnectorWithoutAType() {
        MessageProvider broken = new StubProvider("gmail") {

            @Override
            public ProviderType type() {
                return null;
            }

        };

        assertThatThrownBy(() -> new DefaultProviderRegistry(List.of(broken)))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining(broken.getClass().getName());
    }

    @Test
    void anUnknownTypeIsNotFound() {
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of(new StubProvider("gmail")));

        assertThatExceptionOfType(SinoException.class)
                .isThrownBy(() -> registry.get(TELEGRAM))
                .withMessageContaining("telegram")
                .extracting(SinoException::errorCode)
                .isEqualTo(ProviderRegistryErrorCode.UNKNOWN_PROVIDER);
        assertThat(ProviderRegistryErrorCode.UNKNOWN_PROVIDER.category()).isEqualTo(ErrorCategory.NOT_FOUND);
    }

    @Test
    void checkingAnUnknownTypeDoesNotThrow() {
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of(new StubProvider("gmail")));

        assertThat(registry.isSupported(TELEGRAM)).isFalse();
        assertThat(registry.find(TELEGRAM)).isEmpty();
    }

    @Test
    void describesEveryConnectorSortedByType() {
        DefaultProviderRegistry registry = new DefaultProviderRegistry(List.of(
                new StubProvider("telegram", READ_MESSAGES),
                new NamedStubProvider("gmail", "Gmail", READ_MESSAGES, SEND_MESSAGES)));

        assertThat(registry.descriptors()).containsExactly(
                new ProviderDescriptor(GMAIL, "Gmail", ProviderCapabilities.of(READ_MESSAGES, SEND_MESSAGES)),
                new ProviderDescriptor(TELEGRAM, "telegram", ProviderCapabilities.of(READ_MESSAGES)));
    }

    @Test
    void cannotBeChangedFromOutside() {
        List<MessageProvider> providers = new ArrayList<>(List.of(new StubProvider("gmail")));
        DefaultProviderRegistry registry = new DefaultProviderRegistry(providers);
        providers.add(new StubProvider("telegram"));

        assertThat(registry.isSupported(TELEGRAM)).isFalse();
        assertThatThrownBy(() -> registry.descriptors().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void theApplicationStartsWithoutConnectors() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ProviderRegistry.class).descriptors()).isEmpty();
        });
    }

    @Test
    void picksUpEveryConnectorBean() {
        contextRunner
                .withBean("gmail", MessageProvider.class, () -> new StubProvider("gmail"))
                .withBean("telegram", MessageProvider.class, () -> new StubProvider("telegram"))
                .run(context -> {
                    ProviderRegistry registry = context.getBean(ProviderRegistry.class);
                    assertThat(registry.get(GMAIL)).isSameAs(context.getBean("gmail"));
                    assertThat(registry.get(TELEGRAM)).isSameAs(context.getBean("telegram"));
                });
    }

    @Test
    void theApplicationDoesNotStartWithADuplicateType() {
        contextRunner
                .withBean("first", MessageProvider.class, () -> new StubProvider("gmail"))
                .withBean("second", MessageProvider.class, () -> new NamedStubProvider("gmail", "Gmail"))
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure()).rootCause()
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("Duplicate provider type 'gmail'");
                });
    }

    /** A connector that only declares who it is. */
    private static class StubProvider implements MessageProvider {

        private final ProviderType type;
        private final ProviderCapabilities capabilities;

        StubProvider(String type, ProviderCapability... capabilities) {
            this.type = ProviderType.of(type);
            this.capabilities = ProviderCapabilities.of(capabilities);
        }

        @Override
        public ProviderType type() {
            return type;
        }

        @Override
        public ProviderCapabilities capabilities() {
            return capabilities;
        }

        @Override
        public AccountProfile getAccountProfile(ProviderContext context) {
            throw new UnsupportedOperationException();
        }

        @Override
        public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
            throw new UnsupportedOperationException();
        }

    }

    private static final class NamedStubProvider extends StubProvider {

        private final String displayName;

        NamedStubProvider(String type, String displayName, ProviderCapability... capabilities) {
            super(type, capabilities);
            this.displayName = displayName;
        }

        @Override
        public String displayName() {
            return displayName;
        }

    }

}
