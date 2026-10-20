import { describe, expect, it, vi } from "vitest";
import { type API, ThreadType as ZcaThreadType, type UploadAttachmentImageResponse, ZaloApiError } from "zca-js";
import { type ZaloImage, ZaloRejectedError } from "../src/gateway/ZaloGateway.ts";
import { photoStickerParams, sendPhotoSticker, ZcaGateway } from "../src/gateway/ZcaGateway.ts";

// ZS-09 (D-359): a still sticker goes to Zalo as an AI sticker: uploaded as a photo, then posted to photo_url with
// the fields chat.zalo.me gives an AI sticker. The user saw it arrive as a sticker on 2026-10-21.

const fake = vi.hoisted(() => ({ api: undefined as unknown }));

vi.mock("zca-js", async (importOriginal) => {
  const real = await importOriginal<typeof import("zca-js")>();
  return {
    ...real,
    Zalo: class {
      async login() {
        return fake.api;
      }
    },
  };
});

const NORMAL = "https://f20-zpc.zdn.vn/1/normal.jpg";
const HD = "https://f20-zpc.zdn.vn/1/hd.jpg";
const THUMB = "https://f20-zpc.zdn.vn/1/thumb.jpg";
const SESSION = { cookie: [], imei: "imei-one", userAgent: "Mozilla/5.0" };

function picture(overrides: Partial<ZaloImage> = {}): ZaloImage {
  return { data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), fileName: "sticker.png", width: 128, height: 96, ...overrides };
}

function uploaded(overrides: Partial<UploadAttachmentImageResponse> = {}): UploadAttachmentImageResponse {
  return {
    normalUrl: NORMAL,
    photoId: "5550001",
    finished: 1,
    hdUrl: HD,
    thumbUrl: THUMB,
    clientFileId: 1,
    chunkId: 1,
    fileType: "image",
    width: 512,
    height: 384,
    totalSize: 7,
    hdSize: 7,
    ...overrides,
  };
}

function uploader(result: unknown = [uploaded()]) {
  return vi.fn(async () => result) as unknown as API["uploadAttachment"] & ReturnType<typeof vi.fn>;
}

describe("photoStickerParams", () => {
  it("gives a direct chat the fields chat.zalo.me gives an AI sticker", () => {
    const params = photoStickerParams("8001", "USER", picture(), uploaded());

    expect(params).toEqual({
      clientId: expect.any(Number),
      title: "",
      oriUrl: NORMAL,
      thumbUrl: THUMB,
      hdUrl: HD,
      width: 512,
      height: 384,
      properties: expect.any(String),
      contentId: "5550001",
      thumb_width: 512,
      thumb_height: 384,
      webp: JSON.stringify({ width: 512, height: 384, url: HD }),
      jcp: JSON.stringify({ pStickerType: 1 }),
      toId: "8001",
    });
    expect(JSON.parse(params.properties as string)).toEqual({
      subType: 0,
      color: -1,
      size: -1,
      type: 3,
      ext: JSON.stringify({ sSrcStr: "", sSrcType: -1 }),
    });
  });

  it("names a group by grid with visibility 0, and no toId", () => {
    const params = photoStickerParams("9001", "GROUP", picture(), uploaded());

    expect(params).toMatchObject({ grid: "9001", visibility: 0 });
    expect(params).not.toHaveProperty("toId");
  });

  it("takes the size of the picture when Zalo gives none", () => {
    const params = photoStickerParams("8001", "USER", picture(), uploaded({ width: 0, height: 0 }));

    expect(params).toMatchObject({ width: 128, height: 96, thumb_width: 128, thumb_height: 96 });
    expect(JSON.parse(params.webp as string)).toMatchObject({ width: 128, height: 96 });
  });

  it("shows the normal address when Zalo gives no HD one", () => {
    const params = photoStickerParams("8001", "USER", picture(), uploaded({ hdUrl: "" }));

    expect(JSON.parse(params.webp as string).url).toBe(NORMAL);
  });
});

describe("sendPhotoSticker", () => {
  it("uploads the picture to the thread, then sends it by its address and answers Zalo's msgId", async () => {
    const upload = uploader();
    const photoUrl = vi.fn(async () => ({ msgId: 8372251986276 }));
    const image = picture();

    const msgId = await sendPhotoSticker(upload, photoUrl, "8001", "USER", image);

    expect(msgId).toBe("8372251986276");
    expect(upload).toHaveBeenCalledWith(
      [{ data: image.data, filename: "sticker.png", metadata: { totalSize: 7, width: 128, height: 96 } }],
      "8001",
      ZcaThreadType.User,
    );
    expect(photoUrl).toHaveBeenCalledWith(false, expect.objectContaining({ toId: "8001", contentId: "5550001" }));
  });

  it("sends into a group as a group", async () => {
    const upload = uploader();
    const photoUrl = vi.fn(async () => ({ msgId: 1 }));

    await sendPhotoSticker(upload, photoUrl, "9001", "GROUP", picture());

    expect(upload).toHaveBeenCalledWith(expect.anything(), "9001", ZcaThreadType.Group);
    expect(photoUrl).toHaveBeenCalledWith(true, expect.objectContaining({ grid: "9001" }));
  });

  it("is refused, and sends nothing, when the upload fails in any way: nothing is in the chat yet", async () => {
    for (const failure of [new ZaloApiError("bad file", 302), new ZaloApiError("no answer"), new Error("socket hang up")]) {
      const photoUrl = vi.fn(async () => ({ msgId: 1 }));
      const upload = vi.fn(async () => {
        throw failure;
      }) as unknown as API["uploadAttachment"];

      await expect(sendPhotoSticker(upload, photoUrl, "8001", "USER", picture())).rejects.toBeInstanceOf(ZaloRejectedError);
      expect(photoUrl).not.toHaveBeenCalled();
    }
  });

  it("is refused, and sends nothing, when Zalo does not take the picture as a photo", async () => {
    for (const result of [[], [{ fileType: "others" }]]) {
      const photoUrl = vi.fn(async () => ({ msgId: 1 }));

      await expect(sendPhotoSticker(uploader(result), photoUrl, "8001", "USER", picture())).rejects.toBeInstanceOf(
        ZaloRejectedError,
      );
      expect(photoUrl).not.toHaveBeenCalled();
    }
  });

  it("is refused when Zalo answers the send with an error code", async () => {
    const photoUrl = vi.fn(async () => {
      throw new ZaloApiError("Tin nhắn bị chặn", 114);
    });

    await expect(sendPhotoSticker(uploader(), photoUrl, "8001", "USER", picture())).rejects.toBeInstanceOf(ZaloRejectedError);
  });

  it("stays unknown when the send breaks without an error code, or Zalo answers without a msgId", async () => {
    const answers = [
      async () => {
        throw new Error("socket hang up");
      },
      async () => {
        throw new ZaloApiError("Request failed");
      },
      async () => ({}),
      async () => null,
    ];
    for (const answer of answers) {
      const sent = sendPhotoSticker(uploader(), vi.fn(answer), "8001", "USER", picture());

      await expect(sent).rejects.toThrow();
      await expect(sent).rejects.not.toBeInstanceOf(ZaloRejectedError);
    }
  });
});

describe("a live connection sends a picture", () => {
  /** An api with what `loginWithSession` and the send use; `custom` adds a function as zca-js does. */
  function liveApi() {
    const requests: { url: string; params: Record<string, unknown> }[] = [];
    const sendMessage = vi.fn(async () => ({ message: null, attachment: [{ msgId: 42 }] }));
    const uploadAttachment = vi.fn(async () => [uploaded()]);
    const api: Record<string, unknown> = {
      getOwnId: () => "100",
      zpwServiceMap: { file: ["https://files.zalo.test"] },
      sendMessage,
      uploadAttachment,
      custom: (name: string, callback: (props: unknown) => unknown) => {
        api[name] = (props: unknown) =>
          callback({
            ctx: {},
            props,
            utils: {
              makeURL: (base: string, query: Record<string, unknown>) => `${base}?nretry=${String(query.nretry)}`,
              encodeAES: (text: string) => `aes:${text}`,
              request: async (url: string, init: { body: URLSearchParams }) => {
                const encrypted = init.body.get("params") ?? "";
                requests.push({ url, params: JSON.parse(encrypted.slice("aes:".length)) });
                return "answer";
              },
              resolve: async () => ({ msgId: 99 }),
            },
          });
      },
    };
    fake.api = api;
    return { requests, sendMessage, uploadAttachment };
  }

  it("sends a PNG as an AI sticker through photo_url", async () => {
    const { requests, sendMessage, uploadAttachment } = liveApi();
    const connection = await new ZcaGateway().loginWithSession(SESSION);

    const msgId = await connection.sendImage("8001", "USER", picture());

    expect(msgId).toBe("99");
    expect(uploadAttachment).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(requests).toEqual([
      {
        url: "https://files.zalo.test/api/message/photo_url?nretry=0",
        params: expect.objectContaining({ toId: "8001", jcp: JSON.stringify({ pStickerType: 1 }) }),
      },
    ]);
  });

  it("sends a WebP the same way, and into a group through the group's photo_url", async () => {
    const { requests } = liveApi();
    const connection = await new ZcaGateway().loginWithSession(SESSION);

    await connection.sendImage("9001", "GROUP", picture({ fileName: "sticker.webp" }));

    expect(requests[0]?.url).toBe("https://files.zalo.test/api/group/photo_url?nretry=0");
    expect(requests[0]?.params).toMatchObject({ grid: "9001", visibility: 0 });
  });

  it("keeps a GIF on zca-js's own GIF branch", async () => {
    const { requests, sendMessage, uploadAttachment } = liveApi();
    const connection = await new ZcaGateway().loginWithSession(SESSION);

    const msgId = await connection.sendImage("8001", "USER", picture({ fileName: "sticker.gif" }));

    expect(msgId).toBe("42");
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });
});
