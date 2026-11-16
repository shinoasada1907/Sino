package dev.sino.account.api;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

import dev.sino.account.application.AccountErrorCode;
import dev.sino.account.application.PendingQrConnect;
import dev.sino.account.application.QrConnectService;
import dev.sino.account.application.QrConnectStart;
import dev.sino.account.application.QrConnectStatus;
import dev.sino.common.error.SinoException;
import dev.sino.identity.CurrentUser;

/**
 * Connecting an account by QR code (D-275): start shows a code and keeps the login in this browser's session, the web
 * asks where it is every two seconds until it is over, and closing the dialog cancels it.
 */
@RestController
@RequestMapping("/api/accounts/connect/{provider}/qr")
class QrConnectController {

    private final QrConnectService connect;
    private final CurrentUser currentUser;
    private final Clock clock;

    QrConnectController(QrConnectService connect, CurrentUser currentUser, Clock clock) {
        this.connect = connect;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    QrChallengeResponse start(@PathVariable String provider, @Valid @RequestBody QrConnectRequest request,
            HttpServletRequest http) {
        QrConnectStart started = connect.start(currentUser.requireOwnerId(), provider, request.accountId());
        HttpSession session = http.getSession();
        synchronized (WebUtils.getSessionMutex(session)) {
            pendingIn(session).add(started.pending());
        }
        return new QrChallengeResponse(started.challenge().loginId(), started.challenge().qrImage(),
                started.challenge().expiresAt());
    }

    /**
     * Polls of one session take turns, so a confirmed login is registered once even when two polls cross: the
     * provider says "done" only once, and the second poll then finds nothing to ask.
     */
    @GetMapping("/{loginId}")
    QrStatusResponse status(@PathVariable String provider, @PathVariable String loginId, HttpServletRequest http) {
        HttpSession session = http.getSession(false);
        if (session == null) {
            throw notFound();
        }
        synchronized (WebUtils.getSessionMutex(session)) {
            PendingQrConnects connects = pendingIn(session);
            PendingQrConnect pending = mine(connects.find(loginId, clock.instant()), provider)
                    .orElseThrow(QrConnectController::notFound);
            QrConnectStatus status = connect.status(pending);
            if (status.over()) {
                connects.take(loginId);
            }
            return QrStatusResponse.from(status);
        }
    }

    /** Also when the login is over or unknown: then nothing is asked of the provider. */
    @DeleteMapping("/{loginId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String provider, @PathVariable String loginId, HttpServletRequest http) {
        HttpSession session = http.getSession(false);
        if (session == null) {
            return;
        }
        Optional<PendingQrConnect> pending;
        synchronized (WebUtils.getSessionMutex(session)) {
            PendingQrConnects connects = pendingIn(session);
            pending = mine(connects.find(loginId, clock.instant()), provider);
            pending.ifPresent(found -> connects.take(found.loginId()));
        }
        pending.ifPresent(connect::cancel);
    }

    private Optional<PendingQrConnect> mine(Optional<PendingQrConnect> pending, String provider) {
        UUID ownerId = currentUser.requireOwnerId();
        return pending.filter(found -> found.provider().equals(provider) && found.ownerId().equals(ownerId));
    }

    // The holder is set once per session and filled in place, so a reader always finds the same one.
    private static PendingQrConnects pendingIn(HttpSession session) {
        if (session.getAttribute(PendingQrConnects.SESSION_ATTRIBUTE) instanceof PendingQrConnects existing) {
            return existing;
        }
        PendingQrConnects created = new PendingQrConnects();
        session.setAttribute(PendingQrConnects.SESSION_ATTRIBUTE, created);
        return created;
    }

    private static SinoException notFound() {
        return new SinoException(AccountErrorCode.QR_LOGIN_NOT_FOUND, "QR login not found.");
    }

}
