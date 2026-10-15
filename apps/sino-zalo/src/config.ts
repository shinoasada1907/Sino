export interface Config {
  readonly host: string;
  readonly port: number;
  readonly secret: string;
  /** Where sino-api listens, for the webhook (D-277); no trailing slash. */
  readonly apiUrl: string;
}

const MIN_SECRET_BYTE = 32;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const secret = env.SINO_ZALO_SECRET;
  const port = Number(env.SINO_ZALO_PORT ?? 8090);

  if (!secret) {
    throw new Error("SINO_ZALO_SECRET is missing");
  }

  if (Buffer.byteLength(secret) < MIN_SECRET_BYTE) {
    throw new Error(
      `SINO_ZALO_SECRET must be at least ${MIN_SECRET_BYTE} bytes`,
    );
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SINO_ZALO_PORT must be a whole number from 1 to 65535");
  }

  const apiUrl = parseApiUrl(env.SINO_API_URL ?? "http://127.0.0.1:8080");

  return { host: env.SINO_ZALO_HOST ?? "127.0.0.1", port, secret, apiUrl };
}

function parseApiUrl(value: string): string {
  const url = URL.parse(value);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("SINO_API_URL must be an http or https address");
  }
  return value.replace(/\/+$/, "");
}
