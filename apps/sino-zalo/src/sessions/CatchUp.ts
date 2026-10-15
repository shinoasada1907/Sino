import type { ThreadType, ZaloMessage } from "../gateway/ZaloGateway.ts";
import type { MessageBuffer } from "./MessageBuffer.ts";

/** Asks Zalo for one page of messages after `lastId`. */
export type PageRequest = (threadType: ThreadType, lastId: string) => Promise<ZaloMessage[]>;

export interface CatchUpReport {
  readonly threadType: ThreadType;
  readonly pages: number;
  /** Messages the catch-up added to the buffer. */
  readonly messages: number;
  /** Whether it reached an empty page or the buffer, so nothing is missing in between. */
  readonly joined: boolean;
}

export interface CatchUpOptions {
  readonly maxPages?: number;
  readonly timeoutMs?: number;
}

const THREAD_TYPES: readonly ThreadType[] = ["USER", "GROUP"];

/**
 * Reads what Zalo kept after `from`, for 1-1 and group messages side by side, page after page
 * until it joins the buffer (D-278): at most `maxPages` pages per type and `timeoutMs` in all.
 */
export async function catchUp(
  request: PageRequest,
  buffer: MessageBuffer,
  from: string,
  options: CatchUpOptions = {},
): Promise<CatchUpReport[]> {
  const maxPages = options.maxPages ?? 10;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<"time-up">((resolve) => {
    timer = setTimeout(() => resolve("time-up"), options.timeoutMs ?? 5_000);
  });

  const readType = async (threadType: ThreadType): Promise<CatchUpReport> => {
    let lastId = from;
    let pages = 0;
    let messages = 0;
    while (pages < maxPages) {
      let page: ZaloMessage[] | "time-up";
      try {
        page = await Promise.race([request(threadType, lastId), timeUp]);
      } catch {
        break;
      }
      if (page === "time-up") {
        break;
      }
      pages++;
      const joined = page.length === 0 || page.some((message) => buffer.has(message.msgId));
      messages += buffer.add(page).length;
      if (joined) {
        return { threadType, pages, messages, joined: true };
      }
      lastId = page.reduce(
        (max, message) =>
          /^\d+$/.test(message.msgId) && BigInt(message.msgId) > BigInt(max) ? message.msgId : max,
        lastId,
      );
    }
    return { threadType, pages, messages, joined: false };
  };

  try {
    return await Promise.all(THREAD_TYPES.map(readType));
  } finally {
    clearTimeout(timer);
  }
}
