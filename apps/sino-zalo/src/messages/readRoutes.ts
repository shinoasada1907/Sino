import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../sessions/SessionManager.ts";
import { sendSessionError } from "../sessions/routes.ts";

interface AccountParams {
  accountId: string;
}

interface MessagesQuery {
  after?: string;
  limit: number;
}

const messagesQuerySchema = {
  type: "object",
  properties: {
    // msgId is a whole number written as text; empty means "from the first message".
    after: { type: "string", pattern: "^[0-9]{0,40}$" },
    limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
  },
};

export function registerReadRoutes(app: FastifyInstance, sessions: SessionManager): void {
  app.get<{ Params: AccountParams; Querystring: MessagesQuery }>(
    "/accounts/:accountId/messages",
    { schema: { querystring: messagesQuerySchema } },
    async (request, reply) => {
      const after = request.query.after || null;
      try {
        return await sessions.readMessages(request.params.accountId, after, request.query.limit);
      } catch (error) {
        return sendSessionError(reply, error);
      }
    },
  );
}
