import {
  type API,
  type Credentials,
  LoginQRCallbackEventType,
  Zalo,
  ZaloApiError,
} from "zca-js";
import {
  type QrLoginEvents,
  type QrLoginHandle,
  SessionRejectedError,
  type ZaloConnection,
  type ZaloGateway,
  type ZaloSession,
  ZaloUnavailableError,
} from "./ZaloGateway.ts";

/** ZaloGateway over zca-js, the unofficial Zalo Web client (D-283). */
export class ZcaGateway implements ZaloGateway {
  startQrLogin(events: QrLoginEvents): QrLoginHandle {
    let abort: (() => unknown) | null = null;
    let ended = false;
    let scanned = { displayName: "", avatarUrl: null as string | null };

    const end = (report: () => void) => {
      if (!ended) {
        ended = true;
        report();
      }
    };

    const zalo = new Zalo({ checkUpdate: false, logging: false });
    zalo
      .loginQR({}, (event) => {
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated:
            abort = event.actions.abort;
            // Cancelled before Zalo gave the code: stop here.
            if (ended) event.actions.abort();
            else events.qrReady(event.data.image);
            break;
          case LoginQRCallbackEventType.QRCodeScanned:
            abort = event.actions.abort;
            scanned = {
              displayName: event.data.display_name,
              avatarUrl: event.data.avatar || null,
            };
            events.scanned(scanned.displayName, scanned.avatarUrl);
            break;
          // zca-js waits forever after these two unless told to abort or retry.
          case LoginQRCallbackEventType.QRCodeExpired:
            event.actions.abort();
            end(() => events.expired());
            break;
          case LoginQRCallbackEventType.QRCodeDeclined:
            event.actions.abort();
            end(() => events.declined());
            break;
          case LoginQRCallbackEventType.GotLoginInfo:
            break;
        }
      })
      .then((api) => {
        const context = api.getContext();
        const session = {
          cookie: context.cookie.toJSON()?.cookies ?? [],
          imei: context.imei,
          userAgent: context.userAgent,
        };
        end(() => events.done({ ownId: api.getOwnId(), ...scanned }, session));
      })
      .catch((error: unknown) => end(() => events.failed(reasonOf(error))));

    return {
      cancel: () => {
        ended = true;
        abort?.();
      },
    };
  }

  async loginWithSession(session: ZaloSession): Promise<ZaloConnection> {
    const zalo = new Zalo({ checkUpdate: false, logging: false });
    let api: API;
    try {
      api = await zalo.login({
        cookie: session.cookie as Credentials["cookie"],
        imei: session.imei,
        userAgent: session.userAgent,
      });
    } catch (error) {
      throw isRefusal(error)
        ? new SessionRejectedError(reasonOf(error))
        : new ZaloUnavailableError(reasonOf(error));
    }

    return {
      ownId: api.getOwnId(),
      listener: (events) => {
        const listener = api.listener;
        listener.on("connected", () => events.connected());
        listener.on("closed", (code, reason) => events.closed(code, reason));
        // An "error" event nobody listens to would crash the process.
        listener.on("error", (error) => events.error(reasonOf(error)));
        return {
          // zca-js would reconnect after a kick too and then report 1006 (spike log),
          // so SessionManager decides when to reconnect (D-276).
          start: () => listener.start({ retryOnClose: false }),
          stop: () => listener.stop(),
        };
      },
    };
  }
}

/** How Zalo answers a revoked cookie, as the spike saw it (spikes/zalo-zca/logs/login.jsonl). */
function isRefusal(error: unknown): boolean {
  return error instanceof ZaloApiError && error.message === "Đăng nhập thất bại";
}

/** The error's name and first line: zca-js puts whole Zalo responses after the first line. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }
  const firstLine = error.message.split("\n", 1)[0] ?? "";
  return `${error.name}: ${firstLine}`;
}
