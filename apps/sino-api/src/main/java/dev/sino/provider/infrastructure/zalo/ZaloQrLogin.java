package dev.sino.provider.infrastructure.zalo;

import java.util.Optional;

import dev.sino.provider.infrastructure.zalo.ZaloClient.Login;
import dev.sino.provider.infrastructure.zalo.ZaloClient.LoginView;
import dev.sino.provider.infrastructure.zalo.ZaloClient.Profile;
import dev.sino.provider.spi.AccountProfile;
import dev.sino.provider.spi.ProviderException;
import dev.sino.provider.spi.QrChallenge;
import dev.sino.provider.spi.QrLogin;
import dev.sino.provider.spi.QrLoginState;
import dev.sino.provider.spi.TokenCredentials;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The QR login of Zalo (D-275) through sino-zalo's {@code /logins}. A confirmed login gives the account by its Zalo
 * {@code ownId} and the session as the JSON sino-zalo wrote, which Sino stores as it is and hands back on every
 * {@code PUT session} (D-274).
 */
class ZaloQrLogin implements QrLogin {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ZaloClient client;

    ZaloQrLogin(ZaloClient client) {
        this.client = client;
    }

    @Override
    public QrChallenge start() {
        Login login = client.startLogin();
        return new QrChallenge(login.loginId(), login.qrImage(), login.expiresAt());
    }

    @Override
    public QrLoginState status(String loginId) {
        Optional<LoginView> found = client.login(loginId);
        if (found.isEmpty()) {
            return new QrLoginState.Failed("sino-zalo does not know this login");
        }
        LoginView view = found.get();
        return switch (String.valueOf(view.state())) {
            case "WAITING" -> new QrLoginState.Waiting();
            case "SCANNED" -> new QrLoginState.Scanned(view.displayName());
            case "DONE" -> done(view.profile(), view.session());
            case "EXPIRED" -> new QrLoginState.Expired();
            case "DECLINED" -> new QrLoginState.Declined();
            case "FAILED" -> new QrLoginState.Failed("the login broke off at Zalo");
            default -> new QrLoginState.Failed("sino-zalo answered a state Sino does not know");
        };
    }

    @Override
    public void cancel(String loginId) {
        client.cancelLogin(loginId);
    }

    // sino-zalo forgets the login once it said DONE: half an answer cannot be asked again, so the user scans again.
    private static QrLoginState done(Profile profile, JsonNode session) {
        if (profile == null || session == null || !session.isObject()) {
            return new QrLoginState.Failed("sino-zalo said DONE without the account or its session");
        }
        // Empty when Zalo never said who scanned (ZcaGateway): the account still needs a name to be shown by.
        String displayName = profile.displayName() == null || profile.displayName().isBlank() ? profile.ownId()
                : profile.displayName();
        try {
            return new QrLoginState.Done(new AccountProfile(profile.ownId(), displayName, profile.avatarUrl(), null),
                    new TokenCredentials(JSON.writeValueAsString(session)));
        } catch (ProviderException incomplete) {
            return new QrLoginState.Failed("sino-zalo described the account incompletely");
        }
    }

}
