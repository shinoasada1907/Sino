import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { UserMessage, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { stickerArtOf, toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { ZaloMessage, ZaloStickerArt, ZaloStickerSprite } from "../src/gateway/ZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { Stickers } from "../src/sessions/Stickers.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = {
  cookie: [{ key: "zpw_sek", value: "cookie-one" }],
  imei: "imei-one",
  userAgent: "Mozilla/5.0",
};
const silent = { warn: () => {}, info: () => {} };
const STILL = "https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236&size=130";
const SPRITE: ZaloStickerSprite = {
  url: "https://zalo-api.zadn.vn/api/emoticon/sprite?eid=11236&size=130",
  frames: 7,
  durationMs: 700,
};

function art(url: string | null, sprite: ZaloStickerSprite | null = null): ZaloStickerArt {
  return { url, sprite };
}

function zcaData(fields: Partial<TMessage>): TMessage {
  return {
    msgId: "100",
    msgType: "chat.sticker",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content: { id: 11236, catId: 3341, type: 7 },
    ...fields,
  } as TMessage;
}

function stickerMessage(msgId: string, id = "11236"): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "chat.sticker",
    text: null,
    sentAt: "2026-10-15T08:00:00.000Z",
    sticker: { id, catId: "3341", type: 7, url: null },
  };
}

describe("toZaloMessage for a sticker", () => {
  it("reads the sticker's id, category and type out of the content", () => {
    const message = toZaloMessage(new UserMessage("7001", zcaData({})));

    expect(message).toMatchObject({
      zaloType: "chat.sticker",
      text: null,
      sticker: { id: "11236", catId: "3341", type: 7, url: null },
    });
  });

  it("accepts the numbers as text", () => {
    const content = { id: "11236", catId: "3341", type: "7" };

    expect(toZaloMessage(new UserMessage("7001", zcaData({ content }))).sticker).toEqual({
      id: "11236",
      catId: "3341",
      type: 7,
      url: null,
    });
  });

  it("gives no sticker when the content has no usable id", () => {
    for (const content of [{}, { id: "abc" }, { id: 0 }, "text", null]) {
      const message = toZaloMessage(new UserMessage("7001", zcaData({ content: content as never })));

      expect(message.sticker).toBeUndefined();
    }
  });

  it("gives no sticker for any other type of message", () => {
    const text = zcaData({ msgType: "webchat", content: "Xin chào" });

    expect(toZaloMessage(new UserMessage("7001", text)).sticker).toBeUndefined();
  });

  it("extracts the gif url when msgType is chat.gif", () => {
    const gifUrl = "https://media.tenor.com/example.gif";
    const msg = zcaData({ msgId: "201", msgType: "chat.gif", content: { href: gifUrl } });

    const message = toZaloMessage(new UserMessage("7001", msg));

    expect(message.zaloType).toBe("chat.gif");
    expect(message.sticker).toEqual({
      id: "201",
      catId: "0",
      type: 0,
      url: gifUrl,
    });
  });

  it("accepts string url or json params for chat.gif", () => {
    const gifUrl = "https://zalo-api.zadn.vn/media/example.gif";
    const directUrl = zcaData({ msgId: "202", msgType: "chat.gif", content: gifUrl });
    const jsonParams = zcaData({ msgId: "203", msgType: "chat.gif", content: JSON.stringify({ url: gifUrl }) });

    expect(toZaloMessage(new UserMessage("7001", directUrl)).sticker?.url).toBe(gifUrl);
    expect(toZaloMessage(new UserMessage("7001", jsonParams)).sticker?.url).toBe(gifUrl);
  });
});

describe("stickerArtOf", () => {
  const detail = {
    stickerUrl: STILL,
    stickerSpriteUrl: SPRITE.url,
    stickerWebpUrl: null,
    totalFrames: 7,
    // Zalo's duration is the milliseconds each frame lasts (ZL-15): 100 ms for 7 frames is a run of 700 ms.
    duration: 100,
  };

  it("gives the still picture and the sprite sheet with its frames and the length of one run", () => {
    expect(stickerArtOf(detail)).toEqual({ url: STILL, sprite: SPRITE });
  });

  it.each([
    [7, 150, 1050],
    [19, 100, 1900],
  ])("counts a run as the milliseconds of a frame times the frames (%i frames at %i ms: %i ms)", (totalFrames, duration, run) => {
    // 7 at 150 and 19 at 100 are what Zalo gave for the two stickers of 2026-10-19; read as a whole run they would
    // play 19 frames in 100 ms.
    expect(stickerArtOf({ ...detail, totalFrames, duration })?.sprite?.durationMs).toBe(run);
  });

  it("gives no sprite when Zalo names no sprite sheet", () => {
    for (const stickerSpriteUrl of ["", undefined as never]) {
      expect(stickerArtOf({ ...detail, stickerSpriteUrl })).toEqual({ url: STILL, sprite: null });
    }
  });

  it("gives no sprite for a sticker with one frame or none", () => {
    for (const totalFrames of [1, 0, -3]) {
      expect(stickerArtOf({ ...detail, totalFrames })?.sprite).toBeNull();
    }
  });

  it("gives no sprite when the frames or the duration are not usable numbers", () => {
    const bads = [
      { totalFrames: Number.NaN },
      { totalFrames: 2.5 },
      { duration: 0 },
      { duration: -1 },
      { duration: Number.NaN },
      { duration: undefined as never },
    ];
    for (const bad of bads) {
      expect(stickerArtOf({ ...detail, ...bad })?.sprite).toBeNull();
    }
  });

  it("rounds the milliseconds of a frame before counting the run", () => {
    expect(stickerArtOf({ ...detail, duration: 99.6 })?.sprite?.durationMs).toBe(700);
  });

  it("falls back to the webp address for the still picture", () => {
    const webp = "https://zalo-api.zadn.vn/api/emoticon/sticker/webp?eid=11236";

    expect(stickerArtOf({ ...detail, stickerUrl: "", stickerWebpUrl: webp })?.url).toBe(webp);
  });

  it("gives nothing when Zalo names no picture at all", () => {
    const empty = { ...detail, stickerUrl: "", stickerWebpUrl: null, stickerSpriteUrl: "" };

    expect(stickerArtOf(empty)).toBeNull();
  });

  it("still gives the sprite when the still picture is missing", () => {
    expect(stickerArtOf({ ...detail, stickerUrl: "", stickerWebpUrl: null })).toEqual({
      url: null,
      sprite: SPRITE,
    });
  });
});

describe("Stickers", () => {
  function connection(answer: (id: string) => Promise<ZaloStickerArt | null>) {
    const calls: string[] = [];
    return {
      calls,
      source: {
        stickerArt: (id: string) => {
          calls.push(id);
          return answer(id);
        },
      },
    };
  }

  it("fills in the still picture and the animation of each sticker", async () => {
    const zalo = connection(async () => art(STILL, SPRITE));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.sticker?.url).toBe(STILL);
    expect(filled?.sticker?.sprite).toEqual(SPRITE);
  });

  it("gives a sticker with no animation a null sprite", async () => {
    const zalo = connection(async () => art(STILL));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.sticker?.url).toBe(STILL);
    expect(filled?.sticker?.sprite).toBeNull();
  });

  it("leaves messages that are not stickers as they are, and asks Zalo nothing", async () => {
    const zalo = connection(async () => art("https://x"));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });
    const text = { ...stickerMessage("100"), zaloType: "webchat", text: "hi", sticker: undefined };

    const [same] = await stickers.fill([text]);

    expect(same).toBe(text);
    expect(zalo.calls).toEqual([]);
  });

  it("keeps a sticker url that is already known (a gif) with no sprite and asks Zalo nothing", async () => {
    const zalo = connection(async () => art("https://zalo-api.zadn.vn/s/a.webp"));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });
    const prefilled = {
      ...stickerMessage("100"),
      sticker: { id: "100", catId: "0", type: 0, url: "https://media.tenor.com/a.gif" },
    };

    const [filled] = await stickers.fill([prefilled]);

    expect(filled?.sticker?.url).toBe("https://media.tenor.com/a.gif");
    expect(filled?.sticker?.sprite).toBeNull();
    expect(zalo.calls).toEqual([]);
  });

  it("asks Zalo once for a sticker however many messages carry it, and gives each its animation", async () => {
    const zalo = connection(async () => art(STILL, SPRITE));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    await stickers.fill([stickerMessage("100"), stickerMessage("101")]);
    const [later] = await stickers.fill([stickerMessage("102")]);

    expect(zalo.calls).toEqual(["11236"]);
    expect(later?.sticker?.sprite).toEqual(SPRITE);
  });

  it("does not remember an answer that failed: the next page asks again", async () => {
    let fail = true;
    const zalo = connection(async () => {
      if (fail) throw new Error("Zalo is down");
      return art(STILL, SPRITE);
    });
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [first] = await stickers.fill([stickerMessage("100")]);
    fail = false;
    const [second] = await stickers.fill([stickerMessage("100")]);

    expect(first?.sticker?.url).toBeNull();
    expect(first?.sticker?.sprite).toBeNull();
    expect(second?.sticker?.url).toBe(STILL);
    expect(second?.sticker?.sprite).toEqual(SPRITE);
  });

  it("does not let a picture that never comes hold the messages back", async () => {
    const zalo = connection(() => new Promise<never>(() => {}));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent, timeoutMs: 20 });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.msgId).toBe("100");
    expect(filled?.sticker?.url).toBeNull();
    expect(filled?.sticker?.sprite).toBeNull();
  });

  it("keeps the picture of a sticker Zalo does not know as none", async () => {
    const zalo = connection(async () => null);
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.sticker?.url).toBeNull();
    expect(filled?.sticker?.sprite).toBeNull();
  });

  it("never logs more than the account and the sticker id when Zalo fails", async () => {
    const lines: object[] = [];
    const zalo = connection(async () => {
      throw new Error("secret-token-in-error");
    });
    const stickers = new Stickers(zalo.source, {
      accountId: "a1",
      log: { warn: (details) => void lines.push(details), info: () => {} },
    });

    await stickers.fill([stickerMessage("100")]);

    expect(lines).toEqual([{ accountId: "a1", stickerId: "11236", reason: "Error: secret-token-in-error" }]);
  });

  it("logs the frames and duration Zalo gave an animated sticker, once, so the unit can be checked", async () => {
    const lines: object[] = [];
    const zalo = connection(async () => art(STILL, SPRITE));
    const stickers = new Stickers(zalo.source, {
      accountId: "a1",
      log: { warn: () => {}, info: (details) => void lines.push(details) },
    });

    await stickers.fill([stickerMessage("100")]);
    await stickers.fill([stickerMessage("101")]);

    expect(lines).toEqual([{ accountId: "a1", stickerId: "11236", frames: 7, durationMs: 700 }]);
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("GET /accounts/{accountId}/messages with stickers", () => {
  let gateway: FakeZaloGateway;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    app = buildApp(CONFIG, gateway, { notifier: new QuietNotifier() });
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect() {
    await app.inject({ method: "PUT", url: "/accounts/a1/session", headers: AUTH, payload: { session: SESSION } });
    const listener = gateway.latestListener();
    listener.events.connected();
    listener.events.ready();
    return listener;
  }

  const read = () => app.inject({ method: "GET", url: "/accounts/a1/messages", headers: AUTH });

  it("gives the picture and the animation of a sticker with the message", async () => {
    gateway.stickerArts.set("11236", art(STILL, SPRITE));
    const listener = await connect();
    listener.receive(stickerMessage("100"));

    const body = (await read()).json();

    expect(body.messages[0].sticker).toEqual({
      id: "11236",
      catId: "3341",
      type: 7,
      url: STILL,
      sprite: SPRITE,
    });
  });

  it("gives a sticker with no animation a null sprite", async () => {
    gateway.stickerArts.set("11236", art(STILL));
    const listener = await connect();
    listener.receive(stickerMessage("100"));

    const body = (await read()).json();

    expect(body.messages[0].sticker.sprite).toBeNull();
  });

  it("still gives the message, with no picture, when Zalo cannot tell it", async () => {
    gateway.stickerFails = true;
    const listener = await connect();
    listener.receive(stickerMessage("100"));

    const body = (await read()).json();

    expect(body.messages.map((m: ZaloMessage) => m.msgId)).toEqual(["100"]);
    expect(body.messages[0].sticker.url).toBeNull();
  });

  it("does not change the buffered message: the picture is added to the answer only", async () => {
    gateway.stickerArts.set("11236", art(STILL, SPRITE));
    const listener = await connect();
    const original = stickerMessage("100");
    listener.receive(original);

    await read();

    expect(original.sticker?.url).toBeNull();
    expect(original.sticker?.sprite).toBeUndefined();
  });
});
