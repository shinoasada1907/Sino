import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import {
  FAKE_QR_IMAGE,
  FakeZaloGateway,
} from "../src/gateway/FakeZaloGateway.ts";
import { LoginStore, QrUnavailableError } from "../src/logins/LoginStore.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };

const PROFILE = { ownId: "7001", displayName: "Nick phụ", avatarUrl: null };
const SESSION = {
  cookie: [{ key: "zpw_sek", value: "abc" }],
  imei: "imei-1",
  userAgent: "Mozilla/5.0",
};

describe("QR login routes", () => {
  let gateway: FakeZaloGateway;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    app = buildApp({ host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" }, gateway);
  });

  afterEach(async () => {
    await app.close();
  });

  async function startLogin(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/logins",
      headers: AUTH,
    });
    expect(response.statusCode).toBe(201);
    return response.json().loginId;
  }

  async function stateOf(loginId: string) {
    return app.inject({
      method: "GET",
      url: `/logins/${loginId}`,
      headers: AUTH,
    });
  }

  it("starts a login with the QR image and when it expires", async () => {
    const before = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/logins",
      headers: AUTH,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.loginId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.qrImage).toBe(FAKE_QR_IMAGE);
    const lifetime = Date.parse(body.expiresAt) - before;
    expect(lifetime).toBeGreaterThanOrEqual(100_000);
    expect(lifetime).toBeLessThan(101_000);
  });

  it("waits until the code is scanned", async () => {
    const loginId = await startLogin();

    expect((await stateOf(loginId)).json()).toEqual({ state: "WAITING" });
  });

  it("names the account once the code is scanned", async () => {
    const loginId = await startLogin();
    gateway.latest().events.scanned("Nick phụ", null);

    expect((await stateOf(loginId)).json()).toEqual({
      state: "SCANNED",
      displayName: "Nick phụ",
    });
  });

  it("answers 404 for a login it does not know", async () => {
    const response = await stateOf("nope");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "UNKNOWN_LOGIN",
      message: "No such login",
    });
  });
  it("hands over the profile and the session once, then forgets the login", async () => {
    const loginId = await startLogin();
    gateway.latest().events.scanned("Nick phụ", null);
    gateway.latest().events.done(PROFILE, SESSION);

    const first = await stateOf(loginId);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      state: "DONE",
      profile: PROFILE,
      session: SESSION,
    });

    expect((await stateOf(loginId)).statusCode).toBe(404);
  });
  it("says when the code expired, as often as asked", async () => {
    const loginId = await startLogin();
    gateway.latest().events.expired();

    expect((await stateOf(loginId)).json()).toEqual({ state: "EXPIRED" });
    expect((await stateOf(loginId)).json()).toEqual({ state: "EXPIRED" });
  });

  it("says when the phone declined", async () => {
    const loginId = await startLogin();
    gateway.latest().events.scanned("Nick phụ", null);
    gateway.latest().events.declined();

    expect((await stateOf(loginId)).json()).toEqual({ state: "DECLINED" });
  });

  it("says when the login failed after the code was shown", async () => {
    const loginId = await startLogin();
    gateway.latest().events.failed("ZaloApiError: Can't login");

    expect((await stateOf(loginId)).json()).toEqual({ state: "FAILED" });
  });

  it("ignores what Zalo says after the login has ended", async () => {
    const loginId = await startLogin();
    gateway.latest().events.expired();
    gateway.latest().events.done(PROFILE, SESSION);

    expect((await stateOf(loginId)).json()).toEqual({ state: "EXPIRED" });
  });
  it("answers 502 when Zalo gives no QR code", async () => {
    gateway.nextQr = "fail";

    const response = await app.inject({
      method: "POST",
      url: "/logins",
      headers: AUTH,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: "QR_UNAVAILABLE",
      message: "Zalo did not give a QR code",
    });
  });
  it("cancels a login and forgets it", async () => {
    const loginId = await startLogin();

    const response = await app.inject({
      method: "DELETE",
      url: `/logins/${loginId}`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(204);
    expect(gateway.latest().cancelled).toBe(true);
    expect((await stateOf(loginId)).statusCode).toBe(404);
  });

  it("answers 204 when cancelling a login it does not know", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/logins/nope",
      headers: AUTH,
    });

    expect(response.statusCode).toBe(204);
  });
});

describe("LoginStore limits", () => {
  const silent = { warn: () => {} };

  it("gives up when Zalo sends no QR code in time", async () => {
    const gateway = new FakeZaloGateway();
    gateway.nextQr = "none";
    const store = new LoginStore(gateway, { log: silent, qrWaitMs: 20 });

    await expect(store.start()).rejects.toBeInstanceOf(QrUnavailableError);
    expect(gateway.latest().cancelled).toBe(true);
  });

  it("forgets a login five minutes after it started", async () => {
    let now = 0;
    const gateway = new FakeZaloGateway();
    const store = new LoginStore(gateway, { log: silent, now: () => now });
    const { loginId } = await store.start();

    now = 5 * 60_000 - 1;
    expect(store.get(loginId)).toEqual({ state: "WAITING" });

    now = 5 * 60_000 + 1;
    expect(store.get(loginId)).toBeUndefined();
    expect(gateway.latest().cancelled).toBe(true);
  });
});
