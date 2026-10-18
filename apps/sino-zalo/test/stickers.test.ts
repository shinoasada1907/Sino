import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { UserMessage, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
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
const silent = { warn: () => {} };

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
});

describe("Stickers", () => {
  function connection(answer: (id: string) => Promise<string | null>) {
    const calls: string[] = [];
    return {
      calls,
      source: {
        stickerUrl: (id: string) => {
          calls.push(id);
          return answer(id);
        },
      },
    };
  }

  it("fills in the picture of each sticker", async () => {
    const zalo = connection(async (id) => `https://zalo-api.zadn.vn/s/${id}.webp`);
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.sticker?.url).toBe("https://zalo-api.zadn.vn/s/11236.webp");
  });

  it("leaves messages that are not stickers as they are, and asks Zalo nothing", async () => {
    const zalo = connection(async () => "https://x");
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });
    const text = { ...stickerMessage("100"), zaloType: "webchat", text: "hi", sticker: undefined };

    const [same] = await stickers.fill([text]);

    expect(same).toBe(text);
    expect(zalo.calls).toEqual([]);
  });

  it("asks Zalo once for a sticker however many messages carry it", async () => {
    const zalo = connection(async () => "https://zalo-api.zadn.vn/s/a.webp");
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    await stickers.fill([stickerMessage("100"), stickerMessage("101")]);
    await stickers.fill([stickerMessage("102")]);

    expect(zalo.calls).toEqual(["11236"]);
  });

  it("does not remember an answer that failed: the next page asks again", async () => {
    let fail = true;
    const zalo = connection(async () => {
      if (fail) throw new Error("Zalo is down");
      return "https://zalo-api.zadn.vn/s/a.webp";
    });
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [first] = await stickers.fill([stickerMessage("100")]);
    fail = false;
    const [second] = await stickers.fill([stickerMessage("100")]);

    expect(first?.sticker?.url).toBeNull();
    expect(second?.sticker?.url).toBe("https://zalo-api.zadn.vn/s/a.webp");
  });

  it("does not let a picture that never comes hold the messages back", async () => {
    const zalo = connection(() => new Promise<never>(() => {}));
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent, timeoutMs: 20 });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.msgId).toBe("100");
    expect(filled?.sticker?.url).toBeNull();
  });

  it("keeps the picture of a sticker Zalo does not know as none", async () => {
    const zalo = connection(async () => null);
    const stickers = new Stickers(zalo.source, { accountId: "a1", log: silent });

    const [filled] = await stickers.fill([stickerMessage("100")]);

    expect(filled?.sticker?.url).toBeNull();
  });

  it("never logs more than the account and the sticker id when Zalo fails", async () => {
    const lines: object[] = [];
    const zalo = connection(async () => {
      throw new Error("secret-token-in-error");
    });
    const stickers = new Stickers(zalo.source, {
      accountId: "a1",
      log: { warn: (details) => void lines.push(details) },
    });

    await stickers.fill([stickerMessage("100")]);

    expect(lines).toEqual([{ accountId: "a1", stickerId: "11236", reason: "Error: secret-token-in-error" }]);
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

  it("gives the picture of a sticker with the message", async () => {
    gateway.stickerUrls.set("11236", "https://zalo-api.zadn.vn/s/11236.webp");
    const listener = await connect();
    listener.receive(stickerMessage("100"));

    const body = (await read()).json();

    expect(body.messages[0].sticker).toEqual({
      id: "11236",
      catId: "3341",
      type: 7,
      url: "https://zalo-api.zadn.vn/s/11236.webp",
    });
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
    gateway.stickerUrls.set("11236", "https://zalo-api.zadn.vn/s/11236.webp");
    const listener = await connect();
    const original = stickerMessage("100");
    listener.receive(original);

    await read();

    expect(original.sticker?.url).toBeNull();
  });
});
