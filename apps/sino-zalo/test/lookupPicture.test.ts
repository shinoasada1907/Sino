import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
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
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** When the session starts in these tests. */
const STARTED = Date.parse("2026-10-20T08:00:00.000Z");

function iso(time: number): string {
  return new Date(time).toISOString();
}

// A picture has no text to look it up by (ZS-03): what sino-zalo knows about it is what its sent log holds under the
// clientMessageId, asked without a text.
describe("POST /accounts/{accountId}/sent/lookup for a picture", () => {
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

  async function connect() {
    const response = await app.inject({
      method: "PUT",
      url: "/accounts/a1/session",
      headers: AUTH,
      payload: { session: SESSION },
    });
    expect(response.statusCode).toBe(204);
  }

  function sendPicture(clientMessageId = "c-1") {
    return app.inject({
      method: "POST",
      url: "/accounts/a1/messages",
      headers: AUTH,
      payload: {
        threadId: "8001",
        threadType: "USER",
        clientMessageId,
        image: { data: PNG.toString("base64"), fileName: "meo.png", width: 64, height: 64 },
      },
    });
  }

  function lookup(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/accounts/a1/sent/lookup",
      headers: AUTH,
      payload: { threadId: "8001", clientMessageId: "c-1", after: iso(STARTED + 1_000), ...overrides },
    });
  }

  it("finds the msgId it remembers for a picture, asked without a text", async () => {
    await connect();
    clock = STARTED + 2_000;
    expect((await sendPicture()).statusCode).toBe(201);

    const response = await lookup();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ msgIds: ["9000"] });
  });

  it("finds the picture once Zalo answers a send that sino-api stopped waiting for", async () => {
    await connect();
    clock = STARTED + 2_000;
    gateway.nextSend = "hold";
    expect((await sendPicture()).statusCode).toBe(504);

    gateway.releaseHeldSends();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await lookup()).json()).toEqual({ msgIds: ["9000"] });
  });

  it("answers 409 CANNOT_TELL while the outcome of the picture is unknown, so it is not sent again blind", async () => {
    await connect();
    clock = STARTED + 2_000;
    gateway.nextSend = "hold";
    await sendPicture();

    const response = await lookup();

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CANNOT_TELL");
  });

  it("answers an empty list for a picture it never held, when it has been watching since before `after`", async () => {
    await connect();

    const response = await lookup({ clientMessageId: "c-9" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ msgIds: [] });
  });

  it("still refuses a text that is there but empty", async () => {
    await connect();

    expect((await lookup({ text: "" })).statusCode).toBe(400);
  });

  it("still answers 404 for an account it holds no session for", async () => {
    expect((await lookup()).statusCode).toBe(404);
  });
});
