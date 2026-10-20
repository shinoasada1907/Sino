import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = {
  cookie: [{ key: "zpw_sek", value: "cookie-one" }],
  imei: "imei-one",
  userAgent: "Mozilla/5.0",
};

const FULL = "https://f21-zpc.zdn.vn/jpg/1234/full.jpg";
const THUMB = "https://b-f21-zpc.zdn.vn/jpg/1234/thumb.jpg";

function zcaData(content: unknown, fields: Partial<TMessage> = {}): TMessage {
  return {
    msgId: "100",
    msgType: "chat.photo",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content,
    ...fields,
  } as TMessage;
}

const photoOf = (content: unknown, fields: Partial<TMessage> = {}) =>
  toZaloMessage(new UserMessage("7001", zcaData(content, fields)));

function photoMessage(msgId: string): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "chat.photo",
    text: null,
    sentAt: "2026-10-19T08:00:00.000Z",
    photo: { url: FULL, thumbUrl: THUMB, caption: "Chuyến đi" },
  };
}

describe("toZaloMessage for a photo", () => {
  it("reads the picture, its thumbnail and its caption out of the content", () => {
    const message = photoOf({ title: "Chuyến đi", description: "", href: FULL, thumb: THUMB });

    expect(message).toMatchObject({
      zaloType: "chat.photo",
      text: null,
      photo: { url: FULL, thumbUrl: THUMB, caption: "Chuyến đi" },
    });
  });

  it("gives no caption when the title is empty or only blanks", () => {
    for (const title of ["", "   ", undefined, 7]) {
      expect(photoOf({ title, href: FULL, thumb: THUMB }).photo?.caption).toBeNull();
    }
  });

  it("trims the caption", () => {
    expect(photoOf({ title: "  Xin chào \n", href: FULL }).photo?.caption).toBe("Xin chào");
  });

  it("gives no thumbnail when Zalo names none, or the same address as the picture", () => {
    expect(photoOf({ href: FULL }).photo).toEqual({ url: FULL, thumbUrl: null, caption: null });
    expect(photoOf({ href: FULL, thumb: FULL }).photo?.thumbUrl).toBeNull();
  });

  it("reads the addresses from params when the content names no href", () => {
    for (const key of ["rawUrl", "normalUrl", "oriUrl", "hdUrl", "hd"]) {
      const params = JSON.stringify({ [key]: FULL, width: 800, height: 600 });

      expect(photoOf({ thumb: THUMB, params }).photo).toEqual({ url: FULL, thumbUrl: THUMB, caption: null });
    }
  });

  it("prefers href to params", () => {
    const params = JSON.stringify({ hd: "https://f21-zpc.zdn.vn/jpg/1234/hd.jpg" });

    expect(photoOf({ href: FULL, params }).photo?.url).toBe(FULL);
  });

  it("shows the thumbnail as the picture when it is the only address", () => {
    expect(photoOf({ thumb: THUMB }).photo).toEqual({ url: THUMB, thumbUrl: null, caption: null });
  });

  it("reads a photo in a group the same way", () => {
    const group = zcaData({ href: FULL, thumb: THUMB }, { idTo: "9001", uidFrom: "8002" });

    expect(toZaloMessage(new GroupMessage("7001", group as never))).toMatchObject({
      threadType: "GROUP",
      photo: { url: FULL, thumbUrl: THUMB },
    });
  });

  it("gives no photo when the content names no address, or one that is not a web address", () => {
    const contents = [
      {},
      { href: "" },
      { href: 12 },
      { href: "javascript:alert(1)" },
      { href: "ftp://zdn.vn/a.jpg" },
      { params: "{not json" },
      { params: JSON.stringify({ hd: 3 }) },
      "text",
      null,
    ];
    for (const content of contents) {
      expect(photoOf(content).photo).toBeUndefined();
    }
  });

  it("reads a content that arrives as JSON text", () => {
    const content = JSON.stringify({ title: "Chuyến đi", href: FULL, thumb: THUMB });

    expect(photoOf(content).photo).toEqual({ url: FULL, thumbUrl: THUMB, caption: "Chuyến đi" });
  });

  it("gives no photo for a text that is not JSON or not an object", () => {
    for (const content of ["{not json", "text", "[1,2]", "null", '"https://f21-zpc.zdn.vn/a.jpg"']) {
      expect(photoOf(content).photo).toBeUndefined();
    }
  });

  it("describes the content of a photo it found no picture in, by key and kind, never by value", () => {
    const content = { title: "", pic: "https://f21-zpc.zdn.vn/secret-token-abc/a.jpg", n: 5, nested: { a: 1 }, none: null, list: [1] };

    const shape = photoOf(content).contentShape;

    expect(shape).toBe("title:string(0),pic:url,n:number,nested:object,none:null,list:array");
    expect(shape).not.toContain("secret-token");
    expect(shape).not.toContain("zdn.vn");
  });

  it("describes a content that is no object", () => {
    expect(photoOf("hello").contentShape).toBe("content:string(5)");
    expect(photoOf(null).contentShape).toBe("content:null");
    expect(photoOf(12).contentShape).toBe("content:number");
    expect(photoOf([1, 2]).contentShape).toBe("content:array");
    expect(photoOf("[1,2]").contentShape).toBe("content:string(5)");
  });

  it("keeps the shape short and safe when the keys are many or odd", () => {
    const odd = "bad key!\n" + "k".repeat(60);
    const content: Record<string, unknown> = { [odd]: "x".repeat(300), ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])) };

    const shape = photoOf(content).contentShape ?? "";

    expect(shape.split(",").length).toBe(20);
    expect(shape.split(",")[0]).toBe(`bad_key__${"k".repeat(21)}:string(300)`);
    expect(shape).toMatch(/^[A-Za-z0-9_.:(),-]*$/);
  });

  it("gives no shape when the picture was found, nor for a message that is not a photo", () => {
    expect(photoOf({ href: FULL }).contentShape).toBeUndefined();
    expect(photoOf({ title: "x" }, { msgType: "share.file" }).contentShape).toBeUndefined();
  });

  it("gives a photo only to a chat.photo message", () => {
    const other = photoOf({ href: FULL, thumb: THUMB }, { msgType: "share.file" });

    expect(other.photo).toBeUndefined();
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("a photo through sino-zalo", () => {
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

  it("gives the photo with the message, as Zalo named it", async () => {
    const listener = await connect();
    listener.receive(photoMessage("100"));

    const body = (await read()).json();

    expect(body.messages[0].photo).toEqual({ url: FULL, thumbUrl: THUMB, caption: "Chuyến đi" });
  });

  it("gives a photo without a caption a null caption and keeps the message as it is", async () => {
    const listener = await connect();
    const bare = { ...photoMessage("101"), photo: { url: FULL, thumbUrl: null, caption: null } };
    listener.receive(bare);

    const body = (await read()).json();

    expect(body.messages[0]).toEqual(bare);
  });
});

describe("SessionManager logs a photo", () => {
  function recordingLog() {
    const lines: { message: string; details: object }[] = [];
    const record = (details: object, message: string) => {
      lines.push({ message, details });
    };
    return { lines, log: { info: record, warn: record } };
  }

  async function received(message: ZaloMessage) {
    const gateway = new FakeZaloGateway();
    const { lines, log } = recordingLog();
    const manager = new SessionManager(gateway, new QuietNotifier(), { log });
    await manager.put("a1", SESSION);
    gateway.latestListener().receive(message);
    manager.stopAll();
    return lines;
  }

  it("says whether sino-zalo found the picture, never its address or its caption", async () => {
    const lines = await received(photoMessage("100"));

    const line = lines.find((l) => l.message === "Zalo message");
    expect(line?.details).toEqual({
      accountId: "a1",
      msgId: "100",
      threadId: "8001",
      zaloType: "chat.photo",
      length: 0,
      photo: true,
      photoSticker: false,
    });
    expect(JSON.stringify(lines)).not.toContain("zdn.vn");
    expect(JSON.stringify(lines)).not.toContain("Chuyến đi");
  });

  it("says whether the photo is a sticker (ZL-19)", async () => {
    const message = photoMessage("100");

    const lines = await received({ ...message, photo: { ...message.photo!, sticker: true } });

    expect(lines.find((l) => l.message === "Zalo message")?.details).toMatchObject({ photo: true, photoSticker: true });
  });

  it("says so when a photo message came without a usable picture", async () => {
    const { photo: _photo, ...withoutPhoto } = photoMessage("100");

    const lines = await received(withoutPhoto);

    expect(lines.find((l) => l.message === "Zalo message")?.details).toMatchObject({ photo: false });
  });

  it("adds the shape of the content when no picture was found, and nothing else of it", async () => {
    const { photo: _photo, ...withoutPhoto } = photoMessage("100");

    const lines = await received({ ...withoutPhoto, contentShape: "title:string(0),pic:url" });

    expect(lines.find((l) => l.message === "Zalo message")?.details).toMatchObject({
      photo: false,
      contentShape: "title:string(0),pic:url",
    });
  });

  it("leaves the shape out of the log when the picture was found", async () => {
    const lines = await received(photoMessage("100"));

    expect(lines.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("contentShape");
  });

  it("adds nothing for a message that is not a photo", async () => {
    const lines = await received({ ...photoMessage("100"), zaloType: "webchat", text: "hi", photo: undefined });

    expect(lines.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("photo");
  });
});
