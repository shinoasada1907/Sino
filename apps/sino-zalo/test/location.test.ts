import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

// ZC-02 (location part, D-529): a `chat.location.new` message gives `location`. Zalo gives the coordinates as TEXT
// (measured in ZC-01), the address in `description`, the name in `title` and no map picture.

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };

const ADDRESS = "Số 1 Đường Bí Mật, Quận 1, TP.HCM";
const MAP = "https://map.zdn.vn/t/secret-map.jpg";

function content(params: unknown, fields: Record<string, unknown> = {}) {
  return {
    title: "",
    description: ADDRESS,
    href: "",
    thumb: "",
    childnumber: 0,
    action: "",
    type: "",
    params: typeof params === "string" ? params : JSON.stringify(params),
    ...fields,
  };
}
const GOOD = { latitude: "10.7769", longitude: "106.70098", placeId: "", isUserLocation: 1 };

function zcaData(msgType: string, body: unknown): TMessage {
  return { msgId: "100", msgType, uidFrom: "8001", idTo: "0", dName: "Bạn A", ts: "1760515200000", content: body } as TMessage;
}
const read = (body: unknown, msgType = "chat.location.new") => toZaloMessage(new UserMessage("7001", zcaData(msgType, body)));

describe("toZaloMessage for a location", () => {
  it("reads the coordinates from text, the address from description and nothing else", () => {
    const message = read(content(GOOD));

    expect(message.location).toEqual({ latitude: 10.7769, longitude: 106.70098, title: null, address: ADDRESS, previewUrl: null, current: true });
    expect(message.mediaShape).toBeUndefined();
    expect(message.contentShape).toBeUndefined();
    expect(message.text).toBeNull();
  });

  it("gives the title and a map picture when Zalo gives them, and trims the texts", () => {
    const message = read(content(GOOD, { title: "  Quán A  ", description: "", thumb: MAP }));

    expect(message.location).toEqual({ latitude: 10.7769, longitude: 106.70098, title: "Quán A", address: null, previewUrl: MAP, current: true });
  });

  it("drops a map picture that is not a web address", () => {
    expect(read(content(GOOD, { thumb: "javascript:alert(1)" })).location?.previewUrl).toBeNull();
    expect(read(content(GOOD, { thumb: "//map.zdn.vn/x.jpg" })).location?.previewUrl).toBeNull();
  });

  it("accepts numbers, negative values and the limits", () => {
    expect(read(content({ latitude: 10.5, longitude: -106.25 })).location).toMatchObject({ latitude: 10.5, longitude: -106.25 });
    expect(read(content({ latitude: "-90", longitude: "180" })).location).toMatchObject({ latitude: -90, longitude: 180 });
    expect(read(content({ latitude: " 0 ", longitude: "0.0" })).location).toMatchObject({ latitude: 0, longitude: 0 });
  });

  it("says current for isUserLocation other than 0, and not for 0, missing or not a number", () => {
    const at = (isUserLocation?: unknown) =>
      read(content({ latitude: "10", longitude: "106", ...(isUserLocation === undefined ? {} : { isUserLocation }) })).location?.current;

    expect(at(1)).toBe(true);
    expect(at(2)).toBe(true);
    expect(at(0)).toBe(false);
    expect(at()).toBe(false);
    expect(at("1")).toBe(false);
    expect(at(null)).toBe(false);
    expect(at(true)).toBe(false);
  });

  it("keeps the description whole as the address when the title is empty (no guess at a name)", () => {
    const message = read(content(GOOD, { title: "", description: "Heyman Coffee\n12 Đường A" }));

    expect(message.location).toMatchObject({ title: null, address: "Heyman Coffee\n12 Đường A" });
  });

  it("cuts a long title and address", () => {
    const message = read(content(GOOD, { title: "t".repeat(500), description: "d".repeat(900) }));

    expect(message.location?.title).toHaveLength(200);
    expect(message.location?.address).toHaveLength(300);
  });

  it("gives no location for a coordinate out of range, not a number, empty or missing, and keeps the shape", () => {
    const bad: unknown[] = [
      { latitude: "91", longitude: "106" },
      { latitude: "10", longitude: "181" },
      { latitude: "-90.5", longitude: "10" },
      { latitude: "abc", longitude: "106" },
      { latitude: "10,7769", longitude: "106.7" },
      { latitude: "1e2", longitude: "10" },
      { latitude: "NaN", longitude: "10" },
      { latitude: "", longitude: "" },
      { latitude: "10" },
      { longitude: "10" },
      { latitude: null, longitude: "10" },
      { latitude: true, longitude: 10 },
      { latitude: Number.NaN, longitude: 10 },
      { latitude: Infinity, longitude: 10 },
      {},
    ];
    for (const params of bad) {
      const message = read(content(params));
      expect(message.location).toBeUndefined();
      expect(message.mediaShape).toContain("params:string(");
    }
  });

  it("gives no location for a params that is broken, missing or not an object", () => {
    for (const body of [content("{not json"), content("[1,2]"), { title: "x" }, "hello", null, [1]]) {
      const message = read(body);
      expect(message.location).toBeUndefined();
      expect(message.mediaShape).toBeDefined();
    }
  });

  it("is given in a group too, and only to a chat.location.new message", () => {
    const group = zcaData("chat.location.new", content(GOOD)) as unknown as { idTo: string };
    group.idTo = "9001";

    expect(toZaloMessage(new GroupMessage("7001", group as never)).location?.latitude).toBe(10.7769);
    for (const type of ["webchat", "chat.recommended", "chat.link", "chat.photo", "share.file"]) {
      expect(read(content(GOOD), type).location).toBeUndefined();
    }
  });

  it("leaves a link or a contact card with its shape", () => {
    expect(read(content(GOOD), "chat.recommended").mediaShape).toBeDefined();
  });
});

class QuietNotifier implements Notifier {
  async sessionEnded(): Promise<void> {}
  messagesArrived(): void {}
}

describe("a location through sino-zalo", () => {
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

  it("gives the location with the message on GET /accounts/:id/messages", async () => {
    const listener = await connect();
    listener.receive(read(content(GOOD)));

    const body = (await app.inject({ method: "GET", url: "/accounts/a1/messages", headers: AUTH })).json();

    expect(body.messages[0]).toMatchObject({
      zaloType: "chat.location.new",
      text: null,
      location: { latitude: 10.7769, longitude: 106.70098, title: null, address: ADDRESS, previewUrl: null, current: true },
    });
    expect(body.messages[0]).not.toHaveProperty("mediaShape");
  });
});

describe("SessionManager logs a location", () => {
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

  it("never carries a coordinate, an address or a title, read or not", async () => {
    const readable = await lines(read(content(GOOD, { title: "Quán Riêng", thumb: MAP })));
    const broken = await lines(read(content({ latitude: "999.12345", longitude: "106.70098" })));

    for (const log of [readable, broken]) {
      const all = JSON.stringify(log);
      for (const secret of ["10.7769", "106.70098", "999.12345", "Bí Mật", "Quận", "Riêng", "secret-map"]) {
        expect(all).not.toContain(secret);
      }
    }
    expect(readable.find((l) => l.message === "Zalo message")?.details).not.toHaveProperty("mediaShape");
    expect(broken.find((l) => l.message === "Zalo message")?.details).toMatchObject({ mediaShape: expect.stringContaining("params.latitude:string(") });
  });
});
