import type { FastifyInstance, FastifyReply } from "fastify";
import { type ThreadType, type ZaloFile, type ZaloImage, ZaloRejectedError } from "../gateway/ZaloGateway.ts";
import type { OwnMessages, SessionManager } from "../sessions/SessionManager.ts";
import { sendSessionError } from "../sessions/routes.ts";
import { pictureSize } from "./pictureSize.ts";
import { RateLimiter } from "./RateLimiter.ts";
import { type SentRecord, SentLog } from "./SentLog.ts";

export interface SendRoutesOptions {
  /** The clock of the sent log, the rate limit and sentAt; tests move it by hand. */
  readonly now?: () => number;
  /** How long a send may take before its outcome counts as unknown (504). */
  readonly sendTimeoutMs?: number;
  /** The same for a picture or file from the computer, which Zalo has to take whole first (zalo-send-files, D-375). */
  readonly fileTimeoutMs?: number;
}

interface AccountParams {
  accountId: string;
}

/** A picture as sino-api sends it: the bytes in base64 and a name whose extension says the type (D-353). */
interface ImageBody {
  data: string;
  fileName: ZaloImage["fileName"];
  width: number;
  height: number;
}

interface SendBody {
  threadId: string;
  threadType: ThreadType;
  /** The text of a text message; empty or missing beside a picture. */
  text?: string;
  image?: ImageBody;
  clientMessageId: string;
}

interface LookupBody {
  threadId: string;
  clientMessageId: string;
  /** Missing for a picture, which has no text to be found by: the sent log alone speaks for it (ZS-03). */
  text?: string;
  after: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 };

// Whether there is a text or a picture, and not both, is for `contentOf`: the schema cannot say it.
const sendBodySchema = {
  type: "object",
  required: ["threadId", "threadType", "clientMessageId"],
  properties: {
    threadId: id,
    threadType: { type: "string", enum: ["USER", "GROUP"] },
    text: { type: "string" },
    image: {
      type: "object",
      required: ["data", "fileName", "width", "height"],
      properties: {
        data: { type: "string", minLength: 1 },
        // No path in the name, and the extension is what zca-js picks its GIF branch by.
        fileName: { type: "string", pattern: "^[^/\\\\]{1,100}\\.(png|gif|webp)$" },
        width: { type: "integer", minimum: 1, maximum: 16384 },
        height: { type: "integer", minimum: 1, maximum: 16384 },
      },
    },
    clientMessageId: id,
  },
};

/** The largest picture, after the base64 is undone: the limit of a sticker in the library. */
const MAX_IMAGE_BYTES = 1024 * 1024;
/** Its base64 text: four characters for every three bytes, rounded up. Longer text is not decoded at all. */
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
/** What the send route reads: a picture of 1 MiB is about 1.4 MiB of base64 (D-353). */
const SEND_BODY_LIMIT = 2 * 1024 * 1024;

const lookupBodySchema = {
  type: "object",
  required: ["threadId", "clientMessageId", "after"],
  properties: {
    threadId: id,
    clientMessageId: id,
    text: { type: "string", minLength: 1 },
    after: { type: "string", format: "date-time" },
  },
};

const TIME_UP = Symbol("time up");

/** Sending a text and finding out whether a send went out (D-280). */
export function registerSendRoutes(
  app: FastifyInstance,
  sessions: SessionManager,
  options: SendRoutesOptions = {},
): void {
  const sentLog = new SentLog({ now: options.now });
  // One message per second per account, so Zalo does not take the account for a bot (D-280).
  const rate = new RateLimiter({ intervalMs: 1_000, now: options.now });
  const sendTimeoutMs = options.sendTimeoutMs ?? 10_000;

  app.post<{ Params: AccountParams; Body: SendBody }>(
    "/accounts/:accountId/messages",
    {
      schema: { body: sendBodySchema },
      bodyLimit: SEND_BODY_LIMIT,
      errorHandler: (error, _request, reply) => {
        // Fastify refuses a body past the limit with 413 before the route reads it. A picture too big to be read is
        // the same fault as one that is only too big to send, so it gets the same 400.
        if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
          return reply
            .code(400)
            .send({ code: "PAYLOAD_TOO_LARGE", message: "The request is larger than the route reads" });
        }
        return reply.send(error);
      },
    },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, threadType, clientMessageId } = request.body;
      const content = contentOf(request.body);
      if ("code" in content) {
        return reply.code(400).send(content);
      }
      // What happened to an earlier send is true whatever the session is now: a 410 here would let
      // sino-api mark a message that went out as failed.
      const known = sentLog.get(accountId, clientMessageId);
      if (known?.state === "SENT") {
        return reply.code(200).send(known.record);
      }
      if (known !== undefined) {
        // On its way or broken midway: sending it again could send it twice.
        return sendOutcomeUnknown(reply);
      }
      try {
        sessions.requireLive(accountId);
      } catch (error) {
        return sendSessionError(reply, error);
      }
      if (!rate.tryTake(accountId)) {
        return reply
          .code(429)
          .send({ code: "RATE_LIMITED", message: "At most one message per second per account" });
      }

      // IDs and sizes only: never the text, the bytes or the name of the file (D-282, D-353).
      const details = {
        accountId,
        threadId,
        clientMessageId,
        ...(content.kind === "text"
          ? { length: content.text.length }
          : { imageType: content.type, imageBytes: content.image.data.length }),
      };
      const sending = sentLog.track(
        accountId,
        clientMessageId,
        content.kind === "text"
          ? sessions.sendText(accountId, threadId, threadType, content.text)
          : sessions.sendImage(accountId, threadId, threadType, content.image),
      );
      try {
        const record = await within(sending, sendTimeoutMs);
        if (record === TIME_UP) {
          request.log.warn(details, "Zalo did not answer the send in time");
          void sending.then(
            (late) => request.log.info({ ...details, msgId: late.msgId }, "Zalo message sent after the timeout"),
            (error: unknown) =>
              request.log.warn(
                { ...details, reason: reasonOf(error), refused: error instanceof ZaloRejectedError },
                "Zalo send failed after the timeout",
              ),
          );
          return sendOutcomeUnknown(reply);
        }
        request.log.info({ ...details, msgId: record.msgId }, "Zalo message sent");
        return reply.code(201).send(record);
      } catch (error) {
        if (error instanceof ZaloRejectedError) {
          request.log.warn({ ...details, reason: error.message }, "Zalo refused the message");
          return reply.code(422).send({ code: "REJECTED", message: "Zalo refused the message" });
        }
        request.log.warn({ ...details, reason: reasonOf(error) }, "Zalo send broke midway");
        return sendOutcomeUnknown(reply);
      }
    },
  );

  // zalo-send-files, D-374: a picture or file comes as multipart/form-data, read by Node's own `Request.formData()` from
  // the bytes Fastify hands over; no other route takes multipart.
  app.addContentTypeParser("multipart/form-data", { parseAs: "buffer", bodyLimit: FILE_BODY_LIMIT }, (_request, body, done) =>
    done(null, body),
  );
  const fileTimeoutMs = options.fileTimeoutMs ?? 100_000;

  app.post<{ Params: AccountParams; Body: Buffer }>(
    "/accounts/:accountId/messages/file",
    {
      bodyLimit: FILE_BODY_LIMIT,
      errorHandler: (error, _request, reply) => {
        if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
          return reply.code(400).send({ code: "PAYLOAD_TOO_LARGE", message: "The request is larger than the route reads" });
        }
        return reply.send(error);
      },
    },
    async (request, reply) => {
      const { accountId } = request.params;
      const parsed = await fileRequestOf(request.headers["content-type"], request.body);
      if ("code" in parsed) {
        return reply.code(400).send(parsed);
      }
      const { meta, file } = parsed;
      const known = sentLog.get(accountId, meta.clientMessageId);
      if (known?.state === "SENT") {
        return reply.code(200).send(known.record);
      }
      if (known !== undefined) {
        return sendOutcomeUnknown(reply);
      }
      try {
        sessions.requireLive(accountId);
      } catch (error) {
        return sendSessionError(reply, error);
      }
      if (!rate.tryTake(accountId)) {
        return reply.code(429).send({ code: "RATE_LIMITED", message: "At most one message per second per account" });
      }

      // IDs, the kind and the size only: never the bytes or the name of the file (D-282).
      const details = { accountId, threadId: meta.threadId, clientMessageId: meta.clientMessageId, kind: file.kind, bytes: file.data.length };
      const sending = sentLog.track(accountId, meta.clientMessageId, sessions.sendFile(accountId, meta.threadId, meta.threadType, file));
      try {
        const record = await within(sending, fileTimeoutMs);
        if (record === TIME_UP) {
          request.log.warn(details, "Zalo did not answer the file in time");
          void sending.then(
            (late) => request.log.info({ ...details, msgId: late.msgId }, "Zalo file sent after the timeout"),
            (error: unknown) =>
              request.log.warn({ ...details, reason: reasonOf(error), refused: error instanceof ZaloRejectedError }, "Zalo file failed after the timeout"),
          );
          return sendOutcomeUnknown(reply);
        }
        request.log.info({ ...details, msgId: record.msgId }, "Zalo file sent");
        return reply.code(201).send(record);
      } catch (error) {
        if (error instanceof ZaloRejectedError) {
          request.log.warn({ ...details, reason: error.message }, "Zalo refused the file");
          return reply.code(422).send({ code: "REJECTED", message: "Zalo refused the file" });
        }
        request.log.warn({ ...details, reason: reasonOf(error) }, "Zalo file send broke midway");
        return sendOutcomeUnknown(reply);
      }
    },
  );

  app.post<{ Params: AccountParams; Body: LookupBody }>(
    "/accounts/:accountId/sent/lookup",
    { schema: { body: lookupBodySchema } },
    async (request, reply) => {
      const { accountId } = request.params;
      const { threadId, clientMessageId, text } = request.body;
      const after = Date.parse(request.body.after);
      let own: OwnMessages;
      try {
        own = sessions.ownMessages(accountId, threadId, text, after);
      } catch (error) {
        return sendSessionError(reply, error);
      }

      const known = sentLog.get(accountId, clientMessageId);
      const msgIds = known?.state === "SENT" ? [known.record.msgId] : [];
      for (const msgId of own.msgIds) {
        if (!msgIds.includes(msgId)) msgIds.push(msgId);
      }
      // "I do not know" must not read as "it did not go out": sino-api would send it again. Nothing is known
      // from before the session started, nor of sends older than what the sent log remembers.
      const knownSince = Math.max(own.liveSince, sentLog.knowsSince());
      if (msgIds.length === 0 && (known !== undefined || knownSince > after)) {
        return reply
          .code(409)
          .send({ code: "CANNOT_TELL", message: "sino-zalo cannot tell whether the message went out" });
      }
      return { msgIds };
    },
  );
}

/** What a request sends: a text, or a picture read out of its base64 with the extension of its name as its type. */
type Content =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "image"; readonly image: ZaloImage; readonly type: string };

/** Why a request cannot be sent, as the 400 answers it. */
interface Refusal {
  readonly code: string;
  readonly message: string;
}

const IMAGE_TOO_LARGE: Refusal = { code: "IMAGE_TOO_LARGE", message: "A picture is at most 1 MiB" };

/** A message is a text or a picture: not both, and not neither (a picture's text is empty or missing). */
function contentOf(body: SendBody): Content | Refusal {
  const { text, image } = body;
  const hasText = text !== undefined && text !== "";
  if (image === undefined) {
    return hasText
      ? { kind: "text", text }
      : { code: "INVALID_MESSAGE", message: "A message needs a text or a picture" };
  }
  if (hasText) {
    return { code: "INVALID_MESSAGE", message: "A message is a text or a picture, not both" };
  }
  if (image.data.length > MAX_IMAGE_BASE64_LENGTH) {
    return IMAGE_TOO_LARGE;
  }
  const data = Buffer.from(image.data, "base64");
  // Buffer.from skips whatever is not base64, so only text that encodes back to itself is taken.
  if (data.toString("base64") !== image.data) {
    return { code: "INVALID_IMAGE", message: "image.data is not base64" };
  }
  if (data.length > MAX_IMAGE_BYTES) {
    return IMAGE_TOO_LARGE;
  }
  return {
    kind: "image",
    image: { data, fileName: image.fileName, width: image.width, height: image.height },
    type: image.fileName.slice(image.fileName.lastIndexOf(".") + 1),
  };
}

/** What goes with the bytes of a picture or file (D-374). */
interface FileMeta {
  readonly threadId: string;
  readonly threadType: ThreadType;
  readonly clientMessageId: string;
  readonly kind: "PHOTO" | "FILE";
  readonly fileName: string;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** The bytes of the largest file and room for the meta part and the boundaries. */
const FILE_BODY_LIMIT = 26 * 1024 * 1024;
const PICTURE_NAME = /\.(jpe?g|png|webp|gif)$/i;

const badFileRequest = (message: string): Refusal => ({ code: "INVALID_FILE_REQUEST", message });

/** The meta part and the file of a multipart request, checked; or why it cannot be sent. */
async function fileRequestOf(contentType: string | undefined, body: unknown): Promise<{ meta: FileMeta; file: ZaloFile } | Refusal> {
  if (contentType === undefined || !contentType.startsWith("multipart/form-data") || !Buffer.isBuffer(body)) {
    return badFileRequest("A file comes as multipart/form-data");
  }
  let form: FormData;
  try {
    form = await new Request("http://sino-zalo.local/", { method: "POST", headers: { "content-type": contentType }, body }).formData();
  } catch {
    return badFileRequest("The form cannot be read");
  }
  const metaPart = form.get("meta");
  const filePart = form.get("file");
  if (typeof metaPart !== "string" || !(filePart instanceof File)) {
    return badFileRequest("A file request has the parts meta and file");
  }
  const meta = metaOf(metaPart);
  if (meta === null) {
    return badFileRequest("meta needs threadId, threadType, clientMessageId, kind and fileName");
  }
  const data = Buffer.from(await filePart.arrayBuffer());
  if (data.length === 0) {
    return { code: "INVALID_FILE", message: "The file is empty" };
  }
  if (data.length > (meta.kind === "PHOTO" ? MAX_PHOTO_BYTES : MAX_FILE_BYTES)) {
    return { code: "FILE_TOO_LARGE", message: "A photo is at most 10 MiB and a file 25 MiB" };
  }
  if (meta.kind === "FILE") {
    // zca-js would take a file named as a picture for one; sino-api renames those (D-371).
    return PICTURE_NAME.test(meta.fileName)
      ? badFileRequest("A file that is no photo is not named as a picture")
      : { meta, file: { kind: "FILE", data, fileName: meta.fileName } };
  }
  const size = pictureSize(data);
  if (size === null || !PICTURE_NAME.test(meta.fileName)) {
    return { code: "INVALID_FILE", message: "A photo is a JPEG, PNG, WebP or GIF named as one" };
  }
  return { meta, file: { kind: "PHOTO", data, fileName: meta.fileName as `${string}.${string}`, ...size } };
}

function metaOf(text: string): FileMeta | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { threadId, threadType, clientMessageId, kind, fileName } = value as Record<string, unknown>;
  const isId = (field: unknown): field is string => typeof field === "string" && field.length >= 1 && field.length <= 200;
  const isName =
    typeof fileName === "string" && fileName.length >= 1 && fileName.length <= 255 && !/[/\\\u0000-\u001f]/.test(fileName);
  if (!isId(threadId) || !isId(clientMessageId) || !isName) {
    return null;
  }
  if ((threadType !== "USER" && threadType !== "GROUP") || (kind !== "PHOTO" && kind !== "FILE")) {
    return null;
  }
  return { threadId, threadType, clientMessageId, kind, fileName };
}

function sendOutcomeUnknown(reply: FastifyReply) {
  return reply
    .code(504)
    .send({ code: "OUTCOME_UNKNOWN", message: "Zalo did not say whether the message went out" });
}

/** The send's record, or TIME_UP once the time has run out; the send itself goes on. */
async function within(sending: Promise<SentRecord>, timeoutMs: number): Promise<SentRecord | typeof TIME_UP> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<typeof TIME_UP>((resolve) => {
    timer = setTimeout(() => resolve(TIME_UP), timeoutMs);
  });
  try {
    return await Promise.race([sending, timeUp]);
  } finally {
    clearTimeout(timer);
  }
}

/** The error's name and first line. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }
  return `${error.name}: ${error.message.split("\n", 1)[0] ?? ""}`;
}
