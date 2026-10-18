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

/** Zalo answered a send with an error: the message did not go out (D-280). */
export class ZaloRejectedError extends Error {}

export type ThreadType = "USER" | "GROUP";

/** The sticker of a `chat.sticker` message (D-279). `url` is null until sino-zalo asks Zalo for the picture. */
export interface ZaloSticker {
  readonly id: string;
  readonly catId: string;
  readonly type: number;
  readonly url: string | null;
}

/** A Zalo message in the shape sino-zalo hands to sino-api (design, Contract API). */
export interface ZaloMessage {
  readonly msgId: string;
  readonly threadId: string;
  readonly threadType: ThreadType;
  readonly fromId: string;
  /** The sender's name as the message shows it. */
  readonly fromName: string;
  readonly isSelf: boolean;
  readonly zaloType: string;
  /** null when the message is not text. */
  readonly text: string | null;
  readonly sentAt: string;
  /** Only on a `chat.sticker` message whose content names a sticker. */
  readonly sticker?: ZaloSticker | undefined;
}

/** A thread's name and picture; null where Zalo gave none. */
export interface ThreadInfo {
  readonly title: string | null;
  readonly avatarUrl: string | null;
}

/** What a listener reports. `closed` follows every close of the websocket, a stop asked for included. */
export interface ListenerEvents {
  connected(): void;
  /** Zalo's messages can be read from now on: old messages may be asked for. */
  ready(): void;
  message(message: ZaloMessage): void;
  /** One page answering `requestOldMessages`. */
  oldMessages(messages: ZaloMessage[], threadType: ThreadType): void;
  closed(code: number, reason: string): void;
  error(reason: string): void;
}

/** The websocket Zalo pushes events on; it can start again after it closed. */
export interface ZaloListener {
  start(): void;
  stop(): void;
  /** Asks for the messages after `lastId`; the page comes back as `oldMessages`. */
  requestOldMessages(threadType: ThreadType, lastId: string): void;
}

/** A session Zalo has accepted. */
export interface ZaloConnection {
  readonly ownId: string;
  listener(events: ListenerEvents): ZaloListener;
  /** Throws ZaloUnavailableError when Zalo does not answer. */
  threadInfo(threadId: string, threadType: ThreadType): Promise<ThreadInfo>;
  /**
   * Sends a text and resolves with Zalo's msgId. Throws ZaloRejectedError when Zalo refused it;
   * any other failure leaves it unknown whether the message went out.
   */
  sendText(threadId: string, threadType: ThreadType, text: string): Promise<string>;
  /**
   * The address of a sticker's picture, or null when Zalo does not know the sticker. Throws
   * ZaloUnavailableError when Zalo does not answer.
   */
  stickerUrl(stickerId: string): Promise<string | null>;
}

/** Everything sino-zalo asks of Zalo. Tests use FakeZaloGateway and never reach Zalo. */
export interface ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle;
  /** Logs in with a saved session; throws SessionRejectedError or ZaloUnavailableError. */
  loginWithSession(session: ZaloSession): Promise<ZaloConnection>;
}

/** zca-js lets a QR code live 100 seconds. */
export const QR_LIFETIME_MS = 100_000;
