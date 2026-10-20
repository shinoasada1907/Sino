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
const MIB = 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x42, 0x43]);

/** The `image` of a request: a small PNG unless told otherwise. */
function picture(overrides: Record<string, unknown> = {}, bytes: Buffer = PNG) {
  return { data: bytes.toString("base64"), fileName: "meo.png", width: 128, height: 96, ...overrides };
}

/** A request that is only a picture. */
function pictureReply(image: Record<string, unknown> = picture(), overrides: Record<string, unknown> = {}) {
  return { threadId: "8001", threadType: "USER", clientMessageId: "c-1", image, ...overrides };
}

describe("POST /accounts/{accountId}/messages with a picture", () => {
  let gateway: FakeZaloGateway;
  let clock: number;
  let logLines: string[];
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    clock = Date.parse("2026-10-20T08:00:00.000Z");
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

  function send(payload: object = pictureReply()) {
    return app.inject({ method: "POST", url: "/accounts/a1/messages", headers: AUTH, payload });
  }

  it("sends a picture into a direct chat and answers 201 with the msgId of the picture", async () => {
    await connect();

    const response = await send();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ msgId: "9000", sentAt: "2026-10-20T08:00:00.000Z" });
    expect(gateway.sentImages).toEqual([
      { threadId: "8001", threadType: "USER", image: { data: PNG, fileName: "meo.png", width: 128, height: 96 } },
    ]);
    expect(gateway.sent).toEqual([]);
  });

  it("sends a picture into a group", async () => {
    await connect();

    const response = await send(pictureReply(picture(), { threadId: "9001", threadType: "GROUP" }));

    expect(response.statusCode).toBe(201);
    expect(response.json().msgId).toBe("9000");
    expect(gateway.sentImages.map((sent) => [sent.threadId, sent.threadType])).toEqual([["9001", "GROUP"]]);
  });

  it("takes a GIF and a WebP as well as a PNG", async () => {
    await connect();

    expect((await send(pictureReply(picture({ fileName: "nhay.gif" })))).statusCode).toBe(201);
    clock += 1_000;
    expect((await send(pictureReply(picture({ fileName: "ngu.webp" }), { clientMessageId: "c-2" }))).statusCode).toBe(201);

    expect(gateway.sentImages.map((sent) => sent.image.fileName)).toEqual(["nhay.gif", "ngu.webp"]);
  });

  it("lets the text be empty, or missing, beside a picture", async () => {
    await connect();

    expect((await send(pictureReply(picture(), { text: "" }))).statusCode).toBe(201);
    clock += 1_000;
    expect((await send(pictureReply(picture(), { clientMessageId: "c-2" }))).statusCode).toBe(201);
    expect(gateway.sentImages).toHaveLength(2);
  });

  it("refuses a text beside a picture, and a request with neither, sending nothing", async () => {
    await connect();

    const both = await send(pictureReply(picture(), { text: "Mèo đây" }));
    const neither = await send({ threadId: "8001", threadType: "USER", clientMessageId: "c-2" });

    expect(both.statusCode).toBe(400);
    expect(both.json().code).toBe("INVALID_MESSAGE");
    expect(neither.statusCode).toBe(400);
    expect(neither.json().code).toBe("INVALID_MESSAGE");
    expect(gateway.sentImages).toEqual([]);
    expect(gateway.sent).toEqual([]);
  });

  it("refuses data that is not base64, sending nothing", async () => {
    await connect();
    const good = PNG.toString("base64");

    for (const data of ["not base64 at all!", good.replace(/=+$/, "").slice(0, -1), `${good.slice(0, 4)}\n${good.slice(4)}`, "="]) {
      const response = await send(pictureReply(picture({ data })));

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("INVALID_IMAGE");
    }
    expect(gateway.sentImages).toEqual([]);
  });

  it("takes a picture of exactly 1 MiB and refuses one a byte bigger", async () => {
    await connect();

    const exact = await send(pictureReply(picture({}, Buffer.alloc(MIB, 7))));
    clock += 1_000;
    const over = await send(pictureReply(picture({}, Buffer.alloc(MIB + 1, 7)), { clientMessageId: "c-2" }));

    expect(exact.statusCode).toBe(201);
    expect(over.statusCode).toBe(400);
    expect(over.json().code).toBe("IMAGE_TOO_LARGE");
    expect(gateway.sentImages).toHaveLength(1);
  });

  it("answers 400, not 413, for a picture of 2 MiB or more, and Zalo gets nothing", async () => {
    await connect();

    // Just over the 2 MiB the route reads, and far over it.
    for (const size of [2 * MIB, 6 * MIB]) {
      const response = await send(pictureReply(picture({}, Buffer.alloc(size, 7)), { clientMessageId: `c-${size}` }));

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toMatch(/TOO_LARGE$/);
    }
    expect(gateway.sentImages).toEqual([]);
  });

  it("refuses a name that is not a .png, .gif or .webp file, and a missing or empty size", async () => {
    await connect();
    // The control: the same request with none of the faults is taken, so each 400 below is about its own fault.
    expect((await send(pictureReply(picture()))).statusCode).toBe(201);

    for (const image of [
      picture({ fileName: "meo.jpg" }),
      picture({ fileName: "meo" }),
      picture({ fileName: "../meo.png" }),
      picture({ fileName: "a/b.png" }),
      picture({ fileName: ".png" }),
      picture({ width: 0 }),
      picture({ height: -3 }),
      picture({ width: undefined }),
      picture({ data: "" }),
      picture({ data: undefined }),
    ]) {
      expect((await send(pictureReply(image, { clientMessageId: "c-bad" }))).statusCode).toBe(400);
    }
    expect(gateway.sentImages).toHaveLength(1);
  });

  it("answers the same clientMessageId with 200 and the first result, and Zalo gets one picture", async () => {
    await connect();
    const first = await send();
    clock += 5_000;

    const second = await send();

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(gateway.sentImages).toHaveLength(1);
  });

  it("shares the one message per second with the texts, answering 429 without sending", async () => {
    await connect();
    await send({ threadId: "8001", threadType: "USER", text: "Mai họp lúc 9 giờ", clientMessageId: "c-text" });
    clock += 200;

    const response = await send(pictureReply(picture(), { clientMessageId: "c-2" }));

    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe("RATE_LIMITED");
    expect(gateway.sentImages).toEqual([]);
  });

  it("answers 422 REJECTED when Zalo refuses the picture, and lets it try again later", async () => {
    await connect();
    gateway.nextSend = "reject";

    const refused = await send();
    clock += 1_000;
    const again = await send();

    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe("REJECTED");
    expect(again.statusCode).toBe(201);
    expect(gateway.sentImages).toHaveLength(2);
  });

  it("answers 504 OUTCOME_UNKNOWN when Zalo does not answer in time, and never sends that picture again", async () => {
    await connect();
    gateway.nextSend = "hold";

    const first = await send();
    clock += 5_000;
    const second = await send();

    expect(first.statusCode).toBe(504);
    expect(first.json().code).toBe("OUTCOME_UNKNOWN");
    expect(second.statusCode).toBe(504);
    expect(gateway.sentImages).toHaveLength(1);
  });

  it("answers 404 for an account it holds no session for and 410 once Zalo kicked the session, sending nothing", async () => {
    expect((await send()).statusCode).toBe(404);

    await connect();
    gateway.latestListener().close(3003, "KickConnection");

    expect((await send(pictureReply(picture(), { clientMessageId: "c-2" }))).statusCode).toBe(410);
    expect(gateway.sentImages).toEqual([]);
  });

  it("logs a send by ids, type and size, never the picture or its name", async () => {
    await connect();
    const image = picture({ fileName: "con-mèo-của-tôi.png" });

    await send(pictureReply(image));

    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.msg === "Zalo message sent");
    expect(line).toMatchObject({
      accountId: "a1",
      threadId: "8001",
      clientMessageId: "c-1",
      msgId: "9000",
      imageType: "png",
      imageBytes: PNG.length,
    });
    const everything = logLines.join("");
    expect(everything).not.toContain(image.data);
    expect(everything).not.toContain("con-mèo-của-tôi");
  });

  it("logs nothing of a picture it refused", async () => {
    await connect();
    const big = picture({ fileName: "bi-mat.png" }, Buffer.alloc(MIB + 1, 7));
    const notBase64 = picture({ data: "chuoi-bi-mat!!" });

    await send(pictureReply(big));
    await send(pictureReply(notBase64, { clientMessageId: "c-2" }));

    const everything = logLines.join("");
    expect(everything).not.toContain(big.data.slice(0, 200));
    expect(everything).not.toContain("chuoi-bi-mat");
    expect(everything).not.toContain("bi-mat.png");
  });
});
