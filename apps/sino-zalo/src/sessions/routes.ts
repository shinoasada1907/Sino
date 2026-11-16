import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZaloSession, ZaloUnavailableError } from "../gateway/ZaloGateway.ts";
import {
  SessionEndedError,
  type SessionManager,
  UnknownAccountError,
} from "./SessionManager.ts";

interface AccountParams {
  accountId: string;
}

interface SessionBody {
  session: ZaloSession;
}

const sessionBodySchema = {
  type: "object",
  required: ["session"],
  properties: {
    session: {
      type: "object",
      required: ["cookie", "imei", "userAgent"],
      properties: {
        cookie: { type: "array" },
        imei: { type: "string", minLength: 1 },
        userAgent: { type: "string", minLength: 1 },
      },
    },
  },
};

export function registerSessionRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
): void {
  app.put<{ Params: AccountParams; Body: SessionBody }>(
    "/accounts/:accountId/session",
    { schema: { body: sessionBodySchema } },
    async (request, reply) => {
      try {
        await sessions.put(request.params.accountId, request.body.session);
      } catch (error) {
        return sendSessionError(reply, error);
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: AccountParams }>(
    "/accounts/:accountId/session",
    async (request, reply) => {
      await sessions.remove(request.params.accountId);
      return reply.code(204).send();
    },
  );
}

/** Answers the errors every account route shares; anything else goes on to Fastify (500). */
export function sendSessionError(reply: FastifyReply, error: unknown) {
  if (error instanceof UnknownAccountError) {
    return reply
      .code(404)
      .send({ code: "UNKNOWN_ACCOUNT", message: "No session for this account" });
  }
  if (error instanceof SessionEndedError) {
    return reply
      .code(410)
      .send({ code: "SESSION_ENDED", message: "The Zalo session has ended" });
  }
  if (error instanceof ZaloUnavailableError) {
    return reply
      .code(502)
      .send({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });
  }
  throw error;
}
