// Throwaway F09 spike: can Sino read and send on a personal Zalo account through zca-js?
// Logs metadata only (ids, types, times, lengths), never message text.
import { CloseReason, LoginQRCallbackEventType, ThreadType, Zalo } from "zca-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION = path.join(HERE, ".session", "credentials.json");
const LOGS = path.join(HERE, "logs");
const QR = path.join(HERE, "qr.png");
const QR_ATTEMPTS = 5;

const [, , command = "help", ...args] = process.argv;

function log(event, data = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
    console.log(line);
    fs.mkdirSync(LOGS, { recursive: true });
    fs.appendFileSync(path.join(LOGS, `${command}.jsonl`), line + "\n");
}

function errorText(error) {
    return String(error?.message ?? error);
}

function isoOf(ts) {
    const millis = Number(ts);
    return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : null;
}

function closeReasonName(code) {
    return CloseReason[code] ?? `unknown-${code}`;
}

function savedSession() {
    if (!fs.existsSync(SESSION)) return null;
    const session = JSON.parse(fs.readFileSync(SESSION, "utf-8"));
    return session.cookie && session.imei && session.userAgent ? session : null;
}

function saveSession(api) {
    const context = api.getContext();
    const session = {
        savedAt: new Date().toISOString(),
        cookie: context.cookie.toJSON()?.cookies ?? [],
        imei: context.imei,
        userAgent: context.userAgent,
    };
    fs.mkdirSync(path.dirname(SESSION), { recursive: true });
    fs.writeFileSync(SESSION, JSON.stringify(session, null, 2), "utf-8");
    log("session-saved", { cookies: session.cookie.length });
}

function openFile(file) {
    if (process.platform === "win32") execFile("cmd", ["/c", "start", "", file]);
}

async function loginWithQr(zalo) {
    let attempts = 0;
    const api = await zalo.loginQR({ qrPath: QR }, async (event) => {
        switch (event.type) {
            case LoginQRCallbackEventType.QRCodeGenerated:
                attempts++;
                await event.actions.saveToFile(QR);
                log("qr-ready", { file: QR, attempt: attempts, expiresInSeconds: 100 });
                openFile(QR);
                break;
            case LoginQRCallbackEventType.QRCodeExpired:
                log("qr-expired", { attempt: attempts });
                if (attempts < QR_ATTEMPTS) event.actions.retry();
                else event.actions.abort();
                break;
            case LoginQRCallbackEventType.QRCodeScanned:
                log("qr-scanned", { name: event.data?.display_name ?? null });
                break;
            case LoginQRCallbackEventType.QRCodeDeclined:
                log("qr-declined");
                event.actions.abort();
                break;
            case LoginQRCallbackEventType.GotLoginInfo:
                log("qr-login-info");
                break;
        }
    });
    fs.rmSync(QR, { force: true });
    log("login", { method: "qr" });
    saveSession(api);
    return api;
}

async function signIn({ allowQr }) {
    const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
    const saved = savedSession();
    if (saved) {
        try {
            const api = await zalo.login(saved);
            log("login", { method: "saved-session", sessionSavedAt: saved.savedAt });
            return api;
        } catch (error) {
            log("login-failed", { method: "saved-session", sessionSavedAt: saved.savedAt, error: errorText(error) });
            if (!allowQr) throw error;
        }
    } else if (!allowQr) {
        throw new Error("No saved session: run `node spike.mjs login` first");
    }
    return loginWithQr(zalo);
}

function describeMessage(message) {
    const content = message.data.content;
    return {
        threadType: message.type === ThreadType.Group ? "group" : "user",
        threadId: message.threadId,
        msgId: message.data.msgId,
        isSelf: message.isSelf,
        msgType: message.data.msgType,
        sentAt: isoOf(message.data.ts),
        textLength: typeof content === "string" ? content.length : null,
    };
}

function watchConnection(listener, onClosed) {
    listener.on("connected", () => log("connected"));
    listener.on("disconnected", (code, reason) => log("disconnected", { code, reason: closeReasonName(code), detail: reason }));
    listener.on("closed", (code, reason) => {
        log("closed", { code, reason: closeReasonName(code), detail: reason });
        onClosed();
    });
    listener.on("error", (error) => log("listener-error", { error: errorText(error) }));
}

// Q1 (session survives a restart) and the account shown on the phone.
async function login({ allowQr }) {
    const api = await signIn({ allowQr });
    const info = await api.fetchAccountInfo();
    log("account", { ownId: api.getOwnId(), name: info?.profile?.displayName ?? null });
}

// Q2 (one connection per account) and Q4 (incoming messages arrive).
async function listen(minutes = 30) {
    const api = await signIn({ allowQr: false });
    const { listener } = api;
    watchConnection(listener, () => process.exit(0));
    listener.on("message", (message) => log("message", describeMessage(message)));
    listener.on("undo", (undo) => log("undo", { threadId: undo.threadId, isGroup: undo.isGroup }));
    listener.on("reaction", (reaction) => log("reaction", { threadId: reaction.threadId, isGroup: reaction.isGroup }));
    listener.start({ retryOnClose: true });
    log("listening", { minutes });
    setTimeout(() => {
        log("done", { reason: "time-up" });
        listener.stop();
        process.exit(0);
    }, minutes * 60_000);
}

function summarize(messages) {
    const times = messages.map((m) => Number(m.data.ts)).filter(Number.isFinite).sort((a, b) => a - b);
    return {
        count: messages.length,
        threads: new Set(messages.map((m) => m.threadId)).size,
        oldest: times.length ? isoOf(times[0]) : null,
        newest: times.length ? isoOf(times[times.length - 1]) : null,
    };
}

function oldestMsgId(messages) {
    return messages.reduce((oldest, m) => (Number(m.data.ts) < Number(oldest.data.ts) ? m : oldest)).data.msgId;
}

// Q3: how far back 1-1 and group history goes.
async function history(pages = 5) {
    const api = await signIn({ allowQr: false });
    const { listener } = api;
    const state = {
        [ThreadType.User]: { name: "user", page: 0, seen: new Set(), messages: [], done: false },
        [ThreadType.Group]: { name: "group", page: 0, seen: new Set(), messages: [], done: false },
    };
    let finished = false;
    const finish = async () => {
        if (finished) return;
        finished = true;
        listener.stop();
        await groupHistory(api);
        process.exit(0);
    };
    const request = (type, lastId) => {
        state[type].page++;
        log("old-request", { threadType: state[type].name, page: state[type].page, lastId });
        listener.requestOldMessages(type, lastId);
    };
    let idle = null;
    const waitThenFinish = () => {
        clearTimeout(idle);
        idle = setTimeout(() => {
            log("old-idle", { seconds: 20 });
            finish();
        }, 20_000);
    };

    watchConnection(listener, finish);
    listener.on("connected", () => {
        request(ThreadType.User, null);
        request(ThreadType.Group, null);
        waitThenFinish();
    });
    listener.on("old_messages", (messages, type) => {
        const s = state[type];
        const fresh = messages.filter((m) => !s.seen.has(m.data.msgId));
        fresh.forEach((m) => s.seen.add(m.data.msgId));
        s.messages.push(...fresh);
        log("old-batch", { threadType: s.name, page: s.page, ...summarize(messages), newToThisRun: fresh.length });
        if (fresh.length === 0 || s.page >= pages) {
            s.done = true;
            log("old-total", { threadType: s.name, pages: s.page, ...summarize(s.messages) });
        } else {
            request(type, oldestMsgId(messages));
        }
        if (state[ThreadType.User].done && state[ThreadType.Group].done) finish();
        else waitThenFinish();
    });
    listener.start();
}

async function groupHistory(api, maxGroups = 5) {
    try {
        const groups = Object.keys((await api.getAllGroups()).gridVerMap ?? {});
        log("groups", { count: groups.length, sampled: Math.min(groups.length, maxGroups) });
        for (const groupId of groups.slice(0, maxGroups)) {
            const result = await api.getGroupChatHistory(groupId, 50);
            log("group-history", { groupId, more: result.more, ...summarize(result.groupMsgs) });
        }
    } catch (error) {
        log("group-history-failed", { error: errorText(error) });
    }
}

// Q4 (sending works).
async function send(threadId, kind, ...words) {
    if (!threadId || !["user", "group"].includes(kind) || words.length === 0) {
        throw new Error("Usage: node spike.mjs send <threadId> <user|group> <text...>");
    }
    const api = await signIn({ allowQr: false });
    const type = kind === "group" ? ThreadType.Group : ThreadType.User;
    const result = await api.sendMessage(words.join(" "), threadId, type);
    log("sent", { threadId, threadType: kind, msgId: result?.message?.msgId ?? null });
}

const commands = {
    login: () => login({ allowQr: true }),
    check: () => login({ allowQr: false }),
    listen: () => listen(Number(args[0] ?? 30)),
    history: () => history(Number(args[0] ?? 5)),
    send: () => send(...args),
};

if (!commands[command]) {
    console.log("Usage: node spike.mjs <login | check | listen [minutes] | history [pages] | send <threadId> <user|group> <text...>>");
    process.exit(command === "help" ? 0 : 1);
}

try {
    await commands[command]();
    if (["login", "check", "send"].includes(command)) process.exit(0);
} catch (error) {
    log("failed", { error: errorText(error) });
    process.exit(1);
}
