import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { requireSecret } from "./auth.ts";
import type { Config } from "./config.ts";
import type { ZaloGateway } from "./gateway/ZaloGateway.ts";
import { LoginStore } from "./logins/LoginStore.ts";
import { registerLoginRoutes } from "./logins/routes.ts";
import { registerReadRoutes } from "./messages/readRoutes.ts";
import { type Notifier, WebhookNotifier } from "./notify.ts";
import { SessionManager } from "./sessions/SessionManager.ts";
import { registerSessionRoutes } from "./sessions/routes.ts";

export interface AppOptions {
  readonly logger?: FastifyServerOptions["logger"];
  /** Defaults to the webhook to sino-api; tests pass one that records the calls. */
  readonly notifier?: Notifier;
}

export function buildApp(
  config: Config,
  gateway: ZaloGateway,
  options: AppOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.addHook("onRequest", requireSecret(config.secret));

  const notifier = options.notifier ?? new WebhookNotifier(config, app.log);
  const sessions = new SessionManager(gateway, notifier, { log: app.log });
  app.addHook("onClose", async () => sessions.stopAll());

  app.get("/health", async () => ({
    status: "UP",
    sessions: sessions.counts(),
  }));

  registerLoginRoutes(app, new LoginStore(gateway, { log: app.log }));
  registerSessionRoutes(app, sessions);
  registerReadRoutes(app, sessions);

  return app;
}
