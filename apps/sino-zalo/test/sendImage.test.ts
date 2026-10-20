import { beforeEach, describe, expect, it } from "vitest";
import { type API, ThreadType as ZcaThreadType, ZaloApiError } from "zca-js";
import { FakeZaloGateway } from "../src/gateway/FakeZaloGateway.ts";
import { type ZaloImage, ZaloRejectedError } from "../src/gateway/ZaloGateway.ts";
import { sendImage } from "../src/gateway/ZcaGateway.ts";
import type { Notifier } from "../src/notify.ts";
import { SessionEndedError, SessionManager, UnknownAccountError } from "../src/sessions/SessionManager.ts";

const SESSION = {
  cookie: [{ key: "zpw_sek", value: "cookie-one" }],
  imei: "imei-one",
  userAgent: "Mozilla/5.0",
};
const SILENT: Notifier = { sessionEnded: async () => {}, messagesArrived: () => {} };
const LOG = { info: () => {}, warn: () => {} };

function picture(overrides: Partial<ZaloImage> = {}): ZaloImage {
  return { data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), fileName: "meo.png", width: 128, height: 96, ...overrides };
}

/** A `sendMessage` that remembers what it was asked and answers like zca-js does for a message that is only a picture. */
function recorder(response: Awaited<ReturnType<API["sendMessage"]>> = { message: null, attachment: [{ msgId: 8372251986276 }] }) {
  const calls: { message: unknown; threadId: string; type: ZcaThreadType | undefined }[] = [];
  const send: API["sendMessage"] = async (message, threadId, type) => {
    calls.push({ message, threadId, type });
    return response;
  };
  return { send, calls };
}

describe("sendImage over zca-js", () => {
  it("sends the picture alone, from its bytes, with the size Zalo asks for, and gives the msgId of the picture", async () => {
    const { send, calls } = recorder();
    const image = picture();

    const msgId = await sendImage(send, "8001", "USER", image);

    expect(msgId).toBe("8372251986276");
    expect(calls).toEqual([
      {
        message: {
          msg: "",
          attachments: [{ data: image.data, filename: "meo.png", metadata: { totalSize: 7, width: 128, height: 96 } }],
        },
        threadId: "8001",
        type: ZcaThreadType.User,
      },
    ]);
  });

  it("sends into a group", async () => {
    const { send, calls } = recorder();

    await sendImage(send, "9001", "GROUP", picture());

    expect(calls.map((call) => [call.threadId, call.type])).toEqual([["9001", ZcaThreadType.Group]]);
  });

  it("keeps the .gif name and the whole size, which is what zca-js picks its GIF branch by and reads from", async () => {
    const { send, calls } = recorder();

    await sendImage(send, "8001", "USER", picture({ fileName: "nhay.gif", width: 200, height: 150 }));

    expect(calls[0]?.message).toMatchObject({
      attachments: [{ filename: "nhay.gif", metadata: { totalSize: 7, width: 200, height: 150 } }],
    });
  });

  it("turns a Zalo error code into a refusal: nothing went out", async () => {
    const refused = sendImage(
      async () => {
        throw new ZaloApiError("Tham số không hợp lệ", 114);
      },
      "8001",
      "USER",
      picture(),
    );

    await expect(refused).rejects.toBeInstanceOf(ZaloRejectedError);
  });

  it("leaves any other failure unknown: the picture may have gone out", async () => {
    for (const error of [new ZaloApiError("Request failed with status code 502"), new TypeError("fetch failed")]) {
      const broken = sendImage(
        async () => {
          throw error;
        },
        "8001",
        "GROUP",
        picture(),
      );

      await expect(broken).rejects.not.toBeInstanceOf(ZaloRejectedError);
    }
  });

  it("leaves it unknown when Zalo answers without the msgId of a picture", async () => {
    for (const response of [
      { message: { msgId: 8372251986275 }, attachment: [] },
      { message: null, attachment: [] },
    ]) {
      const { send } = recorder(response);

      const unclear = sendImage(send, "8001", "USER", picture());

      await expect(unclear).rejects.toThrow("without a msgId");
      await expect(unclear).rejects.not.toBeInstanceOf(ZaloRejectedError);
    }
  });
});

describe("SessionManager.sendImage", () => {
  let gateway: FakeZaloGateway;
  let manager: SessionManager;

  beforeEach(() => {
    gateway = new FakeZaloGateway();
    manager = new SessionManager(gateway, SILENT, { log: LOG });
  });

  it("sends a picture through the live session of the account and gives Zalo's msgId", async () => {
    await manager.put("a1", SESSION);
    const image = picture();

    const msgId = await manager.sendImage("a1", "8001", "USER", image);

    expect(msgId).toBe("9000");
    expect(gateway.sentImages).toEqual([{ threadId: "8001", threadType: "USER", image }]);
    expect(gateway.sent).toEqual([]);
  });

  it("sends into a group", async () => {
    await manager.put("a1", SESSION);

    await manager.sendImage("a1", "9001", "GROUP", picture({ fileName: "nhay.gif" }));

    expect(gateway.sentImages.map((sent) => [sent.threadId, sent.threadType, sent.image.fileName])).toEqual([
      ["9001", "GROUP", "nhay.gif"],
    ]);
  });

  it("is refused like a text when Zalo refuses it, and unknown when it breaks midway", async () => {
    await manager.put("a1", SESSION);
    gateway.nextSend = "reject";
    await expect(manager.sendImage("a1", "8001", "USER", picture())).rejects.toBeInstanceOf(ZaloRejectedError);

    gateway.nextSend = "fail";
    const broken = manager.sendImage("a1", "8001", "USER", picture());
    await expect(broken).rejects.toThrow("fetch failed");
    await expect(broken).rejects.not.toBeInstanceOf(ZaloRejectedError);
  });

  it("knows no account it was never given", async () => {
    expect(() => manager.sendImage("a1", "8001", "USER", picture())).toThrow(UnknownAccountError);
  });

  it("says the session ended once Zalo kicked it, and sends nothing", async () => {
    await manager.put("a1", SESSION);
    gateway.latestListener().close(3003, "KickConnection");

    expect(() => manager.sendImage("a1", "8001", "USER", picture())).toThrow(SessionEndedError);
    expect(gateway.sentImages).toEqual([]);
  });
});
