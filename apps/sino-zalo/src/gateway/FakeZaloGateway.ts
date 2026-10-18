import {
  type ListenerEvents,
  type QrLoginEvents,
  type QrLoginHandle,
  SessionRejectedError,
  type ThreadInfo,
  type ThreadType,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloListener,
  type ZaloMessage,
  ZaloRejectedError,
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

/** What Zalo answers to old-message requests: queued pages per type, then empty pages, or nothing at all. */
export interface FakeOldMessages {
  readonly oldPages: Record<ThreadType, ZaloMessage[][]>;
  silentOldMessages: boolean;
}

/** A listener the test closes the way Zalo would; stopping it reports a 1000 close later, as zca-js does. */
export class FakeListener implements ZaloListener {
  readonly events: ListenerEvents;
  readonly requests: { threadType: ThreadType; lastId: string }[] = [];
  private readonly zalo: FakeOldMessages;
  starts = 0;
  running = false;

  constructor(events: ListenerEvents, zalo: FakeOldMessages) {
    this.events = events;
    this.zalo = zalo;
  }

  requestOldMessages(threadType: ThreadType, lastId: string): void {
    this.requests.push({ threadType, lastId });
    if (this.zalo.silentOldMessages) {
      return;
    }
    const page = this.zalo.oldPages[threadType].shift() ?? [];
    queueMicrotask(() => this.events.oldMessages(page, threadType));
  }

  /** Zalo pushes a new message. */
  receive(message: ZaloMessage): void {
    this.events.message(message);
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
  private readonly zalo: FakeZaloGateway;

  constructor(ownId: string, zalo: FakeZaloGateway) {
    this.ownId = ownId;
    this.zalo = zalo;
  }

  listener(events: ListenerEvents): ZaloListener {
    const listener = new FakeListener(events, this.zalo);
    this.listeners.push(listener);
    return listener;
  }

  async threadInfo(threadId: string, threadType: ThreadType): Promise<ThreadInfo> {
    this.zalo.threadInfoCalls.push(`${threadType}:${threadId}`);
    if (this.zalo.threadInfoFails) {
      throw new ZaloUnavailableError("TypeError: fetch failed");
    }
    return this.zalo.threadInfos.get(threadId) ?? { title: null, avatarUrl: null };
  }

  async sendText(threadId: string, threadType: ThreadType, text: string): Promise<string> {
    this.zalo.sent.push({ threadId, threadType, text });
    let outcome = this.zalo.nextSend;
    this.zalo.nextSend = "accept";
    await Promise.resolve();
    if (outcome === "hold") {
      outcome = await new Promise<"accept" | "reject">((release) => this.zalo.heldSends.push(release));
    }
    if (outcome === "reject") {
      throw new ZaloRejectedError("ZcaApiError: Tham số không hợp lệ");
    }
    if (outcome === "fail") {
      throw new TypeError("fetch failed");
    }
    return String(this.zalo.nextMsgId++);
  }

  async stickerUrl(stickerId: string): Promise<string | null> {
    await Promise.resolve();
    if (this.zalo.stickerFails) {
      throw new ZaloUnavailableError("TypeError: fetch failed");
    }
    return this.zalo.stickerUrls.get(stickerId) ?? null;
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
  readonly oldPages: Record<ThreadType, ZaloMessage[][]> = { USER: [], GROUP: [] };
  silentOldMessages = false;
  /** Names Zalo gives threads, by thread id; any other thread has none. */
  readonly threadInfos = new Map<string, ThreadInfo>();
  readonly threadInfoCalls: string[] = [];
  threadInfoFails = false;
  /** The pictures Zalo gives stickers, by sticker id; any other sticker has none. */
  readonly stickerUrls = new Map<string, string>();
  stickerFails = false;
  /** Every text sent, refused or not, in order. */
  readonly sent: { threadId: string; threadType: ThreadType; text: string }[] = [];
  /** What Zalo does with the next send: take it, refuse it, break midway, or hold it until released. */
  nextSend: "accept" | "reject" | "fail" | "hold" = "accept";
  nextMsgId = 9000;
  readonly heldSends: ((outcome: "accept" | "reject") => void)[] = [];

  /** Zalo answers the sends it held: takes them, or refuses them. */
  releaseHeldSends(outcome: "accept" | "reject" = "accept"): void {
    for (const release of this.heldSends.splice(0)) release(outcome);
  }

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
    const connection = new FakeConnection("7001", this);
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
