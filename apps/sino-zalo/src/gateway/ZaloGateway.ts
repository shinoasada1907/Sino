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

/** Everything sino-zalo asks of Zalo. Tests use FakeZaloGateway and never reach Zalo. */
export interface ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle;
}

/** zca-js lets a QR code live 100 seconds. */
export const QR_LIFETIME_MS = 100_000;
