# Biệt danh (tên gợi nhớ Zalo) trong chat 1-1 · Implementation Plan

> **AUTO** (người dùng 2026-10-27, AUTO cho năm change *Hoàn thiện chat Zalo*). **Đề án được duyệt 2026-11-01** ("duyệt"; soạn bởi phiên quản lý `sino-16`). Đội Sino (`CLAUDE.md`, *Đội Sino*): mỗi task ghi kỹ sư phụ trách; kỹ sư không commit; quản lý nghiệm thu nội bộ, người dùng nghiệm thu, rồi quản lý commit (mỗi task một commit trên `dev`).
> **Thứ tự:** hợp đồng chốt sẵn ở D-415, D-416, nên NK-01 và NK-02 chạy song song. NK-03 (canvas) song song với hai task đó; người dùng duyệt frame trước khi giao NK-04. Lượt Chrome thật của NK-04 sau NK-02. NK-20 sau cả bốn, có người dùng.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-zalo`: `pnpm lint`, `pnpm typecheck`, `pnpm test`. `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests` (toàn bộ suite chỉ khi quản lý yêu cầu); không build trong `apps/sino-api` khi người dùng đang chạy nó từ IntelliJ (dùng worktree). `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. Ba app và canvas

- [ ] 1.1 **NK-01 — `sino-zalo`: tên gợi nhớ của bạn bè (D-414, D-415, D-419)** · `sino-zalo`
  - **Goal:** `PUT`/`DELETE /accounts/:id/aliases/:friendId` và `GET /accounts/:id/aliases`; `title` chat 1-1 là tên gốc.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (ba hàm mới trên `ZaloConnection`), một file route mới (ví dụ `src/sessions/aliasRoutes.ts`) đăng ký trong `src/app.ts`, có thể `src/gateway/ZcaGateway.ts` `userInfo` (D-419), README *API so far*; test.
  - **Acceptance criteria:** spec `zalo-friend-aliases`; `GET` lật hết các trang, nhớ 60 giây, `PUT`/`DELETE` xóa bộ nhớ; mã lỗi `409`/`422 ALIAS_REJECTED`/`502` như D-415; log không có tên gợi nhớ.
  - **Phải tìm và ghi lại:** (1) đọc `node_modules/zca-js/dist/apis/{changeFriendAlias,removeFriendAlias,getAliasList}.js`: cỡ trang mặc định và lớn nhất, Zalo trả lỗi gì khi người kia không phải bạn bè; (2) giới hạn độ dài tên gợi nhớ (D-414; không thấy trong mã thì để 50 và ghi CHƯA KIỂM CHỨNG cho NK-20); (3) D-419: `getUserInfo().displayName` của bạn bè có đổi theo tên gợi nhớ không (mã zca-js, hoặc ghi CHƯA KIỂM CHỨNG cho NK-20 nếu chỉ thử được trên Zalo thật).
  - **Test:** test tay với `buildApp` và `FakeZaloGateway` trên `127.0.0.1:8090` (như AV-01): `curl` `PUT`, `GET`, `DELETE`, `GET`; `aliasesFail` cho `422`/`502`; không phiên `409`. Rồi Vitest: ba route, lật trang, nhớ 60 giây (đồng hồ giả), xóa bộ nhớ sau `PUT`.
  - **Hints:** **Level 1:** các route gửi tin đã kiểm phiên và khóa dùng chung thế nào? **Level 2:** `getAliasList(count, page)` trả `items` rỗng ở trang sau trang cuối.

- [ ] 1.2 **NK-02 — `sino-api`: cột `nickname`, PATCH, đồng bộ 5 phút (D-414, D-416, D-417, D-418)** · `sino-api`
  - **Goal:** biệt danh lưu được, đặt qua `PATCH` (Zalo đồng ý mới lưu), về từ Zalo mỗi 5 phút, có trong API.
  - **Files:** `src/main/resources/db/migration/V24__conversation_add_nickname.sql`; `provider/ProviderCapability.java` (`NICKNAMES`), `provider/spi/{MessageProvider,Nicknames}.java`, `provider/infrastructure/zalo/{ZaloClient,ZaloProvider…}.java`; `conversation/api/{ConversationsController,ConversationResponse}.java`, `conversation/application/{InboxItem,InboxService,ConversationErrorCode}.java`, `conversation/infrastructure/JdbcConversationStore.java`; việc định kỳ (cạnh `sync/application/LiveSyncSchedule.java`, `sino.sync.nicknames.interval: PT5M` trong `application.yaml`); README *Endpoints available today*; test.
  - **Acceptance criteria:** spec `conversation-nicknames-api`; `PATCH` chỉ có `nickname` hợp lệ; "không gửi" khác "gửi `null`"; `read`/`archived` vẫn không xuống nhà cung cấp; `ConversationChanged` chỉ cho dòng đổi; `ModularityTests` xanh (facet ở `provider.spi`, không để `conversation` gọi thẳng `provider.infrastructure`).
  - **Test:** test tay trên DB tạm (`./mvnw spring-boot:test-run`, Testcontainers; **không** dùng DB `sino` của người dùng) với `sino-zalo` giả (WireMock hay `FakeZaloGateway` chạy ở cổng khác): nạp một tài khoản Zalo, một chat 1-1, một nhóm, một thư Gmail; `curl` `PATCH` đặt, xóa, nhóm `422`, Zalo từ chối `422`; đặt biệt danh ở `sino-zalo` giả rồi chờ một vòng đồng bộ (đặt interval ngắn) thấy `GET` đổi. Rồi test: controller JSON, service (thứ tự gọi nhà cung cấp rồi mới ghi), store, việc định kỳ, normalizer/client Zalo với JSON mẫu của D-415.
  - **Hints:** **Level 1:** vì sao gọi Zalo trước rồi mới ghi cột, không ghi trước rồi gọi? **Level 2:** cập nhật hàng loạt bằng `UPDATE … FROM (VALUES …)` hay `unnest`, kèm `IS DISTINCT FROM` và `RETURNING id`.

- [ ] 1.3 **NK-03 — Canvas: hộp "Đặt biệt danh" (DN-1, D-420)** · quản lý
  - **Goal:** frame của hộp ở desktop và 390, tên ở đầu khung chat 1-1 có dấu bấm được; người dùng duyệt.
  - **Files:** canvas "Sino UI" (https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB) và bản sao `design/sino-ui/project/`.
  - **Acceptance criteria:** dùng thành phần đã có của canvas (hộp thoại, ô nhập, nút); có trạng thái thường, có biệt danh, lỗi; người dùng nói duyệt.

- [ ] 1.4 **NK-04 — Web: hiện biệt danh, hộp đặt biệt danh (D-420)** · `sino-web`
  - **Goal:** `nickname ?? title` ở mọi chỗ hiện tên chat; hộp đặt, sửa, xóa ở đầu khung chat 1-1 Zalo.
  - **Files:** `src/features/inbox/{inbox.types.ts,inbox.api.ts}` (`nickname`, hàm `updateNickname`), hàm tên hiển thị dùng chung, `components/` của hàng danh sách, đầu khung chat (desktop, `MobilePageHeader`), `ConversationInfo` (Thành viên), hộp mới; test.
  - **Acceptance criteria:** spec `chat-nicknames-ui`; theo frame NK-03; không optimistic; nhóm và thư tên không bấm được; bàn phím: Enter lưu, Esc đóng, focus vào ô nhập khi mở.
  - **Test:** test tay sau NK-02, Chrome thật ở 1440 và 390: đặt, sửa, xóa, lỗi `422` (giả bằng sino-zalo giả), nhóm không bấm được. Trước NK-02 dựng được với MSW. Rồi Vitest: map `nickname`, tên hiển thị, hộp (lưu, lỗi giữ chữ, xóa, Esc).

## 2. Nghiệm thu

- [ ] 2.1 **NK-20 — Chạy thật với Zalo, tài liệu, kết thúc** · quản lý, có người dùng
  - **Goal:** chứng minh hai chiều trên máy người dùng, ghi lại, archive.
  - **Acceptance criteria:** với tài khoản Zalo của người dùng: đặt biệt danh từ Sino → thấy trên Zalo điện thoại; đổi trên điện thoại → Sino đổi trong 5 phút, không cần tin mới; xóa từ Sino → tên gốc hiện lại ở cả hai nơi; người không phải bạn bè (nếu có) → lỗi trong hộp. Kiểm phần CHƯA KIỂM CHỨNG của NK-01 (giới hạn độ dài, D-419).
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới từ phần Kiến thức của các kỹ sư) và `.docx` sinh lại, `genoffice docs check`; `PROJECT_STATE.md`; `openspec archive zalo-nicknames -y`.
