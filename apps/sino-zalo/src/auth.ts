import { createHash, timingSafeEqual } from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const PUBLIC_ROUTES = new Set(["/health"]);

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function requireSecret(secret: string) {
  const expected = digest(`Bearer ${secret}`);
  return async function checkSecret(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const route = request.routeOptions.url;
    if (route !== undefined && PUBLIC_ROUTES.has(route)) {
      return;
    }
    const given = digest(request.headers.authorization ?? "");
    if (!timingSafeEqual(given, expected)) {
      return reply
        .code(401)
        .send({ code: "UNAUTHORIZED", message: "Missing or wrong secret" });
    }
  };
}
