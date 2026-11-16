import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";
import {
  SessionEndedError,
  SessionManager,
  UnknownAccountError,
} from "../src/sessions/SessionManager.ts";
import { ZaloUnavailableError } from "../src/gateway/ZaloGateway.ts";

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
const RESCANNED = {
  cookie: [{ key: "zpw_sek", value: "cookie-two" }],
  imei: "imei-two",
  userAgent: "Mozilla/5.0",
};

class RecordingNotifier implements Notifier {
  readonly ended: string[] = [];

  async sessionEnded(ownId: string): Promise<void> {
    this.ended.push(ownId);
  }

  messagesArrived(): void {}
}

describe("session routes", () => {
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

  function putSession(session: object) {
    return app.inject({
      method: "PUT",
      url: "/accounts/a1/session",
      headers: AUTH,
      payload: { session },
    });
  }

  function deleteSession() {
    return app.inject({
      method: "DELETE",
      url: "/accounts/a1/session",
      headers: AUTH,
    });
  }

  async function counts() {
    const response = await app.inject({ method: "GET", url: "/health" });
    return response.json().sessions;
  }

  it("logs in with the session and starts one listener", async () => {
    const response = await putSession(SESSION);

    expect(response.statusCode).toBe(204);
    expect(gateway.sessionLogins).toEqual([SESSION]);
    expect(gateway.runningListeners()).toHaveLength(1);
    expect(await counts()).toEqual({ live: 1, ended: 0 });
  });

  it("does nothing when the same session comes again while it lives", async () => {
    await putSession(SESSION);

    const response = await putSession(SESSION);

    expect(response.statusCode).toBe(204);
    expect(gateway.sessionLogins).toHaveLength(1);
    expect(gateway.runningListeners()).toHaveLength(1);
    expect(gateway.latestListener().starts).toBe(1);
  });

  it("logs in once when the same session comes twice at the same time", async () => {
    const [first, second] = await Promise.all([
      putSession(SESSION),
      putSession(SESSION),
    ]);

    expect([first.statusCode, second.statusCode]).toEqual([204, 204]);
    expect(gateway.sessionLogins).toHaveLength(1);
    expect(gateway.runningListeners()).toHaveLength(1);
  });

  it("ends the session and tells sino-api when Zalo kicks the listener (3003)", async () => {
    await putSession(SESSION);

    gateway.latestListener().close(3003, "KickConnection");

    expect(notifier.ended).toEqual(["7001"]);
    expect(gateway.runningListeners()).toHaveLength(0);
    expect(await counts()).toEqual({ live: 0, ended: 1 });
  });

  it("ends the session on a duplicate connection (3000) too", async () => {
    await putSession(SESSION);

    gateway.latestListener().close(3000, "DuplicateConnection");

    expect(notifier.ended).toEqual(["7001"]);
    expect(await counts()).toEqual({ live: 0, ended: 1 });
  });

  it("answers 410 without calling Zalo when the ended session comes again", async () => {
    await putSession(SESSION);
    gateway.latestListener().close(3003, "KickConnection");

    const response = await putSession(SESSION);

    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({
      code: "SESSION_ENDED",
      message: "The Zalo session has ended",
    });
    expect(gateway.sessionLogins).toHaveLength(1);
  });

  it("takes the new session after the user scanned again", async () => {
    await putSession(SESSION);
    gateway.latestListener().close(3003, "KickConnection");

    const response = await putSession(RESCANNED);

    expect(response.statusCode).toBe(204);
    expect(gateway.sessionLogins).toEqual([SESSION, RESCANNED]);
    expect(gateway.runningListeners()).toEqual([gateway.latestListener()]);
    expect(await counts()).toEqual({ live: 1, ended: 0 });
  });

  it("replaces a live session with a different one and stops the old listener", async () => {
    await putSession(SESSION);
    const old = gateway.latestListener();

    const response = await putSession(RESCANNED);

    expect(response.statusCode).toBe(204);
    expect(old.running).toBe(false);
    expect(gateway.runningListeners()).toEqual([gateway.latestListener()]);
    expect(await counts()).toEqual({ live: 1, ended: 0 });
    expect(notifier.ended).toEqual([]);
  });

  it("ends the session when Zalo refuses a different one, stopping the old listener", async () => {
    await putSession(SESSION);
    const old = gateway.latestListener();
    gateway.nextSession = "reject";

    const response = await putSession(RESCANNED);

    expect(response.statusCode).toBe(410);
    expect(old.running).toBe(false);
    expect(gateway.runningListeners()).toHaveLength(0);
    expect(await counts()).toEqual({ live: 0, ended: 1 });

    expect((await putSession(RESCANNED)).statusCode).toBe(410);
    expect(gateway.sessionLogins).toHaveLength(2);
  });

  it("answers 502 and keeps the live session when Zalo does not answer", async () => {
    await putSession(SESSION);
    gateway.nextSession = "unavailable";

    const response = await putSession(RESCANNED);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: "ZALO_UNAVAILABLE",
      message: "Zalo did not answer",
    });
    expect(gateway.runningListeners()).toHaveLength(1);
    expect(await counts()).toEqual({ live: 1, ended: 0 });
    expect((await putSession(SESSION)).statusCode).toBe(204);
    expect(gateway.sessionLogins).toHaveLength(2);
  });

  it("deletes the session and stops its listener", async () => {
    await putSession(SESSION);

    const response = await deleteSession();

    expect(response.statusCode).toBe(204);
    expect(gateway.runningListeners()).toHaveLength(0);
    expect(await counts()).toEqual({ live: 0, ended: 0 });
    await putSession(SESSION);
    expect(gateway.sessionLogins).toHaveLength(2);
  });

  it("answers 204 when deleting a session it does not know", async () => {
    const response = await deleteSession();

    expect(response.statusCode).toBe(204);
  });

  it("refuses a body without a usable session", async () => {
    const response = await putSession({ imei: "imei-one" });

    expect(response.statusCode).toBe(400);
    expect(gateway.sessionLogins).toHaveLength(0);
  });

  it("stops every listener when the app closes", async () => {
    const other = buildApp(CONFIG, gateway, { notifier });
    await other.inject({
      method: "PUT",
      url: "/accounts/a2/session",
      headers: AUTH,
      payload: { session: SESSION },
    });

    await other.close();

    expect(gateway.runningListeners()).toHaveLength(0);
  });
});

describe("SessionManager", () => {
  const silent = { info: () => {}, warn: () => {} };
  let gateway: FakeZaloGateway;
  let notifier: RecordingNotifier;
  let manager: SessionManager;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    notifier = new RecordingNotifier();
    manager = new SessionManager(gateway, notifier, { log: silent });
  });

  afterEach(() => {
    manager.stopAll();
    vi.useRealTimers();
  });

  it("does not know an account it was never given", () => {
    expect(() => manager.requireLive("a1")).toThrow(UnknownAccountError);
  });

  it("gives the ownId of a live session", async () => {
    await manager.put("a1", SESSION);

    expect(manager.requireLive("a1")).toEqual({ ownId: "7001" });
  });

  it("says the session ended once Zalo kicked it", async () => {
    await manager.put("a1", SESSION);

    gateway.latestListener().close(3003, "KickConnection");

    expect(() => manager.requireLive("a1")).toThrow(SessionEndedError);
  });

  it("reconnects after a dropped connection (1006), waiting longer each time up to a minute", async () => {
    vi.useFakeTimers();
    await manager.put("a1", SESSION);
    const listener = gateway.latestListener();

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]) {
      const starts = listener.starts;
      listener.close(1006, "AbnormalClosure");

      vi.advanceTimersByTime(delay - 1);
      expect(listener.starts).toBe(starts);
      vi.advanceTimersByTime(1);
      expect(listener.starts).toBe(starts + 1);
    }

    expect(notifier.ended).toEqual([]);
    expect(manager.requireLive("a1")).toEqual({ ownId: "7001" });
  });

  it("waits one second again once a reconnect has worked", async () => {
    vi.useFakeTimers();
    await manager.put("a1", SESSION);
    const listener = gateway.latestListener();
    listener.close(1006, "AbnormalClosure");
    vi.advanceTimersByTime(1_000);

    listener.events.connected();
    listener.close(1006, "AbnormalClosure");
    vi.advanceTimersByTime(1_000);

    expect(listener.starts).toBe(3);
  });

  it("does not reconnect a listener it stopped itself", async () => {
    vi.useFakeTimers();
    await manager.put("a1", SESSION);
    const listener = gateway.latestListener();

    await manager.remove("a1");
    await Promise.resolve();
    vi.advanceTimersByTime(120_000);

    expect(listener.starts).toBe(1);
    expect(listener.running).toBe(false);
  });

  it("cancels a pending reconnect when the session is deleted", async () => {
    vi.useFakeTimers();
    await manager.put("a1", SESSION);
    const listener = gateway.latestListener();
    listener.close(1006, "AbnormalClosure");

    await manager.remove("a1");
    vi.advanceTimersByTime(120_000);

    expect(listener.starts).toBe(1);
  });

  it("keeps cookies and imei out of the log", async () => {
    const lines: string[] = [];
    const record = (details: object, message: string) => {
      lines.push(`${message} ${JSON.stringify(details)}`);
    };
    manager = new SessionManager(gateway, notifier, {
      log: { info: record, warn: record },
    });

    await manager.put("a1", SESSION);
    const listener = gateway.latestListener();
    listener.events.error("Error: socket hang up");
    listener.close(3003, "KickConnection");
    gateway.nextSession = "reject";
    await expect(manager.put("a1", RESCANNED)).rejects.toBeInstanceOf(
      SessionEndedError,
    );
    gateway.nextSession = "unavailable";
    await expect(manager.put("a2", SESSION)).rejects.toBeInstanceOf(
      ZaloUnavailableError,
    );

    expect(lines.length).toBeGreaterThanOrEqual(5);
    const log = lines.join("\n");
    for (const secret of ["cookie-one", "imei-one", "cookie-two", "imei-two"]) {
      expect(log).not.toContain(secret);
    }
  });
});
