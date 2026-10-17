package dev.sino.provider.infrastructure.zalo;

import java.time.Duration;
import java.util.Optional;

import dev.sino.provider.ProviderCapabilities;
import dev.sino.provider.ProviderCapability;
import dev.sino.provider.ProviderKind;
import dev.sino.provider.ProviderType;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.MessageProvider;
import dev.sino.provider.spi.ProviderContext;
import dev.sino.provider.spi.ProviderErrorCode;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.SyncBatch;
import dev.sino.provider.spi.SyncCursor;

/**
 * The personal Zalo connector (F09): Sino reaches Zalo through the sino-zalo service (D-273), every call through
 * {@link ZaloClient}. It connects by QR code, and is in the registry also while turned off (D-286). It declares a
 * capability only once its operation is built, so callers that check capabilities first (FR-06) leave it alone until
 * then: none yet.
 */
class ZaloProvider implements MessageProvider {

    static final ProviderType TYPE = ProviderType.of("zalo");
    // sino-zalo runs on this machine or in the same Docker network (D-282).
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    /** A read may wait for sino-zalo to catch up with Zalo after a restart, which it bounds at 5 s (D-278). */
    static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
    /**
     * For a send and the start of a QR login: above the 10 s sino-zalo waits for Zalo to send, so a slow send comes
     * back as its 504 (D-280), and the 15 s it waits for a QR code.
     */
    static final Duration SLOW_TIMEOUT = Duration.ofSeconds(20);

    private static final ProviderCapabilities CAPABILITIES = ProviderCapabilities.of();

    private final boolean turnedOn;
    private final ZaloQrLogin qrLogin;

    ZaloProvider(ZaloProperties properties) {
        this.turnedOn = properties.enabled();
        ZaloClient client = new ZaloClient(properties.url(), properties.secret(), properties.enabled(),
                CONNECT_TIMEOUT, READ_TIMEOUT, SLOW_TIMEOUT);
        this.qrLogin = new ZaloQrLogin(client);
    }

    @Override
    public ProviderType type() {
        return TYPE;
    }

    @Override
    public String displayName() {
        return "Zalo";
    }

    @Override
    public ProviderKind kind() {
        return ProviderKind.CHAT;
    }

    @Override
    public ProviderCapabilities capabilities() {
        return CAPABILITIES;
    }

    @Override
    public Optional<QrLogin> qrLogin() {
        return Optional.of(qrLogin);
    }

    @Override
    public boolean turnedOn() {
        return turnedOn;
    }

    /** Who a Zalo account is comes with its QR login (D-275); sino-zalo has no call for it. */
    @Override
    public AccountProfile getAccountProfile(ProviderContext context) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                "Zalo tells who the account is only when its QR login is done");
    }

    @Override
    public SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor) {
        throw new ProviderException(ProviderErrorCode.CAPABILITY_NOT_SUPPORTED,
                TYPE + " does not support " + ProviderCapability.READ_MESSAGES);
    }

}
