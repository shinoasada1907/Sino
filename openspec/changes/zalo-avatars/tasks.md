# Ảnh đại diện thật trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-27, "AUTO: đội tự code"). **Đề án được duyệt 2026-10-27** ("Duyệt đề án zalo-avatars, DN-1 = A … Giao việc cho đội."). Đội Sino (`CLAUDE.md`, *Đội Sino*): mỗi task ghi kỹ sư phụ trách; kỹ sư không commit; quản lý nghiệm thu nội bộ, người dùng nghiệm thu, rồi quản lý commit (mỗi task một commit trên `dev`).
> **Thứ tự:** hợp đồng chốt sẵn ở D-410, D-411, D-412, nên AV-01, AV-02, AV-03 chạy song song, mỗi kỹ sư một phiên. Lượt Chrome thật của AV-03 làm sau khi AV-02 xong. AV-20 sau cả ba, có người dùng.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-zalo`: `pnpm lint`, `pnpm typecheck`, `pnpm test`. `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới (toàn bộ suite chỉ khi quản lý yêu cầu). `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. Ba app

- [x] 1.1 **AV-01 — `sino-zalo`: ảnh của người tham gia (D-409, D-410)** · `sino-zalo`
  - **Goal:** `participants[]` của mỗi cuộc trò chuyện mang `avatarUrl`.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (một hàm tra ảnh nhiều người), `src/sessions/Conversations.ts`, README (hình dạng `participants` ở *API so far*); test.
  - **Acceptance criteria:** spec `zalo-participant-avatars`; chat 1-1 không gọi thêm Zalo; nhóm một lời gọi mỗi trang; nhớ 24 giờ cả kết quả `null`; lỗi hay quá giờ thì `null` và tin vẫn đi; log không có tên hay địa chỉ ảnh.
  - **Test:** test tay chỉ chạy được với Zalo thật, nên làm ở AV-20 có người dùng; ở task này chạy `pnpm dev` với gateway giả nếu có cách, hoặc ghi rõ CHƯA KIỂM CHỨNG phần thật. Vitest với `FakeZaloGateway`: 1-1, nhóm, nhớ 24 giờ (đồng hồ giả), lỗi, quá giờ.
  - **Hints:** **Level 1:** `userInfo` hôm nay đọc cả khóa `<id>` lẫn `<id>_0`, vì sao? **Level 2:** đọc `node_modules/zca-js/dist/apis/getUserInfo` xem có nhận mảng và có giới hạn số ID không.
  - **Thực hiện:** `ZaloConnection.userAvatars(userIds)` mới (`ZaloGateway.ts`); `ZcaGateway.avatarsOf` gọi `api.getUserInfo([ids])` một lần, đọc khóa `<id>` rồi `<id>_0` qua `profileOf` dùng chung với `userInfo`; `FakeZaloGateway` có `avatars`, `avatarCalls`, `avatarsFail`. `Conversations` nhận thêm `ownId` và `userAvatars`: 1-1 người kia (`id = threadId`) lấy `avatarUrl` của cuộc trò chuyện (không gọi thêm); nhóm gom người gửi chưa nhớ (bỏ chính tài khoản, mỗi người một lần) vào một lời gọi, chạy song song với tra tên thread, cùng `infoTimeoutMs`; nhớ 24 giờ theo tài khoản kể cả `null`; lỗi hay quá giờ thì `null`, không nhớ, log `warn` chỉ có `accountId`, số người, lý do. Giới hạn thời gian dùng chung cho tên và ảnh qua `withinTime`. README: hình dạng `participants` ở *API so far*, đoạn D-409, dòng *Layout*. zca-js `getUserInfo` nhận `string | string[]`, không đặt giới hạn số ID (`getUserInfo.js`), nên không chia lô; giới hạn phía server Zalo chưa biết.
  - **Kiểm chứng:** test tay: dựng app thật (`buildApp`) với `FakeZaloGateway` trên `127.0.0.1:8090`, PUT session rồi `curl GET /accounts/a1/messages`: 1-1 người kia có ảnh của cuộc trò chuyện, tài khoản `null`; nhóm 3 người, `userAvatars` được gọi đúng một lần `["8002","8003","8004"]` (không có tài khoản, không có người kia của 1-1), người không ảnh `null`; đọc lần hai (`?after=100`) không gọi lại. Chạy lại với `avatarsFail`: đủ 6 tin, mọi `avatarUrl` của nhóm `null`. Tắt server bằng PID, 8090 trống lại. Tự động: `test/participantAvatars.test.ts` 16 test (route: 1-1, nhóm, tài khoản, người đã biết, Zalo lỗi; `Conversations`: 24 giờ bằng đồng hồ giả, `null` được nhớ, một lời gọi cho nhiều nhóm, lỗi + log không tên/địa chỉ + hỏi lại trang sau, quá giờ, chạy song song với tên thread; `avatarsOf`: hai kiểu khóa, thiếu → `null`, lỗi đi lên); sửa 3 chỗ `test/messages.test.ts` cho hình dạng mới. Lỗi gài 4 lần (hỏi cả tài khoản, không nhớ `null`, TTL 1 giờ, nhớ cả lúc lỗi): mỗi lần đúng một test đỏ, đã trả lại mã. `pnpm typecheck` sạch; `pnpm lint` exit 0 (11 cảnh báo cũ ở `sendRoutes.ts`, `photoSticker.test.ts`, không có ở file đã sửa); `pnpm test` 22 file, 327 test xanh.
  - **CHƯA KIỂM CHỨNG:** Zalo thật (AV-20, có người dùng): `getUserInfo` nhiều ID có trả khóa `<id>` hay `<id>_0` như giả định; địa chỉ `avatar` của `AvatarSize.Small` đủ nét cho vòng 40px; Zalo có giới hạn số ID mỗi lần không (thử với nhóm đông, vài chục người gửi trong một trang; nếu có thì chia lô trong `avatarsOf`); người không có ảnh cho `avatar` rỗng hay thiếu khóa (đều ra `null`).
  - **Nghiệm thu:** người dùng 2026-10-28 ("Nghiệm thu ST-21, AV-01, AV-02. Commit mỗi task một commit lên dev."). Quản lý chạy lại: `pnpm lint` 0 lỗi (11 cảnh báo cũ), `pnpm typecheck` 0, `pnpm test` 22 file, 327/327.

- [ ] 1.2 **AV-02 — `sino-api`: lưu ảnh người tham gia, trả `avatarUrl` của cuộc trò chuyện (D-410, D-411)** · `sino-api`
  - **Goal:** ảnh người tham gia Zalo được lưu; danh sách và chi tiết trả `avatarUrl`.
  - **Files:** `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`, `conversation/application/InboxItem.java` và câu đọc danh sách trong `conversation/infrastructure/JdbcConversationStore.java`, `conversation/api/ConversationResponse.java`, README *Endpoints available today*; test. Không migration.
  - **Acceptance criteria:** spec `conversation-avatars-api`; thư Gmail `avatarUrl: null`; `ModularityTests` xanh.
  - **Test:** test tay: chạy app với DB local (đã có chat Zalo lưu từ trước), đăng nhập, `curl` `GET /api/conversations` thấy `avatarUrl` của chat Zalo (ảnh cuộc trò chuyện đã có trong DB từ trước change này) và `null` ở thư; rồi test: normalizer giữ ảnh người tham gia, store giữ ảnh khi trang sau `null`, JSON của controller.
  - **Hints:** **Level 1:** `mergeParticipant` hôm nay nhận tên; ảnh theo cùng luật "giá trị khác null đầu tiên". **Level 2:** `ConversationDetailResponse` dùng `@JsonUnwrapped ConversationResponse`, nên thêm một field là chi tiết có luôn.

- [ ] 1.3 **AV-03 — Web: `Avatar` vẽ ảnh, ảnh ở mọi chỗ của chat (D-412, DN-1)** · `sino-web`
  - **Goal:** ảnh thật ở danh sách, đầu khung chat, cạnh tin của người khác trong nhóm, mục Thành viên; vòng thay thế khi không có hay lỗi.
  - **Files:** `src/shared/ui/avatar.tsx`, `src/features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/{ConversationAvatars,ChatThread,ConversationInfo}.tsx`; test.
  - **Acceptance criteria:** spec `chat-avatars-ui`; ảnh nhóm theo DN-1 = A (người dùng chốt 2026-10-27); không đổi kích thước hay vị trí vòng so với canvas; không ảnh vỡ khi lỗi.
  - **Test:** test tay sau AV-02: `pnpm dev`, mở Tin nhắn ở 1440 và 390, xem danh sách, một chat 1-1, một nhóm, mục Thành viên; chặn tải ảnh (DevTools, chặn domain của Zalo) thấy vòng thay thế. Trước AV-02 dựng được với dữ liệu mẫu và MSW. Rồi Vitest: `Avatar` (có ảnh, lỗi, không `src`), map `avatarUrl`, `ConversationAvatars` theo DN-1.
  - **Hints:** **Level 1:** vì sao vòng thay thế nằm dưới ảnh thay vì đổi sau khi ảnh tải xong? **Level 2:** `onError` gỡ `<img>`; `alt=""` giữ ảnh là trang trí.

## 2. Nghiệm thu

- [ ] 2.1 **AV-20 — Chạy thật với Zalo, tài liệu, kết thúc** · quản lý, có người dùng
  - **Goal:** chứng minh cả luồng trên máy người dùng, ghi lại, archive.
  - **Acceptance criteria:** với tài khoản Zalo của người dùng: danh sách có ảnh của chat 1-1 và nhóm; trong một nhóm, tin mới của vài thành viên có ảnh của họ sau một lần đồng bộ; mục Thành viên có ảnh; một người không có ảnh hiện vòng thay thế. Ghi chỗ khác canvas (DN-1 = A thì ghi vào canvas cùng đợt vẽ của `zalo-mentions`).
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới từ phần Kiến thức trong báo cáo của ba kỹ sư) và `.docx` sinh lại, `genoffice docs check`; `PROJECT_STATE.md`; `openspec archive zalo-avatars -y`.
