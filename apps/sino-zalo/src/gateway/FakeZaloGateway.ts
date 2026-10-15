import type {
  QrLoginEvents,
  QrLoginHandle,
  ZaloGateway,
} from "./ZaloGateway.ts";

/** Stands in for the PNG Zalo sends, in base64. */
export const FAKE_QR_IMAGE = "iVBORw0KGgo=";

export class FakeQrLogin implements QrLoginHandle {
  readonly events: QrLoginEvents;
  cancelled = false;

  constructor(events: QrLoginEvents) {
    this.events = events;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

/** ZaloGateway for tests: the test plays Zalo by calling the events of a login. */
export class FakeZaloGateway implements ZaloGateway {
  readonly logins: FakeQrLogin[] = [];
  /** What the next login does first: show a code, fail, or stay silent. */
  nextQr: "ready" | "fail" | "none" = "ready";

  startQrLogin(events: QrLoginEvents): QrLoginHandle {
    const login = new FakeQrLogin(events);
    this.logins.push(login);
    const first = this.nextQr;
    this.nextQr = "ready";
    // Zalo answers later, never inside the call: the fake does the same.
    queueMicrotask(() => {
      if (first === "ready") events.qrReady(FAKE_QR_IMAGE);
      if (first === "fail") events.failed("Zalo is down");
    });
    return login;
  }

  latest(): FakeQrLogin {
    const login = this.logins.at(-1);
    if (!login) {
      throw new Error("No login was started");
    }
    return login;
  }
}
