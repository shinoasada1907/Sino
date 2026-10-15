import { randomUUID } from "node:crypto";
import {
  QR_LIFETIME_MS,
  type QrLoginHandle,
  type ZaloGateway,
  type ZaloProfile,
  type ZaloSession,
} from "../gateway/ZaloGateway.ts";

export type LoginView =
  | { readonly state: "WAITING" | "EXPIRED" | "DECLINED" | "FAILED" }
  | { readonly state: "SCANNED"; readonly displayName: string }
  | {
      readonly state: "DONE";
      readonly profile: ZaloProfile;
      readonly session: ZaloSession;
    };

export interface QrChallenge {
  readonly loginId: string;
  readonly qrImage: string;
  readonly expiresAt: string;
}

export class QrUnavailableError extends Error {}

export interface LoginStoreOptions {
  readonly log: { warn(details: object, message: string): void };
  readonly now?: () => number;
  readonly qrWaitMs?: number;
  readonly maxAgeMs?: number;
}

interface Login {
  view: LoginView;
  readonly startedAt: number;
  handle: QrLoginHandle | null;
}

/** QR logins in progress, kept in memory only. */
export class LoginStore {
  private readonly logins = new Map<string, Login>();
  private readonly gateway: ZaloGateway;
  private readonly log: LoginStoreOptions["log"];
  private readonly now: () => number;
  private readonly qrWaitMs: number;
  private readonly maxAgeMs: number;

  constructor(gateway: ZaloGateway, options: LoginStoreOptions) {
    this.gateway = gateway;
    this.log = options.log;
    this.now = options.now ?? Date.now;
    this.qrWaitMs = options.qrWaitMs ?? 15_000;
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
  }

  /** Starts a login and resolves once Zalo has given the QR code. */
  async start(): Promise<QrChallenge> {
    this.forgetOld();
    const loginId = randomUUID();
    const login: Login = {
      view: { state: "WAITING" },
      startedAt: this.now(),
      handle: null,
    };

    const qr = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new QrUnavailableError("No QR code in time")),
        this.qrWaitMs,
      );
      login.handle = this.gateway.startQrLogin({
        qrReady: (image) => {
          clearTimeout(timer);
          resolve(image);
        },
        scanned: (displayName) =>
          this.move(login, { state: "SCANNED", displayName }),
        done: (profile, session) =>
          this.move(login, { state: "DONE", profile, session }),
        expired: () => this.move(login, { state: "EXPIRED" }),
        declined: () => this.move(login, { state: "DECLINED" }),
        failed: (reason) => {
          clearTimeout(timer);
          reject(new QrUnavailableError(reason));
          this.log.warn({ loginId, reason }, "QR login failed");
          this.move(login, { state: "FAILED" });
        },
      });
    });

    let qrImage: string;
    try {
      qrImage = await qr;
    } catch (error) {
      login.handle?.cancel();
      throw error;
    }
    this.logins.set(loginId, login);
    const expiresAt = new Date(this.now() + QR_LIFETIME_MS).toISOString();
    return { loginId, qrImage, expiresAt };
  }

  /** The state of a login; a DONE login is forgotten once read, so the session leaves only once. */
  get(loginId: string): LoginView | undefined {
    this.forgetOld();
    const login = this.logins.get(loginId);
    if (!login) {
      return undefined;
    }
    if (login.view.state === "DONE") {
      this.logins.delete(loginId);
    }
    return login.view;
  }

  cancel(loginId: string): void {
    this.logins.get(loginId)?.handle?.cancel();
    this.logins.delete(loginId);
  }

  /** Only a login still waiting for the phone moves; anything Zalo says after the end is ignored. */
  private move(login: Login, next: LoginView): void {
    if (login.view.state === "WAITING" || login.view.state === "SCANNED") {
      login.view = next;
    }
  }

  private forgetOld(): void {
    const oldest = this.now() - this.maxAgeMs;
    for (const [loginId, login] of this.logins) {
      if (login.startedAt < oldest) {
        login.handle?.cancel();
        this.logins.delete(loginId);
      }
    }
  }
}
