import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { UserMessage, ZaloApiError, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { ZaloQuote } from "../src/gateway/ZaloGateway.ts";
import { quoteParams, sendFile, sendImage, sendPhotoSticker, sendText, toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";

// zalo-quote-reply QR-01 (D-503, D-505, D-506): a message that quotes another carries `quote`; a reply carries the quote
// Zalo asks for, in a text, a picture, a file and a picture sent as a sticker.

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };
const SILENT: Notifier = { sessionEnded: async () => {}, messagesArrived: () => {} };

const QUOTE: ZaloQuote = {
  msgId: "400",
  cliMsgId: "399",
  uidFrom: "8001",
  ts: "1760515200000",
  ttl: 0,
  msgType: "webchat",
  content: "tin gốc",
  propertyExt: { color: 0, size: 0, type: 0, subType: 0, ext: "" },
};

function received(quote: unknown): TMessage {
  return {
    msgId: "100",
    cliMsgId: "99",
    msgType: "webchat",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content: "ok",
    quote,
  } as TMessage;
}

describe("a received message that quotes another (D-503)", () => {
  const TEXT_QUOTE = { ownerId: "7001", cliMsgId: 55, globalMsgId: 54, cliMsgType: 1, ts: 1760515100000, msg: "chữ gốc", attach: "", fromD: "Người Dùng", ttl: 0 };

  it("carries the quoted message's ids, sender, text and kind", () => {
    const message = toZaloMessage(new UserMessage("7001", received(TEXT_QUOTE)));

    expect(message.quote).toEqual({
      msgId: "54",
      cliMsgId: "55",
      fromId: "7001",
      fromName: "Người Dùng",
      text: "chữ gốc",
      kind: "text",
      ts: "2025-10-15T07:58:20.000Z",
    });
  });

  it.each([
    [32, "photo"],
    [36, "sticker"],
    [46, "file"],
    [49, "gif"],
    [999, "other"],
  ])("reads cliMsgType %i as kind %s", (cliMsgType, kind) => {
    const message = toZaloMessage(new UserMessage("7001", received({ ...TEXT_QUOTE, cliMsgType, msg: "", attach: "{}" })));

    expect(message.quote?.kind).toBe(kind);
    expect(message.quote?.text).toBe("");
  });

  it("cuts the quoted text to 200 characters without splitting a character", () => {
    const message = toZaloMessage(new UserMessage("7001", received({ ...TEXT_QUOTE, msg: "😀".repeat(300) })));

    expect(Array.from(message.quote?.text ?? "")).toHaveLength(200);
  });

  it("describes the quote for the log without its text or the sender's name", () => {
    const message = toZaloMessage(new UserMessage("7001", received({ ...TEXT_QUOTE, cliMsgType: 32, attach: "{\"a\":1}" })));

    expect(message.quoteShape).toBe(
      "cliMsgType:32,kind:photo,attach:string(7),msg:text,globalMsgIdSafe:true,cliMsgIdSafe:true",
    );
    expect(message.quoteShape).not.toContain("chữ gốc");
    expect(message.quoteShape).not.toContain("Người");
  });

  it("has no quote when the message quotes nothing", () => {
    const message = toZaloMessage(new UserMessage("7001", received(undefined)));

    expect("quote" in message).toBe(false);
    expect("quoteShape" in message).toBe(false);
  });

  it("keeps the raw content of a message that is not text, for a reply that quotes it", () => {
    const photo = { href: "https://photo-stal-1.zdn.vn/a.jpg", thumb: "https://photo-stal-1.zdn.vn/t.jpg" };
    const message = toZaloMessage(new UserMessage("7001", { ...received(undefined), msgType: "chat.photo", content: photo } as TMessage));

    expect(message.rawContent).toEqual(photo);
    expect("rawContent" in toZaloMessage(new UserMessage("7001", received(undefined)))).toBe(false);
  });
});

describe("zca-js sends of a reply (D-506)", () => {
  const sendFn = () => vi.fn<(message: unknown, threadId: string, type: number) => Promise<unknown>>().mockResolvedValue({ message: { msgId: 1 }, attachment: [{ msgId: 2 }] });
  const ZCA_QUOTE = {
    content: "tin gốc",
    msgType: "webchat",
    propertyExt: QUOTE.propertyExt,
    uidFrom: "8001",
    msgId: "400",
    cliMsgId: "399",
    ts: "1760515200000",
    ttl: 0,
  };

  it("sends a text with the quote, and a plain text without it as before", async () => {
    const send = sendFn();

    await sendText(send as never, "8001", "USER", "ok", QUOTE);
    await sendText(send as never, "8001", "USER", "ok");

    expect(send.mock.calls[0]?.[0]).toEqual({ msg: "ok", quote: ZCA_QUOTE });
    expect(send.mock.calls[1]?.[0]).toBe("ok");
  });

  it("sends a picture and a file with the quote beside the attachment", async () => {
    const send = sendFn();
    const image = { data: Buffer.from("x"), fileName: "a.gif", width: 1, height: 1 } as const;

    await sendImage(send as never, "8001", "USER", image, QUOTE);
    await sendFile(send as never, "8001", "GROUP", { kind: "FILE", data: Buffer.from("x"), fileName: "a.pdf" }, QUOTE);

    expect(send.mock.calls[0]?.[0]).toMatchObject({ msg: "", quote: ZCA_QUOTE });
    expect(send.mock.calls[1]?.[0]).toMatchObject({ msg: "", quote: ZCA_QUOTE });
  });

  describe("a picture sent as a sticker", () => {
    const image = { data: Buffer.from("x"), fileName: "a.png", width: 10, height: 10 } as const;
    const upload = vi.fn<() => Promise<unknown>>().mockResolvedValue([
      { fileType: "image", normalUrl: "n", thumbUrl: "t", hdUrl: "h", photoId: 5, width: 10, height: 10 },
    ]);

    it("adds the quote fields of zca-js's text message to the request", async () => {
      const photoUrl = vi.fn<(group: boolean, params: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({ msgId: 77 });

      const msgId = await sendPhotoSticker(upload as never, photoUrl, "9001", "GROUP", image, QUOTE);

      expect(msgId).toBe("77");
      expect(photoUrl.mock.calls[0]?.[1]).toMatchObject({
        qmsgOwner: "8001",
        qmsgId: "400",
        qmsgCliId: "399",
        qmsgType: 1,
        qmsgTs: "1760515200000",
        qmsg: "tin gốc",
        qmsgTTL: 0,
        grid: "9001",
      });
      expect(photoUrl.mock.calls[0]?.[1]).toHaveProperty("qmsgAttach");
    });

    it("sends without the quote, and says so, when Zalo refuses it", async () => {
      const photoUrl = vi
        .fn<(group: boolean, params: Record<string, unknown>) => Promise<unknown>>()
        .mockRejectedValueOnce(new ZaloApiError("Tham số không hợp lệ", 114))
        .mockResolvedValueOnce({ msgId: 78 });
      const dropped = vi.fn<() => void>();

      const msgId = await sendPhotoSticker(upload as never, photoUrl, "8001", "USER", image, QUOTE, dropped);

      expect(msgId).toBe("78");
      expect(dropped).toHaveBeenCalledTimes(1);
      expect(photoUrl.mock.calls[1]?.[1]).not.toHaveProperty("qmsgId");
    });

    it("does not send twice when the quote attempt breaks with no answer from Zalo", async () => {
      const photoUrl = vi.fn<(group: boolean, params: Record<string, unknown>) => Promise<unknown>>().mockRejectedValue(new TypeError("fetch failed"));

      await expect(sendPhotoSticker(upload as never, photoUrl, "8001", "USER", image, QUOTE)).rejects.toBeInstanceOf(TypeError);
      expect(photoUrl).toHaveBeenCalledTimes(1);
    });

    it("quotes a photo by its raw content", () => {
      const params = quoteParams({ ...QUOTE, msgType: "chat.photo", content: { href: "https://x/a.jpg", thumb: "https://x/t.jpg" } }, true);

      expect(params).toMatchObject({ qmsgType: 32, qmsg: "" });
      expect(JSON.parse(params.qmsgAttach as string)).toMatchObject({ oriUrl: "https://x/a.jpg", thumbUrl: "https://x/t.jpg" });
    });
  });
});

describe("sending with a quote through the routes", () => {
  let gateway: FakeZaloGateway;
  let clock: number;
  let logLines: string[];
  let app: FastifyInstance;

  beforeEach(async () => {
    gateway = new FakeZaloGateway();
    clock = 1_000_000;
    logLines = [];
    app = buildApp(CONFIG, gateway, {
      notifier: SILENT,
      now: () => clock,
      logger: { level: "info", stream: { write: (line: string) => logLines.push(line) } },
    });
    const response = await app.inject({ method: "PUT", url: "/accounts/a1/session", headers: AUTH, payload: { session: SESSION } });
    if (response.statusCode !== 204) throw new Error(`The session was not taken: ${response.statusCode}`);
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (payload: object) => app.inject({ method: "POST", url: "/accounts/a1/messages", headers: AUTH, payload });
  const text = (overrides: Record<string, unknown> = {}) => ({
    threadId: "8001",
    threadType: "USER",
    text: "ok",
    clientMessageId: `c-${Math.random()}`,
    ...overrides,
  });

  it("passes the quote of a text reply to Zalo", async () => {
    const response = await send(text({ quote: QUOTE }));

    expect(response.statusCode).toBe(201);
    expect(gateway.sent).toEqual([{ threadId: "8001", threadType: "USER", text: "ok", quote: QUOTE }]);
  });

  it("sends a text without a quote as before", async () => {
    await send(text());

    expect(gateway.sent[0]).toEqual({ threadId: "8001", threadType: "USER", text: "ok" });
  });

  it("passes the quote of a picture reply, and logs when Zalo dropped it", async () => {
    gateway.dropQuoteOnImages = true;
    const image = { data: Buffer.from("png-bytes").toString("base64"), fileName: "a.png", width: 4, height: 4 };

    const response = await send({ threadId: "8001", threadType: "USER", image, quote: QUOTE, clientMessageId: "c-img" });

    expect(response.statusCode).toBe(201);
    expect(gateway.sentImages[0]?.quote).toEqual(QUOTE);
    expect(logLines.some((line) => line.includes("sent without it"))).toBe(true);
  });

  it("passes the quote of a file reply from the meta part", async () => {
    const form = new FormData();
    form.set(
      "meta",
      JSON.stringify({ threadId: "9001", threadType: "GROUP", clientMessageId: "c-file", kind: "FILE", fileName: "a.pdf", quote: QUOTE }),
    );
    form.set("file", new File([Buffer.from("pdf")], "a.pdf"));
    const request = new Request("http://x/", { method: "POST", body: form });

    const response = await app.inject({
      method: "POST",
      url: "/accounts/a1/messages/file",
      headers: { ...AUTH, "content-type": request.headers.get("content-type") ?? "" },
      payload: Buffer.from(await request.arrayBuffer()),
    });

    expect(response.statusCode).toBe(201);
    expect(gateway.sentFiles[0]?.quote).toEqual(QUOTE);
  });

  it("answers 400 INVALID_QUOTE and sends nothing for a quote Zalo cannot be given", async () => {
    for (const quote of [{ ...QUOTE, msgId: "abc" }, { ...QUOTE, ttl: -1 }, { ...QUOTE, content: 5 }, "x"]) {
      const response = await send(text({ quote }));

      expect(response.statusCode).toBe(400);
    }
    expect((await send(text({ quote: { ...QUOTE, msgId: "abc" } }))).json().code).toBe("INVALID_QUOTE");
    expect(gateway.sent).toEqual([]);
  });

  it("serves a received quote through the queue and logs only its shape", async () => {
    const listener = gateway.latestListener();
    listener.events.ready();
    const quote = { msgId: "54", cliMsgId: "55", fromId: "7001", fromName: "Tên Riêng", text: "chữ gốc", kind: "text", ts: "2025-10-15T07:58:20.000Z" } as const;
    listener.receive({
      msgId: "101",
      threadId: "8001",
      threadType: "USER",
      fromId: "8001",
      fromName: "Bạn A",
      isSelf: false,
      zaloType: "webchat",
      text: "ok",
      sentAt: "2026-10-15T08:00:00.000Z",
      quote,
      quoteShape: "cliMsgType:1,kind:text",
    });

    const page = (await app.inject({ method: "GET", url: "/accounts/a1/messages", headers: AUTH })).json();

    expect(page.messages[0].quote).toEqual(quote);
    const line = logLines.find((l) => l.includes('"msgId":"101"')) ?? "";
    expect(line).toContain('"quoteShape":"cliMsgType:1,kind:text"');
    expect(line).not.toContain("chữ gốc");
    expect(line).not.toContain("Tên Riêng");
  });

  it("logs that the message was a reply, never the quote", async () => {
    await send(text({ quote: QUOTE }));

    const line = logLines.find((l) => l.includes("Zalo message sent")) ?? "";
    expect(line).toContain('"quoted":true');
    expect(logLines.join("")).not.toContain("tin gốc");
  });
});
