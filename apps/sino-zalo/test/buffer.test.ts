import { describe, expect, it } from "vitest";
import type { ZaloMessage } from "../src/gateway/ZaloGateway.ts";
import { MessageBuffer } from "../src/sessions/MessageBuffer.ts";

function message(msgId: string): ZaloMessage {
  return {
    msgId,
    threadId: "8001",
    threadType: "USER",
    fromId: "8001",
    fromName: "Bạn",
    isSelf: false,
    zaloType: "webchat",
    text: `tin ${msgId}`,
    sentAt: "2026-10-15T08:00:00.000Z",
  };
}

const ids = (messages: readonly ZaloMessage[]) => messages.map((m) => m.msgId);

describe("MessageBuffer", () => {
  it("gives the messages after the cursor, as many as asked, and says when more wait", () => {
    const buffer = new MessageBuffer();
    buffer.add(["100", "101", "102"].map(message));

    const page = buffer.after(100n, 1);

    expect(ids(page.messages)).toEqual(["101"]);
    expect(page.hasMore).toBe(true);
  });

  it("starts at the first message without a cursor", () => {
    const buffer = new MessageBuffer();
    buffer.add(["100", "101"].map(message));

    const page = buffer.after(null, 10);

    expect(ids(page.messages)).toEqual(["100", "101"]);
    expect(page.hasMore).toBe(false);
  });

  it("orders and compares msgId as numbers, not as text", () => {
    const buffer = new MessageBuffer();
    buffer.add(["1000", "999"].map(message));

    expect(ids(buffer.after(null, 10).messages)).toEqual(["999", "1000"]);
    expect(ids(buffer.after(999n, 10).messages)).toEqual(["1000"]);
    expect(buffer.oldest()).toBe(999n);
  });

  it("keeps a message once and reports only the new ones", () => {
    const buffer = new MessageBuffer();
    buffer.add([message("100")]);

    const added = buffer.add(["100", "101"].map(message));

    expect(ids(added)).toEqual(["101"]);
    expect(buffer.size).toBe(2);
    expect(buffer.has("100")).toBe(true);
    expect(buffer.has("102")).toBe(false);
  });

  it("has no oldest message when empty", () => {
    expect(new MessageBuffer().oldest()).toBeNull();
  });

  it("keeps the 1000 newest messages", () => {
    const buffer = new MessageBuffer();
    buffer.add(Array.from({ length: 1000 }, (_, i) => message(String(1000 + i))));

    buffer.add([message("2000")]);

    expect(buffer.size).toBe(1000);
    expect(buffer.oldest()).toBe(1001n);
  });

  it("forgets a message 24 hours after it came in", () => {
    let now = 0;
    const buffer = new MessageBuffer({ now: () => now });
    buffer.add([message("100")]);
    now = 1_000;
    buffer.add([message("101")]);

    now = 24 * 60 * 60_000;
    expect(ids(buffer.after(null, 10).messages)).toEqual(["100", "101"]);

    now = 24 * 60 * 60_000 + 1;
    expect(ids(buffer.after(null, 10).messages)).toEqual(["101"]);
    expect(buffer.oldest()).toBe(101n);
  });

  it("ignores a message whose msgId is not a number", () => {
    const buffer = new MessageBuffer();

    expect(buffer.add([message("abc")])).toEqual([]);
    expect(buffer.size).toBe(0);
  });
});
