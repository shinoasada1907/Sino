import type { Config } from "./config.ts";

/** Tells sino-api that something changed for a Zalo account; sino-api then pulls (D-277). */
export interface Notifier {
  /** The session ended (kick): sino-api syncs, meets 410 and asks the user to scan again. Never rejects. */
  sessionEnded(ownId: string): Promise<void>;
  /** New messages wait in the buffer; the calls of one account within the batch window make one webhook. Never throws. */
  messagesArrived(ownId: string): void;
}

export interface NotifierLog {
  warn(details: object, message: string): void;
}

export interface WebhookNotifierOptions {
  readonly batchMs?: number;
}

const TIMEOUT_MS = 5_000;

/** Calls `POST <sino-api>/api/webhooks/zalo` with the shared secret; a failure is logged, not thrown. */
export class WebhookNotifier implements Notifier {
  private readonly url: string;
  private readonly secret: string;
  private readonly log: NotifierLog;
  private readonly batchMs: number;
  /** Accounts with a webhook due at the end of their batch window. */
  private readonly due = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    config: Pick<Config, "apiUrl" | "secret">,
    log: NotifierLog,
    options: WebhookNotifierOptions = {},
  ) {
    this.url = `${config.apiUrl}/api/webhooks/zalo`;
    this.secret = config.secret;
    this.log = log;
    this.batchMs = options.batchMs ?? 500;
  }

  async sessionEnded(ownId: string): Promise<void> {
    await this.post(ownId);
  }

  messagesArrived(ownId: string): void {
    if (this.due.has(ownId)) {
      return;
    }
    // A fixed window from the first message: a steady stream still makes one call per window.
    const timer = setTimeout(() => {
      this.due.delete(ownId);
      void this.post(ownId);
    }, this.batchMs);
    // A webhook still due must not keep the process alive at shutdown.
    timer.unref();
    this.due.set(ownId, timer);
  }

  private async post(ownId: string): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ownId }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Nothing to read; cancelling the body frees the connection.
      await response.body?.cancel();
      if (!response.ok) {
        this.log.warn({ ownId, status: response.status }, "Webhook to sino-api failed");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.name : "Unknown error";
      this.log.warn({ ownId, reason }, "Webhook to sino-api failed");
    }
  }
}
