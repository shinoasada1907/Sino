import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { ThreadType, ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import { type Notifier, WebhookNotifier } from "../src/notify.ts";
import { Conversations } from "../src/sessions/Conversations.ts";
import { SessionManager } from "../src/sessions/SessionManager.ts";

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

function message(msgId: string, overrides: Partial<ZaloMessage> = {}): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "webchat",
    text: `tin ${msgId}`,
    sentAt: "2026-10-15T08:00:00.000Z",
    ...overrides,
  };
}

class RecordingNotifier implements Notifier {
  readonly ended: string[] = [];
  readonly arrived: string[] = [];

  async sessionEnded(ownId: string): Promise<void> {
    this.ended.push(ownId);
  }

  messagesArrived(ownId: string): void {
    this.arrived.push(ownId);
  }
}

const ids = (body: { messages: ZaloMessage[] }) => body.messages.map((m) => m.msgId);

describe("GET /accounts/{accountId}/messages", () => {
  let gateway: FakeZaloGateway;
  let notifier: RecordingNotifier;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    notifier = new RecordingNotifier();
    app = buildApp(CONFIG, gateway, { notifier });
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
    const listener = gateway.latestListener();
    listener.events.connected();
    listener.events.ready();
    return listener;
  }

  function read(query = "") {
    return app.inject({
      method: "GET",
      url: `/accounts/a1/messages${query}`,
      headers: AUTH,
    });
  }

  it("answers 404 UNKNOWN_ACCOUNT for an account it holds no session for", async () => {
    const response = await read();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "UNKNOWN_ACCOUNT",
      message: "No session for this account",
    });
  });

  it("answers 410 SESSION_ENDED once Zalo kicked the session", async () => {
    const listener = await connect();
    listener.close(3003, "KickConnection");

    const response = await read();

    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe("SESSION_ENDED");
  });

  it("pages from the cursor: after=100&limit=1 gives 101 and says more wait", async () => {
    const listener = await connect();
    for (const id of ["100", "101", "102"]) listener.receive(message(id));

    const body = (await read("?after=100&limit=1")).json();

    expect(ids(body)).toEqual(["101"]);
    expect(body.nextCursor).toBe("101");
    expect(body.hasMore).toBe(true);
  });

  it("compares msgId as numbers: after=999 gives 1000", async () => {
    const listener = await connect();
    listener.receive(message("999"));
    listener.receive(message("1000"));

    const body = (await read("?after=999")).json();

    expect(ids(body)).toEqual(["1000"]);
  });

  it("gives everything held and a null cursor when there is no cursor and no message", async () => {
    await connect();

    const body = (await read()).json();

    expect(body).toEqual({ conversations: [], messages: [], nextCursor: null, hasMore: false });
  });

  it("keeps the cursor when nothing came after it", async () => {
    const listener = await connect();
    listener.receive(message("100"));

    const body = (await read("?after=100")).json();

    expect(body.messages).toEqual([]);
    expect(body.nextCursor).toBe("100");
  });

  it("keeps the messages the account sent itself", async () => {
    const listener = await connect();
    listener.receive(message("100", { fromId: "7001", fromName: "Tôi", isSelf: true }));

    const body = (await read()).json();

    expect(body.messages).toEqual([
      message("100", { fromId: "7001", fromName: "Tôi", isSelf: true }),
    ]);
  });

  it("refuses a cursor that is not a number", async () => {
    await connect();

    expect((await read("?after=abc")).statusCode).toBe(400);
    expect((await read("?limit=0")).statusCode).toBe(400);
  });

  it("names the conversations of the messages it gives", async () => {
    gateway.threadInfos.set("8001", { title: "Bạn A", avatarUrl: "https://a/8001.jpg" });
    gateway.threadInfos.set("9001", { title: "Nhóm B", avatarUrl: null });
    const listener = await connect();
    listener.receive(message("100"));
    listener.receive(message("101", { threadId: "9001", threadType: "GROUP", fromId: "8002", fromName: "Bạn C" }));
    listener.receive(message("102", { fromId: "7001", fromName: "Tôi", isSelf: true }));

    const body = (await read()).json();

    expect(body.conversations).toEqual([
      {
        threadId: "8001",
        threadType: "USER",
        title: "Bạn A",
        avatarUrl: "https://a/8001.jpg",
        participants: [
          { id: "8001", name: "Bạn A", avatarUrl: "https://a/8001.jpg" },
          { id: "7001", name: "Tôi", avatarUrl: null },
        ],
      },
      {
        threadId: "9001",
        threadType: "GROUP",
        title: "Nhóm B",
        avatarUrl: null,
        participants: [{ id: "8002", name: "Bạn C", avatarUrl: null }],
      },
    ]);
  });

  it("tells sino-api about each new message, not about one it already holds", async () => {
    const listener = await connect();

    listener.receive(message("100"));
    listener.receive(message("100"));

    expect(notifier.arrived).toEqual(["7001"]);
  });

  describe("catching up", () => {
    it("brings in what Zalo kept while sino-zalo was down", async () => {
      gateway.oldPages.USER.push([message("501"), message("502")]);
      await connect();

      const body = (await read("?after=500")).json();

      expect(ids(body)).toEqual(["501", "502"]);
      expect(body.nextCursor).toBe("502");
    });

    it("does not ask Zalo when the buffer already covers the cursor", async () => {
      const listener = await connect();
      for (const id of ["400", "500", "600"]) listener.receive(message(id));

      const body = (await read("?after=500")).json();

      expect(ids(body)).toEqual(["600"]);
      expect(listener.requests).toEqual([]);
    });

    it("catches up from one cursor once per session", async () => {
      const listener = await connect();

      await read("?after=500");
      await read("?after=500");
      await read("?after=600");

      expect(listener.requests).toEqual([
        { threadType: "USER", lastId: "500" },
        { threadType: "GROUP", lastId: "500" },
      ]);
    });

    it("waits for the listener to be ready before asking Zalo", async () => {
      await app.inject({
        method: "PUT",
        url: "/accounts/a1/session",
        headers: AUTH,
        payload: { session: SESSION },
      });
      const listener = gateway.latestListener();
      gateway.oldPages.USER.push([message("501")]);

      const pending = read("?after=500");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(listener.requests).toEqual([]);
      listener.events.ready();

      expect(ids((await pending).json())).toEqual(["501"]);
    });
  });
});

describe("SessionManager logs", () => {
  const silentNotifier = new RecordingNotifier();

  function recordingLog() {
    const lines: { message: string; details: object }[] = [];
    const record = (details: object, message: string) => {
      lines.push({ message, details });
    };
    return { lines, log: { info: record, warn: record } };
  }

  it("logs a received message by id, type and length, never its text", async () => {
    const gateway = new FakeZaloGateway();
    const { lines, log } = recordingLog();
    const manager = new SessionManager(gateway, silentNotifier, { log });
    await manager.put("a1", SESSION);

    gateway.latestListener().receive(message("100", { text: "Mai họp lúc 9 giờ" }));

    const line = lines.find((l) => l.message === "Zalo message");
    expect(line?.details).toEqual({
      accountId: "a1",
      msgId: "100",
      threadId: "8001",
      zaloType: "webchat",
      length: 17,
    });
    expect(JSON.stringify(lines)).not.toContain("Mai họp");
    manager.stopAll();
  });

  it("warns, without message text, when the catch-up runs out of time", async () => {
    const gateway = new FakeZaloGateway();
    gateway.silentOldMessages = true;
    const { lines, log } = recordingLog();
    const manager = new SessionManager(gateway, silentNotifier, { log, catchUpTimeoutMs: 20 });
    await manager.put("a1", SESSION);
    gateway.latestListener().events.ready();

    const page = await manager.readMessages("a1", "500", 100);

    expect(page.messages).toEqual([]);
    const warnings = lines.filter((l) => l.message === "Catch-up stopped before it joined the buffer");
    expect(warnings.map((w) => w.details)).toEqual([
      { accountId: "a1", threadType: "USER", pages: 0, messages: 0 },
      { accountId: "a1", threadType: "GROUP", pages: 0, messages: 0 },
    ]);
    manager.stopAll();
  });
});

describe("a failed webhook", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("loses no message: sino-api finds it at its next pull", async () => {
    const sinoApi = Fastify();
    const url = await sinoApi.listen({ host: "127.0.0.1", port: 0 });
    await sinoApi.close();
    const gateway = new FakeZaloGateway();
    const notifier = new WebhookNotifier({ apiUrl: url, secret: SECRET }, { warn: () => {} }, { batchMs: 10 });
    app = buildApp({ ...CONFIG, apiUrl: url }, gateway, { notifier });
    await app.inject({
      method: "PUT",
      url: "/accounts/a1/session",
      headers: AUTH,
      payload: { session: SESSION },
    });

    gateway.latestListener().receive(message("100"));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const response = await app.inject({ method: "GET", url: "/accounts/a1/messages", headers: AUTH });
    expect(ids(response.json())).toEqual(["100"]);
  });
});

describe("Conversations", () => {
  const silent = { warn: () => {} };

  function directory() {
    const calls: string[] = [];
    let fail = false;
    const connection = {
      ownId: "7001",
      listener: () => {
        throw new Error("not used");
      },
      threadInfo: async (threadId: string, threadType: ThreadType) => {
        calls.push(`${threadType}:${threadId}`);
        if (fail) throw new Error("Zalo is down");
        return { title: `Tên ${threadId}`, avatarUrl: null };
      },
      userAvatars: async () => new Map<string, string | null>(),
    };
    return { calls, connection, breakZalo: () => (fail = true) };
  }

  it("asks Zalo for a thread's name once an hour", async () => {
    let now = 0;
    const zalo = directory();
    const conversations = new Conversations(zalo.connection, { accountId: "a1", log: silent, now: () => now });

    await conversations.of([message("100")]);
    now = 60 * 60_000 - 1;
    await conversations.of([message("101")]);
    expect(zalo.calls).toEqual(["USER:8001"]);

    now = 60 * 60_000;
    await conversations.of([message("102")]);
    expect(zalo.calls).toEqual(["USER:8001", "USER:8001"]);
  });

  it("does not let a thread name that never comes hold the messages back", async () => {
    const silentZalo = {
      ownId: "7001",
      threadInfo: () => new Promise<never>(() => {}),
      userAvatars: () => new Promise<never>(() => {}),
    };
    const conversations = new Conversations(silentZalo, { accountId: "a1", log: silent, infoTimeoutMs: 20 });

    const [direct] = await conversations.of([message("100")]);

    expect(direct).toMatchObject({ threadId: "8001", title: "Bạn A" });
  });

  it("still gives the conversation when Zalo cannot name it", async () => {
    const zalo = directory();
    zalo.breakZalo();
    const conversations = new Conversations(zalo.connection, { accountId: "a1", log: silent });

    const [direct, group] = await conversations.of([
      message("100"),
      message("101", { threadId: "9001", threadType: "GROUP", fromId: "8002", fromName: "Bạn C" }),
    ]);

    expect(direct).toMatchObject({ threadId: "8001", title: "Bạn A", avatarUrl: null });
    expect(group).toMatchObject({ threadId: "9001", title: null, avatarUrl: null });
  });
});
