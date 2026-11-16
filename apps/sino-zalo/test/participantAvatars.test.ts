import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FastifyInstance } from "fastify";
import type { API } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { avatarsOf } from "../src/gateway/ZcaGateway.ts";
import type { ThreadInfo, ThreadType, ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { Conversations } from "../src/sessions/Conversations.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };
const DAY_MS = 24 * 60 * 60_000;

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

/** A message in the group 9001 from `fromId`. */
function inGroup(msgId: string, fromId: string, fromName = `Tên ${fromId}`): ZaloMessage {
  return message(msgId, { threadId: "9001", threadType: "GROUP", fromId, fromName });
}

const notifier: Notifier = { sessionEnded: async () => {}, messagesArrived: () => {} };

describe("participants of a conversation carry their picture (route)", () => {
  let gateway: FakeZaloGateway;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
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

  async function read(query = "") {
    const response = await app.inject({ method: "GET", url: `/accounts/a1/messages${query}`, headers: AUTH });
    return response.json() as {
      messages: ZaloMessage[];
      conversations: { threadId: string; participants: { id: string; avatarUrl: string | null }[] }[];
    };
  }

  const pictures = (body: Awaited<ReturnType<typeof read>>, threadId: string) =>
    Object.fromEntries(
      (body.conversations.find((c) => c.threadId === threadId)?.participants ?? []).map((p) => [p.id, p.avatarUrl]),
    );

  it("gives the friend of a 1-1 chat the picture of the conversation, without asking Zalo again", async () => {
    gateway.threadInfos.set("8001", { title: "Bạn A", avatarUrl: "https://photo.example/8001.jpg" });
    const listener = await connect();
    listener.receive(message("100"));

    const body = await read();

    expect(pictures(body, "8001")).toEqual({ "8001": "https://photo.example/8001.jpg" });
    expect(body.conversations[0]).toMatchObject({ avatarUrl: "https://photo.example/8001.jpg" });
    expect(gateway.avatarCalls).toEqual([]);
  });

  it("gives each member of a group their own picture, from one call", async () => {
    gateway.avatars.set("8002", "https://photo.example/8002.jpg");
    gateway.avatars.set("8003", "https://photo.example/8003.jpg");
    const listener = await connect();
    listener.receive(inGroup("100", "8002"));
    listener.receive(inGroup("101", "8003"));
    listener.receive(inGroup("102", "8002"));

    const body = await read();

    expect(pictures(body, "9001")).toEqual({
      "8002": "https://photo.example/8002.jpg",
      "8003": "https://photo.example/8003.jpg",
    });
    expect(gateway.avatarCalls).toEqual([["8002", "8003"]]);
  });

  it("gives the account itself no picture and does not ask for it", async () => {
    const listener = await connect();
    listener.receive(message("100", { fromId: "7001", fromName: "Tôi", isSelf: true }));
    listener.receive(message("101", { threadId: "9001", threadType: "GROUP", fromId: "7001", fromName: "Tôi", isSelf: true }));
    listener.receive(inGroup("102", "8002"));
    gateway.avatars.set("7001", "https://photo.example/me.jpg");

    const body = await read();

    expect(pictures(body, "8001")).toEqual({ "7001": null });
    expect(pictures(body, "9001")).toEqual({ "7001": null, "8002": null });
    expect(gateway.avatarCalls).toEqual([["8002"]]);
  });

  it("does not ask Zalo again for a sender it already has, and asks only for the new ones", async () => {
    gateway.avatars.set("8002", "https://photo.example/8002.jpg");
    const listener = await connect();
    listener.receive(inGroup("100", "8002"));
    await read();

    listener.receive(inGroup("101", "8002"));
    listener.receive(inGroup("102", "8003"));
    const body = await read("?after=100");

    expect(gateway.avatarCalls).toEqual([["8002"], ["8003"]]);
    expect(pictures(body, "9001")).toEqual({ "8002": "https://photo.example/8002.jpg", "8003": null });
  });

  it("still gives every message when Zalo fails to give the pictures", async () => {
    gateway.avatars.set("8002", "https://photo.example/8002.jpg");
    gateway.avatarsFail = true;
    const listener = await connect();
    listener.receive(message("100"));
    listener.receive(inGroup("101", "8002"));

    const body = await read();

    expect(body.messages.map((m) => m.msgId)).toEqual(["100", "101"]);
    expect(pictures(body, "9001")).toEqual({ "8002": null });
  });
});

describe("Conversations and the pictures of senders", () => {
  /** Silent logger that keeps what it was told. */
  function logger() {
    const warnings: { details: object; message: string }[] = [];
    return { warnings, warn: (details: object, message: string) => warnings.push({ details, message }) };
  }

  /** A connection whose Zalo knows `pictures`, counts the lookups, and can be broken or made to hang. */
  function zalo(pictures: Record<string, string | null> = {}, threads: Record<string, ThreadInfo> = {}) {
    const state = { calls: [] as string[][], fail: false, hang: false };
    const connection = {
      ownId: "7001",
      threadInfo: async (threadId: string, _type: ThreadType): Promise<ThreadInfo> =>
        threads[threadId] ?? { title: null, avatarUrl: null },
      userAvatars: async (userIds: readonly string[]) => {
        state.calls.push([...userIds]);
        if (state.hang) return new Promise<never>(() => {});
        if (state.fail) throw new Error("ZaloUnavailableError: fetch failed");
        return new Map(userIds.map((id) => [id, pictures[id] ?? null]));
      },
    };
    return { state, connection };
  }

  const picturesOf = (conversation: { participants: readonly { id: string; avatarUrl: string | null }[] } | undefined) =>
    Object.fromEntries((conversation?.participants ?? []).map((p) => [p.id, p.avatarUrl]));

  it("remembers a sender's picture for 24 hours, then asks again", async () => {
    let now = 0;
    const z = zalo({ "8002": "https://photo.example/8002.jpg" });
    const conversations = new Conversations(z.connection, { accountId: "a1", log: logger(), now: () => now });

    await conversations.of([inGroup("100", "8002")]);
    now = DAY_MS - 1;
    const [again] = await conversations.of([inGroup("101", "8002")]);
    expect(z.state.calls).toEqual([["8002"]]);
    expect(picturesOf(again)).toEqual({ "8002": "https://photo.example/8002.jpg" });

    now = DAY_MS;
    await conversations.of([inGroup("102", "8002")]);
    expect(z.state.calls).toEqual([["8002"], ["8002"]]);
  });

  it("remembers that a sender has no picture too", async () => {
    const z = zalo({ "8002": null });
    const conversations = new Conversations(z.connection, { accountId: "a1", log: logger() });

    await conversations.of([inGroup("100", "8002")]);
    const [again] = await conversations.of([inGroup("101", "8002")]);

    expect(z.state.calls).toEqual([["8002"]]);
    expect(picturesOf(again)).toEqual({ "8002": null });
  });

  it("asks once for the senders of all the groups of a page, each sender once, never the friend of a 1-1 chat", async () => {
    const z = zalo({ "8002": "https://photo.example/8002.jpg" }, { "8001": { title: "Bạn A", avatarUrl: "https://photo.example/8001.jpg" } });
    const conversations = new Conversations(z.connection, { accountId: "a1", log: logger() });

    const result = await conversations.of([
      message("100"),
      inGroup("101", "8002"),
      message("102", { threadId: "9002", threadType: "GROUP", fromId: "8002", fromName: "Tên 8002" }),
      message("103", { threadId: "9002", threadType: "GROUP", fromId: "8003", fromName: "Tên 8003" }),
    ]);

    expect(z.state.calls).toEqual([["8002", "8003"]]);
    expect(result.map((c) => picturesOf(c))).toEqual([
      { "8001": "https://photo.example/8001.jpg" },
      { "8002": "https://photo.example/8002.jpg" },
      { "8002": "https://photo.example/8002.jpg", "8003": null },
    ]);
  });

  it("makes no call for a page with no group sender to ask about", async () => {
    const z = zalo();
    const conversations = new Conversations(z.connection, { accountId: "a1", log: logger() });

    await conversations.of([message("100"), message("101", { fromId: "7001", isSelf: true })]);

    expect(z.state.calls).toEqual([]);
  });

  it("gives the friend of a 1-1 chat no picture when Zalo gave the conversation none", async () => {
    const conversations = new Conversations(zalo().connection, { accountId: "a1", log: logger() });

    const [direct] = await conversations.of([message("100")]);

    expect(picturesOf(direct)).toEqual({ "8001": null });
  });

  it("gives null when the lookup fails, says so without names or addresses, and asks again on the next page", async () => {
    const z = zalo({ "8002": "https://photo.example/8002.jpg" });
    z.state.fail = true;
    const log = logger();
    const conversations = new Conversations(z.connection, { accountId: "a1", log });

    const [failed] = await conversations.of([inGroup("100", "8002", "Nguyễn Văn C")]);

    expect(picturesOf(failed)).toEqual({ "8002": null });
    expect(log.warnings).toHaveLength(1);
    const logged = JSON.stringify(log.warnings);
    expect(logged).toContain("a1");
    expect(logged).not.toContain("Nguyễn Văn C");
    expect(logged).not.toContain("photo.example");

    z.state.fail = false;
    const [recovered] = await conversations.of([inGroup("101", "8002", "Nguyễn Văn C")]);
    expect(z.state.calls).toEqual([["8002"], ["8002"]]);
    expect(picturesOf(recovered)).toEqual({ "8002": "https://photo.example/8002.jpg" });
  });

  it("does not let a lookup that never answers hold the messages back", async () => {
    const z = zalo({ "8002": "https://photo.example/8002.jpg" });
    z.state.hang = true;
    const log = logger();
    const conversations = new Conversations(z.connection, { accountId: "a1", log, infoTimeoutMs: 20 });

    const [group] = await conversations.of([inGroup("100", "8002")]);

    expect(group).toMatchObject({ threadId: "9001", threadType: "GROUP" });
    expect(picturesOf(group)).toEqual({ "8002": null });
    expect(log.warnings).toHaveLength(1);
  });

  it("runs the lookup beside the thread names, not after them", async () => {
    // The thread name waits for the lookup to start: asked one after the other, it would never come in time.
    let lookupStarted!: () => void;
    const started = new Promise<void>((resolve) => (lookupStarted = resolve));
    const connection = {
      ownId: "7001",
      threadInfo: async (): Promise<ThreadInfo> => {
        await started;
        return { title: "Nhóm", avatarUrl: null };
      },
      userAvatars: async () => {
        lookupStarted();
        return new Map<string, string | null>();
      },
    };
    const conversations = new Conversations(connection, { accountId: "a1", log: logger(), infoTimeoutMs: 500 });

    const [group] = await conversations.of([inGroup("100", "8002")]);

    expect(group?.title).toBe("Nhóm");
  });
});

describe("avatarsOf", () => {
  const profile = (avatar: string) => ({ avatar, displayName: "x", zaloName: "x" });

  /** Zalo's `getUserInfo` as `avatarsOf` sees it: the profiles it answers with, and the arguments it was called with. */
  function api(profiles: Record<string, unknown>) {
    const calls: (string | string[])[] = [];
    return {
      calls,
      api: {
        getUserInfo: async (userId: string | string[]) => {
          calls.push(userId);
          return { changed_profiles: profiles, unchanged_profiles: {}, phonebook_version: 0 };
        },
      } as unknown as Pick<API, "getUserInfo">,
    };
  }

  it("asks for all the users in one call and reads the answer under either key", async () => {
    const z = api({
      "8002": profile("https://photo.example/8002.jpg"),
      "8003_0": profile("https://photo.example/8003.jpg"),
    });

    const pictures = await avatarsOf(z.api, ["8002", "8003"]);

    expect(z.calls).toEqual([["8002", "8003"]]);
    expect(Object.fromEntries(pictures)).toEqual({
      "8002": "https://photo.example/8002.jpg",
      "8003": "https://photo.example/8003.jpg",
    });
  });

  it("maps a user Zalo answers nothing for, or a profile without a picture, to null", async () => {
    const z = api({ "8002": profile(""), "8003": { displayName: "x" } });

    const pictures = await avatarsOf(z.api, ["8002", "8003", "8004"]);

    expect(Object.fromEntries(pictures)).toEqual({ "8002": null, "8003": null, "8004": null });
  });

  it("lets a failure of Zalo reach the caller", async () => {
    const broken = {
      getUserInfo: async () => {
        throw new Error("fetch failed");
      },
    } as unknown as Pick<API, "getUserInfo">;

    await expect(avatarsOf(broken, ["8002"])).rejects.toThrow("fetch failed");
  });
});
