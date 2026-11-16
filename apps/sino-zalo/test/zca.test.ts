import { describe, expect, it } from "vitest";
import { GroupMessage, type TGroupMessage, type TMessage, UserMessage } from "zca-js";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";

const OWN_ID = "7001";

/** The fields of a Zalo message that sino-zalo reads; the rest stay out of the test. */
function data(fields: Partial<TMessage>): TMessage {
  return {
    msgId: "100",
    msgType: "webchat",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content: "Xin chào",
    ...fields,
  } as TMessage;
}

describe("toZaloMessage", () => {
  it("reads a 1-1 message from a friend", () => {
    expect(toZaloMessage(new UserMessage(OWN_ID, data({})))).toEqual({
      msgId: "100",
      threadId: "8001",
      threadType: "USER",
      fromId: "8001",
      fromName: "Bạn A",
      isSelf: false,
      zaloType: "webchat",
      text: "Xin chào",
      sentAt: "2025-10-15T08:00:00.000Z",
    });
  });

  it("reads a message the account sent from the phone", () => {
    const message = toZaloMessage(
      new UserMessage(OWN_ID, data({ uidFrom: "0", idTo: "8001", dName: "Tôi" })),
    );

    expect(message).toMatchObject({ threadId: "8001", fromId: OWN_ID, isSelf: true });
  });

  it("reads a group message", () => {
    const group = data({ idTo: "9001", uidFrom: "8002" }) as TGroupMessage;

    expect(toZaloMessage(new GroupMessage(OWN_ID, group))).toMatchObject({
      threadId: "9001",
      threadType: "GROUP",
      fromId: "8002",
    });
  });

  it("has no text for a message that is not text", () => {
    const photo = data({ msgType: "chat.photo", content: { title: "", href: "https://a/b.jpg" } });

    expect(toZaloMessage(new UserMessage(OWN_ID, photo))).toMatchObject({
      zaloType: "chat.photo",
      text: null,
    });
  });

  it("uses the time it read the message when Zalo sends none it can read", () => {
    for (const ts of ["", "abc"]) {
      const message = toZaloMessage(new UserMessage(OWN_ID, data({ ts })));

      expect(Math.abs(Date.parse(message.sentAt) - Date.now())).toBeLessThan(60_000);
    }
  });
});
