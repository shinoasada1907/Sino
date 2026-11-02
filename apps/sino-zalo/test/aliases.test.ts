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

describe("alias routes (zalo-nicknames, D-415)", () => {
  let gateway: FakeZaloGateway;
  let clock: number;
  let app: FastifyInstance;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    clock = Date.parse("2026-11-01T08:00:00.000Z");
    app = buildApp(CONFIG, gateway, { notifier: SILENT, now: () => clock });
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

  function putAlias(friendId: string, alias: string, accountId = "a1") {
    return app.inject({
      method: "PUT",
      url: `/accounts/${accountId}/aliases/${friendId}`,
      headers: AUTH,
      payload: { alias },
    });
  }

  function deleteAlias(friendId: string, accountId = "a1") {
    return app.inject({ method: "DELETE", url: `/accounts/${accountId}/aliases/${friendId}`, headers: AUTH });
  }

  function getAliases(accountId = "a1") {
    return app.inject({ method: "GET", url: `/accounts/${accountId}/aliases`, headers: AUTH });
  }

  it("sets an alias and reads it back", async () => {
    await connect();

    const put = await putAlias("8002", "Em gái");
    expect(put.statusCode).toBe(204);

    const get = await getAliases();
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ items: [{ friendId: "8002", alias: "Em gái" }] });
    expect(gateway.aliasWrites).toEqual([{ op: "set", friendId: "8002", alias: "Em gái" }]);
  });

  it("removes an alias and the original name shows again", async () => {
    await connect();
    gateway.aliases.set("8001", "Mẹ");

    const del = await deleteAlias("8001");
    expect(del.statusCode).toBe(204);

    const get = await getAliases();
    expect(get.json()).toEqual({ items: [] });
    expect(gateway.aliasWrites).toEqual([{ op: "remove", friendId: "8001" }]);
  });

  it("answers 422 ALIAS_REJECTED when Zalo refuses the alias", async () => {
    await connect();
    gateway.nextAliasWrite = "reject";

    const response = await putAlias("9999", "Người lạ");

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ code: "ALIAS_REJECTED", message: "Zalo refused the alias" });
  });

  it("answers 502 ZALO_UNAVAILABLE when Zalo does not answer", async () => {
    await connect();
    gateway.aliasesUnavailable = true;

    const putResponse = await putAlias("8002", "Em gái");
    expect(putResponse.statusCode).toBe(502);
    expect(putResponse.json()).toEqual({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });

    const getResponse = await getAliases();
    expect(getResponse.statusCode).toBe(502);
  });

  it("answers 409 NO_SESSION for every alias route when the account has no live session", async () => {
    const put = await putAlias("8002", "Em gái", "no-such-account");
    const del = await deleteAlias("8002", "no-such-account");
    const get = await getAliases("no-such-account");

    for (const response of [put, del, get]) {
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ code: "NO_SESSION", message: "No live Zalo session for this account" });
    }
  });

  it("rejects an empty alias with 400 before asking Zalo", async () => {
    await connect();

    const response = await putAlias("8002", "");

    expect(response.statusCode).toBe(400);
    expect(gateway.aliasWrites).toEqual([]);
  });

  it("asks Zalo once for two reads within 60 seconds, then again after", async () => {
    await connect();
    gateway.aliases.set("8001", "Mẹ");

    const first = await getAliases();
    expect(first.json()).toEqual({ items: [{ friendId: "8001", alias: "Mẹ" }] });

    clock += 59_000;
    const second = await getAliases();
    expect(second.json()).toEqual({ items: [{ friendId: "8001", alias: "Mẹ" }] });
    expect(gateway.aliasListCalls).toBe(1);

    clock += 2_000;
    await getAliases();
    expect(gateway.aliasListCalls).toBe(2);
  });

  it("asks Zalo again right after a PUT or DELETE even inside the 60-second window", async () => {
    await connect();
    gateway.aliases.set("8001", "Mẹ");
    await getAliases();
    expect(gateway.aliasListCalls).toBe(1);

    await putAlias("8002", "Em gái");
    await getAliases();
    expect(gateway.aliasListCalls).toBe(2);

    await deleteAlias("8001");
    await getAliases();
    expect(gateway.aliasListCalls).toBe(3);
  });

  it("keeps the 60-second memory separate per account", async () => {
    await connect("a1");
    await connect("a2");
    gateway.aliases.set("8001", "Mẹ");

    await getAliases("a1");
    expect(gateway.aliasListCalls).toBe(1);
    await getAliases("a2");
    expect(gateway.aliasListCalls).toBe(2);
  });
});
