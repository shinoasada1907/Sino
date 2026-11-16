import { describe, expect, it } from "vitest";
import type { ThreadType, ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import { catchUp } from "../src/sessions/CatchUp.ts";
import { MessageBuffer } from "../src/sessions/MessageBuffer.ts";

function message(msgId: string, threadType: ThreadType = "USER"): ZaloMessage {
  return {
    msgId,
    threadId: threadType === "USER" ? "8001" : "9001",
    threadType,
    fromId: "8001",
    fromName: "Bạn",
    isSelf: false,
    zaloType: "webchat",
    text: `tin ${msgId}`,
    sentAt: "2026-10-15T08:00:00.000Z",
  };
}

/** Plays Zalo: answers each request with the next scripted page of that type, or an empty one. */
function scriptedZalo(pages: Partial<Record<ThreadType, string[][]>>) {
  const requests: string[] = [];
  const request = async (threadType: ThreadType, lastId: string) => {
    requests.push(`${threadType}:${lastId}`);
    const page = pages[threadType]?.shift() ?? [];
    return page.map((id) => message(id, threadType));
  };
  return { requests, request };
}

const ids = (buffer: MessageBuffer) =>
  buffer.after(null, 1000).messages.map((m) => m.msgId);

describe("catchUp", () => {
  it("brings in what Zalo kept since the cursor after a restart", async () => {
    const buffer = new MessageBuffer();
    const zalo = scriptedZalo({ USER: [["501", "502"]] });

    const reports = await catchUp(zalo.request, buffer, "500");

    expect(ids(buffer)).toEqual(["501", "502"]);
    expect(zalo.requests).toEqual(["USER:500", "GROUP:500", "USER:502"]);
    expect(reports).toEqual([
      { threadType: "USER", pages: 2, messages: 2, joined: true },
      { threadType: "GROUP", pages: 1, messages: 0, joined: true },
    ]);
  });

  it("reads page after page until a page reaches the buffer", async () => {
    const buffer = new MessageBuffer();
    buffer.add([message("900"), message("901")]);
    const zalo = scriptedZalo({
      USER: [["501", "502"], ["503", "504"], ["505", "506"], ["899", "900"]],
    });

    const reports = await catchUp(zalo.request, buffer, "500");

    expect(zalo.requests.filter((r) => r.startsWith("USER"))).toEqual([
      "USER:500",
      "USER:502",
      "USER:504",
      "USER:506",
    ]);
    expect(ids(buffer)).toEqual(["501", "502", "503", "504", "505", "506", "899", "900", "901"]);
    expect(reports[0]).toEqual({ threadType: "USER", pages: 4, messages: 7, joined: true });
  });

  it("stops after 10 pages of one type and keeps what it read", async () => {
    const buffer = new MessageBuffer();
    const endless = Array.from({ length: 12 }, (_, i) => [String(1000 + i)]);
    const zalo = scriptedZalo({ GROUP: endless });

    const reports = await catchUp(zalo.request, buffer, "999");

    expect(reports[1]).toEqual({ threadType: "GROUP", pages: 10, messages: 10, joined: false });
    expect(buffer.size).toBe(10);
  });

  it("stops when the time is up", async () => {
    const buffer = new MessageBuffer();
    const never = () => new Promise<ZaloMessage[]>(() => {});

    const reports = await catchUp(never, buffer, "500", { timeoutMs: 20 });

    expect(reports).toEqual([
      { threadType: "USER", pages: 0, messages: 0, joined: false },
      { threadType: "GROUP", pages: 0, messages: 0, joined: false },
    ]);
  });

  it("stops one type when its request fails, without stopping the other", async () => {
    const buffer = new MessageBuffer();
    const request = async (threadType: ThreadType, lastId: string) => {
      if (threadType === "USER") throw new Error("socket closed");
      return lastId === "500" ? [message("501", "GROUP")] : [];
    };

    const reports = await catchUp(request, buffer, "500");

    expect(reports).toEqual([
      { threadType: "USER", pages: 0, messages: 0, joined: false },
      { threadType: "GROUP", pages: 2, messages: 1, joined: true },
    ]);
  });
});
