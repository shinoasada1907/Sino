import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { WebhookNotifier } from "../src/notify.ts";

const SECRET = "k".repeat(32);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Call {
  readonly authorization: string | undefined;
  readonly body: unknown;
}

describe("WebhookNotifier", () => {
  let sinoApi: FastifyInstance | undefined;

  afterEach(async () => {
    await sinoApi?.close();
    sinoApi = undefined;
  });

  /** A stand-in for sino-api that records the webhook calls and answers with `status`. */
  async function startSinoApi(status: number) {
    const calls: Call[] = [];
    sinoApi = Fastify();
    sinoApi.post("/api/webhooks/zalo", async (request, reply) => {
      calls.push({
        authorization: request.headers.authorization,
        body: request.body,
      });
      return reply.code(status).send();
    });
    const url = await sinoApi.listen({ host: "127.0.0.1", port: 0 });
    return { calls, url };
  }

  function recordingLog() {
    const warnings: object[] = [];
    return { warnings, log: { warn: (details: object) => warnings.push(details) } };
  }

  it("tells sino-api whose session ended, with the shared secret", async () => {
    const { calls, url } = await startSinoApi(204);
    const { warnings, log } = recordingLog();

    await new WebhookNotifier({ apiUrl: url, secret: SECRET }, log).sessionEnded("7001");

    expect(calls).toEqual([
      { authorization: `Bearer ${SECRET}`, body: { ownId: "7001" } },
    ]);
    expect(warnings).toEqual([]);
  });

  it("logs a warning instead of failing when sino-api answers with an error", async () => {
    const { url } = await startSinoApi(500);
    const { warnings, log } = recordingLog();

    await new WebhookNotifier({ apiUrl: url, secret: SECRET }, log).sessionEnded("7001");

    expect(warnings).toEqual([{ ownId: "7001", status: 500 }]);
  });

  it("makes one call for three messages of an account within 0.3 seconds", async () => {
    const { calls, url } = await startSinoApi(204);
    const notifier = new WebhookNotifier({ apiUrl: url, secret: SECRET }, recordingLog().log);

    notifier.messagesArrived("7001");
    await sleep(150);
    notifier.messagesArrived("7001");
    await sleep(150);
    notifier.messagesArrived("7001");
    await sleep(500);

    expect(calls.map((call) => call.body)).toEqual([{ ownId: "7001" }]);
  });

  it("calls once per account, and again for messages after the window", async () => {
    const { calls, url } = await startSinoApi(204);
    const notifier = new WebhookNotifier({ apiUrl: url, secret: SECRET }, recordingLog().log, { batchMs: 20 });

    notifier.messagesArrived("7001");
    notifier.messagesArrived("7002");
    await sleep(150);
    notifier.messagesArrived("7001");
    await sleep(150);

    expect(calls.map((call) => call.body)).toEqual([
      { ownId: "7001" },
      { ownId: "7002" },
      { ownId: "7001" },
    ]);
  });

  it("logs a warning instead of failing when sino-api cannot be reached", async () => {
    const { url } = await startSinoApi(204);
    await sinoApi?.close();
    const { warnings, log } = recordingLog();

    await new WebhookNotifier({ apiUrl: url, secret: SECRET }, log).sessionEnded("7001");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ ownId: "7001" });
  });
});
