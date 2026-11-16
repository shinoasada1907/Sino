import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { type FakeListener, FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = {
  host: "127.0.0.1",
  port: 0,
  secret: SECRET,
  apiUrl: "http://127.0.0.1:8080",
};
const SESSION = {
  cookie: [{ key: "zpw_sek", value: "cookie-one" }],
  imei: "imei-one",
  userAgent: "Mozilla/5.0",
};
const SILENT: Notifier = {
  sessionEnded: async () => {},
  messagesArrived: () => {},
};
const TEXT = "Mai họp lúc 9 giờ";
/** When the session starts in these tests. */
const STARTED = Date.parse("2026-10-16T08:00:00.000Z");

function iso(time: number): string {
  return new Date(time).toISOString();
}

function own(msgId: string, overrides: Partial<ZaloMessage> = {}): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "7001",
    fromName: "Tôi",
    isSelf: true,
    zaloType: "webchat",
    text: TEXT,
    sentAt: iso(STARTED + 3_000),
    ...overrides,
  };
}

describe("POST /accounts/{accountId}/sent/lookup", () => {
  let gateway: FakeZaloGateway;
  let clock: number;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    clock = STARTED;
    app = buildApp(CONFIG, gateway, { notifier: SILENT, now: () => clock, sendTimeoutMs: 50 });
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect(): Promise<FakeListener> {
    const response = await app.inject({
      method: "PUT",
      url: "/accounts/a1/session",
      headers: AUTH,
      payload: { session: SESSION },
    });
    expect(response.statusCode).toBe(204);
    return gateway.latestListener();
  }

  function send(clientMessageId = "c-1") {
    return app.inject({
      method: "POST",
      url: "/accounts/a1/messages",
      headers: AUTH,
      payload: { threadId: "8001", threadType: "USER", text: TEXT, clientMessageId },
    });
  }

  function lookup(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/accounts/a1/sent/lookup",
      headers: AUTH,
      payload: {
        threadId: "8001",
        clientMessageId: "c-1",
        text: TEXT,
        after: iso(STARTED + 1_000),
        ...overrides,
      },
    });
  }

  it("finds the msgId it remembers for the clientMessageId", async () => {
    await connect();
    clock = STARTED + 2_000;
    await send();

    const response = await lookup();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ msgIds: ["9000"] });
  });

  it("finds the message once Zalo answers a send that sino-api stopped waiting for", async () => {
    await connect();
    clock = STARTED + 2_000;
    gateway.nextSend = "hold";
    expect((await send()).statusCode).toBe(504);

    gateway.releaseHeldSends();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await lookup()).json()).toEqual({ msgIds: ["9000"] });
  });

  it("answers 409 CANNOT_TELL while the outcome of the send is unknown", async () => {
    await connect();
    clock = STARTED + 2_000;
    gateway.nextSend = "hold";
    await send();

    const response = await lookup();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "CANNOT_TELL",
      message: "sino-zalo cannot tell whether the message went out",
    });
  });

  it("answers 409 CANNOT_TELL for a send that broke midway", async () => {
    await connect();
    clock = STARTED + 2_000;
    gateway.nextSend = "fail";
    await send();

    expect((await lookup()).statusCode).toBe(409);
  });

  it("answers 409 CANNOT_TELL once `after` is older than the 24 hours it remembers sends for", async () => {
    await connect();

    clock = STARTED + 1_000 + 24 * 60 * 60_000;
    expect((await lookup()).json()).toEqual({ msgIds: [] });
    clock += 1;
    expect((await lookup()).statusCode).toBe(409);
  });

  it("finds a message the account sent itself in the thread after `after`, with the same text", async () => {
    const listener = await connect();
    listener.receive(own("500"));

    const response = await lookup({ clientMessageId: "c-9" });

    expect(response.json()).toEqual({ msgIds: ["500"] });
  });

  it("leaves out other threads, other text, earlier messages and messages from others", async () => {
    const listener = await connect();
    listener.receive(own("501", { threadId: "9001", threadType: "GROUP" }));
    listener.receive(own("502", { text: "Mai họp lúc 10 giờ" }));
    listener.receive(own("503", { sentAt: iso(STARTED + 500) }));
    listener.receive(own("504", { isSelf: false, fromId: "8001", fromName: "Bạn A" }));

    const response = await lookup({ clientMessageId: "c-9" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ msgIds: [] });
  });

  it("lists a message once when it remembers it and also holds its echo", async () => {
    const listener = await connect();
    clock = STARTED + 2_000;
    await send();
    listener.receive(own("9000"));

    expect((await lookup()).json()).toEqual({ msgIds: ["9000"] });
  });

  it("answers 409 CANNOT_TELL when the session started after `after` and nothing matches", async () => {
    await connect();

    const response = await lookup({ after: iso(STARTED - 60_000) });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CANNOT_TELL");
  });

  it("still answers what it found when the session started after `after`", async () => {
    const listener = await connect();
    listener.receive(own("500"));

    const response = await lookup({ clientMessageId: "c-9", after: iso(STARTED - 60_000) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ msgIds: ["500"] });
  });

  it("answers 404 UNKNOWN_ACCOUNT for an account it holds no session for", async () => {
    const response = await lookup();

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("UNKNOWN_ACCOUNT");
  });

  it("answers 410 SESSION_ENDED once Zalo kicked the session", async () => {
    const listener = await connect();
    listener.close(3003, "KickConnection");

    expect((await lookup()).statusCode).toBe(410);
  });

  it("refuses a body whose `after` is not a time, or without a clientMessageId", async () => {
    await connect();

    expect((await lookup({ after: "yesterday" })).statusCode).toBe(400);
    expect((await lookup({ clientMessageId: undefined })).statusCode).toBe(400);
  });
});
