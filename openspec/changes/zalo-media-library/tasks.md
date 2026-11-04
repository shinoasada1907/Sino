# Kho phương tiện của cuộc trò chuyện Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-27, AUTO cho năm change *Hoàn thiện chat Zalo*). **Đề án được duyệt 2026-11-04** ("có duyệt nhé"): DN-1, DN-2, DN-3 đều chọn A. Đội Sino (`CLAUDE.md`, *Đội Sino*): mỗi task ghi kỹ sư phụ trách; kỹ sư không commit; quản lý nghiệm thu nội bộ, người dùng nghiệm thu, rồi quản lý commit (mỗi task một commit trên `dev`).
> **Thứ tự:** phần log của ML-01 làm trước khi người dùng quét QR, để cùng một buổi đo được cả ZF-20, ZL-17 và ML-01. ML-01 đo xong mới giao ML-02 và ML-03. ML-04 chạy song song với ML-03. ML-05 (canvas) song song; người dùng duyệt khung trước khi giao ML-06. ML-07 sau ML-03. ML-20 sau tất cả, có người dùng. Vị trí so với `zalo-nicknames`, `zalo-mentions` do người dùng chốt; lộ trình hiện đặt change này sau hai change đó.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-zalo`: `pnpm lint`, `pnpm typecheck`, `pnpm test`. `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests`, trong worktree riêng khi người dùng đang chạy app. `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.
> **Điều kiện trước khi giao web (ML-06, ML-07):**
> 1. `chat-ui-refactor` và phần web của `messages-by-account` đã commit hoặc đã được người dùng quyết định, vì cả hai đang sửa dở `ConversationInfo.tsx`, `InboxPage.tsx`, `inbox.types.ts`, `inbox.api.ts`.
> 2. Bộ test của `sino-web` chạy lại được. Ngày 2026-11-04 thư mục làm việc đang thiếu 131 file test và cả `src/test/setup.ts`, trong khi `vite.config.ts` vẫn cần file đó, nên `pnpm test` không còn kiểm được gì.

## 1. Đo trên Zalo thật

- [ ] 1.1 **ML-01 — `sino-zalo`: log hình dạng, đo tin thoại, video, link (D-468, D-474)** · `sino-zalo`, có người dùng
  - **Goal:** biết Zalo giao ba loại tin này qua listener thế nào, trước khi viết phần đọc.
  - **Files:** `src/gateway/ZcaGateway.ts` (chạy `photoShapeOf` cho `chat.voice`, `chat.video.msg`, `chat.recommended`, `chat.link`, không chỉ `chat.photo`); test.
  - **Acceptance criteria:** với mỗi loại có trong lần đo, `tasks.md` ghi: `zaloType`, các khóa kể cả trong `params`, loại giá trị, host; bảng khóa Zalo → trường của D-468; host cần thêm vào `FILE_DOMAINS`; định dạng âm thanh, video. Log không có địa chỉ đầy đủ.
  - **Test:** Vitest cho log với nội dung mẫu, kiểm không có địa chỉ đầy đủ trong dòng log. Rồi chạy thật: người dùng quét QR, từ nick khác gửi tin thoại, video, một link có thẻ, một link dán thành chữ, ở chat 1-1 và một nhóm nếu được; người dùng đưa các dòng log "Zalo message" vì agent không đọc được terminal của người dùng. Không mở `chat.zalo.me`.
  - **Depends on:** người dùng quét QR; có thể làm cùng buổi với ZF-20, ZL-17.
  - **Hints:** **Level 1:** vì sao `chat.voice` hôm nay không có dòng hình dạng nào? **Level 2:** xem `unseen` và chỗ gọi `photoShapeOf` trong `toZaloMessage`.
  - **Thực hiện (phần log, 2026-11-04):** D-475: trường log mới `mediaShape` cho `chat.voice`, `chat.video.msg`, `chat.recommended`, `chat.link`, dùng lại `photoShapeOf` (khóa của `content`, `params` và một cấp sâu hơn, loại giá trị, host); `photoShape` của `chat.photo` giữ nguyên. Lý do `chat.voice` không có dòng nào: nằm trong `KNOWN_TYPES` nên `unseen` là false. File: `src/gateway/ZcaGateway.ts` (`MEASURED_TYPES`, `mediaShape` trong `toZaloMessage`), `ZaloGateway.ts` (trường), `sessions/SessionManager.ts` (`logMessage`), `test/mediaShape.test.ts`. Hành vi tin không đổi.
  - **Kiểm chứng (phần log):** test tay: script chạy `toZaloMessage` + `SessionManager` + `FakeZaloGateway` với nội dung mẫu bốn loại, đọc dòng log thật: chỉ có tên khóa, `string(n)`, `number`, `url(host)`, không có địa chỉ đầy đủ, tiêu đề, mô tả. Vitest `test/mediaShape.test.ts` (10 test). `pnpm lint` không lỗi, `pnpm typecheck` sạch, `pnpm test` 27 file / 367 test xanh. **CHƯA KIỂM CHỨNG:** đo trên Zalo thật (người dùng quét QR, gửi thoại, video, link, đưa dòng log "Zalo message"); bảng khóa, `FILE_DOMAINS`, định dạng chưa có nên ML-01 chưa tick.

## 2. Đọc tin và API

- [ ] 2.1 **ML-02 — `sino-zalo`: đọc tin thoại, video, link (D-468)** · `sino-zalo`
  - **Goal:** `ZaloMessage` mang `voice`, `video`, `link` theo bảng khóa ML-01.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, README *API so far*; test.
  - **Acceptance criteria:** spec `zalo-media-messages`; không có địa chỉ `http(s)` thì không gửi trường và có log hình dạng; loại khác không đổi. Bỏ `mediaShape` của ML-01 khỏi tin đã đọc được (review của quản lý, 2026-11-04): nó chỉ để đo, và với link nó ghi tên miền người ta gửi vào log mỗi lần có tin.
  - **Test:** test tay với `buildApp` và `FakeZaloGateway`: tin mẫu đúng từ ML-01 đi qua `GET /accounts/:id/messages` có đủ trường. Rồi Vitest: đủ khóa, thiếu địa chỉ, scheme lạ, `params` hỏng.
  - **Depends on:** ML-01.
  - **Hints:** **Level 1:** `sharedFileOf` xử lý thiếu trường thế nào? **Level 2:** `params` là chữ JSON, đã có `objectOf`.

- [ ] 2.2 **ML-03 — `sino-api`: lưu đúng loại, trả địa chỉ trong tin (D-469)** · `sino-api`
  - **Goal:** tin thoại, video, thẻ link lưu đúng loại; `GET …/messages` trả được `url`, `thumbnailUrl`, `durationMs`, `link`.
  - **Files:** `provider/spi/NormalizedMessage.java`, `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`, `conversation/application/{InboxMessage,MessageHistory}.java`, `conversation/api/MessageResponse.java`, README; test.
  - **Acceptance criteria:** spec `zalo-media-messages`; ảnh, tệp, sticker, thư Gmail không đổi hành vi; địa chỉ ngoài tên miền cho phép thì tin vẫn còn và có cảnh báo nêu host; `ModularityTests` xanh.
  - **Test:** test tay với DB tạm và `sino-zalo` giả, không dùng DB `sino` của người dùng: nạp tin mẫu của ML-01, gọi `GET …/messages`, xem DB. Rồi test normalizer từng loại, test API, kiểm thư Gmail không đổi.
  - **Depends on:** ML-01. Hợp đồng D-468 chốt ở ML-01, nên làm song song được với ML-02.
  - **Hints:** **Level 1:** `fileBody` giữ địa chỉ ở đâu, và `fetchAttachment` đọc lại thế nào? **Level 2:** thêm trường vào record `File` kéo theo mọi chỗ tạo nó; kiểm luôn các test.

- [ ] 2.3 **ML-04 — `sino-api`: `GET /api/conversations/{id}/media` (D-467, D-470, D-471)** · `sino-api`
  - **Goal:** kho đọc được theo bốn loại, có phân trang, từ tin đã lưu.
  - **Files:** `conversation/application/` (service mới, cạnh `MessageHistory`), `conversation/api/` (controller hay thêm vào `ConversationMessagesController`, kỹ sư chọn, ghi D-xx), README; test. Không migration (DN-1 = A).
  - **Acceptance criteria:** spec `conversation-media-api`; kiểm quyền và chat gộp bằng `inbox.requireInInbox`; `400` cho `kind`, `cursor`, `limit` sai; không gọi nhà cung cấp.
  - **Test:** test tay trên bản sao DB theo cách của dự án (`pg_dump`, app ở cổng 8091, Gmail, Zalo, sync tắt, khóa giả): `curl` đủ bốn loại với ảnh và tệp thật đã có, sang trang, ID của người khác. Rồi test API, test tách link trong chữ, test sticker không vào kho.
  - **Depends on:** phần `LINK` thẻ và `AUDIO` cần khóa của ML-03; phần ảnh, tệp, link trong chữ làm trước được.
  - **Hints:** **Level 1:** vì sao một trang `LINK` có thể nhiều hơn `limit`? **Level 2:** mẫu con trỏ ở `MessageCursor`; lọc bằng SQL rồi tách link bằng Java.

## 3. Giao diện

- [ ] 3.1 **ML-05 — Canvas: khung kho (DN-3, D-473)** · quản lý
  - **Goal:** khung của khối xem trước, bốn tab và trang con 390; người dùng duyệt.
  - **Files:** canvas "Sino UI" (https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB) và bản sao `design/sino-ui/project/`.
  - **Acceptance criteria:** đối chiếu với `ConversationInfo` đã duyệt ở `chat-ui-refactor`, vì canvas chưa có cột này; có trạng thái đang tải, trống, lỗi, "Không còn trên Zalo"; người dùng nói duyệt.
  - **Test:** người dùng xem khung ở desktop và 390.
  - **Depends on:** DN-3.
  - **Hints:** **Level 1:** cột 340px chứa lưới ảnh mấy ô là vừa? **Level 2:** dùng thành phần tab và hàng tệp đã có trên canvas.

- [ ] 3.2 **ML-06 — Web: kho thật ở cột Chi tiết hội thoại và trang con (D-473)** · `sino-web`
  - **Goal:** bốn khối dùng dữ liệu thật; "Xem tất cả" và trang con điện thoại chạy được.
  - **Files:** `src/features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/ConversationInfo.tsx`, component danh sách kho mới, `InboxPage.tsx`, `src/app/router.tsx`; test.
  - **Acceptance criteria:** spec `chat-media-library-ui`; theo khung ML-05; bỏ `linkedUrl` và `detail.files`; link chỉ bấm được với `http`, `https`; tệp vượt 25 MiB mở địa chỉ của Zalo; thư không gọi API kho.
  - **Test:** test tay ở Chrome thật, 1440 và 390: ảnh và tệp đã có trong DB, ảnh `404` hiện "Không còn trên Zalo", cuộn tải tiếp, lỗi API có nút thử lại, trang con quay lại đúng chat. Rồi Vitest: map API, các trạng thái, link có scheme lạ.
  - **Depends on:** ML-04, ML-05, *Điều kiện trước khi giao web*.
  - **Hints:** **Level 1:** chuyện gì xảy ra khi `onError` đặt lại `src`? **Level 2:** mẫu `useInfiniteQuery` đã có ở `useInbox`.

- [ ] 3.3 **ML-07 — Web: phát tin thoại, video, thẻ link trong khung chat (D-472)** · `sino-web`
  - **Goal:** bong bóng tin hiện đúng loại, thay cho chữ giữ chỗ.
  - **Files:** `src/features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/ChatThread.tsx`; test.
  - **Acceptance criteria:** spec `chat-media-library-ui`, *Khung chat phát được và vẽ thẻ link*; tin cũ không địa chỉ vẫn hiện chữ; không tải media trước khi người dùng bấm phát.
  - **Test:** test tay ở Chrome thật với tin mẫu từ ML-03, 1440 và 390. Rồi Vitest: ba loại, tin cũ, scheme lạ.
  - **Depends on:** ML-03, *Điều kiện trước khi giao web*.
  - **Hints:** **Level 1:** `preload` nào để một chat dài không tải hết âm thanh? **Level 2:** ảnh `sticker` và `image` đã rẽ nhánh ở đâu trong `ChatThread`?

## 4. Nghiệm thu

- [ ] 4.1 **ML-20 — Chạy thật với Zalo, đo độ bền địa chỉ, tài liệu, kết thúc** · quản lý, có người dùng
  - **Goal:** chứng minh kho và khung chat trên Zalo thật, ghi lại, archive.
  - **Acceptance criteria:** với tài khoản Zalo của người dùng: gửi từ nick khác ảnh, video, tệp, tin thoại, thẻ link, link trong chữ → khung chat hiện đúng, trình duyệt phát được, kho có đủ ở cột và trang con 390; tin Sino tự gửi cũng vào kho; ghi lại định dạng phát được hay phải mở tab mới (D-472). **Độ bền:** ghi lại số địa chỉ còn mở được của các tin mới ở ngày 0, 7, 14, không để kết quả này chặn archive; có kết quả thì quản lý trình lại DN-2 nếu địa chỉ chết nhanh. Đối chiếu trang Privacy (D-474).
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới từ phần Kiến thức của các kỹ sư) và `.docx` sinh lại, `genoffice docs check`; `PROJECT_STATE.md`; `openspec archive zalo-media-library -y`.
  - **Test:** mọi lệnh kiểm tra của ba app xanh; `openspec validate zalo-media-library --strict` hợp lệ; người dùng đã xem.
  - **Depends on:** ML-01…ML-07.
  - **Hints:** **Level 1:** vì sao không mở `chat.zalo.me` để so kết quả? **Level 2:** đếm độ bền bằng câu đọc chỉ in ngày, host, mã trả về, không in địa chỉ.
