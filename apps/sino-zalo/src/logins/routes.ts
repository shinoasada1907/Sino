import type { FastifyInstance } from "fastify";
import { type LoginStore, QrUnavailableError } from "./LoginStore.ts";

interface LoginParams {
  loginId: string;
}

export function registerLoginRoutes(
  app: FastifyInstance,
  logins: LoginStore,
): void {
  app.post("/logins", async (_request, reply) => {
    try {
      return reply.code(201).send(await logins.start());
    } catch (error) {
      if (error instanceof QrUnavailableError) {
        return reply.code(502).send({
          code: "QR_UNAVAILABLE",
          message: "Zalo did not give a QR code",
        });
      }
      throw error;
    }
  });

  app.get<{ Params: LoginParams }>(
    "/logins/:loginId",
    async (request, reply) => {
      const view = logins.get(request.params.loginId);
      if (view === undefined) {
        return reply
          .code(404)
          .send({ code: "UNKNOWN_LOGIN", message: "No such login" });
      }
      return view;
    },
  );

  app.delete<{ Params: LoginParams }>(
    "/logins/:loginId",
    async (request, reply) => {
      logins.cancel(request.params.loginId);
      return reply.code(204).send();
    },
  );
}
