> **Thứ tự:** MA-01 (canvas) và MA-02 → MA-03 (backend) chạy song song. Người dùng duyệt frame MA-01 trước khi giao web. MA-04 → MA-05 → MA-06 nối tiếp ở `sino-web` (một kỹ sư một lúc); dựng được trên MSW theo hợp đồng ở `design.md` trước khi backend xong, lượt Chrome thật sau khi MA-03 vào `dev`. `chat-scroll-new-message` commit trước MA-05. NK-04 của `zalo-nicknames` sau MA-06. MA-20 sau tất cả, có người dùng.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests`, chạy trong git worktree riêng, không build trong `apps/sino-api` khi người dùng đang chạy nó từ IntelliJ; test tay với dữ liệu thật trên bản sao DB (`pg_dump`) và app của worktree ở cổng 8091, Gmail / Zalo / sync tắt. `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. Canvas

- [ ] 1.1 **MA-01 — Canvas: Tin nhắn theo tài khoản, Hộp thư theo tài khoản (DN-1…DN-5, D-429…D-437)** · quản lý
  - **Goal:** frame mới để người dùng duyệt trước khi giao web.
  - **Files:** canvas "Sino UI" (https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB) và bản sao `design/sino-ui/project/`: `Messages`, `MessagesLight`, `MobileMessages`, `MobileMessagesLight`, frame mới "Messages · đang mở chat" (desktop, dark và light), cột trái của `Inbox` / `InboxLight`.
  - **Acceptance criteria:** cột tài khoản (Tất cả, tài khoản dưới tên nhà cung cấp, số, chấm đỏ cần đăng nhập lại, "Xem tài khoản"); tab + "Thêm" + chip Mọi chat / Cá nhân / Nhóm; dải 64px chữ cái đầu khi mở chat, cột Thông tin mở đè; tablet có ô chọn; 390 có chip tài khoản; nhãn dòng theo D-430; chỉ dùng thành phần đã có của canvas; bản sao trong repo khớp link; người dùng nói duyệt.

## 2. Backend

- [ ] 2.1 **MA-02 — `sino-api`: BE-111 theo loại (D-427; `f05c` D-306, D-307, D-308)** · `sino-api`
  - **Goal:** danh sách và số đếm lọc được theo `kind`; `unreadByKind`; `kind` của dòng theo provider.
  - **Files:** `conversation/api/ConversationsController.java` (`list`, `counts`, `CountsResponse`), `conversation/api/ConversationResponse.java`, `conversation/application/{InboxService,InboxItem}.java`, helper loại theo provider mới trong `conversation/application`, `apps/sino-api/README.md` *Endpoints available today*; test.
  - **Acceptance criteria:** spec `inbox-api` của `f05c`: *Lọc danh sách theo loại*, *Số đếm theo loại*, *Loại của provider không có connector*, *Nội dung một conversation trong danh sách*; `provider-registry` *Connector có công tắc tắt vẫn ở trong registry*.
  - **Test:** test tay trên bản sao DB (8091): `curl` `?kind=chat`, `?kind=email`, `?kind=fax` (400), `?kind=chat&provider=gmail` (rỗng), `counts?kind=chat` so với đếm bằng SQL. Rồi test tích hợp (Testcontainers) cho từng scenario và `ModularityTests`; kiểm bằng lỗi gài cho lọc theo loại và `unreadByKind`.
  - **Depends on:** không (BE-110 và BE-82 đã trên `dev`).
  - **Hints:** **Level 1:** loại của provider đã có ở đâu sau BE-110 (`ProviderRegistry`, `kind()`)? **Level 2:** đổi `kind` thành tập `provider_type` trước khi vào SQL, rồi dùng cùng điều kiện cho trang và cho số đếm, để hai bên không lệch nhau.

- [ ] 2.2 **MA-03 — `sino-api`: `byAccount` và `chatType` (D-425, D-426)** · `sino-api`
  - **Goal:** số của từng tài khoản trong `counts`; lọc 1-1 / nhóm trong danh sách.
  - **Files:** `conversation/api/ConversationsController.java` (`chatType` có `@Pattern`, `CountsResponse.byAccount`), `conversation/application/{InboxService,InboxCounts}.java`, README; test.
  - **Acceptance criteria:** spec `conversation-account-filters-api` (mọi scenario); tham số và trường mới không bắt buộc, phản hồi cũ không đổi tên trường nào.
  - **Test:** test tay trên bản sao DB với hai tài khoản Zalo thật của người dùng: `counts?kind=chat` có đủ hai tài khoản, đối chiếu từng số bằng SQL; `?chatType=group&limit=5` lật hết trang, mọi dòng là nhóm, không thiếu dòng (so với SQL); `?chatType=channel` 400; ghi thời gian của `counts` trước và sau. Rồi test tích hợp cho từng scenario, `ModularityTests`.
  - **Depends on:** MA-02 (cùng sửa `InboxService` và `counts`).
  - **Hints:** **Level 1:** số tổng hôm nay đếm trên nhóm thread hay trên bản sao? `byAccount` cần cái nào để thread f05b tính ở cả hai tài khoản? **Level 2:** một câu `GROUP BY account_id` trên bản sao với cùng điều kiện "chưa lưu trữ" như số tổng, rồi điền 0 cho tài khoản không có dòng nào; `chatType` là một điều kiện `c.type` nữa trong câu của trang, trước `LIMIT`.

## 3. Web

- [ ] 3.1 **MA-04 — `sino-web`: hợp đồng dữ liệu và bộ lọc theo tài khoản (D-428, D-431, D-432, D-433, D-434, D-438)** · `sino-web`
  - **Goal:** dữ liệu và địa chỉ của hai màn đi theo `account` (và `chat` ở Tin nhắn); số theo tài khoản; đổi số lạc quan cho mọi tài khoản giữ thread; thanh tin mới theo tài khoản.
  - **Files:** `features/inbox/{format.ts,inbox.types.ts,inbox.api.ts,useInbox.ts,useNewMailNotice.ts}`, API mẫu và dữ liệu mẫu có `byAccount`, handler MSW; test.
  - **Acceptance criteria:** `account-filter-ui`: *Bộ lọc tài khoản trong địa chỉ*, *Số theo tài khoản đang chọn*, *Đọc và lưu trữ đổi số của mọi tài khoản giữ cuộc trò chuyện*, *Thanh tin mới theo tài khoản đang xem*, *Đổi bộ lọc khi đang mở một cuộc trò chuyện*; `messages-screen` *Lọc chat cá nhân và nhóm* (phần địa chỉ và request); test hiện có của Hộp thư và Tin nhắn còn xanh (đổi mong đợi `source` → `account` thì ghi LÝ DO).
  - **Test:** test tay ở dev server với MSW hay backend sau MA-03: đổi `?account=`, `?chat=` trên địa chỉ, xem request ở tab Network, số đổi khi đọc một chat. Rồi Vitest: đọc / ghi địa chỉ (giá trị lạ, `source` cũ), request có `accountId` / `chatType`, số theo tài khoản, đổi số lạc quan và hoàn lại khi lỗi, thanh tin mới.
  - **Depends on:** hợp đồng ở `design.md` (không chờ MA-03 để dựng); MA-01 được duyệt.
  - **Hints:** **Level 1:** `searchFor` và `InboxFilter` hôm nay đọc `source` ở đâu, ai dùng nó? **Level 2:** một hàm thuần đọc `URLSearchParams` + danh sách tài khoản của màn → `InboxFilter` đã chuẩn hóa, dùng cho cả request lẫn giao diện.

- [ ] 3.2 **MA-05 — `sino-web`: cột tài khoản và nhãn dòng ở cả hai màn (D-429, D-430)** · `sino-web`
  - **Goal:** cột trái là danh sách tài khoản lọc được; tablet có ô chọn, điện thoại có chip; nhãn dòng mới.
  - **Files:** `features/inbox/components/{SourcePane,ConversationList}.tsx` (hay một `AccountPane` mới thay phần đầu `SourcePane`), hàm nhãn trong `format.ts`; test.
  - **Acceptance criteria:** `account-filter-ui`: *Cột tài khoản*, *Tài khoản trên tablet và điện thoại*; `inbox-screen`: *Danh sách hợp nhất*, *Dòng ghi tài khoản khi một nguồn có nhiều tài khoản*, *Lọc hộp thư*; đúng frame MA-01.
  - **Test:** test tay Chrome thật ở 1440, 1024, 390, dark: `/messages` và `/inbox` với hai tài khoản Zalo và Gmail của người dùng: bấm tài khoản, số, "Xem tài khoản", chip trên 390, ô chọn trên 1024, nhãn dòng khi "Tất cả" và khi lọc. Rồi Vitest cho cột, ô chọn, chip, hàm nhãn (một tài khoản, đang lọc, nhóm, thread f05b).
  - **Depends on:** MA-04; `chat-scroll-new-message` đã commit.
  - **Hints:** **Level 1:** `accountTone` và `Count` của `SourcePane` dùng lại được không? **Level 2:** nhãn là một hàm thuần `(item, accounts, filter) → string | null`, test riêng như `format.ts`.

- [ ] 3.3 **MA-06 — `sino-web`: màn Tin nhắn riêng (DN-4, D-435, D-436, D-437)** · `sino-web`
  - **Goal:** `MessagesPage` riêng: tab + "Thêm", chip Cá nhân / Nhóm, danh sách cạnh khung chat từ 1280px, dải 64px, cột Thông tin mở đè.
  - **Files:** `app/router.tsx`, `features/inbox/MessagesPage.tsx` (mới), phần dùng chung tách khỏi `InboxPage.tsx` (nếu cần), `components/{ConversationList,ChatThread,ConversationInfo}.tsx` (chỉ phần bố cục và nút "Thông tin"); test.
  - **Acceptance criteria:** `messages-screen`: *Màn Tin nhắn*, *Hội thoại chat ở Tin nhắn*, *Lọc chat cá nhân và nhóm*, và các requirement cũ của `f05c` (*Hai màn dùng chung hành vi…*, *Trạng thái trống của Tin nhắn*, *Chuyển tới màn đúng loại*) còn đúng; `/inbox` không đổi bố cục; đúng frame MA-01.
  - **Test:** test tay Chrome thật ở 1440, 1024, 390, dark và light một lượt: mở chat, đổi chat tại chỗ, "Thông tin" mở / Esc đóng, tab, "Thêm" → "Có tệp", chip, quay lại trên 390 giữ bộ lọc, link `/inbox/<id chat>` chuyển sang `/messages/<id>`. Rồi Vitest: tab và menu, chip, bố cục theo cỡ màn (class / phần tử hiện), cột Thông tin, đổi bộ lọc khi đang mở.
  - **Depends on:** MA-05.
  - **Hints:** **Level 1:** phần nào của `InboxPage` là bố cục, phần nào là dữ liệu và chuyển màn? **Level 2:** giữ hook dữ liệu và `ConversationList` dùng chung; `MessagesPage` chỉ sắp cột và quyết định khi nào dải 64px thay cột tài khoản.

## 4. Ghi chú sang change khác

- [x] 4.1 **`f05c-messages-inbox-split`:** gạch task 2.2 BE-111, ghi "LÝ DO: chuyển sang `messages-by-account` MA-02 (người dùng duyệt 2026-11-02)"; ghi ở 5.1 / 5.2 rằng ACC và archive của `f05c` chờ MA-02 và đi trước archive của change này · quản lý
- [ ] 4.2 **`zalo-nicknames`:** ghi ở NK-04 "làm sau MA-06 của `messages-by-account` (người dùng chọn 2026-11-02)"; báo phiên quản lý `sino-16` qua `PROJECT_STATE.md` · quản lý

## 5. Nghiệm thu

- [ ] 5.1 **MA-20 — Chạy thật, tài liệu, kết thúc** · quản lý, có người dùng
  - **Goal:** chứng minh trên máy người dùng với hai tài khoản Zalo và tài khoản Gmail thật.
  - **Acceptance criteria:** số ở cột trái của Tin nhắn chỉ tính chat (không còn 1008 của Gmail) và khớp từng tài khoản; lọc một tài khoản, Cá nhân, Nhóm, tab, "Thêm" đúng; mở chat ở desktop giữ danh sách; Hộp thư lọc theo tài khoản Gmail; file kiến thức phase đang làm có phần của change, `.docx` sinh lại, `genoffice docs check` sạch; người dùng nghiệm thu.

- [ ] 5.2 **Archive:** sau archive của `f05c-messages-inbox-split` (D-427). `openspec archive messages-by-account -y`.
