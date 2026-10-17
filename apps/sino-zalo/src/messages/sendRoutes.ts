import type { FastifyInstance, FastifyReply } from "fastify";
import { type ThreadType, ZaloRejectedError } from "../gateway/ZaloGateway.ts";
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

interface SendBody {
  threadId: string;
  threadType: ThreadType;
  text: string;
  clientMessageId: string;
}

interface LookupBody {
  threadId: string;
  clientMessageId: string;
  text: string;
  after: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 };

const sendBodySchema = {
  type: "object",
  required: ["threadId", "threadType", "text", "clientMessageId"],
  properties: {
    threadId: id,
    threadType: { type: "string", enum: ["USER", "GROUP"] },
    text: { type: "string", minLength: 1 },
    clientMessageId: id,
  },
};

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
    { schema: { body: sendBodySchema } },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, threadType, text, clientMessageId } = request.body;
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

      // IDs and length only: never the text (D-282).
      const details = { accountId, threadId, clientMessageId, length: text.length };
      const sending = sentLog.track(
        accountId,
        clientMessageId,
        sessions.sendText(accountId, threadId, threadType, text),
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
