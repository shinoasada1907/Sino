import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import type { Notifier } from "../src/notify.ts";

const SECRET = "k".repeat(32);
const AUTH = { authorization: `Bearer ${SECRET}` };
const CONFIG = { host: "127.0.0.1", port: 0, secret: SECRET, apiUrl: "http://127.0.0.1:8080" };
const SESSION = { cookie: [{ key: "zpw_sek", value: "cookie-one" }], imei: "imei-one", userAgent: "Mozilla/5.0" };
const SILENT: Notifier = { sessionEnded: async () => {}, messagesArrived: () => {} };

describe("contact route (zalo-contacts, D-425)", () => {
  let gateway: FakeZaloGateway;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    app = buildApp(CONFIG, gateway, { notifier: SILENT, contactsTimeoutMs: 50 });
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect(accountId = "a1") {
    const response = await app.inject({
      method: "PUT",
      url: `/accounts/${accountId}/session`,
      headers: AUTH,
      payload: { session: SESSION },
    });
    expect(response.statusCode).toBe(204);
  }

  function getContacts(accountId = "a1") {
    return app.inject({ method: "GET", url: `/accounts/${accountId}/contacts`, headers: AUTH });
  }

  it("lists every friend and group of the account", async () => {
    await connect();
    gateway.friends.push(
      { id: "8001", name: "Nguyễn Thị Đào", avatarUrl: "https://s120.zalo/avatar/a.jpg" },
      { id: "8002", name: "Trần Văn B", avatarUrl: null },
    );
    gateway.groups.push({ id: "6001", name: "Nhà mình", avatarUrl: null, memberCount: 12 });

    const response = await getContacts();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      friends: [
        { id: "8001", name: "Nguyễn Thị Đào", avatarUrl: "https://s120.zalo/avatar/a.jpg" },
        { id: "8002", name: "Trần Văn B", avatarUrl: null },
      ],
      groups: [{ id: "6001", name: "Nhà mình", avatarUrl: null, memberCount: 12 }],
    });
  });

  it("answers empty lists for an account with no friends and no groups", async () => {
    await connect();

    const response = await getContacts();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ friends: [], groups: [] });
  });

  it("answers 502 ZALO_UNAVAILABLE, and no list at all, when Zalo fails", async () => {
    await connect();
    gateway.friends.push({ id: "8001", name: "Nguyễn Thị Đào", avatarUrl: null });
    gateway.contactsUnavailable = true;

    const response = await getContacts();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });
  });

  it("answers 502 ZALO_UNAVAILABLE once Zalo takes longer than the time limit", async () => {
    await connect();
    gateway.nextContacts = "hang";

    const response = await getContacts();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });
    expect(gateway.contactsCalls).toBe(1);
  });

  it("answers 409 NO_SESSION for an account with no live session, without asking Zalo", async () => {
    const response = await getContacts("no-such-account");

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: "NO_SESSION", message: "No live Zalo session for this account" });
    expect(gateway.contactsCalls).toBe(0);
  });

  it("answers 401 without the shared secret", async () => {
    await connect();

    const response = await app.inject({ method: "GET", url: "/accounts/a1/contacts" });

    expect(response.statusCode).toBe(401);
    expect(gateway.contactsCalls).toBe(0);
  });
});
