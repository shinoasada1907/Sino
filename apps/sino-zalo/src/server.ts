import { buildApp } from "./app.ts";
import { loadConfig, type Config } from "./config.ts";

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(`sino-zalo cannot start: ${error as Error}`);
  process.exit(1);
}

const app = buildApp(config, true);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    console.log(`sino-zalo received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
