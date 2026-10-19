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
      stickerArt: async (stickerId) => {
        try {
          // `await` here, or a rejection would pass the catch below.
          const [detail] = await api.getStickersDetail(Number(stickerId));
          return detail === undefined ? null : stickerArtOf(detail);
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

/** A zca-js message in the contract's shape (D-279 reads `zaloType`, `text` and the sticker). */
export function toZaloMessage(message: Message): ZaloMessage {
  const data = message.data;
  const ts = Number(data.ts);
  const sticker =
    data.msgType === "chat.sticker"
      ? stickerOf(data.content)
      : data.msgType === "chat.gif"
        ? gifStickerOf(data.msgId, data.content)
        : undefined;
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
  };
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
