import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ZaloApiError } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { ZaloRejectedError } from "../src/gateway/ZaloGateway.ts";
import { sendText } from "../src/gateway/ZcaGateway.ts";
import { RateLimiter } from "../src/messages/RateLimiter.ts";
import { SentLog } from "../src/messages/SentLog.ts";
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
const DAY_MS = 24 * 60 * 60_000;

function reply(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "8001",
    threadType: "USER",
    text: "Mai họp lúc 9 giờ",
    clientMessageId: "c-1",
    ...overrides,
  };
}

describe("POST /accounts/{accountId}/messages", () => {
  let gateway: FakeZaloGateway;
  let clock: number;
  let logLines: string[];
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    clock = Date.parse("2026-10-16T08:00:00.000Z");
    logLines = [];
    app = buildApp(CONFIG, gateway, {
      notifier: SILENT,
      now: () => clock,
      sendTimeoutMs: 50,
      logger: { level: "info", stream: { write: (line: string) => logLines.push(line) } },
    });
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

  function send(payload: object = reply()) {
    return app.inject({ method: "POST", url: "/accounts/a1/messages", headers: AUTH, payload });
  }

  it("sends the text through Zalo and answers 201 with its msgId", async () => {
    await connect();

    const response = await send();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ msgId: "9000", sentAt: "2026-10-16T08:00:00.000Z" });
    expect(gateway.sent).toEqual([
      { threadId: "8001", threadType: "USER", text: "Mai họp lúc 9 giờ" },
    ]);
  });

  it("sends to a group", async () => {
    await connect();

    const response = await send(reply({ threadId: "9001", threadType: "GROUP" }));

    expect(response.statusCode).toBe(201);
    expect(gateway.sent).toEqual([{ threadId: "9001", threadType: "GROUP", text: "Mai họp lúc 9 giờ" }]);
  });

  it("answers the same clientMessageId with 200 and the first result, sending once", async () => {
    await connect();
    const first = await send();
    clock += 5_000;

    const second = await send();

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(gateway.sent).toHaveLength(1);
  });

  it("does not count a repeated clientMessageId against the rate", async () => {
    await connect();
    await send();
    clock += 200;

    expect((await send()).statusCode).toBe(200);
  });

  it("answers 429 RATE_LIMITED, without sending, for a second message 0.2 seconds later", async () => {
    await connect();
    await send();
    clock += 200;

    const response = await send(reply({ clientMessageId: "c-2" }));

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      code: "RATE_LIMITED",
      message: "At most one message per second per account",
    });
    expect(gateway.sent).toHaveLength(1);
  });

  it("sends again one second after the last message", async () => {
    await connect();
    await send();
    clock += 1_000;

    expect((await send(reply({ clientMessageId: "c-2" }))).statusCode).toBe(201);
  });

  it("answers 422 REJECTED when Zalo refuses, and lets the same message try again later", async () => {
    await connect();
    gateway.nextSend = "reject";

    const refused = await send();

    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({ code: "REJECTED", message: "Zalo refused the message" });

    clock += 1_000;
    expect((await send()).statusCode).toBe(201);
    expect(gateway.sent).toHaveLength(2);
  });

  it("answers 504 OUTCOME_UNKNOWN when Zalo does not answer in time", async () => {
    await connect();
    gateway.nextSend = "hold";

    const response = await send();

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      code: "OUTCOME_UNKNOWN",
      message: "Zalo did not say whether the message went out",
    });
  });

  it("never sends again a message whose outcome is unknown, and gives its msgId once Zalo answers", async () => {
    await connect();
    gateway.nextSend = "hold";
    await send();
    clock += 5_000;

    const whileWaiting = await send();
    gateway.releaseHeldSends();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterwards = await send();

    expect(whileWaiting.statusCode).toBe(504);
    expect(afterwards.statusCode).toBe(200);
    expect(afterwards.json().msgId).toBe("9000");
    expect(gateway.sent).toHaveLength(1);
  });

  it("lets a message Zalo refused after the timeout be sent again", async () => {
    await connect();
    gateway.nextSend = "hold";
    await send();
    gateway.releaseHeldSends("reject");
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock += 1_000;

    expect((await send()).statusCode).toBe(201);
    expect(gateway.sent).toHaveLength(2);
    expect(logLines.some((l) => JSON.parse(l).msg === "Zalo send failed after the timeout")).toBe(true);
  });

  it("sends once when the same clientMessageId comes twice at the same time", async () => {
    await connect();
    gateway.nextSend = "hold";

    const answers = await Promise.all([send(), send()]);

    expect(answers.map((a) => a.statusCode)).toEqual([504, 504]);
    expect(gateway.sent).toHaveLength(1);
  });

  it("sends one of two messages that come at the same time, and refuses the other with 429", async () => {
    await connect();

    const answers = await Promise.all([send(), send(reply({ clientMessageId: "c-2" }))]);

    expect(answers.map((a) => a.statusCode).sort()).toEqual([201, 429]);
    expect(gateway.sent).toHaveLength(1);
  });

  it("answers 200 for a message already sent, even once the session has ended", async () => {
    await connect();
    const first = await send();
    gateway.latestListener().close(3003, "KickConnection");

    const again = await send();

    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
  });

  it("answers 504 for a send that broke midway, and never sends it again", async () => {
    await connect();
    gateway.nextSend = "fail";

    const first = await send();
    clock += 5_000;
    const second = await send();

    expect(first.statusCode).toBe(504);
    expect(second.statusCode).toBe(504);
    expect(gateway.sent).toHaveLength(1);
  });

  it("answers 404 UNKNOWN_ACCOUNT for an account it holds no session for", async () => {
    const response = await send();

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("UNKNOWN_ACCOUNT");
    expect(gateway.sent).toEqual([]);
  });

  it("answers 410 SESSION_ENDED, without sending, once Zalo kicked the session", async () => {
    await connect();
    gateway.latestListener().close(3003, "KickConnection");

    const response = await send();

    expect(response.statusCode).toBe(410);
    expect(gateway.sent).toEqual([]);
  });

  it("refuses a body without text, thread or a known thread type", async () => {
    await connect();

    expect((await send(reply({ text: "" }))).statusCode).toBe(400);
    expect((await send(reply({ threadId: undefined }))).statusCode).toBe(400);
    expect((await send(reply({ threadType: "PAGE" }))).statusCode).toBe(400);
    expect((await send(reply({ clientMessageId: "" }))).statusCode).toBe(400);
    expect(gateway.sent).toEqual([]);
  });

  it("logs a send by ids and length, never its text", async () => {
    await connect();

    await send();

    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.msg === "Zalo message sent");
    expect(line).toMatchObject({ accountId: "a1", threadId: "8001", clientMessageId: "c-1", msgId: "9000", length: 17 });
    expect(logLines.join("")).not.toContain("Mai họp");
  });

  it("logs a refused or broken send without its text", async () => {
    await connect();
    gateway.nextSend = "reject";
    await send();
    clock += 1_000;
    gateway.nextSend = "fail";
    await send(reply({ clientMessageId: "c-2" }));

    const messages = logLines.map((l) => JSON.parse(l).msg);
    expect(messages).toContain("Zalo refused the message");
    expect(messages).toContain("Zalo send broke midway");
    expect(logLines.join("")).not.toContain("Mai họp");
  });
});

describe("SentLog", () => {
  let clock: number;
  let log: SentLog;

  beforeEach(() => {
    clock = Date.parse("2026-10-16T08:00:00.000Z");
    log = new SentLog({ now: () => clock });
  });

  it("holds the msgId by the time the send resolves", async () => {
    const record = await log.track("a1", "c-1", Promise.resolve("9000"));

    expect(record).toEqual({ msgId: "9000", sentAt: "2026-10-16T08:00:00.000Z" });
    expect(log.get("a1", "c-1")).toEqual({ state: "SENT", record });
  });

  it("knows a send is on its way before Zalo answers", () => {
    void log.track("a1", "c-1", new Promise<string>(() => {}));

    expect(log.get("a1", "c-1")).toEqual({ state: "PENDING" });
  });

  it("forgets a send Zalo refused: nothing went out", async () => {
    await expect(log.track("a1", "c-1", Promise.reject(new ZaloRejectedError("no")))).rejects.toThrow("no");

    expect(log.get("a1", "c-1")).toBeUndefined();
  });

  it("keeps a send that broke midway as unknown", async () => {
    await expect(log.track("a1", "c-1", Promise.reject(new Error("socket hang up")))).rejects.toThrow("socket hang up");

    expect(log.get("a1", "c-1")).toEqual({ state: "UNKNOWN" });
  });

  it("keeps the ids of each account apart", async () => {
    await log.track("a1", "c-1", Promise.resolve("9000"));

    expect(log.get("a2", "c-1")).toBeUndefined();
  });

  it("forgets a clientMessageId 24 hours after the send started", async () => {
    await log.track("a1", "c-1", Promise.resolve("9000"));

    clock += DAY_MS - 1;
    expect(log.get("a1", "c-1")?.state).toBe("SENT");
    clock += 1;
    expect(log.get("a1", "c-1")).toBeUndefined();
  });
});

describe("RateLimiter", () => {
  it("lets one event per interval through for each key", () => {
    let clock = 0;
    const limiter = new RateLimiter({ intervalMs: 1_000, now: () => clock });

    expect(limiter.tryTake("a1")).toBe(true);
    clock = 999;
    expect(limiter.tryTake("a1")).toBe(false);
    expect(limiter.tryTake("a2")).toBe(true);
    clock = 1_000;
    expect(limiter.tryTake("a1")).toBe(true);
  });

  it("does not count a refused attempt as a turn", () => {
    let clock = 0;
    const limiter = new RateLimiter({ intervalMs: 1_000, now: () => clock });
    limiter.tryTake("a1");
    clock = 500;
    limiter.tryTake("a1");

    clock = 1_000;
    expect(limiter.tryTake("a1")).toBe(true);
  });
});

describe("sendText over zca-js", () => {
  it("gives the msgId Zalo answers with, as text", async () => {
    const msgId = await sendText(
      async () => ({ message: { msgId: 8372251986275 }, attachment: [] }),
      "8001",
      "USER",
      "Xin chào",
    );

    expect(msgId).toBe("8372251986275");
  });

  it("turns a Zalo error code into a refusal: nothing went out", async () => {
    const refused = sendText(
      async () => {
        throw new ZaloApiError("Tham số không hợp lệ", 114);
      },
      "8001",
      "USER",
      "Xin chào",
    );

    await expect(refused).rejects.toBeInstanceOf(ZaloRejectedError);
  });

  it("leaves any other failure unknown: the message may have gone out", async () => {
    for (const error of [new ZaloApiError("Request failed with status code 502"), new TypeError("fetch failed")]) {
      const broken = sendText(
        async () => {
          throw error;
        },
        "8001",
        "GROUP",
        "Xin chào",
      );

      await expect(broken).rejects.not.toBeInstanceOf(ZaloRejectedError);
    }
  });
});
