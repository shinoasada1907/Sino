import { describe, expect, it } from "vitest";
import { GroupMessage, UserMessage, type StickerDetail, type TMessage } from "zca-js";
import { findStickerArt, toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";
import { Stickers } from "../src/sessions/Stickers.ts";

const STILL = "https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=500&size=130";
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };

function detail(id: number, fields: Partial<StickerDetail> = {}): StickerDetail {
  return {
    id,
    cateId: 77,
    type: 3,
    stickerUrl: `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${id}&size=130`,
    stickerSpriteUrl: "",
    stickerWebpUrl: null,
    totalFrames: 1,
    duration: 0,
    ...fields,
  } as StickerDetail;
}

/** Zalo as `findStickerArt` sees it: what each call answers, and how many calls were made. */
function zalo(options: { byId?: StickerDetail[] | Error; categories?: Record<number, StickerDetail[] | Error> }) {
  const calls = { byId: 0, category: [] as number[] };
  return {
    calls,
    api: {
      getStickersDetail: async () => {
        calls.byId++;
        if (options.byId instanceof Error) throw options.byId;
        return options.byId ?? [];
      },
      getStickerCategoryDetail: async (cateId: number) => {
        calls.category.push(cateId);
        const answer = options.categories?.[cateId];
        if (answer instanceof Error) throw answer;
        return answer ?? [];
      },
    },
  };
}

describe("findStickerArt", () => {
  it("gives the picture Zalo names for the sticker itself and never asks for its category", async () => {
    const z = zalo({ byId: [detail(500)] });

    const art = await findStickerArt(z.api, new Map(), "500", "77");

    expect(art).toMatchObject({ url: STILL, sprite: null, via: "detail" });
    expect(z.calls.category).toEqual([]);
  });

  it("asks for the category when Zalo knows nothing of the sticker by itself", async () => {
    const z = zalo({ byId: [], categories: { 77: [detail(499), detail(500)] } });

    const art = await findStickerArt(z.api, new Map(), "500", "77");

    expect(art).toMatchObject({ url: STILL, via: "category" });
    expect(z.calls.category).toEqual([77]);
  });

  it("asks for the category when the detail names no picture at all", async () => {
    const empty = detail(500, { stickerUrl: "", stickerWebpUrl: null, stickerSpriteUrl: "" });
    const z = zalo({ byId: [empty], categories: { 77: [detail(500)] } });

    expect(await findStickerArt(z.api, new Map(), "500", "77")).toMatchObject({ url: STILL, via: "category" });
  });

  it("keeps the sprite sheet of a moving sticker it finds through the category", async () => {
    const moving = detail(500, { stickerSpriteUrl: "https://zalo-api.zadn.vn/api/emoticon/sprite?eid=500&size=130", totalFrames: 7, duration: 100 });
    const z = zalo({ byId: [], categories: { 77: [moving] } });

    const art = await findStickerArt(z.api, new Map(), "500", "77");

    expect(art?.sprite).toEqual({ url: moving.stickerSpriteUrl, frames: 7, durationMs: 700 });
  });

  it("gives nothing when the category does not hold the sticker either", async () => {
    const z = zalo({ byId: [], categories: { 77: [detail(1), detail(2)] } });

    expect(await findStickerArt(z.api, new Map(), "500", "77")).toBeNull();
  });

  it.each([["0"], ["-3"], ["abc"], [""], [undefined]])("never asks for a category it cannot name (%s)", async (catId) => {
    const z = zalo({ byId: [] });

    expect(await findStickerArt(z.api, new Map(), "500", catId)).toBeNull();
    expect(z.calls.category).toEqual([]);
  });

  it("asks for a category once however many of its stickers come", async () => {
    const z = zalo({ byId: [], categories: { 77: [detail(500), detail(501)] } });
    const categories = new Map<number, StickerDetail[]>();

    await findStickerArt(z.api, categories, "500", "77");
    const second = await findStickerArt(z.api, categories, "501", "77");

    expect(second).toMatchObject({ via: "category" });
    expect(z.calls.category).toEqual([77]);
  });

  it("does not remember a category that failed: the next sticker asks again", async () => {
    const z = zalo({ byId: [], categories: { 77: new Error("Zalo is down") } });
    const categories = new Map<number, StickerDetail[]>();

    await expect(findStickerArt(z.api, categories, "500", "77")).rejects.toThrow("Zalo is down");
    await expect(findStickerArt(z.api, categories, "500", "77")).rejects.toThrow("Zalo is down");

    expect(z.calls.category).toEqual([77, 77]);
  });

  it("lets a failure of the first question through, as it did before", async () => {
    const z = zalo({ byId: new Error("Zalo is down"), categories: { 77: [detail(500)] } });

    await expect(findStickerArt(z.api, new Map(), "500", "77")).rejects.toThrow("Zalo is down");
    expect(z.calls.category).toEqual([]);
  });
});

describe("Stickers asks with the category and says what it could not get", () => {
  const message = (msgId: string, id = "500", catId = "77"): ZaloMessage => ({
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "chat.sticker",
    text: null,
    sentAt: "2026-10-19T08:00:00.000Z",
    sticker: { id, catId, type: 3, url: null },
  });

  function log() {
    const lines: { level: string; message: string; details: object }[] = [];
    return {
      lines,
      log: {
        warn: (details: object, text: string) => void lines.push({ level: "warn", message: text, details }),
        info: (details: object, text: string) => void lines.push({ level: "info", message: text, details }),
      },
    };
  }

  it("hands the category of the sticker to Zalo", async () => {
    const asked: [string, string | undefined][] = [];
    const { log: sink } = log();
    const stickers = new Stickers(
      { stickerArt: async (id, catId) => (asked.push([id, catId]), { url: STILL, sprite: null }) },
      { accountId: "a1", log: sink },
    );

    await stickers.fill([message("1", "500", "77")]);

    expect(asked).toEqual([["500", "77"]]);
  });

  it("warns, with the ids and nothing else, when Zalo gives no picture for a sticker", async () => {
    const { lines, log: sink } = log();
    const stickers = new Stickers({ stickerArt: async () => null }, { accountId: "a1", log: sink });

    await stickers.fill([message("1", "500", "77")]);

    expect(lines).toEqual([
      { level: "warn", message: "Zalo gave no picture for the sticker", details: { accountId: "a1", stickerId: "500", catId: "77", stickerType: 3 } },
    ]);
  });

  it("says when it had to take the picture from the category", async () => {
    const { lines, log: sink } = log();
    const stickers = new Stickers(
      { stickerArt: async () => ({ url: STILL, sprite: null, via: "category" as const }) },
      { accountId: "a1", log: sink },
    );

    const [filled] = await stickers.fill([message("1")]);

    expect(filled?.sticker?.url).toBe(STILL);
    expect(lines).toEqual([
      { level: "info", message: "Zalo gave the sticker through its category", details: { accountId: "a1", stickerId: "500", via: "category" } },
    ]);
  });

  it("does not put the way it found the picture into the message", async () => {
    const { log: sink } = log();
    const stickers = new Stickers(
      { stickerArt: async () => ({ url: STILL, sprite: null, via: "category" as const }) },
      { accountId: "a1", log: sink },
    );

    const [filled] = await stickers.fill([message("1")]);

    expect(JSON.stringify(filled)).not.toContain("via");
  });
});

function zcaData(msgType: string, content: unknown, fields: Partial<TMessage> = {}): TMessage {
  return { msgId: "100", msgType, uidFrom: "8001", idTo: "0", dName: "Bạn A", ts: "1760515200000", content, ...fields } as TMessage;
}

const shapeOf = (msgType: string, content: unknown) => toZaloMessage(new UserMessage("7001", zcaData(msgType, content))).contentShape;

describe("contentShape for a message the pipeline cannot show", () => {
  it("describes the content of a type nobody has seen, by key and kind", () => {
    expect(shapeOf("chat.webcontent", { title: "x", href: "https://a/b?secret=1", n: 3 })).toBe("title:string(1),href:url,n:number");
  });

  it("describes an empty content as empty", () => {
    expect(shapeOf("chat.webcontent", {})).toBe("empty");
  });

  it("describes a sticker whose content names no sticker", () => {
    expect(shapeOf("chat.sticker", { id: "abc", catId: 3 })).toBe("id:string(3),catId:number");
  });

  it("describes a gif whose content names no address", () => {
    expect(shapeOf("chat.gif", { width: 10 })).toBe("width:number");
  });

  it("gives no shape for the types it knows, found or placeholder", () => {
    expect(shapeOf("webchat", "Xin chào")).toBeUndefined();
    expect(shapeOf("share.file", { title: "a.pdf" })).toBeUndefined();
    expect(shapeOf("chat.voice", { href: "https://a/b.aac" })).toBeUndefined();
    expect(shapeOf("chat.sticker", { id: 500, catId: 77, type: 3 })).toBeUndefined();
    expect(shapeOf("chat.gif", { href: "https://media.tenor.com/a.gif" })).toBeUndefined();
  });

  it("reads a group message the same way", () => {
    const group = zcaData("chat.webcontent", { a: 1 }, { idTo: "9001", uidFrom: "8002" });

    expect(toZaloMessage(new GroupMessage("7001", group as never)).contentShape).toBe("a:number");
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("SessionManager logs what it needs to tell a sticker or an unknown type apart", () => {
  async function received(message: ZaloMessage) {
    const gateway = new FakeZaloGateway();
    const lines: { message: string; details: object }[] = [];
    const record = (details: object, text: string) => void lines.push({ message: text, details });
    const manager = new SessionManager(gateway, new QuietNotifier(), { log: { info: record, warn: record } });
    await manager.put("a1", SESSION);
    gateway.latestListener().receive(message);
    manager.stopAll();
    return lines.find((l) => l.message === "Zalo message")?.details;
  }

  const base: ZaloMessage = {
    msgId: "100",
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "chat.sticker",
    text: null,
    sentAt: "2026-10-19T08:00:00.000Z",
  };

  it("adds the ids of a sticker, which are numbers", async () => {
    const details = await received({ ...base, sticker: { id: "500", catId: "77", type: 3, url: null } });

    expect(details).toEqual({ accountId: "a1", msgId: "100", threadId: "8001", zaloType: "chat.sticker", length: 0, stickerId: "500", stickerCatId: "77", stickerType: 3 });
  });

  it("adds no sticker ids for a gif, whose message id stands in for them", async () => {
    const details = await received({ ...base, zaloType: "chat.gif", sticker: { id: "100", catId: "0", type: 0, url: "https://media.tenor.com/a.gif" } });

    expect(details).toEqual({ accountId: "a1", msgId: "100", threadId: "8001", zaloType: "chat.gif", length: 0 });
  });

  it("adds the shape of a content that came with no sticker", async () => {
    const details = await received({ ...base, contentShape: "id:string(3)" });

    expect(details).toMatchObject({ zaloType: "chat.sticker", contentShape: "id:string(3)" });
    expect(details).not.toHaveProperty("stickerId");
  });

  it("adds the shape of a type nobody has seen", async () => {
    const details = await received({ ...base, zaloType: "chat.webcontent", contentShape: "title:string(1),href:url" });

    expect(details).toMatchObject({ zaloType: "chat.webcontent", contentShape: "title:string(1),href:url" });
  });

  it("adds nothing for a text", async () => {
    const details = await received({ ...base, zaloType: "webchat", text: "hi" });

    expect(details).toEqual({ accountId: "a1", msgId: "100", threadId: "8001", zaloType: "webchat", length: 2 });
  });
});
