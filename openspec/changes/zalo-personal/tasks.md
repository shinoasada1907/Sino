# F09 — Zalo cá nhân (zca-js) · Implementation Plan

> **TRAINING:** người dùng code mọi task từ ZL-01 ("Toàn bộ", 2026-10-14; `project-mode.yaml` `zalo-personal`). Claude hướng dẫn theo D-287:
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
> **Zalo thật:** chỉ dùng nick phụ, chỉ ở ZL-00 và ZL-13.

## 0. Cổng đi/không đi

- [ ] 0.1 **ZL-00 — Đo độ bền bằng script spike** (Claude chạy, người dùng làm theo hướng dẫn trên điện thoại)
  - **Goal:** biết Zalo có giữ được kết nối và bù được tin lỡ không, trước khi code phần lớn (D-270).
  - **Đã có (2026-10-14):** QR được; dùng lại phiên được; mở chat.zalo.me thì bị đá (`3003`, phiên bị hủy); 20 phút chỉ dùng điện thoại thì không bị đá; `requestOldMessages` chỉ trả tin sau `lastId`; `getGroupChatHistory` trả `404`. Bằng chứng ở design (Kết quả spike).
  - **Còn đo:**
    1. Listener 24 giờ, người dùng dùng điện thoại bình thường, không mở Web/PC.
    2. Tin 1-1 từ nick chính; tin nhóm; tin tự gửi từ điện thoại; một ảnh, một sticker, một tệp, một tin thoại (ghi tên `zaloType` thật để sửa bảng D-279).
    3. `send` một tin chữ tới nick chính.
    4. Tắt listener 1 giờ, rồi qua đêm, nhắn vào trong lúc tắt, rồi bù bằng `requestOldMessages(lastId)` (cần thêm lệnh `catchup <lastId>` vào script spike).
    5. `check` sau 24 giờ và 72 giờ.
    6. Mở Zalo PC bằng nick phụ.
  - **Acceptance criteria:**
    - bảng kết quả trong `spikes/zalo-zca/README.md` đã điền;
    - kết luận **đi** hoặc **dừng** theo D-270, ghi vào design;
    - DN-1 được người dùng trả lời nếu cửa sổ bù tin ngắn.
  - **Test:** log JSON của script (`logs/*.jsonl`, không commit), trích số liệu vào README.
  - **Depends on:** —
  - **Hints:** Level 1: "tại sao `requestOldMessages` với `lastId` cũ lại quan trọng hơn lịch sử cũ đối với Sino?"

## 1. `apps/sino-zalo` (Node + TypeScript)

- [ ] 1.1 **ZL-01 — Khung service: Fastify, cấu hình, khóa bí mật, `/health`**
  - **Goal:** một service chạy được, chỉ `sino-api` gọi được (D-282, D-283).
  - **Files:** `apps/sino-zalo/{package.json,tsconfig.json,eslint.config.js,vitest.config.ts,.env.example,.gitignore,README.md}`, `src/{server.ts,app.ts,config.ts,auth.ts}`, `test/{auth.test.ts,health.test.ts,config.test.ts}`.
  - **Acceptance criteria:** spec `zalo-gateway` (Chỉ sino-api gọi được sino-zalo); `pnpm lint`, `pnpm typecheck`, `pnpm test` xanh; `pnpm dev` chạy và `curl /health` trả `UP`.
  - **Test:** thiếu khóa / sai khóa / đúng khóa; khóa ngắn hơn 32 byte làm `loadConfig` ném lỗi; `/health` không cần khóa.
  - **Depends on:** — (làm được trong lúc ZL-00 đang đo)
  - **Bạn sẽ học:** cấu trúc một service Node + TypeScript, `app.ts` tách khỏi `server.ts` để test bằng `inject`, hook `onRequest` của Fastify, vì sao so khóa phải dùng `timingSafeEqual`.
  - **Hints:** Level 2: hàm `buildApp(config)` trả `FastifyInstance`, `server.ts` chỉ gọi `listen`. Kiểm khóa ở một hook, bỏ qua đúng `/health`.

- [ ] 1.2 **ZL-02 — `ZaloGateway` và đăng nhập QR**
  - **Goal:** `sino-api` mở được một lần đăng nhập QR và nhận phiên khi người dùng quét xong (D-275).
  - **Files:** `src/gateway/{ZaloGateway.ts,ZcaGateway.ts,FakeZaloGateway.ts}`, `src/logins/{LoginStore.ts,routes.ts}`, `test/logins.test.ts`.
  - **Acceptance criteria:** spec `zalo-gateway` (Đăng nhập bằng mã QR): đủ 6 trạng thái; phiên chỉ trả một lần rồi `404`; `DELETE` hủy được.
  - **Test:** `FakeZaloGateway` phát lần lượt các sự kiện QR; kiểm từng response; lần đăng nhập bị quên sau `DONE`.
  - **Depends on:** ZL-01
  - **Bạn sẽ học:** interface làm ranh giới với thư viện ngoài (cách đổi zca-js mà không sửa code khác), callback thành trạng thái (state machine nhỏ), `Map` có hạn.
  - **Hints:** Level 1: "nếu `GET /logins/{id}` trả phiên mỗi lần được hỏi, kẻ nào đoán được `loginId` sẽ lấy được gì?"

- [ ] 1.3 **ZL-03 — Phiên và listener: bật, tắt, bị đá, nối lại**
  - **Goal:** mỗi account có đúng một listener; bị đá thì báo ngay (D-276).
  - **Files:** `src/sessions/{SessionManager.ts,routes.ts}`, `src/notify.ts`, `test/sessions.test.ts`.
  - **Acceptance criteria:** spec `zalo-gateway` (Vòng đời phiên và listener).
  - **Test:** `PUT` hai lần chỉ một listener; mã `3003` → `ENDED` + webhook + `410`; mã `1006` → nối lại; `DELETE` xóa sạch; account lạ → `404 UNKNOWN_ACCOUNT`.
  - **Depends on:** ZL-02, **ZL-00 = đi**
  - **Bạn sẽ học:** vòng đời tài nguyên dài hạn (websocket) trong một service, idempotency, phân biệt lỗi tạm thời và lỗi vĩnh viễn.
  - **Hints:** Level 2: `SessionManager` giữ `Map<accountId, Session>`; `Session` có `state` (`LIVE` | `ENDED`), `ownId`, `listener`, bộ đệm (ZL-04).

- [ ] 1.4 **ZL-04 — Bộ đệm, cursor, bù tin, báo có tin**
  - **Goal:** `sino-api` kéo được tin theo cursor, không mất tin khi service khởi động lại (D-277, D-278).
  - **Files:** `src/sessions/{MessageBuffer.ts,CatchUp.ts}`, `src/messages/readRoutes.ts`, `src/notify.ts` (gom 0,5 giây), `test/{buffer.test.ts,catchup.test.ts,notify.test.ts}`.
  - **Acceptance criteria:** spec `zalo-gateway` (Bộ đệm tin và cursor, Bù tin lỡ ở lần kéo, Báo có tin mới).
  - **Test:** `after`/`limit`/`hasMore`; `999` < `1000`; giới hạn 1.000 tin và 24 giờ; bù tin đúng một lần và chỉ khi cần; chờ tối đa 5 giây; ba tin trong 0,3 giây → một webhook; webhook lỗi không mất tin.
  - **Depends on:** ZL-03
  - **Bạn sẽ học:** cursor (keyset) thay cho phân trang theo trang; vì sao so `msgId` bằng `BigInt`; debounce; vì sao "báo rồi kéo" giữ được một đường lưu dữ liệu duy nhất.
  - **Hints:** Level 1: "nếu webhook lỗi mà tin vẫn còn trong bộ đệm, thì lúc nào `sino-api` sẽ lấy được nó?"

- [ ] 1.5 **ZL-05 — Gửi tin, chống trùng, giới hạn tốc độ, tra tin đã gửi**
  - **Goal:** trả lời từ Sino không bao giờ gửi trùng và không gửi dồn dập (D-280).
  - **Files:** `src/messages/{sendRoutes.ts,SentLog.ts,RateLimiter.ts}`, `test/{send.test.ts,lookup.test.ts}`.
  - **Acceptance criteria:** spec `zalo-gateway` (Gửi tin chữ, không gửi trùng, có giới hạn tốc độ; Tra tin đã gửi).
  - **Test:** cùng `clientMessageId` → một lần gửi; 2 tin trong 0,2 giây → `429`; Zalo từ chối → `422`; hết giờ → `504`; tra theo `clientMessageId`, theo tin `isSelf`, và `409 CANNOT_TELL`.
  - **Depends on:** ZL-04
  - **Bạn sẽ học:** idempotency key, token bucket (dạng đơn giản), vì sao "không biết" phải khác "không có".
  - **Hints:** Level 2: `SentLog` là `Map<clientMessageId, {msgId, sentAt, expiresAt}>`; ghi **trước** khi trả `201`.

## 2. `sino-api` (Java)

- [ ] 2.1 **ZL-06 — Connector `zalo`: cấu hình, client HTTP, bảng đổi lỗi, contract test**
  - **Goal:** `ZaloProvider` có trong registry và qua bộ test contract F03 (D-273, D-281, D-286).
  - **Files:** `dev/sino/provider/infrastructure/zalo/{ZaloProperties,ZaloConfiguration,ZaloClient,ZaloProvider}.java`, `application.yaml` (`sino.zalo.*`), `.env.example`, test `ZaloProviderContractTest`, `ZaloErrorMappingTests` (WireMock).
  - **Acceptance criteria:** spec `zalo-provider` (Connector Zalo khai báo định danh và capability; Đổi lỗi; Công tắc tắt Zalo).
  - **Test:** từng hàng của bảng D-281; tắt công tắc → không request nào tới WireMock; `./mvnw -B -ntp verify` xanh.
  - **Depends on:** ZL-05
  - **Bạn sẽ học:** `@ConfigurationProperties` + `record`, `RestClient`, đổi lỗi HTTP thành lỗi miền, contract test (abstract test class).
  - **Hints:** Level 1: "tại sao hết giờ khi gửi phải là `OUTCOME_UNKNOWN` mà không phải `PROVIDER_UNAVAILABLE`?" (xem F10 D-135).

- [ ] 2.2 **ZL-07 — Kết nối QR: SPI `qrLogin()`, API connect/poll/hủy, kết nối lại; `GET /api/providers` có `connectMethod`**
  - **Goal:** người dùng kết nối và kết nối lại Zalo bằng QR (D-275, D-285).
  - **Files:**
    - `provider/spi/{QrLogin,QrChallenge,QrLoginState}.java`, `MessageProvider.qrLogin()`;
    - `provider/api/ProviderResponse.java`;
    - `account/api/QrConnectController.java`, `account/application/QrConnectService.java`, pending trong session (theo cách `PendingConnects`);
    - `ZaloProvider.qrLogin()`;
    - test `QrConnectApiTests`, `ProvidersApiTests`.
  - **Acceptance criteria:** spec `qr-connect` (cả 4 requirement); delta `provider-contract` (Contract kết nối bằng mã QR); delta `provider-catalog-api`.
  - **Test:** từng trạng thái; `DONE` tạo account `CONNECTED` với credential mã hóa; kết nối lại đúng/sai `ownId`; thiếu `acceptRisk`; Gmail → `400`; tắt → `409`; `loginId` của session khác → `404`; `ModularityTests` xanh.
  - **Depends on:** ZL-06
  - **Bạn sẽ học:** mở rộng contract mà không phá connector cũ (`default` method), sealed interface cho trạng thái, lưu tạm trong HTTP session, vì sao kết nối lại phải so `externalAccountId`.
  - **Hints:** Level 2: đặt `QrConnectService` cạnh `ConnectService`, dùng lại `AccountRegistration.register`.

- [ ] 2.3 **ZL-08 — Nhận tin: webhook, `registerPush`, `fetchUpdates`, chuẩn hóa**
  - **Goal:** tin Zalo hiện trong Hộp thư vài giây sau khi đến (D-277, D-279).
  - **Files:** `provider/infrastructure/zalo/{ZaloWebhookController,ZaloMessageNormalizer,ZaloMessages}.java`, `ZaloProvider.{registerPush,fetchUpdates}`, cấu hình bảo mật cho `/api/webhooks/zalo`, test `ZaloWebhookTests`, `ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`.
  - **Acceptance criteria:** spec `zalo-provider` (Bảo đảm listener đang chạy; Lấy tin Zalo theo cursor; Chuẩn hóa tin Zalo; Webhook báo có tin Zalo).
  - **Test:** từng hàng của bảng D-279 (đã sửa theo ZL-00); `404` → `PUT session` → thử lại một lần; webhook đúng/sai khóa; body quá 1 KB bị từ chối.
  - **Depends on:** ZL-07
  - **Bạn sẽ học:** luồng push → sync có sẵn của F07 (`PushNotices`, `PushWatches`), chuẩn hóa dữ liệu ngoài về mô hình chung, endpoint public có khóa bí mật.
  - **Hints:** Level 1: "vì sao `expiresAt` = 1 ngày lại làm `PushWatches` gọi `registerPush` mỗi giờ, và đó có phải điều mình muốn không?"

- [ ] 2.4 **ZL-09 — Trả lời: `sendMessage`, `findSentMessages`**
  - **Goal:** trả lời tin Zalo từ Sino qua `ReplyService` của F10 mà không sửa lõi (D-280).
  - **Files:** `ZaloProvider.{sendMessage,findSentMessages}`, `ZaloClient` (gửi, tra), test `ZaloSendTests`, thêm ca Zalo vào `ConversationSendApiTests` nếu cần.
  - **Acceptance criteria:** spec `zalo-provider` (Trả lời tin Zalo); thư `UNKNOWN` của Zalo đi đúng D-136/D-138 khi tra trả `CANNOT_TELL` (ghi kết quả vào design D-280).
  - **Test:** gửi `USER` và `GROUP`; `429` / `422` / `504`; tra theo `clientMessageId`; `CANNOT_TELL` thành lỗi.
  - **Depends on:** ZL-08
  - **Bạn sẽ học:** idempotency đầu-cuối (web → `sino-api` → `sino-zalo`), xử lý "kết quả không rõ".
  - **Hints:** Level 2: loại thread lấy từ cuộc trò chuyện đã lưu (`DIRECT` → `USER`).

- [ ] 2.5 **ZL-10 — Ngắt phiên khi xóa/tắt account; công tắc tắt trọn vẹn**
  - **Goal:** xóa hay tắt account thì Sino không còn giữ phiên Zalo (D-284, D-286).
  - **Files:** `provider/spi/MessageProvider.disconnect`, `account/application/AccountManagementService` (gọi sau commit), `ZaloProvider.disconnect`, test `AccountDisconnectTests`, `ZaloDisconnectTests`.
  - **Acceptance criteria:** spec `zalo-provider` (Ngắt phiên khi xóa hoặc tắt account); delta `provider-contract` (Contract ngắt kết nối).
  - **Test:** xóa/tắt → `DELETE session` sau commit; rollback → không gọi; `sino-zalo` tắt → account vẫn xóa được + log cảnh báo; Gmail không đổi hành vi.
  - **Depends on:** ZL-09
  - **Bạn sẽ học:** việc phụ sau commit (`TransactionSynchronization` hoặc `@TransactionalEventListener`), best-effort và vì sao không được làm hỏng việc chính.
  - **Hints:** Level 1: "nếu gọi `DELETE session` **trước** khi commit mà transaction rollback, chuyện gì xảy ra?" Kiểm zca-js có API đăng xuất không (D-284).

## 3. `sino-web`

- [ ] 3.1 **ZL-11 — Bước Zalo trong hộp thoại kết nối**
  - **Goal:** người dùng kết nối và quét lại Zalo từ web, có cảnh báo trước (D-272, D-288).
  - **Files:** `apps/sino-web/src/features/accounts/{accounts.api.ts (connectMethod, connectable, QR API),connect.types.ts,ConnectWizard.tsx,components/QrStep.tsx,components/RiskStep.tsx,useQrConnect.ts}`, test cạnh từng file, handler MSW.
  - **Acceptance criteria:** spec `zalo-connect-web` (cả 5 requirement); DN-2 (chữ cảnh báo) được người dùng chốt; đối chiếu canvas `ConnectWizard`.
  - **Test:** Vitest + MSW cho mọi trạng thái; `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ màn hộp thoại dùng.
  - **Depends on:** ZL-07 (contract API; dùng MSW nên làm song song với ZL-08…ZL-10 được)
  - **Bạn sẽ học:** polling bằng TanStack Query (`refetchInterval` dừng theo trạng thái), dọn dẹp khi đóng hộp thoại, vì sao web không tự đoán `connectable`.
  - **Hints:** Level 2: `refetchInterval` là hàm nhận dữ liệu hiện tại và trả `false` khi trạng thái không còn `WAITING`/`SCANNED`.

## 4. Chạy, CI, nghiệm thu

- [ ] 4.1 **ZL-12 — Chạy cục bộ, README, CI**
  - **Goal:** ai clone repo cũng chạy được `sino-zalo` cạnh `sino-api`; CI kiểm `sino-zalo`.
  - **Files:** `apps/sino-zalo/README.md`, `apps/sino-api/README.md` (mục Zalo: biến môi trường, cách tắt khẩn cấp hai bước), compose (nếu `sino-api` chạy bằng compose), `.github/workflows/zalo-ci.yml`.
  - **Acceptance criteria:** README đủ để chạy từ đầu; job CI chạy lint, typecheck, test của `sino-zalo` (xanh khi người dùng cho push).
  - **Test:** làm theo README trên máy sạch (thư mục mới); CI chạy cục bộ bằng các lệnh của job.
  - **Depends on:** ZL-10, ZL-11
  - **Bạn sẽ học:** cấu hình qua biến môi trường, health check, CI cho một package trong monorepo (`paths` filter).

- [ ] 4.2 **ZL-13 — Nghiệm thu thật, trang công khai, archive**
  - **Goal:** chứng minh F09 chạy thật bằng nick phụ; người dùng ngoài biết rõ Sino làm gì với Zalo.
  - **Việc:**
    - **Kịch bản nghiệm thu bằng nick phụ:**
      1. Kết nối bằng QR.
      2. Nhận tin 1-1, tin nhóm và tin tự gửi.
      3. Trả lời.
      4. Mở chat.zalo.me: account thành "Cần đăng nhập lại", quét lại được.
      5. Tắt `sino-zalo` 10 phút, nhắn vào: tin được bù.
      6. Xóa account: phiên dừng.
      7. Tắt công tắc: Zalo thành "Sắp có".
    - Sửa `apps/sino-site`: chính sách quyền riêng tư VI/EN nói Zalo (phiên mã hóa, chỉ tin từ lúc kết nối, rủi ro); trang Sino Messages đổi "Zalo sắp có".
    - Cập nhật roadmap F09.
    - `openspec archive zalo-personal -y`.
  - **Acceptance criteria:** mọi bước của kịch bản có bằng chứng ngắn trong mục này; spec đã gộp vào `openspec/specs/`.
  - **Depends on:** ZL-12
