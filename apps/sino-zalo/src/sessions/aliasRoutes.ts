import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZaloAlias, ZaloRejectedError, ZaloUnavailableError } from "../gateway/ZaloGateway.ts";
import { SessionEndedError, type SessionManager, UnknownAccountError } from "./SessionManager.ts";

interface AccountParams {
  accountId: string;
}

interface AliasParams extends AccountParams {
  friendId: string;
}

interface AliasBody {
  alias: string;
}

/** A non-empty string: sino-api turns an empty or missing nickname into a DELETE, never a PUT with "" (D-414). */
const aliasBodySchema = {
  type: "object",
  required: ["alias"],
  properties: {
    alias: { type: "string", minLength: 1 },
  },
};

export interface AliasRoutesOptions {
  /** The clock the 60-second memory of `GET /accounts/:id/aliases` is kept against; tests move it by hand. */
  readonly now?: () => number;
}

/** How long a `GET` answer is kept so two requests close together do not ask Zalo twice (zalo-nicknames, D-415). */
const CACHE_TTL_MS = 60_000;

/**
 * Every nickname Zalo gave for an account, kept for `CACHE_TTL_MS` so two reads close together ask Zalo once; a
 * `PUT` or `DELETE` empties the account's entry so the next `GET` asks again. Each `clear` also moves the account's
 * version on, so a list Zalo was asked for before the write cannot be kept once it comes back after it.
 */
class AliasCache {
  private readonly entries = new Map<string, { items: readonly ZaloAlias[]; until: number }>();
  private readonly versions = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  get(accountId: string): readonly ZaloAlias[] | undefined {
    const entry = this.entries.get(accountId);
    return entry !== undefined && entry.until > this.now() ? entry.items : undefined;
  }

  /** Read before asking Zalo, then handed back to `set`. */
  version(accountId: string): number {
    return this.versions.get(accountId) ?? 0;
  }

  /** Keeps `items` unless a `clear` came between the `version` read and now. */
  set(accountId: string, items: readonly ZaloAlias[], version: number): void {
    if (version === this.version(accountId)) {
      this.entries.set(accountId, { items, until: this.now() + CACHE_TTL_MS });
    }
  }

  clear(accountId: string): void {
    this.entries.delete(accountId);
    this.versions.set(accountId, this.version(accountId) + 1);
  }
}

/**
 * `PUT`/`DELETE /accounts/:accountId/aliases/:friendId` and `GET /accounts/:accountId/aliases` (zalo-nicknames,
 * D-415): sets, removes and lists the nicknames (biệt danh) the account owner gave their Zalo friends.
 */
export function registerAliasRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
  options: AliasRoutesOptions = {},
): void {
  const cache = new AliasCache(options.now ?? Date.now);

  app.put<{ Params: AliasParams; Body: AliasBody }>(
    "/accounts/:accountId/aliases/:friendId",
    { schema: { body: aliasBodySchema } },
    async (request, reply) => {
      const { accountId, friendId } = request.params;
      try {
        const connection = sessions.connectionOf(accountId);
        await connection.setAlias(friendId, request.body.alias);
      } catch (error) {
        return sendAliasError(reply, error);
      }
      cache.clear(accountId);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: AliasParams }>(
    "/accounts/:accountId/aliases/:friendId",
    async (request, reply) => {
      const { accountId, friendId } = request.params;
      try {
        const connection = sessions.connectionOf(accountId);
        await connection.removeAlias(friendId);
      } catch (error) {
        return sendAliasError(reply, error);
      }
      cache.clear(accountId);
      return reply.code(204).send();
    },
  );

  app.get<{ Params: AccountParams }>(
    "/accounts/:accountId/aliases",
    async (request, reply) => {
      const { accountId } = request.params;
      const cached = cache.get(accountId);
      if (cached !== undefined) {
        return { items: cached };
      }
      const version = cache.version(accountId);
      let items: ZaloAlias[];
      try {
        const connection = sessions.connectionOf(accountId);
        items = await connection.aliasList();
      } catch (error) {
        return sendAliasError(reply, error);
      }
      cache.set(accountId, items, version);
      return { items };
    },
  );
}

/**
 * Answers every error the alias routes can throw. No live session (unknown account or an ended one) is `409`
 * here, unlike the `404`/`410` of the session and message routes, because reading or changing a nickname needs
 * Zalo right now and there is no saved state to tell "not yet connected" from "never will be" apart (D-415).
 */
function sendAliasError(reply: FastifyReply, error: unknown) {
  if (error instanceof UnknownAccountError || error instanceof SessionEndedError) {
    return reply.code(409).send({ code: "NO_SESSION", message: "No live Zalo session for this account" });
  }
  if (error instanceof ZaloRejectedError) {
    return reply.code(422).send({ code: "ALIAS_REJECTED", message: "Zalo refused the alias" });
  }
  if (error instanceof ZaloUnavailableError) {
    return reply.code(502).send({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });
  }
  throw error;
}
