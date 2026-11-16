import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZaloContacts, ZaloUnavailableError } from "../gateway/ZaloGateway.ts";
import { SessionEndedError, type SessionManager, UnknownAccountError } from "./SessionManager.ts";

interface AccountParams {
  accountId: string;
}

export interface ContactRoutesOptions {
  /** How long a contact list may take before it counts as Zalo not answering (502); 15 seconds by default. */
  readonly timeoutMs?: number;
}

const TIME_UP = Symbol("time-up");

/**
 * `GET /accounts/:accountId/contacts` (zalo-contacts, D-425): every friend and group of the account, for sino-api
 * to keep as the account's contacts. A list that fails or runs out of time anywhere is `502` as a whole, never a
 * partial one: sino-api removes the contacts missing from what it gets.
 */
export function registerContactRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
  options: ContactRoutesOptions = {},
): void {
  // Below the 20 seconds sino-api waits for its slow calls, so sino-zalo answers first (D-433).
  const timeoutMs = options.timeoutMs ?? 15_000;

  app.get<{ Params: AccountParams }>("/accounts/:accountId/contacts", async (request, reply) => {
    const { accountId } = request.params;
    let contacts: ZaloContacts | typeof TIME_UP;
    try {
      const connection = sessions.connectionOf(accountId);
      contacts = await within(connection.contacts(), timeoutMs);
    } catch (error) {
      return sendContactsError(reply, error);
    }
    if (contacts === TIME_UP) {
      request.log.warn({ accountId, timeoutMs }, "Zalo did not answer the contact list in time");
      return sendZaloUnavailable(reply);
    }
    request.log.info(
      { accountId, friends: contacts.friends.length, groups: contacts.groups.length },
      "Zalo contacts listed",
    );
    return contacts;
  });
}

/** No live session is `409`, like the alias routes (D-415): the list needs Zalo right now. */
function sendContactsError(reply: FastifyReply, error: unknown) {
  if (error instanceof UnknownAccountError || error instanceof SessionEndedError) {
    return reply.code(409).send({ code: "NO_SESSION", message: "No live Zalo session for this account" });
  }
  if (error instanceof ZaloUnavailableError) {
    return sendZaloUnavailable(reply);
  }
  throw error;
}

function sendZaloUnavailable(reply: FastifyReply) {
  return reply.code(502).send({ code: "ZALO_UNAVAILABLE", message: "Zalo did not answer" });
}

/** The list, or TIME_UP once the time has run out; the calls to Zalo themselves go on. */
async function within(listing: Promise<ZaloContacts>, timeoutMs: number): Promise<ZaloContacts | typeof TIME_UP> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<typeof TIME_UP>((resolve) => {
    timer = setTimeout(() => resolve(TIME_UP), timeoutMs);
  });
  try {
    return await Promise.race([listing, timeUp]);
  } finally {
    clearTimeout(timer);
  }
}
