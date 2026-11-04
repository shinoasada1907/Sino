import { describe, expect, it } from "vitest";
import type { API } from "zca-js";
import { aliasListOf } from "../src/gateway/ZcaGateway.ts";

/** Zalo's `getAliasList` as `aliasListOf` sees it: pages of items, keyed by the page asked for. */
function api(pages: Record<number, { userId: string; alias: string }[]>) {
  const calls: { count: number; page: number }[] = [];
  return {
    calls,
    api: {
      getAliasList: async (count?: number, page?: number) => {
        calls.push({ count: count ?? 100, page: page ?? 1 });
        return { items: pages[page ?? 1] ?? [], updateTime: "0" };
      },
    } as unknown as Pick<API, "getAliasList">,
  };
}

describe("aliasListOf", () => {
  it("returns everything of a single page without asking for a second one", async () => {
    const z = api({ 1: [{ userId: "8001", alias: "Mẹ" }] });

    const items = await aliasListOf(z.api);

    expect(items).toEqual([{ friendId: "8001", alias: "Mẹ" }]);
    expect(z.calls).toEqual([{ count: 100, page: 1 }]);
  });

  it("joins every page, asking for the next one until a page comes back short", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ userId: `f${i}`, alias: `bạn ${i}` }));
    const z = api({ 1: full, 2: [{ userId: "f100", alias: "bạn 100" }] });

    const items = await aliasListOf(z.api);

    expect(items).toHaveLength(101);
    expect(items[100]).toEqual({ friendId: "f100", alias: "bạn 100" });
    expect(z.calls).toEqual([
      { count: 100, page: 1 },
      { count: 100, page: 2 },
    ]);
  });

  it("stops at an empty list, including for an account with no aliases at all", async () => {
    const z = api({});

    const items = await aliasListOf(z.api);

    expect(items).toEqual([]);
    expect(z.calls).toEqual([{ count: 100, page: 1 }]);
  });

  it("throws instead of looping when Zalo gives the same full page again (D-424)", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ userId: `f${i}`, alias: `bạn ${i}` }));
    const z = api({ 1: full, 2: full, 3: full });

    await expect(aliasListOf(z.api)).rejects.toThrow("Zalo gave page 2 of the aliases");
    expect(z.calls).toHaveLength(2);
  });

  it("throws after 50 full pages instead of asking Zalo for ever (D-424)", async () => {
    const pages: Record<number, { userId: string; alias: string }[]> = {};
    for (let page = 1; page <= 60; page++) {
      pages[page] = Array.from({ length: 100 }, (_, i) => ({ userId: `p${page}-${i}`, alias: "bạn" }));
    }
    const z = api(pages);

    await expect(aliasListOf(z.api)).rejects.toThrow("Zalo gave more than 50 full pages of aliases");
    expect(z.calls).toHaveLength(50);
  });

  it("lists a friend once when the list moved between two pages", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ userId: `f${i}`, alias: `bạn ${i}` }));
    const z = api({ 1: full, 2: [{ userId: "f99", alias: "bạn 99" }, { userId: "f100", alias: "bạn 100" }] });

    const items = await aliasListOf(z.api);

    expect(items).toHaveLength(101);
    expect(items.filter((item) => item.friendId === "f99")).toHaveLength(1);
  });

  it("lets a failure of Zalo reach the caller", async () => {
    const broken = {
      getAliasList: async () => {
        throw new Error("fetch failed");
      },
    } as unknown as Pick<API, "getAliasList">;

    await expect(aliasListOf(broken)).rejects.toThrow("fetch failed");
  });
});
