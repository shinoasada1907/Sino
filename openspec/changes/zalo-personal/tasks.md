# F09 — Zalo cá nhân (zca-js) · Implementation Plan

> **AUTO từ ZL-02** (người dùng, 2026-10-15: "chuyển sang mode AUTO tiếp tục phần tích hợp zalo"; `project-mode.yaml` `zalo-personal: AUTO`): Claude làm từng task, kiểm chứng, viết tài liệu, commit, rồi báo lại và dừng. Phần TRAINING dưới đây áp cho ZL-01. **LÝ DO:** người dùng tự gõ ZL-01, rồi chọn AUTO cho phần còn lại.
>
> ~~**TRAINING:** người dùng code mọi task từ ZL-01~~ (áp cho ZL-01) ("Toàn bộ", 2026-10-14; `project-mode.yaml` `zalo-personal`). Claude hướng dẫn theo D-287:
> - mỗi bước chỉ đưa đoạn code mới hoặc đổi, kèm chỗ chèn chính xác, không in lại cả file;
> - giải thích: làm gì, vì sao, giải quyết gì, scale ra sao;
> - review code người dùng gõ, chạy test.
>
> **Gợi ý trong file này:** chỉ Level 1–2; code đầy đủ nằm trong chat của từng task.
>
> **Mỗi task xong khi:**
> - test viết trước, đỏ rồi xanh;
> - lint, typecheck và test của phần đã đụng xanh;
> - người dùng giải thích được luồng (learning gate);
> - có mục trong `docs/knowledge/phase-5-multi-provider-send.md` và `.docx` sinh lại;
> - có một commit riêng trên `dev`.
>
> **Zalo thật:** chỉ dùng nick phụ, chỉ ở ~~ZL-00 và~~ ZL-13.

## 0. Cổng đi/không đi

- [x] 0.1 ~~**ZL-00 — Đo độ bền bằng script spike** trước khi code~~ → các phép đo chuyển sang ZL-13, làm cùng lần chạy thật. **LÝ DO:** người dùng (2026-10-14): "không cần đầu khi nào làm rồi work 1 thể vì login được rồi mà". Spike đã chứng minh đăng nhập QR, dùng lại phiên và nhận tin chạy được. Phần chưa đo được thiết kế để vẫn chạy trước khi đo (D-270). Rủi ro người dùng chấp nhận: nếu ZL-13 thấy kết quả xấu (bị đá khi chỉ dùng điện thoại, cửa sổ bù tin quá ngắn) thì phần đã code có thể phải bỏ hoặc sửa nhiều. Không còn task nào chờ ZL-00.
  - **Đã có từ spike (2026-10-14):** QR được; dùng lại phiên được; mở chat.zalo.me thì bị đá (`3003`, phiên bị hủy); 20 phút chỉ dùng điện thoại thì không bị đá; `requestOldMessages` chỉ trả tin sau `lastId`; `getGroupChatHistory` trả `404`. Bằng chứng ở design (Kết quả spike).
  - **Hints** (giữ lại cho ZL-04): Level 1: "tại sao `requestOldMessages` với `lastId` cũ lại quan trọng hơn lịch sử cũ đối với Sino?"

## 1. `apps/sino-zalo` (Node + TypeScript)

- [ ] 1.1 **ZL-01 — Khung service: Fastify, cấu hình, khóa bí mật, `/health`**
  - **Goal:** một service chạy được, chỉ `sino-api` gọi được (D-282, D-283).
  - **Files:** `apps/sino-zalo/{package.json,tsconfig.json,~~eslint.config.js~~ .oxlintrc.json,vitest.config.ts,.env.example,.gitignore,README.md}`, `src/{server.ts,app.ts,config.ts,auth.ts}`, `test/{auth.test.ts,health.test.ts,config.test.ts}`. **LÝ DO** (2026-10-15, sino-api-67): `sino-web` và `sino-site` dùng oxlint (`pnpm lint` = `oxlint`), không dùng ESLint; D-283 muốn stack "như sino-web". Node 24+ chạy thẳng file `.ts` (bỏ kiểu khi chạy), nên `pnpm dev` / `pnpm start` là `node src/server.ts`, không cần `tsx` hay bước build; `tsc` chỉ kiểm kiểu.
  - **Acceptance criteria:** spec `zalo-gateway` (Chỉ sino-api gọi được sino-zalo); `pnpm lint`, `pnpm typecheck`, `pnpm test` xanh; `pnpm dev` chạy và `curl /health` trả `UP`.
  - **Test:** thiếu khóa / sai khóa / đúng khóa; khóa ngắn hơn 32 byte làm `loadConfig` ném lỗi; `/health` không cần khóa.
  - **Depends on:** — ~~(làm được trong lúc ZL-00 đang đo)~~ (ZL-00 gộp vào ZL-13, D-270)
  - **Bạn sẽ học:** cấu trúc một service Node + TypeScript, `app.ts` tách khỏi `server.ts` để test bằng `inject`, hook `onRequest` của Fastify, vì sao so khóa phải dùng `timingSafeEqual`.
  - **Hints:** Level 2: hàm `buildApp(config)` trả `FastifyInstance`, `server.ts` chỉ gọi `listen`. Kiểm khóa ở một hook, bỏ qua đúng `/health`.
  - **Thực hiện (2026-10-15):** người dùng gõ cấu hình và `src/`; ba file test do Claude viết theo lời người dùng ("bạn viết test giúp tôi đi"). Review trước khi chạy test tìm 4 chỗ, người dùng sửa cả 4: `400` → `401`, chữ "Wrong" trong lỗi, `.message` nằm ngoài `${}` ở `server.ts`, `process.on` → `once`.
  - **Bằng chứng:** đỏ trước: 3 file `Cannot find module`; xanh: `pnpm test` 13/13, `pnpm lint` 0, `pnpm typecheck` 0; chạy thật ở cổng 8099: `/health` 200 không khóa, 401 không khóa, 404 có khóa, khóa không có trong log, thiếu khóa thì thoát mã 1 kèm tên biến; người dùng chạy `pnpm dev` ở cổng 8090: "ok". Kiến thức: mục 5 của `phase-5-multi-provider-send.md` + `.docx` (`genoffice docs check`: 0 lỗi).
  - **Còn mở:** learning gate (D-287): 3 câu tự kiểm chưa trả lời; tick task này khi người dùng trả lời hoặc nói bỏ qua.

- [x] 1.2 **ZL-02 — `ZaloGateway` và đăng nhập QR**
  - **Goal:** `sino-api` mở được một lần đăng nhập QR và nhận phiên khi người dùng quét xong (D-275).
  - **Files:** `src/gateway/{ZaloGateway.ts,ZcaGateway.ts,FakeZaloGateway.ts}`, `src/logins/{LoginStore.ts,routes.ts}`, `test/logins.test.ts`.
  - **Acceptance criteria:** spec `zalo-gateway` (Đăng nhập bằng mã QR): đủ 6 trạng thái; phiên chỉ trả một lần rồi `404`; `DELETE` hủy được.
  - **Test:** `FakeZaloGateway` phát lần lượt các sự kiện QR; kiểm từng response; lần đăng nhập bị quên sau `DONE`.
  - **Depends on:** ZL-01
  - **Bạn sẽ học:** interface làm ranh giới với thư viện ngoài (cách đổi zca-js mà không sửa code khác), callback thành trạng thái (state machine nhỏ), `Map` có hạn.
  - **Hints:** Level 1: "nếu `GET /logins/{id}` trả phiên mỗi lần được hỏi, kẻ nào đoán được `loginId` sẽ lấy được gì?"
  - **Thực hiện (2026-10-15):** chia 12 phase nhỏ; Phase 1–2 (cài `zca-js@2.2.0` ghim cứng, `paths`, `ZaloGateway.ts`) Claude làm theo lời người dùng, rồi người dùng chuyển sang AUTO. Ngoài danh sách file đã tính: `src/app.ts` (`buildApp(config, gateway, logger)`), `src/server.ts` (`new ZcaGateway()`), `test/{auth,health}.test.ts` (truyền `FakeZaloGateway`), `tsconfig.json` (`paths` → `zca-js/dist/index.d.ts`: `index.d.ts` của zca-js re-export một thư mục mà `nodenext` không đọc được). Thêm hai giới hạn không có trong danh sách test: chờ mã QR tối đa 15 giây rồi `502`; lần đăng nhập bị quên sau 5 phút (đồng hồ truyền vào để test). `ZcaGateway` gọi `abort()` sau `QRCodeExpired` / `QRCodeDeclined`, vì zca-js chờ mãi nếu không ai gọi `abort` hay `retry`.
  - **Bằng chứng:** đỏ trước: 3 file `Cannot find module '../src/gateway/FakeZaloGateway.ts'`; xanh: `pnpm test` 27/27, `pnpm lint` 0, `pnpm typecheck` 0; chạy thật với `ZcaGateway` (cổng 8097): `/health` 200, `POST /logins` không khóa 401, `GET /logins/nope` 404 `UNKNOWN_LOGIN`, `DELETE /logins/nope` 204, khóa không có trong log. **NOT VERIFIED:** `POST /logins` với Zalo thật (mã QR, quét, phiên, hết hạn 100 giây) chờ ZL-13. Kiến thức: mục 6 của `phase-5-multi-provider-send.md` + `.docx` (`genoffice docs check`: 0 lỗi).

- [x] 1.3 **ZL-03 — Phiên và listener: bật, tắt, bị đá, nối lại**
  - **Goal:** mỗi account có đúng một listener; bị đá thì báo ngay (D-276).
  - **Files:** `src/sessions/{SessionManager.ts,routes.ts}`, `src/notify.ts`, `test/sessions.test.ts`.
  - **Acceptance criteria:** spec `zalo-gateway` (Vòng đời phiên và listener, gồm dấu vân tay phiên của D-289).
  - **Test:** `PUT` hai lần chỉ một listener; mã `3003` → `ENDED` + webhook + `410`; mã `1006` → nối lại; `DELETE` xóa sạch; account lạ → `404 UNKNOWN_ACCOUNT`; bốn hàng `PUT` của D-289: cùng phiên đang sống → không làm gì; cùng phiên đã `ENDED` → `410` mà `FakeZaloGateway` không nhận lời gọi nào; phiên khác → thay phiên, listener cũ dừng; phiên khác bị từ chối → `ENDED` + `410` (thêm sau review 2026-10-14).
  - **Depends on:** ZL-02 ~~, **ZL-00 = đi**~~ (**LÝ DO:** ZL-00 gộp vào ZL-13, D-270)
  - **Bạn sẽ học:** vòng đời tài nguyên dài hạn (websocket) trong một service, idempotency, phân biệt lỗi tạm thời và lỗi vĩnh viễn.
  - **Hints:** Level 2: `SessionManager` giữ `Map<accountId, Session>`; `Session` có `state` (`LIVE` | `ENDED`), `ownId`, `fingerprint`, `listener`, bộ đệm (ZL-04). Level 1 (D-289): "nếu `PUT` thấy phiên đang sống là bỏ qua, thì người dùng quét lại xong, phiên mới đi vào `sino-zalo` bằng đường nào?"
  - **Thực hiện (2026-10-15, AUTO, sino-zalo-f4; nhận từ sino-zalo-9d đã thoát):**
    - **Nối lại do `SessionManager` tự làm, không dùng `retryOnClose` của zca-js** (D-276 đã sửa, agent chốt, cần xem lại). **LÝ DO:** log spike `listen.jsonl` cho thấy zca-js nối lại cả sau `3003` rồi báo `closed 1006`, nên bị đá sẽ trông như rớt mạng; zca-js cũng không hủy được lần nối lại đã hẹn và không đặt lại số lần thử. Độ trễ 1, 2, 4 … 60 giây, về 1 giây khi `connected`.
    - **Ngoài danh sách file đã tính:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (`loginWithSession`, `ZaloConnection`, `ZaloListener`, `SessionRejectedError`, `ZaloUnavailableError`); `src/app.ts` (`buildApp(config, gateway, { logger, notifier })`, `/health` đếm phiên thật, `onClose` dừng mọi listener); `src/server.ts`; `src/config.ts` + `.env.example` (`SINO_API_URL`, mặc định `http://127.0.0.1:8080`, cho webhook); `test/notify.test.ts` (tạo sớm, ZL-04 thêm phần gom 0,5 giây); `test/{config,auth,health,logins}.test.ts` (`apiUrl`).
    - **Thêm ngoài danh sách test:** `PUT` khi Zalo không trả lời → `502 ZALO_UNAVAILABLE`, phiên đang giữ không đổi (lỗi tạm thời không được thành `ENDED`); hai `PUT` cùng lúc chỉ đăng nhập một lần (mọi việc của một account chạy nối tiếp); listener tự dừng không bị nối lại; log không có cookie/imei; body thiếu phiên → `400`.
    - **Từ chối = đúng câu `ZaloApiError: Đăng nhập thất bại`** (thứ spike thấy khi cookie bị hủy, `login.jsonl`); lỗi khác của zca-js là `ZaloUnavailableError`. Chỗ dễ vỡ khi nâng zca-js; ZL-13 kiểm lại.
    - **`404 UNKNOWN_ACCOUNT` / `410` cho các route đọc, gửi:** `SessionManager.requireLive` và `sendSessionError` đã có và có test; route `GET /accounts/{id}/messages` dùng chúng ở ZL-04.
  - **Bằng chứng:** đỏ trước: `Cannot find module '../src/sessions/SessionManager.ts'`, `Cannot find module '../src/notify.ts'`, 3 test `apiUrl` của `config.test.ts`; xanh: `pnpm test` 54/54 (6 file), oxlint 0 chẩn đoán (19 file), `tsc` 0; chạy thật với `ZcaGateway` (cổng 8096, không gọi Zalo): `/health` 200 `{live 0, ended 0}`, `PUT session` không khóa 401, thiếu cookie 400, `DELETE` account lạ 204, khóa và imei không có trong log, `SINO_API_URL` sai → thoát mã 1 kèm tên biến. **NOT VERIFIED:** đăng nhập bằng cookie, listener, bị đá và rớt mạng với Zalo thật (ZL-13). Kiến thức: mục 7 của `phase-5-multi-provider-send.md` + `.docx` (`genoffice docs check`: 0 lỗi).

- [x] 1.4 **ZL-04 — Bộ đệm, cursor, bù tin, báo có tin**
  - **Goal:** `sino-api` kéo được tin theo cursor, không mất tin khi service khởi động lại (D-277, D-278).
  - **Files:** `src/sessions/{MessageBuffer.ts,CatchUp.ts}`, `src/messages/readRoutes.ts`, `src/notify.ts` (gom 0,5 giây), `test/{buffer.test.ts,catchup.test.ts,notify.test.ts}`.
  - **Acceptance criteria:** spec `zalo-gateway` (Bộ đệm tin và cursor, Bù tin lỡ ở lần kéo, Báo có tin mới).
  - **Test:** `after`/`limit`/`hasMore`; `999` < `1000`; `nextCursor` = `null` khi không có `after` lẫn tin; giới hạn 1.000 tin và 24 giờ; bù tin đúng một lần và chỉ khi cần; bù nhiều trang tới khi gặp trang rỗng hoặc tin đã có trong bộ đệm; dừng ở 10 trang mỗi loại hoặc 5 giây, kèm một log WARN không có nội dung tin; ba tin trong 0,3 giây → một webhook; webhook lỗi không mất tin. (Phần nhiều trang và `nextCursor` = `null` thêm sau review 2026-10-14, D-278.)
  - **Depends on:** ZL-03
  - **Bạn sẽ học:** cursor (keyset) thay cho phân trang theo trang; vì sao so `msgId` bằng `BigInt`; debounce; vì sao "báo rồi kéo" giữ được một đường lưu dữ liệu duy nhất.
  - **Hints:** Level 1: "nếu webhook lỗi mà tin vẫn còn trong bộ đệm, thì lúc nào `sino-api` sẽ lấy được nó?"
  - **Thực hiện (2026-10-15, AUTO, sino-zalo-f4; người dùng: "oke làm đi"):**
    - **Agent chốt, cần xem lại** (ghi trong design): 24 giờ của bộ đệm tính từ lúc tin vào bộ đệm (D-277); bù tin chờ listener nhận khóa giải mã `cipher_key`, trong cùng 5 giây (D-278); `ZaloMessage` thêm `fromName`, `participants` là người gửi các tin đi kèm, `title` có thể `null` (Contract API).
    - **Ngoài danh sách file đã tính:** `src/sessions/Conversations.ts` (tên thread qua `getUserInfo`/`getGroupInfo`, cache 1 giờ, chờ tối đa 2 giây; D-279 đặt việc này ở `sino-zalo` mà không task nào nhận); `src/gateway/*` (`ZaloMessage`, `ThreadInfo`, `ready`/`message`/`oldMessages`, `requestOldMessages`, `threadInfo`, `toZaloMessage`, `selfListen: true`); `src/app.ts` (route đọc); `test/{messages,zca}.test.ts`; `test/auth.test.ts` (route đọc tin giờ trả `404 UNKNOWN_ACCOUNT`). `notify.test.ts` đã có từ ZL-03.
    - **Thêm ngoài danh sách test:** `after` không phải số → `400`; tin tự gửi được giữ; tin trùng không báo webhook lần hai; bù tin chờ listener sẵn sàng; tên thread lỗi hoặc im lặng không giữ tin lại (review tìm ra: thiếu hẹn giờ thì một Zalo treo giữ cả lần kéo tin); `toZaloMessage` trên đối tượng tin của chính zca-js (1-1, tự gửi, nhóm, không phải chữ, `ts` hỏng).
    - **Giới hạn đã biết:** rớt mạng ngắn (`1006`) rồi nối lại thì tin đến trong lúc rớt chỉ về nếu Zalo tự gửi lại; bù tin chỉ chạy khi cursor cũ hơn bộ đệm (spec, D-278). Đo ở ZL-13 (thêm vào mục Đo, số 8).
  - **Bằng chứng:** đỏ trước: 3 file `Cannot find module` (`MessageBuffer`, `CatchUp`, `Conversations`), `messagesArrived is not a function`, `toZaloMessage is not a function`, `auth.test.ts` (route chưa có); test hẹn giờ tên thread đỏ với `Test timed out in 5000ms`; xanh: `pnpm test` 94/94 (10 file, 4 lần liền), oxlint 0 chẩn đoán (27 file), `tsc` 0; chạy thật với `ZcaGateway` (cổng 8095, không gọi Zalo): `GET` tin không khóa 401, account lạ 404 `UNKNOWN_ACCOUNT`, `after=abc` 400, `limit=5000` 400, khóa không có trong log. **NOT VERIFIED:** tin thật qua listener, `requestOldMessages`/`old_messages` thật, khóa trả về của `getUserInfo` (`<id>` hay `<id>_0`), độ dài trang bù tin (ZL-13). Kiến thức: mục 8 của `phase-5-multi-provider-send.md` + `.docx` (`genoffice docs check`: 0 lỗi).

- [x] 1.5 **ZL-05 — Gửi tin, chống trùng, giới hạn tốc độ, tra tin đã gửi**
  - **Goal:** trả lời từ Sino không bao giờ gửi trùng và không gửi dồn dập (D-280).
  - **Files:** `src/messages/{sendRoutes.ts,SentLog.ts,RateLimiter.ts}`, `test/{send.test.ts,lookup.test.ts}`.
  - **Acceptance criteria:** spec `zalo-gateway` (Gửi tin chữ, không gửi trùng, có giới hạn tốc độ; Tra tin đã gửi).
  - **Test:** cùng `clientMessageId` → một lần gửi; 2 tin trong 0,2 giây → `429`; Zalo từ chối → `422`; hết giờ → `504`; tra theo `clientMessageId`, theo tin `isSelf`, và `409 CANNOT_TELL`.
  - **Depends on:** ZL-04
  - **Bạn sẽ học:** idempotency key, token bucket (dạng đơn giản), vì sao "không biết" phải khác "không có".
  - **Hints:** Level 2: `SentLog` là `Map<clientMessageId, {msgId, sentAt, expiresAt}>`; ghi **trước** khi trả `201`.
  - **Thực hiện (2026-10-16, AUTO, phiên con của phiên chính):**
    - **Agent chốt, cần xem lại** (ghi trong design D-280 "Chốt ở ZL-05", spec `zalo-gateway` sửa theo, `openspec validate --strict` hợp lệ): `SentLog` ghi `PENDING` khi bắt đầu và ghi `msgId` ngay khi zca-js trả, kể cả sau `504`; gọi lặp khi lần trước còn `PENDING`/`UNKNOWN` → `504`, không gửi; tra tin trong trường hợp đó mà không thấy gì → `409 CANNOT_TELL`; Zalo từ chối thì quên ID (gửi lại được), lần đó vẫn tính vào 1 tin/giây; chỉ `ZaloApiError` có mã lỗi Zalo là từ chối, còn lại là "không biết"; hạn chờ gửi 10 giây (ZL-06 đặt hạn đọc của `sino-api` dài hơn); ~~kiểm phiên (`404`/`410`) trước `SentLog`~~ route gửi đọc `SentLog` trước khi kiểm phiên (ID đã `SENT` trả `200` kể cả khi phiên `ENDED`), route tra tin kiểm phiên trước như spec (**LÝ DO:** review trước commit: trả `410` cho một tin đã đi thì `sino-api` có thể ghi nó thất bại); tra tin trả `409` cả khi `after` cũ hơn 24 giờ (thêm sau review: `SentLog` chỉ nhớ 24 giờ); `SentLog` theo `(accountId, clientMessageId)`, ngoài phiên; giới hạn tốc độ đo bằng `performance.now()`.
    - **Review trước commit** (reviewer độc lập): sửa mốc 24 giờ, thứ tự `SentLog` trước phiên ở route gửi, log lần gửi lỗi sau khi đã hết giờ; thêm test gửi đồng thời (cùng ID: một lần gửi, request sau `504`; khác ID: một `201`, một `429`), log nhánh `422`/`504`, `409` khi hỏng giữa chừng, gửi lại được sau khi Zalo từ chối muộn. Một điểm thuộc `sino-api` để ZL-09 (ghi ở đó).
    - **Ngoài danh sách file đã tính:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (`sendText`, `ZaloRejectedError`; `sendText` của `ZcaGateway` export ra để test phân loại lỗi); `src/sessions/SessionManager.ts` (`sendText`, `ownMessages`, `liveSince`, `now`); `src/sessions/MessageBuffer.ts` (`filter`); `src/app.ts` (`now`, `sendTimeoutMs`, route gửi); `README.md`. Test `SentLog`, `RateLimiter` và `sendText` của zca-js nằm trong `test/send.test.ts`.
    - **Thêm ngoài danh sách test:** lần gọi lặp không tính vào giới hạn tốc độ; gửi được lại sau đúng 1 giây; lần thử bị `429` không đẩy lùi lượt sau; gửi lại được sau `422`; hỏng giữa chừng → `504` và không bao giờ gửi lại; `404`/`410` không gửi; body sai → `400` (cả `after` không múi giờ); log không có chữ của tin; tin vọng lại trùng `msgId` đã nhớ chỉ kể một lần; bỏ qua thread khác, chữ khác, tin trước `after`, tin người khác; phiên bật sau `after` mà vẫn thấy tin thì trả tin; `SentLog` quên sau đúng 24 giờ và tách theo account.
    - **Giới hạn đã biết:** zca-js gửi bằng `fetch` không có hạn chờ riêng, nên lần gửi treo nằm `PENDING` tới khi undici bỏ (mặc định khoảng 300 giây); `text` không có giới hạn độ dài vì chưa biết giới hạn của Zalo (ZL-13 thử tin dài).
  - **Bằng chứng:** đỏ trước: `send.test.ts` `Cannot find module '../src/messages/RateLimiter.ts'`, `lookup.test.ts` 11/11 (`expected 404 to be 200`, route chưa có); sau review 3 test mới đỏ đúng chỗ (`expected 200 to be 409`, `expected 410 to be 200`, thiếu log lỗi muộn), 4 test giữ hành vi đã có xanh ngay; xanh: `pnpm test` 137/137 (12 file, 4 lần liền), oxlint 0 chẩn đoán (32 file), `tsc` 0; chạy thật với `ZcaGateway` (cổng 8094, không gọi Zalo): gửi và tra tin không khóa 401, account lạ 404 `UNKNOWN_ACCOUNT`, `threadType` sai 400, `after` không múi giờ 400, khóa và chữ của tin không có trong log. **NOT VERIFIED:** gửi thật qua Zalo, `msgId` của tin vọng lại có trùng `msgId` gửi trả không, mã lỗi Zalo khi từ chối (ZL-13). Kiến thức: mục 9 của `phase-5-multi-provider-send.md` + `.docx` (`genoffice docs check`: 0 lỗi).

## 2. `sino-api` (Java)

- [x] 2.1 **ZL-06 — Connector `zalo`: cấu hình, client HTTP, bảng đổi lỗi, contract test**
  - **Goal:** `ZaloProvider` có trong registry ~~và~~ (khi `SINO_ZALO_ENABLED=true`, xem dưới) và qua bộ test contract F03 (D-273, D-281, D-286).
  - **Files:** `dev/sino/provider/infrastructure/zalo/{ZaloProperties,ZaloConfiguration,ZaloClient,ZaloProvider}.java`, `application.yaml` (`sino.zalo.*`), `.env.example`, test `ZaloProviderContractTest`, `ZaloErrorMappingTests` (WireMock; kiểm thẳng `ZaloClient`), thêm `ZaloConfigurationTests`, `ZaloProviderTests`, `ZaloWiringTests` (cả app khi bật Zalo).
  - **Acceptance criteria:** spec `zalo-provider` (Connector Zalo khai báo định danh và capability; Đổi lỗi; Công tắc tắt Zalo).
    - ~~Đủ ba capability ở task này~~ → định danh (`zalo`, "Zalo", `CHAT`, không `oauth2()`) ở đây; mỗi capability đi với task dựng thao tác của nó: `READ_MESSAGES` + `PUSH_WEBHOOK` ở ZL-08, `SEND_MESSAGES` ở ZL-09. **LÝ DO** (agent chốt 2026-10-17, cần xem lại): nơi gọi tin vào capability trước khi gọi (FR-06), và bộ contract F03 đòi mọi capability đã khai phải chạy được; khai trước khi có `fetchUpdates`/`sendMessage` thì bộ contract đỏ và màn hình cho bấm Gửi.
    - ~~Tắt công tắc thì `ZaloProvider` vẫn trong registry (D-286)~~ ở task này → chỉ đăng ký khi `SINO_ZALO_ENABLED=true`; phần "tắt thì không gọi `sino-zalo`" vẫn làm ở đây (trong `ZaloClient`). **LÝ DO** (người dùng chọn 2026-10-17, "Chỉ đăng ký khi bật"): web tự gán `connectable: true` cho mọi provider của API (`accounts.api.ts`) tới ZL-07/ZL-11, nên Zalo vào registry ngay thì hộp thoại kết nối hiện Zalo như kết nối được, bấm vào thì lỗi `CONNECT_NOT_SUPPORTED`. ZL-07 chuyển về đúng D-286.
  - **Test:** từng hàng của bảng D-281 (`404` và `410` → `PUT session` rồi thử lại một lần; `PUT` trả `410` → `AUTH_EXPIRED` không thử lại; thêm sau review 2026-10-14, D-289); tắt công tắc → không request nào tới WireMock; `./mvnw -B -ntp verify` xanh.
  - **Depends on:** ZL-05
  - **Bạn sẽ học:** `@ConfigurationProperties` + `record`, `RestClient`, đổi lỗi HTTP thành lỗi miền, contract test (abstract test class).
  - **Hints:** Level 1: "tại sao hết giờ khi gửi phải là `OUTCOME_UNKNOWN` mà không phải `PROVIDER_UNAVAILABLE`?" (xem F10 D-135).
  - **Thêm từ `f05c-messages-inbox-split` (D-306, 2026-10-16):** `ZaloProvider.kind()` = `CHAT`. `MessageProvider.kind()` không có default (BE-110 của f05c): nếu BE-110 vào `dev` trước thì ZL-06 khai luôn; nếu ZL-06 xong trước thì BE-110 thêm `kind()` cho Zalo. Spec `provider-registry` *Connector có công tắc tắt vẫn ở trong registry* của f05c trùng với D-286: tắt công tắc thì `ZaloProvider` vẫn đăng ký.
  - **Thực hiện (2026-10-17, AUTO):** BE-110 đã vào `dev`, nên `kind()` = `CHAT` khai luôn. `ZaloClient` có `putSession`, `messages`, `send`, `lookup`, mỗi lời gọi đi qua bảng D-281 và luật "`PUT session` rồi thử lại đúng một lần"; các chỗ bảng để ngỏ ghi ở design D-281 "Chốt ở ZL-06" (agent chốt, cần xem lại). `getAccountProfile` ném `CAPABILITY_NOT_SUPPORTED`: ai là account đến từ lần đăng nhập QR (ZL-07). Review độc lập trước commit: khóa ngoài ASCII lọt vào lời lỗi của JDK (sửa: khóa chỉ gồm ASCII nhìn thấy được, chặn `IllegalArgumentException`), công tắc đọc như boolean của Spring, log WARN cho `PUT 400`, thêm 7 phương thức test (17 ca chạy).
  - **Bằng chứng:** đỏ trước: biên dịch đỏ (4 lớp chưa có), sau review 8 test mới đỏ đúng chỗ; xanh: `-Dtest='Zalo*'` 83 test + `ZaloWiringTests`, `./mvnw -B -ntp verify` (worktree, trên `9f8af03`) 1613 test, 0 lỗi, 11 bỏ qua; gài lỗi 16/16 bị bắt (lượt đầu hỏng vì `mvnw.cmd` không chạy, mọi lỗi gài bị tính là bị bắt; chạy lại với đường gốc xanh); chạy thật với `sino-zalo` cổng 8093, không gọi Zalo: `401` → `PROVIDER_UNAVAILABLE` + ERROR, `404` → `PUT session` (body qua schema tới `session.imei`) → `400` → `AUTH_EXPIRED` + WARN, body gửi và tra tin qua schema, không có khóa hay cookie trong log. Kiến thức: mục 10 của `phase-5-multi-provider-send.md` + `.docx`. **Chưa kiểm:** phiên thật, đọc và gửi thật (ZL-08, ZL-09, ZL-13).

- [x] 2.2 **ZL-07 — Kết nối QR: SPI `qrLogin()`, API connect/poll/hủy, kết nối lại; `GET /api/providers` có `connectMethod`**
  - **Goal:** người dùng kết nối và kết nối lại Zalo bằng QR (D-275, D-285).
  - **Files:**
    - `provider/spi/{QrLogin,QrChallenge,QrLoginState}.java`, `MessageProvider.qrLogin()`;
    - `provider/api/ProviderResponse.java`;
    - `account/api/QrConnectController.java`, `account/application/QrConnectService.java`, pending trong session (theo cách `PendingConnects`);
    - `account/infrastructure/ConnectedAccountRepository.java` (một query: account chưa xóa của owner khác cùng `provider` và `externalAccountId`, D-290);
    - `ZaloProvider.qrLogin()`;
    - test `QrConnectApiTests`, `ProvidersApiTests`.
  - **Acceptance criteria:** spec `qr-connect` (cả 5 requirement); delta `provider-contract` (Contract kết nối bằng mã QR); delta `provider-catalog-api`.
  - **Test:** từng trạng thái; `DONE` tạo account `CONNECTED` với credential mã hóa; kết nối lại đúng/sai `ownId`; nick đã thuộc owner khác (kể cả account đang tắt) → `FAILED` `CONNECT_ACCOUNT_IN_USE`, không account nào đổi; owner cũ đã xóa account → kết nối được (D-290, thêm sau review 2026-10-14); thiếu `acceptRisk`; Gmail → ~~`400`~~ `422` (**LÝ DO:** lỗi nghiệp vụ trong app là `422`, như `CONNECT_NOT_SUPPORTED`; design D-275 "Chốt ở ZL-07"); tắt → `409`; `loginId` của session khác → `404`; `ModularityTests` xanh.
  - **Depends on:** ZL-06
  - **Bạn sẽ học:** mở rộng contract mà không phá connector cũ (`default` method), sealed interface cho trạng thái, lưu tạm trong HTTP session, vì sao kết nối lại phải so `externalAccountId`.
  - **Hints:** Level 2: đặt `QrConnectService` cạnh `ConnectService`, dùng lại ~~`AccountRegistration.register`~~ `AccountRegistrationService.register` (**LÝ DO:** review 2026-10-14: lớp trong code tên là `AccountRegistrationService`). Kiểm D-290 trong `QrConnectService` trước khi gọi `register`, không đặt trong `register`, vì luồng OAuth2 của Gmail cũng đi qua `register`.
  - **Thêm từ ZL-06 (2026-10-17):** `ZaloConfiguration` hiện chỉ đăng ký `ZaloProvider` khi `SINO_ZALO_ENABLED=true` (người dùng chọn, xem ZL-06). Khi `GET /api/providers` đã trả `connectMethod`/`connectable`, đăng ký nó cả khi tắt (D-286: `connectable: false`, mọi lời gọi ra `sino-zalo` ném `PROVIDER_UNAVAILABLE`, `ZaloClient` đã làm phần này), sửa `ZaloConfigurationTests` (`staysOffByDefaultAndSaysSo`, `offNeedsNoSecret`) cho đúng, và kiểm hộp thoại kết nối trên web hiện Zalo "Sắp có" khi tắt. `ZaloClient.putSession` đã có. Đây cũng là lúc requirement *Connector có công tắc tắt vẫn ở trong registry* của `f05c-messages-inbox-split` (spec `provider-registry`) đúng trở lại cho Zalo; nếu f05c được archive trước ZL-07 thì `openspec/specs/provider-registry` nói trước điều ZL-07 mới làm.
  - **Thực hiện (2026-10-17, AUTO):**
    - SPI thêm ~~"`qrLogin()` rỗng khi tắt"~~ `qrLogin()` luôn có cộng `default boolean turnedOn()`. **LÝ DO** (agent chốt, cần xem lại): spec `provider-catalog-api` đòi `connectMethod` = `QR` và spec `qr-connect` đòi `409 PROVIDER_DISABLED` khi tắt; `qrLogin()` rỗng thì cả hai sai (D-286 sửa theo).
    - `ConnectMethod`; `ProviderDescriptor` có `connectMethod` và `connectable`; registry dừng app khi một connector có cả hai cách kết nối.
    - Ngoài danh sách file: `QrConnectStatus`, `QrConnectStart`, `PendingQrConnect`, `PendingQrConnects`, `QrConnectRequest`, `QrChallengeResponse`, `QrStatusResponse`, `ZaloQrLogin`, `ConnectMethod`, các mã lỗi mới; test `PendingQrConnectsTests`, `QrConnectServiceTests`, `QrLoginStateTests`, `ZaloQrLoginTests`, `ZaloOffWiringTests`, `FakeQrLogin`. ~~`ProvidersApiTests`~~ → `ProvidersControllerTests` (tên lớp test có sẵn).
    - `ZaloConfiguration` luôn đăng ký `ZaloProvider` (D-286); hai `Condition` tự viết của ZL-06 bỏ, công tắc đọc qua `ZaloProperties.enabled`.
    - `ZaloProvider.SEND_TIMEOUT` (15 s) đổi thành `SLOW_TIMEOUT` (20 s), chung cho gửi tin và bắt đầu đăng nhập. **LÝ DO:** `sino-zalo` chờ Zalo đưa mã QR tối đa 15 s, quá hạn chờ đọc 10 s.
    - Web: `fetchConnectProviders` đọc `connectable` (kéo từ ZL-11), tạm chỉ coi `OAUTH2` là kết nối được tới khi có bước QR.
    - Review độc lập (không có CRITICAL/HIGH): `register` lỗi sau `DONE` → `FAILED`; `displayName` rỗng → `ownId`; web chặn QR tới ZL-11; thêm test hai lần hỏi song song, "Thêm" với nick đã có, account bị xóa trong lúc quét, `401`/`403` cho hỏi và hủy.
  - **Bằng chứng:**
    - **Đỏ trước:** biên dịch đỏ ở tầng provider; `QrConnectApiTests` 22/23 đỏ (`404`); 26 test Zalo đỏ; test web đỏ; sau review 4 test đỏ đúng chỗ (một test `401` sai, đã sửa: session vừa `POST` đã đăng nhập).
    - **Xanh:** `./mvnw -B -ntp verify` (worktree, `5a80bb4`) 1681 test, 0 lỗi, 11 bỏ qua; web trên `9461f75`: lint 0, `tsc -b` 0, test 769/769, build 0.
    - **Gài lỗi:** 19/19 bị bắt, gồm 2 lỗi sống sót lúc đầu nên thêm 2 test (hỏi dưới provider khác, `SCANNED` chưa phải xong).
    - **Chạy thật với `sino-zalo`** (cổng 8093, không gọi Zalo): login lạ → `Failed`, hủy → `204`, sai khóa → `PROVIDER_UNAVAILABLE` + ERROR, khóa không có trong log.
    - Kiến thức: mục 11 + `.docx`.
    - **NOT VERIFIED:** hộp thoại kết nối trong Chrome (extension Chrome không kết nối được; dữ liệu `connectable` có test, phần hiện "Sắp có" có test sẵn ở `connect.format.test.ts`); quét QR thật bằng nick phụ (ZL-13).

- [x] 2.3 **ZL-08 — Nhận tin: webhook, `registerPush`, `fetchUpdates`, chuẩn hóa**
  - **Goal:** tin Zalo hiện trong Hộp thư vài giây sau khi đến (D-277, D-279). Sau `f05c-messages-inbox-split` (D-300) tin Zalo hiện ở màn Tin nhắn (`/messages`), không ở Hộp thư.
  - **Files:** `provider/infrastructure/zalo/{ZaloWebhookController,ZaloMessageNormalizer,ZaloMessages}.java`, `ZaloProvider.{registerPush,fetchUpdates}`, cấu hình bảo mật cho `/api/webhooks/zalo`, test `ZaloWebhookTests`, `ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`.
  - **Acceptance criteria:** spec `zalo-provider` (Bảo đảm listener đang chạy; Lấy tin Zalo theo cursor; Chuẩn hóa tin Zalo; Webhook báo có tin Zalo).
  - **Test:** từng hàng của bảng D-279 ~~(đã sửa theo ZL-00)~~ (tên `zaloType` ngoài `webchat`, `chat.photo` là giả định tới ZL-13; test thêm ca tên lạ → `[Tin Zalo chưa hỗ trợ]` + `metadata.zaloType`, D-270); `registerPush` trả `expiresAt` = bây giờ + 3 ngày; `404` → `PUT session` → thử lại một lần; `410` → `PUT session` với phiên mới → thử lại → batch, account vẫn `CONNECTED` (quét lại sau khi bị đá, D-289); `410` rồi `PUT` cũng `410` → `AUTH_EXPIRED`; `nextCursor` = `null` của `sino-zalo` → cursor đầu; webhook đúng/sai khóa; body quá 1 KB bị từ chối. (Phần `410`, `expiresAt` và `nextCursor` = `null` thêm sau review 2026-10-14.)
  - **Depends on:** ZL-07
  - **Bạn sẽ học:** luồng push → sync có sẵn của F07 (`PushNotices`, `PushWatches`), chuẩn hóa dữ liệu ngoài về mô hình chung, endpoint public có khóa bí mật.
  - **Hints:** Level 1: ~~"vì sao `expiresAt` = 1 ngày lại làm `PushWatches` gọi `registerPush` mỗi giờ, và đó có phải điều mình muốn không?"~~ **LÝ DO:** review 2026-10-14 đổi `expiresAt` thành 3 ngày (D-277), câu hỏi cũ không còn đúng. Câu mới: "`registerPush` giờ chỉ chạy khoảng mỗi ngày một lần; vậy sau khi `sino-zalo` khởi động lại, cái gì bật lại listener trong vòng 5 phút?"
  - **Thêm từ ZL-06 (2026-10-17):** khai `READ_MESSAGES` và `PUSH_WEBHOOK` trong `ZaloProvider.capabilities()` ở task này; các test đọc tin và push của bộ contract F03 sẽ tự chạy trên `ZaloProviderContractTest` (cần dữ liệu mẫu qua WireMock). `ZaloClient.messages` (kèm `PUT session` rồi thử lại, D-289) và `putSession` (cho `registerPush`) đã có; bản ghi dây `ZaloClient.MessagePage` / `Message` / `Conversation` giữ `threadType` và `sentAt` dạng chữ để `ZaloMessageNormalizer` bỏ từng tin hỏng mà không bỏ cả trang. `ZaloMessages.java` chỉ cần nếu chuẩn hóa thật sự cần một lớp riêng. Bộ contract còn đòi `SyncCursor.initial(since)` bỏ tin cũ hơn `since` (`theFirstSyncFromAMomentLeavesOutOlderItems`), dù web gọi Zalo với `range: ALL` (D-288).
  - **Thực hiện (2026-10-17, AUTO):** `ZaloMessageNormalizer` chuẩn hóa trang `MessagePage` và từng `Message` theo D-279 (`USER` → `DIRECT`, `GROUP` → `GROUP`, `isSelf` → `OUTBOUND` + `SENT` + `read = true`, `webchat` → `TEXT`, 5 loại khác → chữ thay thế tiếng Việt + `metadata.zaloType`, cắt > 100 000 ký tự không chẻ đôi surrogate pair, xóa `\u0000`, lọc `sentAt < cursor.since()`, tin hỏng → `SkippedItem`), không cần tách thêm `ZaloMessages.java`; `ZaloProvider` khai `READ_MESSAGES` + `PUSH_WEBHOOK`, cài `fetchUpdates` (`GET /accounts/{accountId}/messages?after={cursor}&limit=100`) và `registerPush` (`PUT /accounts/{accountId}/session` + `PushRegistration(ownId, now + 3d)`); `ZaloWebhookController` + `ZaloWebhookErrorCode` nhận `POST /api/webhooks/zalo` (kiểm `Authorization: Bearer <SINO_ZALO_SECRET>` hằng thời gian, giới hạn 1 KB body, phát `ProviderPushReceived(ZaloProvider.TYPE, ownId, now)`).
  - **Bằng chứng:** đỏ trước: `ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`, `ZaloWebhookTests`, `ZaloProviderContractTest`; xanh: toàn bộ `Zalo*` (146 test) + `ModularityTests` xanh. Kiến thức: mục 13 của `phase-5-multi-provider-send.md` + `.docx`.

- [x] 2.4 **ZL-09 — Trả lời: `sendMessage`, `findSentMessages`**
  - **Goal:** trả lời tin Zalo từ Sino qua `ReplyService` của F10 mà không sửa lõi (D-280).
  - **Files:** `ZaloProvider.{sendMessage,findSentMessages}`, ~~`ZaloClient` (gửi, tra)~~, test `ZaloSendTests`, thêm ca Zalo vào `ConversationSendApiTests` nếu cần. **LÝ DO:** `ZaloClient.send` và `lookup` làm ở ZL-06, vì các hàng gửi và tra tin của bảng D-281 (`504`, `429`, `422`, `409`) chỉ có ở hai lời gọi đó. Task này khai `SEND_MESSAGES` và đổi `SendMessageCommand` sang `ZaloClient.SendRequest` / `LookupRequest`.
  - **Acceptance criteria:** spec `zalo-provider` (Trả lời tin Zalo); thư `UNKNOWN` của Zalo đi đúng D-136/D-138 khi tra trả `CANNOT_TELL` (ghi kết quả vào design D-280).
  - **Test:** gửi `USER` và `GROUP`; `429` / `422` / `504`; `404` / `410` khi gửi → `PUT session` → gửi lại một lần, không gửi trùng (D-289); tra theo `clientMessageId`; tra gặp `404` → `PUT` → tra lại; `CANNOT_TELL` thành lỗi; nếu ~~ZL-00~~ ZL-13 thấy tin vọng lại qua listener có `msgId` khác, sửa và thêm test cho cách đã chọn để không hiện hai lần. (Phần `404` / `410` và tin vọng lại thêm sau review 2026-10-14.)
  - **Depends on:** ZL-08
  - **Bạn sẽ học:** idempotency đầu-cuối (web → `sino-api` → `sino-zalo`), xử lý "kết quả không rõ".
  - **Hints:** Level 2: loại thread lấy từ cuộc trò chuyện đã lưu (`DIRECT` → `USER`).
  - **Từ review ZL-05 (2026-10-16), phải làm ở task này:** `ReplyService.reconcile` duyệt các tin "chưa rõ" của account từ cũ tới mới và `return` ở lỗi provider đầu tiên khác `CAPABILITY_NOT_SUPPORTED`. Nếu `409 CANNOT_TELL` thành `PROVIDER_UNAVAILABLE` (bảng D-281) thì sau khi `sino-zalo` khởi động lại, tin cũ trả `409` mãi và chặn đối chiếu mọi tin sau nó, kể cả sau khi quét lại. Cho `CANNOT_TELL` đi đường "không biết" (giữ `UNKNOWN`, sang tin kế), chốt cách làm với người dùng nếu phải sửa `ReplyService` hay bảng D-281; test: hai tin `UNKNOWN`, tin cũ nhận `409`, tin mới vẫn được xác nhận. Kiểm thêm: `ZaloClient` không tự gửi lại lệnh gửi.
  - **Thực hiện (2026-10-17, AUTO):** `ZaloProvider` khai `SEND_MESSAGES`, cài `sendMessage` (`ConversationType.GROUP` → `ThreadType.GROUP`, còn lại → `ThreadType.USER`, gọi `ZaloClient.send` trả `SendMessageResult(msgId, SENT, sentAt)`) và `findSentMessages` (gọi `ZaloClient.lookup`, đổi `409 CANNOT_TELL` thành `ProviderException(OUTCOME_UNKNOWN)` để `ZaloClient.lookup` vẫn giữ `PROVIDER_UNAVAILABLE` theo bảng D-281); `SendMessageCommand` mang thêm `ConversationType` (kèm constructor 6 tham số mặc định `DIRECT`); `ReplyService` truyền `ConversationType` khi gửi và đối chiếu, đồng thời cho `OUTCOME_UNKNOWN` trong `reconcile` đi nhánh `canTell = false` (giữ `UNKNOWN` cả sau 10 phút và duyệt tiếp tin mới hơn); `Replies.recipientsOf` lấy địa chỉ từ chính cuộc trò chuyện (`DIRECT` / `GROUP`) khi cuộc trò chuyện chỉ có tin tự gửi từ điện thoại.
  - **Bằng chứng:** đỏ trước: `ZaloSendTests`, `ZaloProviderTests`, `ZaloWiringTests`, `ConversationSendApiTests` (2 test mới); xanh: `Zalo*`, `ConversationSendApiTests`, `ConversationReplyApiTests`, `ModularityTests` (208 test, 0 lỗi). Kiến thức: mục 14 của `phase-5-multi-provider-send.md` + `.docx`.

- [x] 2.5 **ZL-10 — Ngắt phiên khi xóa/tắt account; công tắc tắt trọn vẹn**
  - **Goal:** xóa hay tắt account thì Sino không còn giữ phiên Zalo (D-284, D-286).
  - **Files:** `provider/spi/MessageProvider.disconnect`, `account/application/AccountManagementService` (gọi sau commit), `ZaloProvider.disconnect`, test `AccountDisconnectTests`, `ZaloDisconnectTests`.
  - **Acceptance criteria:** spec `zalo-provider` (Ngắt phiên khi xóa hoặc tắt account); delta `provider-contract` (Contract ngắt kết nối).
  - **Test:** xóa/tắt → `DELETE session` sau commit; rollback → không gọi; `sino-zalo` tắt → account vẫn xóa được + log cảnh báo; Gmail không đổi hành vi.
  - **Depends on:** ZL-09
  - **Bạn sẽ học:** việc phụ sau commit (`TransactionSynchronization` hoặc `@TransactionalEventListener`), best-effort và vì sao không được làm hỏng việc chính.
  - **Hints:** Level 1: "nếu gọi `DELETE session` **trước** khi commit mà transaction rollback, chuyện gì xảy ra?" Kiểm zca-js có API đăng xuất không (D-284).
  - **Thực hiện (2026-10-18, AUTO):** `MessageProvider` thêm `default void disconnect(ProviderContext)` (mặc định không làm gì); `ZaloClient.deleteSession` gọi `DELETE /accounts/{accountId}/session` kèm `Bearer <SINO_ZALO_SECRET>` và `ZaloProvider.disconnect` ủy quyền sang đó; `AccountManagementService.remove` đọc `ProviderContext` trước khi xóa credential trong transaction rồi gọi `disconnect` ngoài transaction sau khi `transaction.execute` đã commit; `AccountManagementService.update` khi `command.enabled() == false` và `account.disable()` thực sự đổi trạng thái thì đăng ký `TransactionSynchronization.afterCommit()` để gọi `disconnect` sau khi commit; lỗi của `disconnect` chỉ ghi `LOG.warn` (mã lỗi hoặc tên lớp ngoại lệ, không in nội dung lỗi thô hay credential) và không làm hỏng việc xóa/tắt tài khoản.
  - **Bằng chứng:** đỏ trước: 8/11 test trong `ZaloDisconnectTests` và `AccountDisconnectTests`; xanh: `ZaloDisconnectTests`, `AccountDisconnectTests`, `RemoveAccountRevokesTests`, `AccountsApiTests`, toàn bộ `Zalo*` và `ModularityTests` (195 test, 0 lỗi). Kiến thức: mục 15 của `phase-5-multi-provider-send.md` + `.docx`.

## 3. `sino-web`

- [x] 3.1 **ZL-11 — Bước Zalo trong hộp thoại kết nối**
  - **Goal:** người dùng kết nối và quét lại Zalo từ web, có cảnh báo trước (D-272, D-288).
  - **Files:** `apps/sino-web/src/features/accounts/{accounts.api.ts (connectMethod, ~~connectable,~~ QR API),connect.types.ts,ConnectWizard.tsx,components/QrStep.tsx,components/RiskStep.tsx,useQrConnect.ts}`, test cạnh từng file, handler MSW. **LÝ DO:** `fetchConnectProviders` đọc `connectable` từ API ngay ở ZL-07 (agent chốt, D-285 "Chốt ở ZL-07"): từ ZL-07 backend đăng ký Zalo cả khi tắt, nên web còn tự gán `true` thì hộp thoại cho bấm Zalo rồi báo lỗi. Task này còn: `connectMethod` (chọn bước QR) và các lời gọi QR.
  - **Acceptance criteria:** spec `zalo-connect-web` (cả 5 requirement); DN-2 (chữ cảnh báo) được người dùng chốt; đối chiếu canvas `ConnectWizard`.
  - **Test:** Vitest + MSW cho mọi trạng thái, gồm `DONE` mới → `initial-sync` với `range` = `ALL`, `DONE` kết nối lại → không `initial-sync`, `FAILED` `CONNECT_ACCOUNT_IN_USE` → lời báo (thêm sau review 2026-10-14, D-288, D-290); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ màn hộp thoại dùng.
  - **Depends on:** ZL-07 (contract API; dùng MSW nên làm song song với ZL-08…ZL-10 được)
  - **Bạn sẽ học:** polling bằng TanStack Query (`refetchInterval` dừng theo trạng thái), dọn dẹp khi đóng hộp thoại, vì sao web không tự đoán `connectable`.
  - **Hints:** Level 2: `refetchInterval` là hàm nhận dữ liệu hiện tại và trả `false` khi trạng thái không còn `WAITING`/`SCANNED`.
  - **Thêm từ `f05c-messages-inbox-split` (D-305, 2026-10-16):** bước cuối "Hoàn tất" của một tài khoản Zalo có nút "Mở Tin nhắn" (`/messages`), không phải "Mở hộp thư" (spec `connect-wizard` *Kết quả quay về* của f05c; FE-113 làm phần chọn nút theo `kind`).
  - **Thực hiện (2026-10-17, AUTO):** người dùng chốt giữ nguyên bản nháp chữ cảnh báo DN-2 (`ZALO_RISK_WARNING`). Bỏ chặn tạm `connectMethod === 'OAUTH2'` trong `fetchConnectProviders`, thêm `startQrConnect`, `fetchQrStatus`, `cancelQrConnect`; thêm `RiskStep`, `QrStep`, `useQrConnect` (polling 2 giây khi `WAITING`/`SCANNED`, dừng ở trạng thái kết thúc, gọi `initial-sync` với `range: 'ALL'` khi `DONE` và `reconnected: false`, `DELETE` khi đóng hộp thoại giữa chừng); nối vào `ConnectWizard` và đổi nút kết nối lại thành "Quét QR lại" cho tài khoản Zalo (`ReauthAlert`, `AccountsPage`, `AccountDetailPage`, `MobileAccountDetail`).
  - **Bằng chứng:** đỏ trước: 12 test mới trong `accounts.api.test.ts`, `connect.format.test.ts`, `ConnectOnApi.test.tsx`; xanh: `pnpm lint` 0, `pnpm exec tsc -b` 0, `pnpm build` 0, `pnpm test -- --run` 90/90 file (778/778 test). Kiến thức: mục 12 của `phase-5-multi-provider-send.md` + `.docx`.
  - **Sửa sau khi người dùng test QR thật (2026-10-18, AUTO):** hai lỗi, sửa trước rồi viết test hồi quy sau (người dùng yêu cầu "đỏ trước rồi xanh"):
    1. `useQrConnect` bỏ `active` ngay khi trạng thái về `DONE`, trong khi `initial-sync` và `invalidateQueries(['accounts'])` còn đang chạy → bước QR mất `challenge` lẫn `status`, hộp thoại nháy về rỗng trước khi `onDone` kịp chạy. Chuyển `setActive(null)` xuống sau `await invalidateQueries`. Thêm `refetchOnWindowFocus: false`, `refetchOnReconnect: false` cho query trạng thái: người dùng quét bằng điện thoại rồi quay lại trình duyệt, nên lần nào kết nối cũng có một lần focus lại, và mặc định của TanStack Query sẽ hỏi lại một `loginId` server đã dùng xong.
    2. `useConversationList` lấy `loaded` từ các trang `keepPreviousData` của kind trước trong lúc trang đầu của kind mới chưa về, mà hội thoại đang mở đọc dòng của nó từ `loaded` trước khi tự gọi API → dòng email lọt sang Tin nhắn và ngược lại. Lọc thêm `item.kind === kind`. **LÝ DO ghi ở đây dù lỗi thuộc `f05c-messages-inbox-split`** (D-306, D-307): người dùng yêu cầu ghi dưới ZL-11; mục "Thêm từ `f05c-messages-inbox-split`" ở trên đã nối hai change này.
  - **Bằng chứng (2026-10-18):** đỏ có thật — trả hai file về bản `554990a` rồi chạy 4 test mới: `expected undefined to be 'login-1'` (challenge bị bỏ sớm), `['login-1','login-1']` vs `['login-1']` hai lần (focus và reconnect hỏi lại login đã dùng), `[{ id: 'c-1' …}]` vs `[]` (dòng email còn trong `loaded` khi chuyển sang CHAT). Trả fix về: 17/17 test trong hai file đó. Cả bộ: `pnpm lint` 0 lỗi (2 cảnh báo cũ ở `features/public`), `pnpm exec tsc -b` 0, `pnpm build` 0, `pnpm test` 91/91 file (782/782 test; trước là 90/778). Commit trên `dev`: `922c307`, `c3a053d` (fix), `0685d37`, `5f885c3` (test). Không chạy Chrome: không màn nào đổi, chỉ hai hook.

## 4. Chạy, CI, nghiệm thu

- [x] 4.1 **ZL-12 — Chạy cục bộ, README, CI**
  - **Goal:** ai clone repo cũng chạy được `sino-zalo` cạnh `sino-api`; CI kiểm `sino-zalo`.
  - **Files:** `apps/sino-zalo/README.md`, `apps/sino-api/README.md` (mục Zalo: biến môi trường, cách tắt khẩn cấp hai bước), ~~compose (nếu `sino-api` chạy bằng compose)~~, `.github/workflows/zalo-ci.yml`. **LÝ DO** (agent, 2026-10-18): `apps/sino-api/compose.yaml` chỉ chạy PostgreSQL, bản thân `sino-api` không nằm trong compose, nên `sino-zalo` không có chỗ trong đó. `apps/sino-api/.env.example` cũng đã có sẵn ba biến Zalo từ ZL-06, không phải thêm.
  - **Acceptance criteria:** README đủ để chạy từ đầu; job CI chạy lint, typecheck, test của `sino-zalo` (xanh khi người dùng cho push).
  - **Test:** làm theo README trên máy sạch (thư mục mới); CI chạy cục bộ bằng các lệnh của job.
  - **Depends on:** ZL-10, ZL-11
  - **Bạn sẽ học:** cấu hình qua biến môi trường, health check, CI cho một package trong monorepo (`paths` filter).
  - **Thực hiện (2026-10-18, AUTO):** `.github/workflows/zalo-ci.yml` mới, dựng theo `frontend-ci.yml`: `paths` lọc `apps/sino-zalo/**` và chính file workflow, `working-directory: apps/sino-zalo`, pnpm theo `packageManager`, Node 26, cache theo `apps/sino-zalo/pnpm-lock.yaml` (repo không có pnpm workspace, mỗi app một lockfile riêng), rồi Install `--frozen-lockfile` / Lint / Type-check / Test. Không có bước Build: Node chạy TypeScript trực tiếp nên `pnpm typecheck` là chỗ duy nhất kiểm type. `apps/sino-api/README.md` thêm mục "Zalo: personal accounts through sino-zalo (F09)" (đặt trước mục Admin; trước đó README này không hề nhắc Zalo): bảng ba biến `SINO_ZALO_ENABLED` / `SINO_ZALO_URL` / `SINO_ZALO_SECRET`, cách sinh secret dùng chung cho hai bên, điều gì xảy ra khi tắt (`connectable: false`, `409 PROVIDER_DISABLED`, `PROVIDER_UNAVAILABLE` — chữ lấy đúng từ `QrConnectService` và `ZaloClient`), và mục con "Turn Zalo off in a hurry" hai bước theo D-286. `apps/sino-zalo/README.md`: sửa dòng Status còn ghi ZL-05, thêm mục "Run it next to sino-api" (6 bước từ bản clone sạch) và mục tắt khẩn cấp hai bước.
  - **Bằng chứng (2026-10-18):** chạy đúng các lệnh của job CI trong một thư mục sạch (copy `src`, `test`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `.oxlintrc.json`, `.gitignore`; không `node_modules`, không `.env`): `pnpm install --frozen-lockfile` xong trong 4,4 s (lockfile khớp), `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 12/12 file (137/137 test). Trong `apps/sino-zalo` thật: cùng kết quả; node v26.1.0, pnpm 11.21.0, khớp `node-version: "26"` của job. **Một lần đỏ đáng ghi:** lần chạy sạch đầu tiên `pnpm lint` thoát 1 vì oxlint đi vào `node_modules/typescript/lib/typescript.js` — nguyên nhân là bản copy thiếu `.gitignore`, không phải lỗi CI: `.oxlintrc.json` không có `ignorePatterns`, oxlint bỏ `node_modules` nhờ `.gitignore`, mà `actions/checkout` luôn mang file đó theo; thêm `.gitignore` vào thư mục sạch thì lint về 0. `apps/sino-web` cũng đúng kiểu này và `frontend-ci` vẫn xanh, nên không sửa. Câu `curl` trong README khớp đúng assert của `test/health.test.ts`: `{"status":"UP","sessions":{"live":0,"ended":0}}`. Kiến thức: mục 16 của `phase-5-multi-provider-send.md` + `.docx` sinh lại bằng genoffice; `genoffice docs check` 0 lỗi, 1 cảnh báo `placeholder_left` — cảnh báo sai: nó bắt `${{ github.ref }}`, vốn là cú pháp thật của GitHub Actions trong khối `yaml`, không phải chỗ trống chưa điền.
  - **NOT VERIFIED:** job `zalo-ci` chưa chạy thật trên GitHub (chưa push lúc viết dòng này) và không parse được YAML tại máy (máy không có thư viện yaml); `diff -u` với `frontend-ci.yml` chỉ khác tên, `paths`, timeout, chú thích và Build → Type-check, nên cấu trúc giống file GitHub đang nhận. Cũng chưa chạy thật hai service cạnh nhau theo README (cần backend + DB của người dùng và một nick Zalo): đó đúng là bước 1 kịch bản ZL-13, làm cùng ZL-13.

- [ ] 4.2 **ZL-13 — Nghiệm thu thật, trang công khai, archive**
  - **Goal:** chứng minh F09 chạy thật bằng nick phụ; người dùng ngoài biết rõ Sino làm gì với Zalo.
  - **Việc:**
    - **Kịch bản nghiệm thu bằng nick phụ:**
      1. Kết nối bằng QR.
      2. Nhận tin 1-1, tin nhóm và tin tự gửi.
      3. Trả lời.
      4. Mở chat.zalo.me: account thành "Cần đăng nhập lại", quét lại được, rồi chờ hơn 5 phút (qua một lượt đồng bộ dự phòng) và nhắn vào: account vẫn đã kết nối và tin vào Hộp thư (D-289).
      5. Tắt `sino-zalo` 10 phút, nhắn vào: tin được bù.
      6. Xóa account: phiên dừng.
      7. Tắt công tắc: Zalo thành "Sắp có".
    - **Đo (chuyển từ ZL-00, D-270; làm cùng kịch bản trên, bằng `sino-zalo` thật, hoặc script spike khi cần đo riêng):**
      1. Chạy 24 giờ, người dùng dùng điện thoại bình thường, không mở Web/PC: listener có bị đá không.
      2. Tin 1-1 từ nick chính, tin nhóm, tin tự gửi từ điện thoại, một ảnh, một sticker, một tệp, một tin thoại: ghi tên `zaloType` thật (log của `sino-zalo` có loại tin), rồi sửa bảng D-279 và `ZaloMessageNormalizer` kèm test.
      3. Trả lời từ Sino: listener có nhận lại tin đó (`isSelf`) không, và `msgId` nhận lại có trùng `msgId` mà gửi trả không. Khác nhau thì một tin hiện hai lần: sửa theo ZL-09.
      4. Tắt `sino-zalo` 1 giờ, rồi qua đêm, nhắn vào trong lúc tắt (hơn 30 tin một lần): bù được không, một trang `requestOldMessages` dài bao nhiêu tin, có log WARN "bù tin chưa hết" không (D-278).
      5. Mở lại Sino sau 24 giờ và 72 giờ không quét lại: phiên còn dùng được không.
      6. Mở Zalo PC bằng nick phụ: Sino có bị đăng xuất không.
      7. Quét lại trong Sino khi phiên cũ còn sống: phiên cũ có bị Zalo đá không, và account có ở trạng thái đã kết nối sau lượt đồng bộ kế tiếp không (D-289).
      8. Rớt mạng ngắn (tắt mạng máy chạy `sino-zalo` 1–2 phút, nhắn vào trong lúc đó, bật lại): tin trong lúc rớt có về qua listener sau khi nối lại không. Không về thì cần bù tin khi nối lại (thêm sau ZL-04, xem giới hạn đã biết ở ZL-04).
    - **Sau khi đo:**
      - điền bảng kết quả trong `spikes/zalo-zca/README.md` và mục Kết quả spike của design;
      - người dùng trả lời DN-1 nếu cửa sổ bù tin ngắn;
      - sửa câu Zalo PC trong chữ cảnh báo (DN-2) theo mục 6;
      - nếu listener bị đá cả khi chỉ dùng điện thoại: dừng và hỏi người dùng (giữ, sửa hay bỏ F09) trước khi archive.
    - Sửa `apps/sino-site`: chính sách quyền riêng tư VI/EN nói Zalo (phiên mã hóa, chỉ tin từ lúc kết nối, rủi ro); trang Sino Messages đổi "Zalo sắp có".
    - Cập nhật roadmap F09.
    - `openspec archive zalo-personal -y`.
  - **Acceptance criteria:** mọi bước của kịch bản và mọi phép đo có bằng chứng ngắn trong mục này; bảng D-279 dùng tên `zaloType` thật; spec đã gộp vào `openspec/specs/`.
  - **Depends on:** ZL-12

- [x] 4.3 **ZL-14 — Hiển thị sticker Zalo dạng ảnh trong chat**
  - **Goal:** Tin nhắn `chat.sticker` từ Zalo hiện ảnh sticker trong chat (`sino-web`), thay vì chỉ hiện chữ `[Sticker]`.
  - **Files:**
    - `apps/sino-zalo`: `ZaloGateway.ts`, `ZcaGateway.ts`, `Stickers.ts`, `SessionManager.ts`, `FakeZaloGateway.ts`, `test/stickers.test.ts`.
    - `apps/sino-api`: `NormalizedMessage.java`, `ZaloClient.java`, `ZaloMessageNormalizer.java`, `InboxMessage.java`, `MessageResponse.java`, `MessageHistory.java`, `ZaloStickerTests.java`, `ConversationMessagesApiTests.java`.
    - `apps/sino-web`: `sticker.ts`, `sticker.test.ts`, `inbox.types.ts`, `inbox.api.ts`, `inbox.api.test.ts`, `ChatThread.tsx`, `Sticker.test.tsx`.
  - **Acceptance criteria:**
    - `sino-zalo` parse `{ id, catId, type }` từ `chat.sticker`, tra cứu URL ảnh sticker (`getStickersDetail`) với cache bộ nhớ, timeout 2s;
    - `sino-api` kiểm tra an toàn URL (HTTPS, tên miền CDN Zalo `*.zadn.vn`, `*.zdn.vn`, `*.zaloapp.com`, `*.zalo.me`), lưu `metadata.stickerUrl`, trả trường `sticker` ở API messages;
    - `sino-web` hiển thị `img` sticker (`loading="lazy"`, `referrerPolicy="no-referrer"`), fallback về chữ `[Sticker]` khi URL không hợp lệ hoặc ảnh lỗi tải;
    - Mọi test suite (backend unit tests, zalo gateway tests, web unit tests) đều xanh; `tsc`, `lint`, `build` thành công.
  - **Depends on:** ZL-12
  - **Thực hiện (2026-10-18, AUTO):**
    - `apps/sino-zalo`: Viết `Stickers.ts` để tra cứu và cache URL; `toZaloMessage` parse `chat.sticker`; 14 test trong `test/stickers.test.ts` (151/151 test xanh, 0 lint error).
    - `apps/sino-api`: `STICKER_URL` trong `NormalizedMessage`, `Sticker` record trong `ZaloClient`, hàm chuẩn hóa URL `pictureAddress` trong `ZaloMessageNormalizer`, `sticker` trong `MessageResponse` và `MessageHistory`; 24 test trong `ZaloStickerTests` và 2 test trong `ConversationMessagesApiTests` đều xanh.
    - `apps/sino-web`: Hàm `pictureOf` kiểm tra URL an toàn trong `sticker.ts`; trường `sticker` trong `inbox.types.ts` và `inbox.api.ts`; hiển thị ảnh sticker trong `ChatThread.tsx` (có xử lý `onError` fallback); 35 test liên quan đến sticker xanh; toàn bộ 799 web test xanh, `oxlint` 0 lỗi, `tsc -b` và `pnpm build` thành công.

