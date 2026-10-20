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

/**
 * How a sticker moves: a sprite sheet with all its frames side by side in one row, each frame as wide as the
 * sheet is tall (checked on two stickers, 910x130 and 2470x130 for 130-pixel frames). `durationMs` is one run
 * of all the frames: the milliseconds each frame lasts times `frames`.
 */
export interface ZaloStickerSprite {
  readonly url: string;
  readonly frames: number;
  readonly durationMs: number;
}

/** What Zalo gives for a sticker id: the still picture, and the sprite sheet when the sticker moves. */
export interface ZaloStickerArt {
  readonly url: string | null;
  readonly sprite: ZaloStickerSprite | null;
  /** How the picture was found, for the log only: by the sticker itself or, failing that, through its category. */
  readonly via?: "detail" | "category" | undefined;
}

/**
 * The sticker of a `chat.sticker` message (D-279). `url` and `sprite` are null until sino-zalo asks Zalo for the
 * picture; a `chat.gif` has a url and never a sprite.
 */
export interface ZaloSticker {
  readonly id: string;
  readonly catId: string;
  readonly type: number;
  readonly url: string | null;
  readonly sprite?: ZaloStickerSprite | null | undefined;
}

/**
 * The picture of a `chat.photo` message (ZL-16): the address Zalo shows it from, a smaller one when Zalo names a
 * different one, and the caption the sender typed with it. Addresses are web addresses as Zalo gave them;
 * sino-api decides which hosts it trusts.
 */
export interface ZaloPhoto {
  readonly url: string;
  readonly thumbUrl: string | null;
  readonly caption: string | null;
  /** true when Zalo draws the photo as a sticker, without the photo frame (ZL-19); absent for a plain photo. */
  readonly sticker?: true | undefined;
}

/**
 * A picture to send (D-353): its bytes, a file name whose extension (`.png`, `.gif` or `.webp`) says what it is, and its
 * size in pixels, which Zalo wants beside it. The bytes are never logged.
 */
export interface ZaloImage {
  readonly data: Buffer;
  readonly fileName: `${string}.${string}`;
  readonly width: number;
  readonly height: number;
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
  /** Only on a `chat.photo` message whose content names a picture. */
  readonly photo?: ZaloPhoto | undefined;
  /**
   * Only on a `chat.photo` message whose content named no picture: the keys of the content with the kind of each
   * value, never a value, so the log can say what Zalo sent (ZL-16). sino-api ignores it.
   */
  readonly contentShape?: string | undefined;
  /**
   * Only on a `chat.photo` message, found or not: every key of the content (and of its `params`) with the kind of its
   * value, and the host of each web address, never a path or a value, so the log can say which address of a photo
   * that fails to load was chosen and where the others are (ZL-18). sino-api ignores it.
   */
  readonly photoShape?: string | undefined;
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
   * Sends a picture alone, with no text, and resolves with the msgId of the picture's message. Throws ZaloRejectedError
   * when Zalo refused it; any other failure leaves it unknown whether it went out (D-353).
   */
  sendImage(threadId: string, threadType: ThreadType, image: ZaloImage): Promise<string>;
  /**
   * The still picture of a sticker and its sprite sheet, or null when Zalo does not know the sticker or names
   * no picture for it, also in its category (`catId`, from the message). Throws ZaloUnavailableError when Zalo
   * does not answer.
   */
  stickerArt(stickerId: string, catId?: string): Promise<ZaloStickerArt | null>;
}

/** Everything sino-zalo asks of Zalo. Tests use FakeZaloGateway and never reach Zalo. */
export interface ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle;
  /** Logs in with a saved session; throws SessionRejectedError or ZaloUnavailableError. */
  loginWithSession(session: ZaloSession): Promise<ZaloConnection>;
}

/** zca-js lets a QR code live 100 seconds. */
export const QR_LIFETIME_MS = 100_000;
