import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { GroupMessage, Reaction, Reactions, UserMessage, ZaloApiError, type TMessage, type TReaction } from "zca-js";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { REACTION_CODES, type ZaloMessage, ZaloRejectedError, ZaloUnavailableError } from "../src/gateway/ZaloGateway.ts";
import { react, toZaloMessage, toZaloReaction } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";

// zalo-reactions RX-02 (D-381): a reaction event is one entry of the queue and every message carries its cliMsgId.
// RX-03 (D-389): the route that sets, changes and takes back a reaction.

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };

function event(overrides: Partial<TReaction> = {}, content: Partial<TReaction["content"]> = {}): TReaction {
  return {
    actionId: "1",
    msgId: "7000000000000000100",
    cliMsgId: "55",
    msgType: "webchat",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    content: {
      rMsg: [{ gMsgID: "400", cMsgID: "399", msgType: 1 }],
      rIcon: Reactions.HEART,
      rType: 5,
      source: 6,
      ...content,
    },
    ts: "1760515200000",
    ttl: 0,
    ...overrides,
  };
}

function entry(msgId: string, overrides: Partial<ZaloMessage> = {}): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn A",
    isSelf: false,
    zaloType: "reaction",
    text: null,
    sentAt: "2026-10-15T08:00:00.000Z",
    reaction: { icon: "/-heart", targets: [{ msgId: "400", cliMsgId: "399" }] },
    ...overrides,
  };
}

function text(msgId: string): ZaloMessage {
  const { reaction: _reaction, ...rest } = entry(msgId);
  return { ...rest, zaloType: "webchat", text: "tin" };
}

describe("toZaloReaction", () => {
  it("makes one entry of the event: the reactor, the moment, the code and the target", () => {
    const message = toZaloReaction(new Reaction("7001", event(), false));

    expect(message).toMatchObject({
      msgId: "7000000000000000100",
      threadId: "8001",
      threadType: "USER",
      fromId: "8001",
      fromName: "Bạn A",
      isSelf: false,
      zaloType: "reaction",
      text: null,
      sentAt: "2025-10-15T08:00:00.000Z",
      cliMsgId: "55",
      reaction: { icon: "/-heart", targets: [{ msgId: "400", cliMsgId: "399" }] },
    });
  });

  it("keeps every target of an event and takes the group as the thread", () => {
    const data = event(
      { idTo: "9001" },
      {
        rMsg: [
          { gMsgID: "400", cMsgID: "399", msgType: 1 },
          { gMsgID: "401", cMsgID: "398", msgType: 1 },
        ],
      },
    );

    const message = toZaloReaction(new Reaction("7001", data, true));

    expect(message.threadId).toBe("9001");
    expect(message.threadType).toBe("GROUP");
    expect(message.reaction?.targets).toEqual([
      { msgId: "400", cliMsgId: "399" },
      { msgId: "401", cliMsgId: "398" },
    ]);
  });

  it("marks the account's own reaction from another device", () => {
    const message = toZaloReaction(new Reaction("7001", event({ uidFrom: "0", idTo: "8001" }), false));

    expect(message.isSelf).toBe(true);
    expect(message.fromId).toBe("7001");
    expect(message.threadId).toBe("8001");
  });

  it.each([
    ["an empty icon", { rIcon: "" as Reactions, rType: 5 }],
    ["rType -1", { rIcon: Reactions.HEART, rType: -1 }],
  ])("reads a removal as an empty icon: %s", (_name, content) => {
    expect(toZaloReaction(new Reaction("7001", event({}, content), false)).reaction?.icon).toBe("");
  });

  it("describes the event without the icon, a name or an id", () => {
    const message = toZaloReaction(new Reaction("7001", event(), false));

    expect(message.reactionShape).toBe(
      "targets:1,targetMsgTypes:1,removed:false,rType:positive,source:6,eventMsgId:numeric,targetIds:numeric,eventCliMsgId:present",
    );
    expect(message.reactionShape).not.toContain("heart");
    expect(message.reactionShape).not.toContain("Bạn");
    expect(message.reactionShape).not.toContain("400");
  });
});

describe("toZaloMessage keeps what a quote and a reaction need", () => {
  const data = (extra: object): TMessage =>
    ({
      msgId: "100",
      cliMsgId: "99",
      msgType: "webchat",
      uidFrom: "8001",
      idTo: "0",
      dName: "A",
      ts: "1760515200000",
      content: "xin chào",
      ...extra,
    }) as TMessage;

  it("carries cliMsgId, ttl and propertyExt of a text, of a 1-1 chat and of a group", () => {
    const propertyExt = { color: 0, size: 0, type: 0, subType: 0, ext: "" };

    const user = toZaloMessage(new UserMessage("7001", data({ ttl: 0, propertyExt })));
    const group = toZaloMessage(new GroupMessage("7001", data({ idTo: "9001", ttl: 3600 }) as never));

    expect(user).toMatchObject({ cliMsgId: "99", ttl: 0, propertyExt });
    expect(group).toMatchObject({ cliMsgId: "99", ttl: 3600 });
    expect(group.propertyExt).toBeUndefined();
  });

  it("leaves cliMsgId out when Zalo gave none", () => {
    const message = toZaloMessage(new UserMessage("7001", data({ cliMsgId: "" })));

    expect("cliMsgId" in message).toBe(false);
  });
});

describe("react (zca-js)", () => {
  const request = { threadId: "8001", threadType: "USER", msgId: "400", cliMsgId: "399", icon: "/-heart" } as const;
  const addFn = () => vi.fn<(icon: unknown, dest: unknown) => Promise<unknown>>().mockResolvedValue({ msgIds: [] });

  it("lists exactly the codes of the library, without the empty one", () => {
    expect([...REACTION_CODES].sort()).toEqual(Object.values(Reactions).filter((code) => code !== "").sort());
  });

  it("sets a code as the library's enum value, to the right thread type", async () => {
    const add = addFn();

    await react(add as never, request);
    await react(add as never, { ...request, threadType: "GROUP", icon: ":>" });

    expect(add.mock.calls[0]).toEqual(["/-heart", { data: { msgId: "400", cliMsgId: "399" }, threadId: "8001", type: 0 }]);
    expect(add.mock.calls[1]).toEqual([":>", { data: { msgId: "400", cliMsgId: "399" }, threadId: "8001", type: 1 }]);
  });

  it("takes a reaction back with the custom -1 reaction, never Reactions.NONE", async () => {
    const add = addFn();

    await react(add as never, { ...request, icon: "" });

    expect(add.mock.calls[0]?.[0]).toEqual({ rType: -1, source: 6, icon: "" });
  });

  it("does not call Zalo for a code it does not know", async () => {
    const add = addFn();

    await expect(react(add as never, { ...request, icon: ":not-a-zalo-code" })).rejects.toBeInstanceOf(ZaloRejectedError);
    expect(add).not.toHaveBeenCalled();
  });

  it("reads a Zalo error code as a refusal and any other failure as Zalo not answering", async () => {
    const refused = vi.fn<() => Promise<never>>().mockRejectedValue(new ZaloApiError("Tham số không hợp lệ", 114));
    const broken = vi.fn<() => Promise<never>>().mockRejectedValue(new TypeError("fetch failed"));

    await expect(react(refused as never, request)).rejects.toBeInstanceOf(ZaloRejectedError);
    await expect(react(broken as never, request)).rejects.toBeInstanceOf(ZaloUnavailableError);
  });
});

class RecordingNotifier implements Notifier {
  readonly arrived: string[] = [];
  async sessionEnded(): Promise<void> {}
  messagesArrived(ownId: string): void {
    this.arrived.push(ownId);
  }
}

describe("reactions in the queue and the route", () => {
  let gateway: FakeZaloGateway;
  let notifier: RecordingNotifier;
  let clock: number;
  let logLines: string[];
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    notifier = new RecordingNotifier();
    clock = 1_000_000;
    logLines = [];
    app = buildApp(CONFIG, gateway, {
      notifier,
      now: () => clock,
      sendTimeoutMs: 50,
      logger: { level: "info", stream: { write: (line: string) => logLines.push(line) } },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect() {
    const response = await app.inject({ method: "PUT", url: "/accounts/a1/session", headers: AUTH, payload: { session: SESSION } });
    expect(response.statusCode).toBe(204);
    const listener = gateway.latestListener();
    listener.events.connected();
    listener.events.ready();
    return listener;
  }

  const read = (query = "") => app.inject({ method: "GET", url: `/accounts/a1/messages${query}`, headers: AUTH });
  const post = (payload: object) => app.inject({ method: "POST", url: "/accounts/a1/reactions", headers: AUTH, payload });
  const body = (overrides: Record<string, unknown> = {}) => ({
    threadId: "8001",
    threadType: "USER",
    msgId: "400",
    cliMsgId: "399",
    icon: "/-heart",
    ...overrides,
  });

  describe("the queue", () => {
    it("serves a reaction through the cursor, as an entry, and tells the webhook", async () => {
      const listener = await connect();
      listener.receive(text("500"));

      listener.receive(entry("501"));
      const page = (await read("?after=500")).json();

      expect(page.messages).toEqual([entry("501")]);
      expect(notifier.arrived).toEqual(["7001", "7001"]);
    });

    it("serves a removal as a new entry with an empty icon", async () => {
      const listener = await connect();
      listener.receive(entry("501"));

      listener.receive(entry("502", { reaction: { icon: "", targets: [{ msgId: "400", cliMsgId: "399" }] } }));
      const page = (await read("?after=501")).json();

      expect(page.messages).toHaveLength(1);
      expect(page.messages[0].reaction).toEqual({ icon: "", targets: [{ msgId: "400", cliMsgId: "399" }] });
    });

    it("puts a reaction caught up after a restart in the queue", async () => {
      gateway.oldReactionPages.USER.push([entry("501"), entry("502", { fromId: "8002" })]);
      const listener = await connect();

      const page = (await read("?after=500")).json();

      expect(page.messages.map((m: ZaloMessage) => m.msgId)).toEqual(["501", "502"]);
      expect(listener.reactionRequests).toEqual([
        { threadType: "USER", lastId: "500" },
        { threadType: "GROUP", lastId: "500" },
        { threadType: "USER", lastId: "502" },
      ]);
    });

    it("catches up messages and reactions together, in msgId order", async () => {
      gateway.oldPages.USER.push([text("501")]);
      gateway.oldReactionPages.GROUP.push([entry("502", { threadType: "GROUP", threadId: "9001" })]);
      await connect();

      const page = (await read("?after=500")).json();

      expect(page.messages.map((m: ZaloMessage) => [m.msgId, m.zaloType])).toEqual([
        ["501", "webchat"],
        ["502", "reaction"],
      ]);
    });

    it("keeps a reaction page Zalo sends on its own", async () => {
      const listener = await connect();

      listener.events.oldReactions([entry("601")], "USER");

      expect((await read()).json().messages.map((m: ZaloMessage) => m.msgId)).toEqual(["601"]);
      expect(notifier.arrived).toEqual(["7001"]);
    });

    it("logs the shape of a reaction and never its icon or the reactor's name", async () => {
      const listener = await connect();
      listener.receive(text("500"));
      listener.receive(entry("501", { reactionShape: "targets:1,removed:false" }));
      listener.receive(entry("9999999999", { fromName: "Tên Riêng", reactionShape: "targets:1,removed:false" }));

      const lines = logLines.filter((line) => line.includes("Zalo message") && line.includes('"zaloType":"reaction"'));

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('"reactionShape":"targets:1,removed:false"');
      expect(lines[0]).toContain('"reactionAboveNewest":true');
      expect(lines[0]).toContain('"targetsHeld":0');
      expect(lines.join("")).not.toContain("/-heart");
      expect(lines.join("")).not.toContain("Tên Riêng");
      expect(lines.join("")).not.toContain("Bạn A");
    });

    it("logs whether a message came with its cliMsgId, never the value", async () => {
      const listener = await connect();

      listener.receive({ ...text("500"), cliMsgId: "123456" });
      listener.receive(text("501"));

      const lines = logLines.filter((line) => line.includes("Zalo message"));
      expect(lines[0]).toContain('"hasCliMsgId":true');
      expect(lines[0]).not.toContain("123456");
      expect(lines[1]).not.toContain("hasCliMsgId");
    });

    it("logs which types of message the targets are", async () => {
      const listener = await connect();
      listener.receive({ ...text("400"), zaloType: "chat.photo", text: null });

      listener.receive(entry("401", { reactionShape: "targets:1" }));

      const line = logLines.find((l) => l.includes('"msgId":"401"')) ?? "";
      expect(line).toContain('"targetsHeld":1');
      expect(line).toContain('"targetZaloTypes":"chat.photo"');
    });
  });

  describe("POST /accounts/{accountId}/reactions", () => {
    it("sets a reaction and answers 204", async () => {
      await connect();

      const response = await post(body());

      expect(response.statusCode).toBe(204);
      expect(gateway.reactions).toEqual([body()]);
    });

    it("takes a reaction back with an empty icon", async () => {
      await connect();

      const response = await post(body({ icon: "" }));

      expect(response.statusCode).toBe(204);
      expect(gateway.reactions).toEqual([body({ icon: "" })]);
    });

    it("changes a reaction a second later", async () => {
      await connect();
      await post(body());
      clock += 1_000;

      const response = await post(body({ icon: ":>", threadType: "GROUP", threadId: "9001" }));

      expect(response.statusCode).toBe(204);
      expect(gateway.reactions.at(-1)).toEqual(body({ icon: ":>", threadType: "GROUP", threadId: "9001" }));
    });

    it.each([
      ["a code Zalo does not know", { icon: ":not-a-zalo-code" }],
      ["an id that is not a number", { msgId: "abc" }],
      ["a cliMsgId that is empty", { cliMsgId: "" }],
      ["a thread type that is neither", { threadType: "CHANNEL" }],
      ["a body without an icon", { icon: undefined }],
    ])("answers 400 and does not ask Zalo for %s", async (_name, overrides) => {
      await connect();

      const response = await post(body(overrides));

      expect(response.statusCode).toBe(400);
      expect(gateway.reactions).toEqual([]);
    });

    it("does not use up the turn of the account on a request it refuses", async () => {
      await connect();
      await post(body({ icon: ":not-a-zalo-code" }));

      expect((await post(body())).statusCode).toBe(204);
    });

    it("answers 404 for an account without a session", async () => {
      const response = await post(body());

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("UNKNOWN_ACCOUNT");
    });

    it("answers 410 once the session ended", async () => {
      const listener = await connect();
      listener.close(3003, "KickConnection");

      const response = await post(body());

      expect(response.statusCode).toBe(410);
      expect(response.json().code).toBe("SESSION_ENDED");
      expect(gateway.reactions).toEqual([]);
    });

    it("answers 422 when Zalo refuses", async () => {
      await connect();
      gateway.nextReact = "reject";

      const response = await post(body());

      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("REJECTED");
    });

    it("answers 502 when Zalo does not answer", async () => {
      await connect();
      gateway.nextReact = "fail";

      const response = await post(body());

      expect(response.statusCode).toBe(502);
      expect(response.json().code).toBe("ZALO_UNAVAILABLE");
    });

    it("answers 504 when Zalo takes too long, and survives the late answer", async () => {
      await connect();
      gateway.nextReact = "hold";

      const response = await post(body());
      gateway.releaseHeldReacts();

      expect(response.statusCode).toBe(504);
      expect(response.json().code).toBe("OUTCOME_UNKNOWN");
    });

    it("shares the turn of the account with sending a message", async () => {
      await connect();
      const send = (clientMessageId: string) =>
        app.inject({
          method: "POST",
          url: "/accounts/a1/messages",
          headers: AUTH,
          payload: { threadId: "8001", threadType: "USER", text: "xin chào", clientMessageId },
        });

      expect((await post(body())).statusCode).toBe(204);
      const tooSoon = await send("c-1");
      expect(tooSoon.statusCode).toBe(429);
      expect(gateway.sent).toEqual([]);

      clock += 1_000;
      expect((await send("c-1")).statusCode).toBe(201);
      expect((await post(body())).statusCode).toBe(429);
      expect(gateway.reactions).toHaveLength(1);
    });

    it("needs the shared secret", async () => {
      const response = await app.inject({ method: "POST", url: "/accounts/a1/reactions", payload: body() });

      expect(response.statusCode).toBe(401);
    });

    it("logs the ids and whether it was a removal, never the icon", async () => {
      await connect();
      await post(body());
      clock += 1_000;
      await post(body({ icon: "" }));

      const lines = logLines.filter((line) => line.includes("Zalo reaction sent"));

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('"removed":false');
      expect(lines[1]).toContain('"removed":true');
      expect(lines.join("")).not.toContain("/-heart");
    });
  });
});
