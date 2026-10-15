/** A Zalo session as sino-api stores it (D-274); sino-zalo passes the cookies on untouched. */
export interface ZaloSession {
  readonly cookie: unknown[];
  readonly imei: string;
  readonly userAgent: string;
}

export interface ZaloProfile {
  readonly ownId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

/** What a QR login reports: qrReady, maybe scanned, then exactly one ending. */
export interface QrLoginEvents {
  qrReady(image: string): void;
  scanned(displayName: string, avatarUrl: string | null): void;
  done(profile: ZaloProfile, session: ZaloSession): void;
  expired(): void;
  declined(): void;
  failed(reason: string): void;
}

export interface QrLoginHandle {
  cancel(): void;
}

/** Zalo refused the session, for instance because a kick revoked its cookie (D-276). */
export class SessionRejectedError extends Error {}

/** Zalo could not be reached, or failed in a way that says nothing about the session. */
export class ZaloUnavailableError extends Error {}

/** What a listener reports. `closed` follows every close of the websocket, a stop asked for included. */
export interface ListenerEvents {
  connected(): void;
  closed(code: number, reason: string): void;
  error(reason: string): void;
}

/** The websocket Zalo pushes events on; it can start again after it closed. */
export interface ZaloListener {
  start(): void;
  stop(): void;
}

/** A session Zalo has accepted. */
export interface ZaloConnection {
  readonly ownId: string;
  listener(events: ListenerEvents): ZaloListener;
}

/** Everything sino-zalo asks of Zalo. Tests use FakeZaloGateway and never reach Zalo. */
export interface ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle;
  /** Logs in with a saved session; throws SessionRejectedError or ZaloUnavailableError. */
  loginWithSession(session: ZaloSession): Promise<ZaloConnection>;
}

/** zca-js lets a QR code live 100 seconds. */
export const QR_LIFETIME_MS = 100_000;
