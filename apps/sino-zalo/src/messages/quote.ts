import type { ZaloQuote } from "../gateway/ZaloGateway.ts";

/** What a quote body is refused with (400). */
export const INVALID_QUOTE = { code: "INVALID_QUOTE", message: "A quote needs msgId, cliMsgId, uidFrom, ts, ttl, msgType and content" };

const WHOLE_NUMBER = /^[0-9]{1,20}$/;

/**
 * The quote of a reply (zalo-quote-reply, D-506): the fields zca-js asks of the message to quote. The ids and the time
 * are whole numbers as text, ttl a whole number, msgType one of Zalo's names, content the text or, for a message that is
 * not text, its raw content; propertyExt is an object or missing. undefined for a value that is none of that.
 */
export function parseQuote(value: unknown): ZaloQuote | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { msgId, cliMsgId, uidFrom, ts, ttl, msgType, content, propertyExt } = value as Record<string, unknown>;
  const object = (field: unknown): field is Record<string, unknown> =>
    typeof field === "object" && field !== null && !Array.isArray(field);
  if (
    typeof msgId !== "string" ||
    typeof cliMsgId !== "string" ||
    typeof uidFrom !== "string" ||
    typeof ts !== "string" ||
    !WHOLE_NUMBER.test(msgId) ||
    !WHOLE_NUMBER.test(cliMsgId) ||
    !WHOLE_NUMBER.test(uidFrom) ||
    !WHOLE_NUMBER.test(ts) ||
    typeof ttl !== "number" ||
    !Number.isSafeInteger(ttl) ||
    ttl < 0 ||
    typeof msgType !== "string" ||
    msgType === "" ||
    msgType.length > 40 ||
    (typeof content !== "string" && !object(content)) ||
    (propertyExt !== undefined && propertyExt !== null && !object(propertyExt))
  ) {
    return undefined;
  }
  return {
    msgId,
    cliMsgId,
    uidFrom,
    ts,
    ttl,
    msgType,
    content,
    ...(object(propertyExt) ? { propertyExt } : {}),
  };
}
