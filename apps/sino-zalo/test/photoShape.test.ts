import { describe, expect, it } from "vitest";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

// ZL-18: a photo Zalo gave with an address that the browser then cannot load (404 on b-f11-zpc.zdn.vn, while the
// photos on photo-stal-*.zdn.vn load) shows as the text [Ảnh]. The log said only "photo: true", so it could not say
// which address of the content was chosen nor where the others are. `photoShape` says it: every key, with the host
// of an address, never a path (the path opens the picture).

const SESSION = {
  cookie: [{ key: "zpw_sek", value: "cookie-one" }],
  imei: "imei-one",
  userAgent: "Mozilla/5.0",
};

const HREF = "https://b-f11-zpc.zdn.vn/4788031984530569242/fb89c99aaaaaaaaaaaaaaaaa.jpg";
const HD = "https://photo-stal-11.zdn.vn/secret-token-abc/hd.jpg";

function zcaData(content: unknown, fields: Partial<TMessage> = {}, msgType = "chat.photo"): TMessage {
  return {
    msgId: "100",
    msgType,
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content,
    ...fields,
  } as TMessage;
}

const shapeOf = (content: unknown, fields: Partial<TMessage> = {}, msgType = "chat.photo") =>
  toZaloMessage(new UserMessage("7001", zcaData(content, fields, msgType))).photoShape;

describe("photoShape of a chat.photo message", () => {
  it("says where each address is by its host, in the content and in params", () => {
    const params = JSON.stringify({ hd: HD, rawUrl: HREF, width: 800, caption: "tiger" });

    const shape = shapeOf({ title: "", href: HREF, thumb: HREF, params, type: "photo" });

    expect(shape).toBe(
      [
        "title:string(0)",
        "href:url(b-f11-zpc.zdn.vn)",
        "thumb:url(b-f11-zpc.zdn.vn)",
        `params:string(${params.length})`,
        "type:string(5)",
        "params.hd:url(photo-stal-11.zdn.vn)",
        "params.rawUrl:url(b-f11-zpc.zdn.vn)",
        "params.width:number",
        "params.caption:string(5)",
      ].join(","),
    );
  });

  it("is there when the picture was found too, which is when it fails to load", () => {
    expect(shapeOf({ href: HREF })).toBe("href:url(b-f11-zpc.zdn.vn)");
  });

  it("never names a path, a query or a value", () => {
    const shape = shapeOf({
      href: "https://f21-zpc.zdn.vn/secret-token-abc/a.jpg?sig=hunter2",
      params: JSON.stringify({ hd: HD, note: "private words" }),
      title: "Chuyến đi riêng",
    }) ?? "";

    expect(shape).toContain("href:url(f21-zpc.zdn.vn)");
    expect(shape).toContain("params.hd:url(photo-stal-11.zdn.vn)");
    for (const secret of ["secret-token", "hunter2", "private", "riêng", "a.jpg", "hd.jpg"]) {
      expect(shape).not.toContain(secret);
    }
  });

  it("says unreadable for an address whose host cannot be read or is odd", () => {
    expect(shapeOf({ a: "https://", b: "http://exa mple.com/x", c: "https://[::1]/x" })).toBe(
      "a:url(unreadable),b:url(unreadable),c:url(unreadable)",
    );
  });

  it("describes the other kinds as the content shape does", () => {
    expect(shapeOf({ n: 5, nested: { a: 1 }, none: null, list: [1], text: "abc" })).toBe(
      "n:number,nested:object,none:null,list:array,text:string(3)",
    );
  });

  it("reads params given as JSON text and ignores one that is not an object", () => {
    expect(shapeOf({ params: JSON.stringify({ hd: HD }) })).toContain(",params.hd:url(photo-stal-11.zdn.vn)");
    for (const params of ["{not json", "[1,2]", "null", 7, null]) {
      expect(shapeOf({ params })).not.toContain("params.");
    }
  });

  it("reads a content that arrives as JSON text", () => {
    expect(shapeOf(JSON.stringify({ href: HREF }))).toBe("href:url(b-f11-zpc.zdn.vn)");
  });

  it("describes a content that is no object", () => {
    expect(shapeOf("hello")).toBe("content:string(5)");
    expect(shapeOf(null)).toBe("content:null");
    expect(shapeOf(12)).toBe("content:number");
    expect(shapeOf([1, 2])).toBe("content:array");
  });

  it("adds the numbers Zalo puts beside the content, and no text of theirs", () => {
    const shape = shapeOf(
      { href: HREF },
      {
        propertyExt: { color: 0, size: 12, type: 3, subType: 1, ext: "secret words" },
        paramsExt: { countUnread: 0, containType: 2, platformType: 1 },
      },
    );

    expect(shape).toBe(
      "href:url(b-f11-zpc.zdn.vn)," +
        "propertyExt.color:0,propertyExt.size:12,propertyExt.type:3,propertyExt.subType:1," +
        "paramsExt.countUnread:0,paramsExt.containType:2,paramsExt.platformType:1",
    );
    expect(shape).not.toContain("secret");
  });

  it("leaves out an ext that is missing or holds something else", () => {
    expect(shapeOf({ href: HREF }, { propertyExt: undefined, paramsExt: "x" as never })).toBe("href:url(b-f11-zpc.zdn.vn)");
    expect(shapeOf({ href: HREF }, { propertyExt: { type: 1.5, subType: Number.NaN } as never })).toBe(
      "href:url(b-f11-zpc.zdn.vn)",
    );
  });

  it("keeps the shape short and safe when the keys are many or odd", () => {
    const odd = "bad key!\n" + "k".repeat(60);
    const content: Record<string, unknown> = {
      [odd]: "x".repeat(300),
      ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])),
      params: JSON.stringify(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${i}`, i]))),
    };

    const parts = (shapeOf(content) ?? "").split(",");

    expect(parts.filter((part) => part.startsWith("params.")).length).toBe(20);
    expect(parts.filter((part) => !part.startsWith("params.")).length).toBe(20);
    expect(parts[0]).toBe(`bad_key__${"k".repeat(21)}:string(300)`);
    expect(parts.join(",")).toMatch(/^[A-Za-z0-9_.:(),-]*$/);
  });

  it("is given to a photo in a group too", () => {
    const group = zcaData({ href: HREF }, { idTo: "9001", uidFrom: "8002" });

    expect(toZaloMessage(new GroupMessage("7001", group as never)).photoShape).toBe("href:url(b-f11-zpc.zdn.vn)");
  });

  it("is given only to a chat.photo message", () => {
    for (const type of ["webchat", "chat.sticker", "chat.gif", "share.file", "chat.webcontent"]) {
      expect(shapeOf({ href: HREF }, {}, type)).toBeUndefined();
    }
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("SessionManager logs the shape of a photo", () => {
  function recordingLog() {
    const lines: { message: string; details: object }[] = [];
    const record = (details: object, message: string) => {
      lines.push({ message, details });
    };
    return { lines, log: { info: record, warn: record } };
  }

  const photo: ZaloMessage = {
    msgId: "100",
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "chat.photo",
    text: null,
    sentAt: "2026-10-19T08:00:00.000Z",
    photo: { url: HD, thumbUrl: null, caption: null },
    photoShape: "href:url(b-f11-zpc.zdn.vn)",
  };

  async function received(message: ZaloMessage) {
    const gateway = new FakeZaloGateway();
    const { lines, log } = recordingLog();
    const manager = new SessionManager(gateway, new QuietNotifier(), { log });
    await manager.put("a1", SESSION);
    gateway.latestListener().receive(message);
    manager.stopAll();
    return lines;
  }

  it("adds photoShape to the line of a live photo, with no address in it", async () => {
    const lines = await received(photo);

    const details = lines.find((l) => l.message === "Zalo message")?.details;
    expect(details).toMatchObject({ zaloType: "chat.photo", photo: true, photoShape: "href:url(b-f11-zpc.zdn.vn)" });
    expect(JSON.stringify(lines)).not.toContain("secret-token");
  });

  it("adds nothing when the message has no shape", async () => {
    const { photoShape: _shape, ...plain } = photo;

    const lines = await received(plain);

    expect(lines.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("photoShape");
  });
});
