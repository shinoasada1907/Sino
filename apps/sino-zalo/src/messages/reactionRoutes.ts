import type { FastifyInstance } from "fastify";
import { REACTION_CODES, type ThreadType, ZaloRejectedError } from "../gateway/ZaloGateway.ts";
import type { SessionManager } from "../sessions/SessionManager.ts";
import { sendSessionError } from "../sessions/routes.ts";
import type { RateLimiter } from "./RateLimiter.ts";

export interface ReactionRoutesOptions {
  /** How long Zalo may take before the outcome counts as unknown (504); 10 seconds by default. */
  readonly timeoutMs?: number;
}

interface ReactionBody {
  threadId: string;
  threadType: ThreadType;
  msgId: string;
  cliMsgId: string;
  /** A code of Zalo's `Reactions`; empty takes the reaction back. */
  icon: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 };
/** Zalo's ids are whole numbers; zca-js reads them with `parseInt`, so text that is not one is refused here. */
const wholeNumber = { type: "string", pattern: "^[0-9]{1,20}$" };

const bodySchema = {
  type: "object",
  required: ["threadId", "threadType", "msgId", "cliMsgId", "icon"],
  properties: {
    threadId: id,
    threadType: { type: "string", enum: ["USER", "GROUP"] },
    msgId: wholeNumber,
    cliMsgId: wholeNumber,
    icon: { type: "string", enum: ["", ...REACTION_CODES] },
  },
};

const TIME_UP = Symbol("time up");

/**
 * Setting, changing and taking back a reaction (zalo-reactions, D-389). It takes its turn on the same `rate` as sending a
 * message, so a reaction and a message of one account are at least a second apart (Zalo limits the rhythm per account).
 * No sent log: setting the same reaction twice does no harm. The log says the account, the thread, the ids and whether
 * it was a removal, never the icon.
 */
export function registerReactionRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
  rate: RateLimiter,
  options: ReactionRoutesOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? 10_000;

  app.post<{ Params: { accountId: string }; Body: ReactionBody }>(
    "/accounts/:accountId/reactions",
    { schema: { body: bodySchema } },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, threadType, msgId, cliMsgId, icon } = request.body;
      try {
        sessions.requireLive(accountId);
      } catch (error) {
        return sendSessionError(reply, error);
      }
      if (!rate.tryTake(accountId)) {
        return reply
          .code(429)
          .send({ code: "RATE_LIMITED", message: "At most one message or reaction per second per account" });
      }

      const details = { accountId, threadId, msgId, cliMsgId, removed: icon === "" };
      const reacting = sessions.react(accountId, { threadId, threadType, msgId, cliMsgId, icon });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeUp = new Promise<typeof TIME_UP>((resolve) => {
        timer = setTimeout(() => resolve(TIME_UP), timeoutMs);
      });
      try {
        const outcome = await Promise.race([reacting, timeUp]);
        if (outcome === TIME_UP) {
          request.log.warn(details, "Zalo did not answer the reaction in time");
          // A late refusal must not become an unhandled rejection.
          reacting.catch(() => {});
          return reply
            .code(504)
            .send({ code: "OUTCOME_UNKNOWN", message: "Zalo did not say whether the reaction was taken" });
        }
        request.log.info(details, "Zalo reaction sent");
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof ZaloRejectedError) {
          request.log.warn({ ...details, reason: error.message }, "Zalo refused the reaction");
          return reply.code(422).send({ code: "REJECTED", message: "Zalo refused the reaction" });
        }
        request.log.warn({ ...details, reason: error instanceof Error ? error.message : "Unknown error" }, "Zalo reaction failed");
        return sendSessionError(reply, error);
      } finally {
        clearTimeout(timer);
      }
    },
  );
}
