import { describe, expect, it } from "vitest";
import { GroupMessage, UserMessage, type TMessage } from "zca-js";
import { toZaloMessage } from "../src/gateway/ZcaGateway.ts";

// ZL-18: the "stickers" the user sends from Zalo (a tiger) reach sino-zalo as chat.photo whose `href`, `thumb` and
// `params.hd` are all on b-f11-zpc.zdn.vn and answer 404 in the browser. What marks them is in `params`: a number
// `pStickerType` and an object `webp` (real log of 2026-10-19: params.thumb_width, thumb_height, width, contentId,
// pStickerType, webp, hd, height). The picture to show is the address inside `webp`.

const HREF = "https://b-f11-zpc.zdn.vn/4788031984530569242/fb89c99aaaaaaaaaaaaaaaaa.jpg";
const WEBP = "https://b-f11-zpc.zdn.vn/4788031984530569242/fb89c99aaaaaaaaaaaaaaaaa.webp";

function zcaData(content: unknown, fields: Partial<TMessage> = {}): TMessage {
  return {
    msgId: "100",
    msgType: "chat.photo",
    uidFrom: "8001",
    idTo: "0",
    dName: "Bạn A",
    ts: "1760515200000",
    content,
    ...fields,
  } as TMessage;
}

/** The content a tiger arrives with: every address on b-f11-zpc, `webp` an object. */
function tiger(params: Record<string, unknown> = {}, content: Record<string, unknown> = {}) {
  return {
    title: "",
    description: "",
    href: HREF,
    thumb: HREF,
    childnumber: 0,
    action: "",
    type: "",
    params: JSON.stringify({
      thumb_width: 128,
      thumb_height: 128,
      width: 512,
      height: 512,
      contentId: "1234567890123",
      pStickerType: 1,
      hd: HREF,
      webp: { url: WEBP, width: 512, height: 512 },
      ...params,
    }),
    ...content,
  };
}

const photoOf = (content: unknown) => toZaloMessage(new UserMessage("7001", zcaData(content))).photo;

describe("a photo that is a Zalo sticker", () => {
  it("shows the address inside params.webp and keeps the address it used to show as the fallback", () => {
    expect(photoOf(tiger())).toEqual({ url: WEBP, thumbUrl: HREF, caption: null });
  });

  it("is read the same in a group", () => {
    const group = zcaData(tiger(), { idTo: "9001", uidFrom: "8002" });

    expect(toZaloMessage(new GroupMessage("7001", group as never)).photo).toEqual({ url: WEBP, thumbUrl: HREF, caption: null });
  });

  it("is read from a content that arrives as JSON text", () => {
    expect(photoOf(JSON.stringify(tiger()))).toEqual({ url: WEBP, thumbUrl: HREF, caption: null });
  });

  it("keeps the caption", () => {
    expect(photoOf(tiger({}, { title: "  Hổ  " }))?.caption).toBe("Hổ");
  });

  it("takes the webp given as a plain address", () => {
    expect(photoOf(tiger({ webp: WEBP }))?.url).toBe(WEBP);
  });

  it("takes the webp given as JSON text", () => {
    expect(photoOf(tiger({ webp: JSON.stringify({ url: WEBP }) }))?.url).toBe(WEBP);
  });

  it("takes the first address of a webp given as a list", () => {
    expect(photoOf(tiger({ webp: [{ width: 1 }, { url: WEBP }] }))?.url).toBe(WEBP);
  });

  it("finds the address under any key, and one level down", () => {
    expect(photoOf(tiger({ webp: { src: WEBP } }))?.url).toBe(WEBP);
    expect(photoOf(tiger({ webp: { sizes: { big: WEBP } } }))?.url).toBe(WEBP);
  });

  it("looks no deeper than one level below webp", () => {
    expect(photoOf(tiger({ webp: { a: { b: { c: WEBP } } } }))).toEqual({ url: HREF, thumbUrl: null, caption: null });
  });

  it("falls back to the address it would have shown, not to the thumbnail", () => {
    const thumb = "https://b-f11-zpc.zdn.vn/1/thumb.jpg";

    expect(photoOf(tiger({}, { thumb }))).toEqual({ url: WEBP, thumbUrl: HREF, caption: null });
  });

  it("prefers the key url to another key", () => {
    const other = "https://b-f11-zpc.zdn.vn/1/other.webp";

    expect(photoOf(tiger({ webp: { thumb: other, url: WEBP } }))?.url).toBe(WEBP);
  });

  it("gives no fallback when the webp is the address it would have shown", () => {
    expect(photoOf(tiger({ webp: { url: HREF } }))).toEqual({ url: HREF, thumbUrl: null, caption: null });
  });

  it("shows the webp when it is the only address in the content", () => {
    const content = { title: "", params: JSON.stringify({ pStickerType: 2, webp: { url: WEBP } }) };

    expect(photoOf(content)).toEqual({ url: WEBP, thumbUrl: null, caption: null });
  });

  it("does not look into webp when pStickerType is not a number", () => {
    for (const pStickerType of [undefined, "1", null, 1.5, Number.NaN]) {
      expect(photoOf(tiger({ pStickerType }))).toEqual({ url: HREF, thumbUrl: null, caption: null });
    }
  });

  it("leaves a photo as it was when webp names no web address", () => {
    for (const webp of [{}, { url: "javascript:alert(1)" }, { url: "ftp://zdn.vn/a.webp" }, { url: 3 }, "text", "{not json", null, 7, []]) {
      expect(photoOf(tiger({ webp }))).toEqual({ url: HREF, thumbUrl: null, caption: null });
    }
  });

  it("leaves an ordinary photo alone, whatever else it carries", () => {
    const ordinary = tiger({ pStickerType: undefined, webp: { url: WEBP } });

    expect(photoOf(ordinary)?.url).toBe(HREF);
  });

  it("is looked for only in a chat.photo", () => {
    const other = toZaloMessage(new UserMessage("7001", zcaData(tiger(), { msgType: "share.file" })));

    expect(other.photo).toBeUndefined();
  });
});

describe("photoShape goes one object deeper into params", () => {
  const shapeOf = (content: unknown) => toZaloMessage(new UserMessage("7001", zcaData(content))).photoShape ?? "";

  it("names the keys of params.webp with the host of each address", () => {
    const shape = shapeOf(tiger());

    expect(shape).toContain("params.webp:object");
    expect(shape).toContain("params.webp.url:url(b-f11-zpc.zdn.vn)");
    expect(shape).toContain("params.webp.width:number");
    expect(shape).not.toContain("fb89c99");
  });

  it("goes no deeper, and looks into at most three objects", () => {
    const params = {
      a: { x: 1, deep: { y: 1 } },
      b: { x: 1 },
      c: { x: 1 },
      d: { x: 1 },
    };

    const shape = shapeOf({ params: JSON.stringify(params) });

    expect(shape).toContain("params.a.x:number");
    expect(shape).toContain("params.a.deep:object");
    expect(shape).not.toContain("params.a.deep.y");
    expect(shape).toContain("params.c.x:number");
    expect(shape).not.toContain("params.d.x");
  });

  it("does not go into a list", () => {
    const shape = shapeOf({ params: JSON.stringify({ list: [{ x: 1 }] }) });

    expect(shape).toContain("params.list:array");
    expect(shape).not.toContain("params.list.");
  });

  it("looks only at the first twenty keys of params for an object to go into", () => {
    const first = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["k" + i, i]));

    expect(shapeOf({ params: JSON.stringify({ ...first, late: { x: 1 } }) })).not.toContain("params.late");
  });

  it("keeps the keys of a nested object to ten", () => {
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));

    const nested = shapeOf({ params: JSON.stringify({ wide }) }).split(",").filter((part) => part.startsWith("params.wide."));

    expect(nested.length).toBe(10);
  });
});
