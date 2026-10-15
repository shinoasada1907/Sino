import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { requireSecret } from "./auth.ts";
import type { Config } from "./config.ts";

export function buildApp(
  config: Config,
  logger: FastifyServerOptions["logger"] = false,
): FastifyInstance {
  const app = Fastify({ logger });

  app.addHook("onRequest", requireSecret(config.secret));

  app.get("/health", async () => ({
    status: "UP",
    sessions: { live: 0, ended: 0 },
  }));

  return app;
}
