import { describe, expect, it } from "vitest";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

// ML-01 (D-474, D-475): Sino has not yet seen how Zalo gives a voice message, a video or a link card. `mediaShape`
// describes their content in the log: keys, kind of each value, host of each address; never an address, a title, a
// description or a word of the message.

const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };

function zcaData(msgType: string, content: unknown): TMessage {
  return { msgId: "100", msgType, uidFrom: "8001", idTo: "0", dName: "Bạn A", ts: "1760515200000", content } as TMessage;
}

const shapeOf = (msgType: string, content: unknown) =>
  toZaloMessage(new UserMessage("7001", zcaData(msgType, content))).mediaShape;

const VOICE = {
  title: "",
  href: "https://voice-aac.zdn.vn/secret-path/a.aac",
  params: JSON.stringify({
    voiceUrl: "https://voice-aac.zdn.vn/secret-path/a.aac",
    m4aUrl: "https://voice-m4a.zdn.vn/x/secret.m4a",
    fileSize: 12345,
  }),
};
const VIDEO = {
  title: "private title",
  href: "https://video.zdn.vn/v/secret.mp4",
  thumb: "https://thumb.zdn.vn/t/secret.jpg",
  params: JSON.stringify({ duration: 5000, width: 720, height: 1280, fileSize: 99, videoUrl: "https://video.zdn.vn/v/secret.mp4" }),
};
const LINK = {
  title: "Tiêu đề riêng",
  desc: "mô tả riêng",
  href: "https://example.com/bai/secret?x=1",
  thumb: "https://thumb.zdn.vn/l/secret.jpg",
  params: JSON.stringify({ mediaTitle: "private words", meta: { u: "https://deep.example.org/p/secret" } }),
};
const SECRETS = ["secret", "private", "riêng", "mô tả", "a.aac", "x=1", "words"];

describe("mediaShape of a voice message, a video and a link", () => {
  it("describes a voice message by its keys and the hosts of its addresses", () => {
    expect(shapeOf("chat.voice", VOICE)).toBe(
      `title:string(0),href:url(voice-aac.zdn.vn),params:string(${VOICE.params.length}),` +
        "params.voiceUrl:url(voice-aac.zdn.vn),params.m4aUrl:url(voice-m4a.zdn.vn),params.fileSize:number",
    );
  });

  it("describes a video: duration, size and the addresses in params", () => {
    const shape = shapeOf("chat.video.msg", VIDEO);

    expect(shape).toContain("href:url(video.zdn.vn),thumb:url(thumb.zdn.vn)");
    expect(shape).toContain("params.duration:number,params.width:number,params.height:number,params.fileSize:number");
    expect(shape).toContain("params.videoUrl:url(video.zdn.vn)");
  });

  it("describes a link card and goes one object deeper into params", () => {
    for (const type of ["chat.recommended", "chat.link"]) {
      const shape = shapeOf(type, LINK);
      expect(shape).toContain("title:string(13),desc:string(11),href:url(example.com),thumb:url(thumb.zdn.vn)");
      expect(shape).toContain("params.meta:object,params.meta.u:url(deep.example.org)");
    }
  });

  it("never carries an address, a title, a description or other text", () => {
    for (const [type, content] of [["chat.voice", VOICE], ["chat.video.msg", VIDEO], ["chat.recommended", LINK], ["chat.link", LINK]] as const) {
      const shape = shapeOf(type, content) ?? "";
      for (const secret of SECRETS) {
        expect(shape).not.toContain(secret);
      }
      expect(shape).not.toContain("http");
      expect(shape).toMatch(/^[A-Za-z0-9_.:(),-]*$/);
    }
  });

  it("describes a content that is no object or a params that is broken", () => {
    expect(shapeOf("chat.voice", "hello")).toBe("content:string(5)");
    expect(shapeOf("chat.video.msg", null)).toBe("content:null");
    expect(shapeOf("chat.link", { href: "https://example.com/x", params: "{not json" })).toBe(
      "href:url(example.com),params:string(9)",
    );
  });

  it("is given in a group too", () => {
    const group = zcaData("chat.voice", VOICE) as unknown as { idTo: string };
    group.idTo = "9001";

    expect(toZaloMessage(new GroupMessage("7001", group as never)).mediaShape).toContain("params.m4aUrl:url(voice-m4a.zdn.vn)");
  });

  it("is given to these four types only, and the photo keeps photoShape", () => {
    for (const type of ["webchat", "chat.sticker", "chat.gif", "share.file", "chat.webcontent"]) {
      expect(shapeOf(type, LINK)).toBeUndefined();
    }
    const photo = toZaloMessage(new UserMessage("7001", zcaData("chat.photo", { href: "https://b-f11-zpc.zdn.vn/x.jpg" })));
    expect(photo.photoShape).toBe("href:url(b-f11-zpc.zdn.vn)");
    expect(photo.mediaShape).toBeUndefined();
  });

  it("does not change the message itself: no voice, video or link field", () => {
    const message = toZaloMessage(new UserMessage("7001", zcaData("chat.voice", VOICE)));
    const { mediaShape: _shape, ...rest } = message;

    expect(rest).toEqual({
      msgId: "100",
      threadId: "8001",
      threadType: "USER",
      fromId: "8001",
      fromName: "Bạn A",
      isSelf: false,
      zaloType: "chat.voice",
      text: null,
      sentAt: "2025-10-15T08:00:00.000Z",
    });
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("SessionManager logs mediaShape", () => {
  async function lineOf(type: string, content: unknown) {
    const lines: { message: string; details: object }[] = [];
    const record = (details: object, message: string) => {
      lines.push({ message, details });
    };
    const gateway = new FakeZaloGateway();
    const manager = new SessionManager(gateway, new QuietNotifier(), { log: { info: record, warn: record } });
    await manager.put("a1", SESSION);
    gateway.latestListener().receive(toZaloMessage(new UserMessage("7001", zcaData(type, content))));
    manager.stopAll();
    return lines;
  }

  it("adds mediaShape to the line of a voice message with nothing secret in the whole line", async () => {
    const lines = await lineOf("chat.voice", VOICE);

    const details = lines.find((l) => l.message === "Zalo message")?.details;
    expect(details).toMatchObject({ zaloType: "chat.voice", mediaShape: expect.stringContaining("params.m4aUrl:url(voice-m4a.zdn.vn)") });
    const all = JSON.stringify(lines);
    for (const secret of SECRETS) {
      expect(all).not.toContain(secret);
    }
  });

  it("keeps the line of a link free of its title and description too, contentShape included", async () => {
    const all = JSON.stringify(await lineOf("chat.recommended", LINK));

    expect(all).toContain("mediaShape");
    for (const secret of SECRETS) {
      expect(all).not.toContain(secret);
    }
  });

  it("adds nothing for a message without a shape", async () => {
    const lines = await lineOf("webchat", "hi");

    expect(lines.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("mediaShape");
  });
});
