import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { requireSecret } from "./auth.ts";
import type { Config } from "./config.ts";
import type { ZaloGateway } from "./gateway/ZaloGateway.ts";
import { LoginStore } from "./logins/LoginStore.ts";
import { registerLoginRoutes } from "./logins/routes.ts";

export function buildApp(
  config: Config,
  gateway: ZaloGateway,
  logger: FastifyServerOptions["logger"] = false,
): FastifyInstance {
  const app = Fastify({ logger });

  app.addHook("onRequest", requireSecret(config.secret));

  app.get("/health", async () => ({
    status: "UP",
    sessions: { live: 0, ended: 0 },
  }));

  registerLoginRoutes(app, new LoginStore(gateway, { log: app.log }));

  return app;
}
