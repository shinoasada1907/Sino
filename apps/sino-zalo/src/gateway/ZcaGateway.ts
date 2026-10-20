import {
  type API,
  type Credentials,
  LoginQRCallbackEventType,
  type Message,
  type StickerDetail,
  ThreadType as ZcaThreadType,
  Zalo,
  ZaloApiError,
} from "zca-js";
import {
  type QrLoginEvents,
  type QrLoginHandle,
  SessionRejectedError,
  type ThreadInfo,
  type ThreadType,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloMessage,
  type ZaloPhoto,
  ZaloRejectedError,
  type ZaloSession,
  type ZaloSticker,
  type ZaloStickerArt,
  ZaloUnavailableError,
} from "./ZaloGateway.ts";

/** ZaloGateway over zca-js, the unofficial Zalo Web client (D-283). */
export class ZcaGateway implements ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle {
    let abort: (() => unknown) | null = null;
    let ended = false;
    let scanned = { displayName: "", avatarUrl: null as string | null };

    const end = (report: () => void) => {
      if (!ended) {
        ended = true;
        report();
      }
    };

    const zalo = new Zalo({ checkUpdate: false, logging: false });
    zalo
      .loginQR({}, (event) => {
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated:
            abort = event.actions.abort;
            // Cancelled before Zalo gave the code: stop here.
            if (ended) event.actions.abort();
            else events.qrReady(event.data.image);
            break;
          case LoginQRCallbackEventType.QRCodeScanned:
            abort = event.actions.abort;
            scanned = {
              displayName: event.data.display_name,
              avatarUrl: event.data.avatar || null,
            };
            events.scanned(scanned.displayName, scanned.avatarUrl);
            break;
          // zca-js waits forever after these two unless told to abort or retry.
          case LoginQRCallbackEventType.QRCodeExpired:
            event.actions.abort();
            end(() => events.expired());
            break;
          case LoginQRCallbackEventType.QRCodeDeclined:
            event.actions.abort();
            end(() => events.declined());
            break;
          case LoginQRCallbackEventType.GotLoginInfo:
            break;
        }
      })
      .then((api) => {
        const context = api.getContext();
        const session = {
          cookie: context.cookie.toJSON()?.cookies ?? [],
          imei: context.imei,
          userAgent: context.userAgent,
        };
        end(() => events.done({ ownId: api.getOwnId(), ...scanned }, session));
      })
      .catch((error: unknown) => end(() => events.failed(reasonOf(error))));

    return {
      cancel: () => {
        ended = true;
        abort?.();
      },
    };
  }

  async loginWithSession(session: ZaloSession): Promise<ZaloConnection> {
    // selfListen: what the account sends from the phone shows in Sino too (D-279).
    const zalo = new Zalo({ checkUpdate: false, logging: false, selfListen: true });
    let api: API;
    try {
      api = await zalo.login({
        cookie: session.cookie as Credentials["cookie"],
        imei: session.imei,
        userAgent: session.userAgent,
      });
    } catch (error) {
      throw isRefusal(error)
        ? new SessionRejectedError(reasonOf(error))
        : new ZaloUnavailableError(reasonOf(error));
    }

    // The stickers of a category, once Zalo has given them, for the stickers of that category that come later.
    const categories = new Map<number, StickerDetail[]>();

    return {
      ownId: api.getOwnId(),
      listener: (events) => {
        const listener = api.listener;
        listener.on("connected", () => events.connected());
        // Zalo sends the key that decrypts its events right after connecting; before it, nothing can be read.
        listener.on("cipher_key", () => events.ready());
        listener.on("message", (message) => events.message(toZaloMessage(message)));
        listener.on("old_messages", (messages, type) =>
          events.oldMessages(messages.map(toZaloMessage), threadTypeOf(type)),
        );
        listener.on("closed", (code, reason) => events.closed(code, reason));
        // An "error" event nobody listens to would crash the process.
        listener.on("error", (error) => events.error(reasonOf(error)));
        return {
          // zca-js would reconnect after a kick too and then report 1006 (spike log),
          // so SessionManager decides when to reconnect (D-276).
          start: () => listener.start({ retryOnClose: false }),
          stop: () => listener.stop(),
          requestOldMessages: (threadType, lastId) =>
            listener.requestOldMessages(zcaThreadType(threadType), lastId),
        };
      },
      sendText: (threadId, threadType, text) => sendText(api.sendMessage, threadId, threadType, text),
      stickerArt: async (stickerId, catId) => {
        try {
          // `await` here, or a rejection would pass the catch below.
          return await findStickerArt(api, categories, stickerId, catId);
        } catch (error) {
          throw new ZaloUnavailableError(reasonOf(error));
        }
      },
      threadInfo: async (threadId, threadType) => {
        try {
          // `await` here, or a rejection would pass the catch below.
          return await (threadType === "USER"
            ? userInfo(api, threadId)
            : groupInfo(api, threadId));
        } catch (error) {
          throw new ZaloUnavailableError(reasonOf(error));
        }
      },
    };
  }
}

/** A zca-js message in the contract's shape (D-279 reads `zaloType`, `text`, the sticker and the photo). */
export function toZaloMessage(message: Message): ZaloMessage {
  const data = message.data;
  const ts = Number(data.ts);
  const sticker =
    data.msgType === "chat.sticker"
      ? stickerOf(data.content)
      : data.msgType === "chat.gif"
        ? gifStickerOf(data.msgId, data.content)
        : undefined;
  const photo = data.msgType === "chat.photo" ? photoOf(data.content) : undefined;
  const contentShape = unseen(data.msgType, photo, sticker) ? contentShapeOf(data.content) : undefined;
  const photoShape = data.msgType === "chat.photo" ? photoShapeOf(data) : undefined;
  return {
    msgId: data.msgId,
    threadId: message.threadId,
    threadType: threadTypeOf(message.type),
    fromId: data.uidFrom,
    fromName: data.dName ?? "",
    isSelf: message.isSelf,
    zaloType: data.msgType,
    text: typeof data.content === "string" ? data.content : null,
    sentAt: new Date(ts > 0 ? ts : Date.now()).toISOString(),
    ...(sticker === undefined ? {} : { sticker }),
    ...(photo === undefined ? {} : { photo }),
    ...(contentShape === undefined ? {} : { contentShape }),
    ...(photoShape === undefined ? {} : { photoShape }),
  };
}

/** The types of message the pipeline knows what to do with (D-279); any other is shown as a placeholder. */
const KNOWN_TYPES = new Set(["webchat", "chat.photo", "chat.sticker", "chat.gif", "share.file", "chat.voice"]);

/**
 * Whether a message is one the pipeline could not show as it means to: a type nobody has handled, or a photo, a sticker
 * or a gif whose content named nothing to show. Its content is then described in the log (`contentShapeOf`).
 */
function unseen(msgType: string, photo: ZaloPhoto | undefined, sticker: ZaloSticker | undefined): boolean {
  switch (msgType) {
    case "chat.photo":
      return photo === undefined;
    case "chat.sticker":
      return sticker === undefined;
    case "chat.gif":
      return !sticker?.url;
    default:
      return !KNOWN_TYPES.has(msgType);
  }
}

/**
 * The picture a `chat.photo` content names (ZL-16). `href` is the picture as the chat shows it and `thumb` its
 * thumbnail (zca-js reads them so when it quotes a photo, `sendMessage.js`); when `href` is missing the same
 * addresses may be in `params`, a JSON text. `title` is the caption the sender typed, empty for none. undefined
 * when the content names no web address at all; the message then stays the text `[Ảnh]` in Sino. Not yet seen on
 * a real photo (ZL-16): the log line of SessionManager says whether a picture was found.
 *
 * A photo that is a Zalo sticker (the tigers the user sends, ZL-18) has `href`, `thumb` and `params.hd` on
 * b-f11-zpc.zdn.vn and the browser gets 404 from all three. What marks it is in `params`: a whole number
 * `pStickerType` and `webp`, whose web address is the picture to show; the address the photo would have shown
 * becomes its fallback. Only a `pStickerType` that is a whole number switches to `webp`, so a photo without one is
 * read exactly as before.
 */
function photoOf(content: unknown): ZaloPhoto | undefined {
  const fields = objectOf(content);
  if (fields === null) {
    return undefined;
  }
  const params = objectOf(fields.params) ?? {};
  const thumbUrl = webAddress(fields.thumb) ?? webAddress(params.thumbUrl);
  const shown =
    webAddress(fields.href) ??
    ["rawUrl", "normalUrl", "oriUrl", "hdUrl", "hd"].map((key) => webAddress(params[key])).find((a) => a !== null) ??
    thumbUrl;
  const sticker = Number.isSafeInteger(params.pStickerType) ? addressIn(params.webp, 2) : null;
  const url = sticker ?? shown;
  if (url === null) {
    return undefined;
  }
  const second = sticker === null ? thumbUrl : shown;
  const caption = typeof fields.title === "string" ? fields.title.trim() : "";
  return { url, thumbUrl: second === url ? null : second, caption: caption === "" ? null : caption };
}

/**
 * The first web address in a value: the value itself, or one inside it, in an object (the key `url` first, then the
 * others in order), in a list, or in JSON text, down `depth` levels. null when there is none.
 */
function addressIn(value: unknown, depth: number): string | null {
  const own = webAddress(value);
  if (own !== null || depth === 0) {
    return own;
  }
  const inner = Array.isArray(value)
    ? value
    : Object.entries(objectOf(value) ?? {})
        .sort(([a], [b]) => Number(b === "url") - Number(a === "url"))
        .map(([, field]) => field);
  for (const field of inner) {
    const found = addressIn(field, depth - 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The fields of a value that is an object, or of JSON text that holds one; null for anything else (an array too). */
function objectOf(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

/**
 * What a content looks like, for the log when no picture was found in it (ZL-16): up to 20 keys, each with the kind of
 * its value (`url` for a web address, the length for other text) and never the value itself, since an address can open
 * the picture. A content that is no object is described as a whole.
 */
function contentShapeOf(content: unknown): string {
  const fields = objectOf(content);
  if (fields === null) {
    return `content:${kindOf(content)}`;
  }
  return (
    Object.entries(fields)
      .slice(0, 20)
      .map(([key, value]) => `${key.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 30)}:${kindOf(value)}`)
      .join(",") || "empty"
  );
}

/**
 * Where a photo's content keeps its addresses, for the log (ZL-18). The photos that load come from photo-stal-*.zdn.vn
 * and the ones that do not (404) from b-f11-zpc.zdn.vn, so which address was chosen, and whether another one is in
 * the content or in `params`, is what the log has to say. Each key of the content (up to 20), then each of `params`
 * (up to 20, `params.` before the name), with the kind of its value and, for a web address, its host: a host opens
 * nothing, the path does. Last the numbers Zalo puts beside the content (`propertyExt`, `paramsExt`), which may say
 * what sort of image it is; their text is left out.
 */
function photoShapeOf(data: Message["data"]): string {
  const content = objectOf(data.content);
  const parts =
    content === null ? [`content:${kindOf(data.content)}`] : keysOf("", content);
  const params = content === null ? null : objectOf(content.params);
  if (params !== null) {
    parts.push(...keysOf("params.", params));
    // One object deeper (up to three objects, ten keys each): `params.webp` is where the picture of a Zalo sticker is.
    const objects = Object.entries(params)
      .slice(0, 20)
      .filter(([, value]) => typeof value === "object" && value !== null && !Array.isArray(value))
      .slice(0, 3);
    for (const [key, value] of objects) {
      parts.push(...keysOf(`params.${safeKey(key)}.`, value as Record<string, unknown>, 10));
    }
  }
  for (const [name, ext] of [["propertyExt", data.propertyExt], ["paramsExt", data.paramsExt]] as const) {
    for (const [key, value] of Object.entries(typeof ext === "object" && ext !== null ? ext : {}).slice(0, 10)) {
      if (typeof value === "number" && Number.isSafeInteger(value)) {
        parts.push(`${name}.${safeKey(key)}:${value}`);
      }
    }
  }
  return parts.join(",");
}

function keysOf(prefix: string, fields: Record<string, unknown>, limit = 20): string[] {
  return Object.entries(fields)
    .slice(0, limit)
    .map(([key, value]) => `${prefix}${safeKey(key)}:${kindWithHostOf(value)}`);
}

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 30);
}

/** `kindOf`, but a web address says its host: `url(photo-stal-11.zdn.vn)`, or `url(unreadable)`. */
function kindWithHostOf(value: unknown): string {
  const kind = kindOf(value);
  if (kind !== "url") {
    return kind;
  }
  try {
    const host = new URL(value as string).hostname;
    return /^[A-Za-z0-9.-]{1,100}$/.test(host) ? `url(${host})` : "url(unreadable)";
  } catch {
    return "url(unreadable)";
  }
}

function kindOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "string") {
    return webAddress(value) === null ? `string(${value.length})` : "url";
  }
  return typeof value;
}

/** The text of a web address, trimmed, or null when the value is anything else. */
function webAddress(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://") ? trimmed : null;
}

/**
 * The picture of a sticker: what Zalo names for the sticker itself and, when it names nothing (zca-js drops a sticker
 * Zalo refuses, so a sticker of a pack it does not serve comes back as no answer at all), what the sticker's category
 * lists for it. Null when neither has a picture or the category cannot be named. A category is asked for once and
 * kept in `categories`; one that failed is not kept, so the next sticker asks again. A failure of either question
 * is the caller's to handle.
 */
export async function findStickerArt(
  api: Pick<API, "getStickersDetail" | "getStickerCategoryDetail">,
  categories: Map<number, StickerDetail[]>,
  stickerId: string,
  catId: string | undefined,
): Promise<ZaloStickerArt | null> {
  const [detail] = await api.getStickersDetail(Number(stickerId));
  const own = detail === undefined ? null : stickerArtOf(detail);
  if (own !== null) {
    return { ...own, via: "detail" };
  }
  const category = wholeNumber(catId);
  if (category === null || category <= 0) {
    return null;
  }
  let stickers = categories.get(category);
  if (stickers === undefined) {
    stickers = await api.getStickerCategoryDetail(category);
    categories.set(category, stickers);
  }
  const listed = stickers.find((candidate) => String(candidate.id) === String(Number(stickerId)));
  const art = listed === undefined ? null : stickerArtOf(listed);
  return art === null ? null : { ...art, via: "category" };
}

/**
 * The still picture and the sprite sheet of a sticker out of Zalo's detail. `stickerUrl` is a still 130x130 PNG,
 * not a moving picture; the sticker moves only when Zalo names a sprite sheet with more than one frame and a
 * duration. Zalo's `duration` is the milliseconds each frame lasts (7 frames at 150, 19 at 100 on the first real
 * stickers), so one run lasts `duration` times the frames. null when the detail names no picture at all.
 */
export function stickerArtOf(
  detail: Pick<StickerDetail, "stickerUrl" | "stickerSpriteUrl" | "stickerWebpUrl" | "totalFrames" | "duration">,
): ZaloStickerArt | null {
  const url = detail.stickerUrl || detail.stickerWebpUrl || null;
  const frames = detail.totalFrames;
  const frameMs = Math.round(detail.duration);
  const sprite =
    detail.stickerSpriteUrl && Number.isSafeInteger(frames) && frames > 1 && frameMs > 0
      ? { url: detail.stickerSpriteUrl, frames, durationMs: frames * frameMs }
      : null;
  return url === null && sprite === null ? null : { url, sprite };
}

/** The sticker a `chat.gif` content names (D-279). */
function gifStickerOf(msgId: string, content: unknown): ZaloSticker | undefined {
  const url = gifUrlOf(content);
  return {
    id: msgId,
    catId: "0",
    type: 0,
    url,
  };
}

/** Extracts the URL from a `chat.gif` content payload. */
function gifUrlOf(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("{")) {
      try {
        return gifUrlOf(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (typeof content === "object" && content !== null) {
    const fields = content as Record<string, unknown>;
    const candidate = fields.href || fields.url || fields.normalUrl || fields.oriUrl || fields.thumbUrl || fields.thumb;
    if (typeof candidate === "string" && (candidate.startsWith("http://") || candidate.startsWith("https://"))) {
      return candidate;
    }
    if (typeof fields.params === "string") {
      try {
        return gifUrlOf(JSON.parse(fields.params));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The sticker a `chat.sticker` content names, or undefined when it names none we can use. */
function stickerOf(content: unknown): ZaloSticker | undefined {
  if (typeof content !== "object" || content === null) {
    return undefined;
  }
  const fields = content as Record<string, unknown>;
  const id = wholeNumber(fields.id);
  if (id === null || id <= 0) {
    return undefined;
  }
  return {
    id: String(id),
    catId: String(wholeNumber(fields.catId) ?? 0),
    type: wholeNumber(fields.type) ?? 0,
    url: null,
  };
}

/** A whole number given as a number or as text, else null. */
function wholeNumber(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) ? number : null;
}

/**
 * Sends a text through zca-js. Only a Zalo error code is a refusal (ZaloRejectedError); any other failure
 * (no answer, a 5xx, an answer it cannot read) may come after Zalo took the message, so it stays unknown (D-280).
 */
export async function sendText(
  send: API["sendMessage"],
  threadId: string,
  threadType: ThreadType,
  text: string,
): Promise<string> {
  let response: Awaited<ReturnType<API["sendMessage"]>>;
  try {
    response = await send(text, threadId, zcaThreadType(threadType));
  } catch (error) {
    if (error instanceof ZaloApiError && error.code !== null) {
      throw new ZaloRejectedError(reasonOf(error));
    }
    throw error;
  }
  const msgId = response.message?.msgId;
  if (msgId === undefined) {
    throw new Error("Zalo answered the send without a msgId");
  }
  return String(msgId);
}

function threadTypeOf(type: ZcaThreadType): ThreadType {
  return type === ZcaThreadType.User ? "USER" : "GROUP";
}

function zcaThreadType(threadType: ThreadType): ZcaThreadType {
  return threadType === "USER" ? ZcaThreadType.User : ZcaThreadType.Group;
}

async function userInfo(api: API, userId: string): Promise<ThreadInfo> {
  const { changed_profiles: profiles } = await api.getUserInfo(userId);
  // zca-js asks for "<id>_0"; which key Zalo answers with is checked at ZL-13.
  const profile = profiles[userId] ?? profiles[`${userId}_0`];
  return {
    title: profile?.displayName || profile?.zaloName || null,
    avatarUrl: profile?.avatar || null,
  };
}

async function groupInfo(api: API, groupId: string): Promise<ThreadInfo> {
  const group = (await api.getGroupInfo(groupId)).gridInfoMap[groupId];
  return {
    title: group?.name || null,
    avatarUrl: group?.fullAvt || group?.avt || null,
  };
}

/** How Zalo answers a revoked cookie, as the spike saw it (spikes/zalo-zca/logs/login.jsonl). */
function isRefusal(error: unknown): boolean {
  return error instanceof ZaloApiError && error.message === "Đăng nhập thất bại";
}

/** The error's name and first line: zca-js puts whole Zalo responses after the first line. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }
  const firstLine = error.message.split("\n", 1)[0] ?? "";
  return `${error.name}: ${firstLine}`;
}
