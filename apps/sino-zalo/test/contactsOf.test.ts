import { describe, expect, it } from "vitest";
import type { API } from "zca-js";
import { contactsOf } from "../src/gateway/ZcaGateway.ts";

interface FakeUser {
  userId: string;
  displayName: string;
  zaloName: string;
  avatar: string;
}

/** zca-js's three list calls as `contactsOf` sees them; `getGroupInfo` answers what `groups` has for each id. */
function api(
  friends: FakeUser[],
  groups: Record<string, { name: string; avt: string; fullAvt: string; totalMember: number }>,
  options: { failBatch?: number; leaveOut?: string } = {},
) {
  const batches: string[][] = [];
  return {
    batches,
    api: {
      getAllFriends: async () => friends,
      getAllGroups: async () => ({ version: "1", gridVerMap: Object.fromEntries(Object.keys(groups).map((id) => [id, "1"])) }),
      getGroupInfo: async (groupIds: string | string[]) => {
        const batch = Array.isArray(groupIds) ? groupIds : [groupIds];
        batches.push(batch);
        if (options.failBatch === batches.length) {
          throw new Error("fetch failed");
        }
        const answered = batch.filter((id) => id !== options.leaveOut);
        return { removedsGroup: [], unchangedsGroup: [], gridInfoMap: Object.fromEntries(answered.map((id) => [id, groups[id]])) };
      },
    } as unknown as Pick<API, "getAllFriends" | "getAllGroups" | "getGroupInfo">,
  };
}

function manyGroups(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`g${i}`, { name: `Nhóm ${i}`, avt: "", fullAvt: "", totalMember: 5 }]),
  );
}

describe("contactsOf", () => {
  it("maps friends to their Zalo name and picture, and groups to name, picture and member count", async () => {
    const z = api(
      [{ userId: "8001", displayName: "Nguyễn Thị Đào", zaloName: "Đào", avatar: "https://a/1.jpg" }],
      { "6001": { name: "Nhà mình", avt: "https://a/small.jpg", fullAvt: "https://a/full.jpg", totalMember: 12 } },
    );

    const contacts = await contactsOf(z.api);

    expect(contacts).toEqual({
      friends: [{ id: "8001", name: "Nguyễn Thị Đào", avatarUrl: "https://a/1.jpg" }],
      groups: [{ id: "6001", name: "Nhà mình", avatarUrl: "https://a/full.jpg", memberCount: 12 }],
    });
  });

  it("falls back to the Zalo name, then the id, and gives null for a missing picture", async () => {
    const z = api(
      [
        { userId: "8001", displayName: "", zaloName: "Đào", avatar: "" },
        { userId: "8002", displayName: "", zaloName: "", avatar: "" },
      ],
      { "6001": { name: "", avt: "https://a/small.jpg", fullAvt: "", totalMember: Number.NaN } },
    );

    const contacts = await contactsOf(z.api);

    expect(contacts.friends).toEqual([
      { id: "8001", name: "Đào", avatarUrl: null },
      { id: "8002", name: "8002", avatarUrl: null },
    ]);
    expect(contacts.groups).toEqual([{ id: "6001", name: "6001", avatarUrl: "https://a/small.jpg", memberCount: null }]);
  });

  it("asks for the groups 50 at a time, one call after the other", async () => {
    const z = api([], manyGroups(120));

    const contacts = await contactsOf(z.api);

    expect(z.batches.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(contacts.groups).toHaveLength(120);
  });

  it("skips a group Zalo leaves out of its answer", async () => {
    const z = api([], manyGroups(3), { leaveOut: "g1" });

    const contacts = await contactsOf(z.api);

    expect(contacts.groups.map((group) => group.id)).toEqual(["g0", "g2"]);
  });

  it("lets a failed batch reach the caller, so no partial list comes out", async () => {
    const z = api([], manyGroups(120), { failBatch: 2 });

    await expect(contactsOf(z.api)).rejects.toThrow("fetch failed");
    expect(z.batches).toHaveLength(2);
  });

  it("does not ask for group details when the account is in no group", async () => {
    const z = api([{ userId: "8001", displayName: "A", zaloName: "A", avatar: "" }], {});

    const contacts = await contactsOf(z.api);

    expect(contacts.groups).toEqual([]);
    expect(z.batches).toEqual([]);
  });
});
