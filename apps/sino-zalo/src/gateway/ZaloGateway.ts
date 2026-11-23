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
 * The place a `chat.location.new` message shares (zalo-location-card, D-529). The coordinates are numbers, already in
 * range; `title` and `address` are the texts Zalo gave (cut), `previewUrl` the map picture when Zalo gives one (it has
 * not so far), as a web address that sino-api checks against its hosts.
 */
export interface ZaloLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly title: string | null;
  readonly address: string | null;
  readonly previewUrl: string | null;
  /** true for the sender's own current position ("Vị trí của bạn" in Zalo), from `params.isUserLocation` other than 0. */
  readonly current: boolean;
}

/**
 * The contact card a `chat.recommended` message shares (zalo-location-card, D-529). `userId` is the Zalo user's id (digits)
 * when `params` is one; `phone` and `qrUrl` come from Zalo's `description` and are null when it says none. Addresses
 * are web addresses that sino-api checks against its hosts.
 */
export interface ZaloContactCard {
  readonly userId: string | null;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly phone: string | null;
  readonly qrUrl: string | null;
}

/** A file a `share.file` message carries, as Zalo names it: its name, where Zalo serves it, its size when said. */
export interface ZaloSharedFile {
  readonly name: string;
  readonly url: string;
  readonly sizeBytes: number | null;
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

/**
 * A picture or a file from the user's computer to send (zalo-send-files, D-375). A `PHOTO` goes as Zalo's plain photo,
 * with the frame, and needs its size in pixels; a `FILE` goes as a file to download. zca-js picks its path by the ending
 * of `fileName`, which sino-api made match the kind. The bytes and the name are never logged.
 */
export type ZaloFile =
  | { readonly kind: "PHOTO"; readonly data: Buffer; readonly fileName: `${string}.${string}`; readonly width: number; readonly height: number }
  | { readonly kind: "FILE"; readonly data: Buffer; readonly fileName: string };

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
  /** Only on a `share.file` message whose content names a file and where Zalo serves it (zalo-send-files, ZF-08). */
  readonly file?: ZaloSharedFile | undefined;
  /** Only on a `chat.recommended` message that is a contact card with a name (zalo-location-card, ZC-02); a link has none. */
  readonly contactCard?: ZaloContactCard | undefined;
  /** Only on a `chat.location.new` message whose content named a valid place (zalo-location-card, ZC-02). */
  readonly location?: ZaloLocation | undefined;
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
  /**
   * Only on a `chat.voice`, `chat.video.msg`, `chat.recommended`, `chat.link` or `chat.location.new` message (ML-01, D-475; ZC-01), a location only when it could not be read (no `location`) and a contact card only when its description did not give the QR address: the same
   * description as `photoShape` (keys of the content and of `params`, kind of each value, host of each address, never
   * a path or a value), so a real message shows how Zalo gives these. sino-api ignores it.
   */
  readonly mediaShape?: string | undefined;
  /**
   * The `cliMsgId` Zalo gave the message (the sender's own id for it), when it gave one (zalo-reactions, D-381): a
   * reaction names its target by `msgId` and `cliMsgId`, and so will a reply that quotes it.
   */
  readonly cliMsgId?: string | undefined;
  /** How long Zalo keeps the message, in seconds, as Zalo gave it; a quote of the message carries it back. */
  readonly ttl?: number | undefined;
  /** What Zalo put beside the content (`color`, `size`, `type`, `subType`, `ext`), untouched, for a quote to carry back. */
  readonly propertyExt?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Only on a `reaction` entry (D-381): one reaction event of Zalo, not a message. `msgId` is the event's own,
   * `fromId`, `fromName`, `isSelf` and `sentAt` are the reactor's and the moment, `text` is null. `icon` is the code of
   * Zalo's `Reactions`, empty when the reactor took the reaction back; `targets` are the messages it is on (Zalo allows
   * several in one event).
   */
  readonly reaction?: ZaloReaction | undefined;
  /**
   * Only on a `reaction` entry: what the event looked like, never the icon or a name, so the log can say how Zalo
   * sends a removal or a reaction on a photo (zalo-reactions, D-380). sino-api ignores it.
   */
  readonly reactionShape?: string | undefined;
  /**
   * Only on a message that quotes another (zalo-quote-reply, D-503): the message it quotes, as Zalo names it. The text is
   * cut to 200 characters. Never logged; only quoteShape is.
   */
  readonly quote?: ZaloQuoted | undefined;
  /** Only with quote: what the quote looked like (kind, the numeric type, whether it has attach), never a text or a name. */
  readonly quoteShape?: string | undefined;
  /**
   * The content of a message whose content is not text (a photo, a sticker, a file...), untouched: a reply that quotes
   * such a message has to give it back to Zalo (zalo-quote-reply, D-505). Absent for text.
   */
  readonly rawContent?: Readonly<Record<string, unknown>> | undefined;
}

/** What Zalo says about the message a message quotes (D-503). */
export interface ZaloQuoted {
  /** The Zalo msgId of the quoted message (globalMsgId). */
  readonly msgId: string;
  readonly cliMsgId: string;
  /** Who sent the quoted message (ownerId). */
  readonly fromId: string;
  readonly fromName: string;
  /** The text of the quoted message, at most 200 characters; empty for a picture or a sticker. */
  readonly text: string;
  readonly kind: "text" | "photo" | "sticker" | "file" | "gif" | "voice" | "video" | "link" | "location" | "other";
  readonly ts: string;
}

/**
 * A message to quote in a reply (D-506): what zca-js asks of the original message (the fields of Zalo's own message).
 * content is the text, or for a message that is not text the raw content it had.
 */
export interface ZaloQuote {
  readonly msgId: string;
  readonly cliMsgId: string;
  readonly uidFrom: string;
  readonly ts: string;
  readonly ttl: number;
  readonly msgType: string;
  readonly content: string | Readonly<Record<string, unknown>>;
  readonly propertyExt?: Readonly<Record<string, unknown>> | undefined;
}

/** The reaction a `reaction` entry carries (zalo-reactions, D-381). */
export interface ZaloReaction {
  readonly icon: string;
  readonly targets: readonly ZaloReactionTarget[];
}

/** A message a reaction is on, named as Zalo wants it back when a reaction is set (`addReaction`). */
export interface ZaloReactionTarget {
  readonly msgId: string;
  readonly cliMsgId: string;
}

/**
 * The reaction codes Zalo takes (`Reactions` of zca-js 2.2.0, D-389), without the empty one, which cannot be sent: zca-js
 * throws "Invalid reaction" for it, so a removal goes another way. Only `ZcaGateway` imports zca-js, so the list is
 * here; a test checks it still equals the library's.
 */
export const REACTION_CODES: readonly string[] = [
  "/-heart", "/-strong", ":>", ":o", ":-((", ":-h", ":-*", ":')", "/-shit", "/-rose", "/-break", "/-weak", ";xx", ";-/",
  ";-)", "/-fade", "/-li", "/-bd", "/-bome", "/-ok", "/-v", "/-thanks", "/-punch", "/-share", "_()_", "/-no", "/-bad",
  "/-loveu", "--b", ":((", "x-)", "8-)", ";-d", "b-)", ":--|", "p-(", ":-bye", "|-)", ":wipe", ":-dig", "&-(", ":handclap",
  ">-|", ":-f", ":-l", ":-r", ";-x", ":-o", ";-s", ";-a", ":-<", ":))", "$-)", "/-beer",
];

/** Where a reaction goes: the message (`msgId`, `cliMsgId`) in its thread, and the reaction (`icon`, empty to remove). */
export interface ReactionRequest {
  readonly threadId: string;
  readonly threadType: ThreadType;
  readonly msgId: string;
  readonly cliMsgId: string;
  readonly icon: string;
}

/** A thread's name and picture; null where Zalo gave none. */
export interface ThreadInfo {
  readonly title: string | null;
  readonly avatarUrl: string | null;
}

/** A friend's nickname (zalo-nicknames, D-415): the friend's id and the alias the account owner gave them. */
export interface ZaloAlias {
  readonly friendId: string;
  readonly alias: string;
}

/** A friend of the account (zalo-contacts, D-425); `id` is the `threadId` of a 1-1 chat with them. */
export interface ZaloFriendContact {
  readonly id: string;
  /** The Zalo name, as a 1-1 chat is named (D-419), never a nickname sino-zalo adds. */
  readonly name: string;
  readonly avatarUrl: string | null;
}

/** A group the account is in (zalo-contacts, D-425); `id` is the `threadId` of the group chat. */
export interface ZaloGroupContact {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly memberCount: number | null;
}

/** Every friend and group of the account, from one answer of Zalo each (zalo-contacts, D-425). */
export interface ZaloContacts {
  readonly friends: readonly ZaloFriendContact[];
  readonly groups: readonly ZaloGroupContact[];
}

/** What a listener reports. `closed` follows every close of the websocket, a stop asked for included. */
export interface ListenerEvents {
  connected(): void;
  /** Zalo's messages can be read from now on: old messages may be asked for. */
  ready(): void;
  message(message: ZaloMessage): void;
  /** One page answering `requestOldMessages`. */
  oldMessages(messages: ZaloMessage[], threadType: ThreadType): void;
  /** One page answering `requestOldReactions`, each reaction as a `reaction` entry (D-381). */
  oldReactions(reactions: ZaloMessage[], threadType: ThreadType): void;
  closed(code: number, reason: string): void;
  error(reason: string): void;
}

/** The websocket Zalo pushes events on; it can start again after it closed. */
export interface ZaloListener {
  start(): void;
  stop(): void;
  /** Asks for the messages after `lastId`; the page comes back as `oldMessages`. */
  requestOldMessages(threadType: ThreadType, lastId: string): void;
  /** Asks for the reactions after `lastId`; the page comes back as `oldReactions`. */
  requestOldReactions(threadType: ThreadType, lastId: string): void;
}

/** A session Zalo has accepted. */
export interface ZaloConnection {
  readonly ownId: string;
  listener(events: ListenerEvents): ZaloListener;
  /** Throws ZaloUnavailableError when Zalo does not answer. */
  threadInfo(threadId: string, threadType: ThreadType): Promise<ThreadInfo>;
  /**
   * The picture address of each user in `userIds`, asked of Zalo in one call. A user Zalo names no picture for is
   * there with null. Throws ZaloUnavailableError when Zalo does not answer.
   */
  userAvatars(userIds: readonly string[]): Promise<ReadonlyMap<string, string | null>>;
  /**
   * Sends a text and resolves with Zalo's msgId. Throws ZaloRejectedError when Zalo refused it;
   * any other failure leaves it unknown whether the message went out.
   */
  sendText(threadId: string, threadType: ThreadType, text: string, quote?: ZaloQuote): Promise<string>;
  /**
   * Sends a picture alone, with no text, and resolves with the msgId of the picture's message. Throws ZaloRejectedError
   * when Zalo refused it; any other failure leaves it unknown whether it went out (D-353).
   */
  sendImage(
    threadId: string,
    threadType: ThreadType,
    image: ZaloImage,
    quote?: ZaloQuote,
    /** Called when a picture sent as a sticker could not carry the quote and went without it (D-506). */
    onQuoteDropped?: () => void,
  ): Promise<string>;
  /**
   * Sends a picture or file from the computer alone and resolves with its message's msgId (zalo-send-files, D-375).
   * Throws ZaloRejectedError when Zalo refused it; any other failure leaves it unknown whether it went out.
   */
  sendFile(threadId: string, threadType: ThreadType, file: ZaloFile, quote?: ZaloQuote): Promise<string>;
  /**
   * Sets, changes or takes back the account's reaction on a message (zalo-reactions, D-389). `icon` is a code of
   * `REACTION_CODES`, or empty to take the reaction back. Throws ZaloRejectedError when Zalo answered with an error;
   * ZaloUnavailableError for any other failure.
   */
  react(request: ReactionRequest): Promise<void>;
  /**
   * The still picture of a sticker and its sprite sheet, or null when Zalo does not know the sticker or names
   * no picture for it, also in its category (`catId`, from the message). Throws ZaloUnavailableError when Zalo
   * does not answer.
   */
  stickerArt(stickerId: string, catId?: string): Promise<ZaloStickerArt | null>;
  /**
   * Sets a friend's nickname (zalo-nicknames, D-415, `changeFriendAlias`). Throws ZaloRejectedError when Zalo
   * refuses it (for instance the friend is not a friend, or the name is not valid); ZaloUnavailableError when
   * Zalo does not answer or fails in a way that says nothing about it.
   */
  setAlias(friendId: string, alias: string): Promise<void>;
  /** Removes a friend's nickname (`removeFriendAlias`). Same errors as `setAlias`. */
  removeAlias(friendId: string): Promise<void>;
  /**
   * Every nickname Zalo knows for this account's friends, every page of `getAliasList` joined into one list.
   * Throws ZaloUnavailableError when Zalo does not answer.
   */
  aliasList(): Promise<ZaloAlias[]>;
  /**
   * Every friend and group of the account (zalo-contacts, D-425). Throws ZaloUnavailableError when any call to
   * Zalo fails, so a partial list never comes out.
   */
  contacts(): Promise<ZaloContacts>;
}

/** Everything sino-zalo asks of Zalo. Tests use FakeZaloGateway and never reach Zalo. */
export interface ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle;
  /** Logs in with a saved session; throws SessionRejectedError or ZaloUnavailableError. */
  loginWithSession(session: ZaloSession): Promise<ZaloConnection>;
}

/** zca-js lets a QR code live 100 seconds. */
export const QR_LIFETIME_MS = 100_000;
