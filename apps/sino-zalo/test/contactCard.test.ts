import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

// ZC-02 (contact card part, D-529): a `chat.recommended` with action `recommened.user` (Zalo's spelling) is a contact
// card. Its `description` is INFERRED to be the JSON of zca-js's `sendCard` (qrCodeUrl, phone); not yet seen.

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };

const USER_ID = "1234567890123456789";
const AVATAR = "https://s160-26-ava-talk.zadn.vn/a/secret-avatar.jpg";
const QR = "https://qr.zalo.me/secret-qr.png";
const PHONE = "0912345678";

function card(fields: Record<string, unknown> = {}, description: unknown = { qrCodeUrl: QR, phone: PHONE }) {
  return {
    title: "Nguyễn Bình",
    description: typeof description === "string" ? description : JSON.stringify(description),
    href: "https://zalo.me/0912345678",
    thumb: AVATAR,
    childnumber: 0,
    action: "recommened.user",
    params: USER_ID,
    type: "",
    ...fields,
  };
}

function zcaData(msgType: string, body: unknown): TMessage {
  return { msgId: "100", msgType, uidFrom: "8001", idTo: "0", dName: "Bạn A", ts: "1760515200000", content: body } as TMessage;
}
const read = (body: unknown, msgType = "chat.recommended") => toZaloMessage(new UserMessage("7001", zcaData(msgType, body)));

describe("toZaloMessage for a contact card", () => {
  it("reads every field and drops the shapes", () => {
    const message = read(card());

    expect(message.contactCard).toEqual({ userId: USER_ID, name: "Nguyễn Bình", avatarUrl: AVATAR, phone: PHONE, qrUrl: QR });
    expect(message.mediaShape).toBeUndefined();
    expect(message.contentShape).toBeUndefined();
    expect(message.text).toBeNull();
  });

  it("gives a card without a phone a null phone", () => {
    for (const description of [{ qrCodeUrl: QR }, { qrCodeUrl: QR, phone: "" }, { qrCodeUrl: QR, phone: "  " }, { qrCodeUrl: QR, phone: 5 }]) {
      expect(read(card({}, description)).contactCard).toMatchObject({ phone: null, qrUrl: QR });
    }
  });

  it("reads the keys of the description whatever their case", () => {
    expect(read(card({}, { QRCODEURL: QR, Phone: ` ${PHONE} ` })).contactCard).toMatchObject({ phone: PHONE, qrUrl: QR });
  });

  it("sends the card with null phone and qrUrl when the description is no JSON object, and keeps what it looked like", () => {
    for (const description of ["0912345678", "not json {", "[1,2]", "", "null", "12"]) {
      const message = read(card({}, description));
      expect(message.contactCard).toMatchObject({ name: "Nguyễn Bình", phone: null, qrUrl: null });
      expect(message.mediaShape).toBeDefined();
      expect(message.contentShape).toMatch(/^[A-Za-z0-9_.:(),-]*$/);
    }
  });

  it("says the keys of a description whose keys it does not know, never a value", () => {
    const message = read(card({}, { link: QR, tel: PHONE }));

    expect(message.contactCard).toMatchObject({ phone: null, qrUrl: null });
    expect(message.contentShape).toBe("link:url,tel:string(10)");
  });

  it("gives a null userId unless params is plain digits of a sensible length", () => {
    for (const params of ["abc", "", "12", "1".repeat(26), "12 345 678", '{"a":1}', 123456789, null]) {
      expect(read(card({ params })).contactCard?.userId).toBeNull();
    }
    expect(read(card({ params: " 12345 " })).contactCard?.userId).toBe("12345");
  });

  it("gives a null avatarUrl when thumb is not a web address", () => {
    for (const thumb of ["", "javascript:alert(1)", "//x.zadn.vn/a.jpg", null]) {
      expect(read(card({ thumb })).contactCard?.avatarUrl).toBeNull();
    }
  });

  it("is no card without a name, and then keeps its shape", () => {
    for (const title of ["", "   ", null, 5]) {
      const message = read(card({ title }));
      expect(message.contactCard).toBeUndefined();
      expect(message.mediaShape).toContain("action:string(15)");
    }
  });

  it("cuts a long name and phone", () => {
    const message = read(card({ title: "n".repeat(500) }, { qrCodeUrl: QR, phone: "9".repeat(100) }));

    expect(message.contactCard?.name).toHaveLength(200);
    expect(message.contactCard?.phone).toHaveLength(30);
  });

  it("does not make a link card a contact card: another action, a missing one, or another type", () => {
    for (const action of ["recommened.link", "recommended.user", "RECOMMENED.USER", "", undefined]) {
      const message = read(card({ action }));
      expect(message.contactCard).toBeUndefined();
      expect(message.mediaShape).toBeDefined();
    }
    for (const type of ["chat.link", "webchat", "chat.location.new", "share.file"]) {
      expect(read(card(), type).contactCard).toBeUndefined();
    }
    expect(read("hello").contactCard).toBeUndefined();
  });

  it("is given in a group too", () => {
    const group = zcaData("chat.recommended", card()) as unknown as { idTo: string };
    group.idTo = "9001";

    expect(toZaloMessage(new GroupMessage("7001", group as never)).contactCard?.userId).toBe(USER_ID);
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("a contact card through sino-zalo", () => {
  let gateway: FakeZaloGateway;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    app = buildApp(CONFIG, gateway, { notifier: new QuietNotifier() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("gives the card with the message on GET /accounts/:id/messages", async () => {
    await app.inject({ method: "PUT", url: "/accounts/a1/session", headers: AUTH, payload: { session: SESSION } });
    const listener = gateway.latestListener();
    listener.events.connected();
    listener.events.ready();
    listener.receive(read(card()));

    const body = (await app.inject({ method: "GET", url: "/accounts/a1/messages", headers: AUTH })).json();

    expect(body.messages[0]).toMatchObject({
      zaloType: "chat.recommended",
      text: null,
      contactCard: { userId: USER_ID, name: "Nguyễn Bình", avatarUrl: AVATAR, phone: PHONE, qrUrl: QR },
    });
    expect(body.messages[0]).not.toHaveProperty("mediaShape");
  });
});

describe("SessionManager logs a contact card", () => {
  async function lines(message: ReturnType<typeof read>) {
    const out: { message: string; details: object }[] = [];
    const record = (details: object, text: string) => {
      out.push({ message: text, details });
    };
    const gateway = new FakeZaloGateway();
    const manager = new SessionManager(gateway, new QuietNotifier(), { log: { info: record, warn: record } });
    await manager.put("a1", SESSION);
    gateway.latestListener().receive(message);
    manager.stopAll();
    return out;
  }

  it("never carries a name, a phone, an id or an address, read in full or not", async () => {
    const logs = [
      await lines(read(card())),
      await lines(read(card({}, { link: QR, tel: PHONE }))),
      await lines(read(card({}, "0912345678"))),
      await lines(read(card({ title: "" }))),
    ];
    for (const log of logs) {
      const all = JSON.stringify(log);
      for (const secret of ["Nguyễn", "Bình", PHONE, "912345", USER_ID, "secret", "qr.zalo.me"]) {
        expect(all).not.toContain(secret);
      }
    }
    expect(logs[0]?.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("mediaShape");
    expect(logs[1]?.find((l) => l.message === "Zalo message")?.details).toMatchObject({ contentShape: "link:url,tel:string(10)" });
  });
});
