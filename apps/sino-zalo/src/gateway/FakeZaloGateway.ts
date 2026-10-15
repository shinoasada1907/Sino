import {
  type ListenerEvents,
  type QrLoginEvents,
  type QrLoginHandle,
  SessionRejectedError,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloListener,
  type ZaloSession,
  ZaloUnavailableError,
} from "./ZaloGateway.ts";

/** Stands in for the PNG Zalo sends, in base64. */
export const FAKE_QR_IMAGE = "iVBORw0KGgo=";

export class FakeQrLogin implements QrLoginHandle {
  readonly events: QrLoginEvents;
  cancelled = false;

  constructor(events: QrLoginEvents) {
    this.events = events;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

/** A listener the test closes the way Zalo would; stopping it reports a 1000 close later, as zca-js does. */
export class FakeListener implements ZaloListener {
  readonly events: ListenerEvents;
  starts = 0;
  running = false;

  constructor(events: ListenerEvents) {
    this.events = events;
  }

  start(): void {
    if (this.running) {
      throw new Error("Already started");
    }
    this.starts++;
    this.running = true;
  }

  stop(): void {
    if (this.running) {
      this.running = false;
      queueMicrotask(() => this.events.closed(1000, "ManualClosure"));
    }
  }

  /** Zalo closes the websocket with this code. */
  close(code: number, reason: string): void {
    this.running = false;
    this.events.closed(code, reason);
  }
}

export class FakeConnection implements ZaloConnection {
  readonly ownId: string;
  readonly listeners: FakeListener[] = [];

  constructor(ownId: string) {
    this.ownId = ownId;
  }

  listener(events: ListenerEvents): ZaloListener {
    const listener = new FakeListener(events);
    this.listeners.push(listener);
    return listener;
  }
}

/** ZaloGateway for tests: the test plays Zalo by calling the events of a login. */
export class FakeZaloGateway implements ZaloGateway {
  readonly logins: FakeQrLogin[] = [];
  /** What the next login does first: show a code, fail, or stay silent. */
  nextQr: "ready" | "fail" | "none" = "ready";
  /** Every session a cookie login was tried with, in order. */
  readonly sessionLogins: ZaloSession[] = [];
  readonly connections: FakeConnection[] = [];
  /** What Zalo does with the next cookie login. */
  nextSession: "accept" | "reject" | "unavailable" = "accept";

  async loginWithSession(session: ZaloSession): Promise<ZaloConnection> {
    this.sessionLogins.push(session);
    const outcome = this.nextSession;
    this.nextSession = "accept";
    // Zalo answers later, never inside the call.
    await Promise.resolve();
    if (outcome === "reject") {
      throw new SessionRejectedError("ZaloApiError: Đăng nhập thất bại");
    }
    if (outcome === "unavailable") {
      throw new ZaloUnavailableError("TypeError: fetch failed");
    }
    const connection = new FakeConnection("7001");
    this.connections.push(connection);
    return connection;
  }

  latestListener(): FakeListener {
    const listener = this.connections.at(-1)?.listeners.at(-1);
    if (!listener) {
      throw new Error("No listener was made");
    }
    return listener;
  }

  runningListeners(): FakeListener[] {
    return this.connections
      .flatMap((connection) => connection.listeners)
      .filter((listener) => listener.running);
  }

  startQrLogin(events: QrLoginEvents): QrLoginHandle {
    const login = new FakeQrLogin(events);
    this.logins.push(login);
    const first = this.nextQr;
    this.nextQr = "ready";
    // Zalo answers later, never inside the call: the fake does the same.
    queueMicrotask(() => {
      if (first === "ready") events.qrReady(FAKE_QR_IMAGE);
      if (first === "fail") events.failed("Zalo is down");
    });
    return login;
  }

  latest(): FakeQrLogin {
    const login = this.logins.at(-1);
    if (!login) {
      throw new Error("No login was started");
    }
    return login;
  }
}
