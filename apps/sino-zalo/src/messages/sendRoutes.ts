import type { FastifyInstance, FastifyReply } from "fastify";
import { type ThreadType, type ZaloImage, ZaloRejectedError } from "../gateway/ZaloGateway.ts";
import type { OwnMessages, SessionManager } from "../sessions/SessionManager.ts";
import { sendSessionError } from "../sessions/routes.ts";
import { RateLimiter } from "./RateLimiter.ts";
import { type SentRecord, SentLog } from "./SentLog.ts";

export interface SendRoutesOptions {
  /** The clock of the sent log, the rate limit and sentAt; tests move it by hand. */
  readonly now?: () => number;
  /** How long a send may take before its outcome counts as unknown (504). */
  readonly sendTimeoutMs?: number;
}

interface AccountParams {
  accountId: string;
}

/** A picture as sino-api sends it: the bytes in base64 and a name whose extension says the type (D-353). */
interface ImageBody {
  data: string;
  fileName: ZaloImage["fileName"];
  width: number;
  height: number;
}

interface SendBody {
  threadId: string;
  threadType: ThreadType;
  /** The text of a text message; empty or missing beside a picture. */
  text?: string;
  image?: ImageBody;
  clientMessageId: string;
}

interface LookupBody {
  threadId: string;
  clientMessageId: string;
  text: string;
  after: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 };

// Whether there is a text or a picture, and not both, is for `contentOf`: the schema cannot say it.
const sendBodySchema = {
  type: "object",
  required: ["threadId", "threadType", "clientMessageId"],
  properties: {
    threadId: id,
    threadType: { type: "string", enum: ["USER", "GROUP"] },
    text: { type: "string" },
    image: {
      type: "object",
      required: ["data", "fileName", "width", "height"],
      properties: {
        data: { type: "string", minLength: 1 },
        // No path in the name, and the extension is what zca-js picks its GIF branch by.
        fileName: { type: "string", pattern: "^[^/\\\\]{1,100}\\.(png|gif|webp)$" },
        width: { type: "integer", minimum: 1, maximum: 16384 },
        height: { type: "integer", minimum: 1, maximum: 16384 },
      },
    },
    clientMessageId: id,
  },
};

/** The largest picture, after the base64 is undone: the limit of a sticker in the library. */
const MAX_IMAGE_BYTES = 1024 * 1024;
/** Its base64 text: four characters for every three bytes, rounded up. Longer text is not decoded at all. */
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
/** What the send route reads: a picture of 1 MiB is about 1.4 MiB of base64 (D-353). */
const SEND_BODY_LIMIT = 2 * 1024 * 1024;

const lookupBodySchema = {
  type: "object",
  required: ["threadId", "clientMessageId", "text", "after"],
  properties: {
    threadId: id,
    clientMessageId: id,
    text: { type: "string", minLength: 1 },
    after: { type: "string", format: "date-time" },
  },
};

const TIME_UP = Symbol("time up");

/** Sending a text and finding out whether a send went out (D-280). */
export function registerSendRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
  options: SendRoutesOptions = {},
): void {
  const sentLog = new SentLog({ now: options.now });
  // One message per second per account, so Zalo does not take the account for a bot (D-280).
  const rate = new RateLimiter({ intervalMs: 1_000, now: options.now });
  const sendTimeoutMs = options.sendTimeoutMs ?? 10_000;

  app.post<{ Params: AccountParams; Body: SendBody }>(
    "/accounts/:accountId/messages",
    {
      schema: { body: sendBodySchema },
      bodyLimit: SEND_BODY_LIMIT,
      errorHandler: (error, _request, reply) => {
        // Fastify refuses a body past the limit with 413 before the route reads it. A picture too big to be read is
        // the same fault as one that is only too big to send, so it gets the same 400.
        if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
          return reply
            .code(400)
            .send({ code: "PAYLOAD_TOO_LARGE", message: "The request is larger than the route reads" });
        }
        return reply.send(error);
      },
    },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, threadType, clientMessageId } = request.body;
      const content = contentOf(request.body);
      if ("code" in content) {
        return reply.code(400).send(content);
      }
      // What happened to an earlier send is true whatever the session is now: a 410 here would let
      // sino-api mark a message that went out as failed.
      const known = sentLog.get(accountId, clientMessageId);
      if (known?.state === "SENT") {
        return reply.code(200).send(known.record);
      }
      if (known !== undefined) {
        // On its way or broken midway: sending it again could send it twice.
        return sendOutcomeUnknown(reply);
      }
      try {
        sessions.requireLive(accountId);
      } catch (error) {
        return sendSessionError(reply, error);
      }
      if (!rate.tryTake(accountId)) {
        return reply
          .code(429)
          .send({ code: "RATE_LIMITED", message: "At most one message per second per account" });
      }

      // IDs and sizes only: never the text, the bytes or the name of the file (D-282, D-353).
      const details = {
        accountId,
        threadId,
        clientMessageId,
        ...(content.kind === "text"
          ? { length: content.text.length }
          : { imageType: content.type, imageBytes: content.image.data.length }),
      };
      const sending = sentLog.track(
        accountId,
        clientMessageId,
        content.kind === "text"
          ? sessions.sendText(accountId, threadId, threadType, content.text)
          : sessions.sendImage(accountId, threadId, threadType, content.image),
      );
      try {
        const record = await within(sending, sendTimeoutMs);
        if (record === TIME_UP) {
          request.log.warn(details, "Zalo did not answer the send in time");
          void sending.then(
            (late) => request.log.info({ ...details, msgId: late.msgId }, "Zalo message sent after the timeout"),
            (error: unknown) =>
              request.log.warn(
                { ...details, reason: reasonOf(error), refused: error instanceof ZaloRejectedError },
                "Zalo send failed after the timeout",
              ),
          );
          return sendOutcomeUnknown(reply);
        }
        request.log.info({ ...details, msgId: record.msgId }, "Zalo message sent");
        return reply.code(201).send(record);
      } catch (error) {
        if (error instanceof ZaloRejectedError) {
          request.log.warn({ ...details, reason: error.message }, "Zalo refused the message");
          return reply.code(422).send({ code: "REJECTED", message: "Zalo refused the message" });
        }
        request.log.warn({ ...details, reason: reasonOf(error) }, "Zalo send broke midway");
        return sendOutcomeUnknown(reply);
      }
    },
  );

  app.post<{ Params: AccountParams; Body: LookupBody }>(
    "/accounts/:accountId/sent/lookup",
    { schema: { body: lookupBodySchema } },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, clientMessageId, text } = request.body;
      const after = Date.parse(request.body.after);
      let own: OwnMessages;
      try {
        own = sessions.ownMessages(accountId, threadId, text, after);
      } catch (error) {
        return sendSessionError(reply, error);
      }

      const known = sentLog.get(accountId, clientMessageId);
      const msgIds = known?.state === "SENT" ? [known.record.msgId] : [];
      for (const msgId of own.msgIds) {
        if (!msgIds.includes(msgId)) msgIds.push(msgId);
      }
      // "I do not know" must not read as "it did not go out": sino-api would send it again. Nothing is known
      // from before the session started, nor of sends older than what the sent log remembers.
      const knownSince = Math.max(own.liveSince, sentLog.knowsSince());
      if (msgIds.length === 0 && (known !== undefined || knownSince > after)) {
        return reply
          .code(409)
          .send({ code: "CANNOT_TELL", message: "sino-zalo cannot tell whether the message went out" });
      }
      return { msgIds };
    },
  );
}

/** What a request sends: a text, or a picture read out of its base64 with the extension of its name as its type. */
type Content =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "image"; readonly image: ZaloImage; readonly type: string };

/** Why a request cannot be sent, as the 400 answers it. */
interface Refusal {
  readonly code: string;
  readonly message: string;
}

const IMAGE_TOO_LARGE: Refusal = { code: "IMAGE_TOO_LARGE", message: "A picture is at most 1 MiB" };

/** A message is a text or a picture: not both, and not neither (a picture's text is empty or missing). */
function contentOf(body: SendBody): Content | Refusal {
  const { text, image } = body;
  const hasText = text !== undefined && text !== "";
  if (image === undefined) {
    return hasText
      ? { kind: "text", text }
      : { code: "INVALID_MESSAGE", message: "A message needs a text or a picture" };
  }
  if (hasText) {
    return { code: "INVALID_MESSAGE", message: "A message is a text or a picture, not both" };
  }
  if (image.data.length > MAX_IMAGE_BASE64_LENGTH) {
    return IMAGE_TOO_LARGE;
  }
  const data = Buffer.from(image.data, "base64");
  // Buffer.from skips whatever is not base64, so only text that encodes back to itself is taken.
  if (data.toString("base64") !== image.data) {
    return { code: "INVALID_IMAGE", message: "image.data is not base64" };
  }
  if (data.length > MAX_IMAGE_BYTES) {
    return IMAGE_TOO_LARGE;
  }
  return {
    kind: "image",
    image: { data, fileName: image.fileName, width: image.width, height: image.height },
    type: image.fileName.slice(image.fileName.lastIndexOf(".") + 1),
  };
}

function sendOutcomeUnknown(reply: FastifyReply) {
  return reply
    .code(504)
    .send({ code: "OUTCOME_UNKNOWN", message: "Zalo did not say whether the message went out" });
}

/** The send's record, or TIME_UP once the time has run out; the send itself goes on. */
async function within(sending: Promise<SentRecord>, timeoutMs: number): Promise<SentRecord | typeof TIME_UP> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<typeof TIME_UP>((resolve) => {
    timer = setTimeout(() => resolve(TIME_UP), timeoutMs);
  });
  try {
    return await Promise.race([sending, timeUp]);
  } finally {
    clearTimeout(timer);
  }
}

/** The error's name and first line. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }
  return `${error.name}: ${error.message.split("\n", 1)[0] ?? ""}`;
}
