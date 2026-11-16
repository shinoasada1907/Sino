> **Thứ tự:** MF-01 → MF-02 → MF-03 nối tiếp ở `sino-api` (một kỹ sư một lúc). MF-10 dựng được trên MSW theo hợp đồng ở `design.md` song song với backend, sau khi người dùng cho biết số phận các thay đổi chưa commit trong `features/inbox/`; lượt Chrome thật sau khi MF-02 vào `dev`. MF-20 sau tất cả, có người dùng.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests`, chạy trong git worktree riêng; test tay trên bản sao DB (`pg_dump`) và app của worktree ở cổng 8091; phần cần Gmail thật (MF-03) chạy với tài khoản Gmail thử của người dùng, hỏi trước. `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. Backend

- [x] 1.1 **MF-01 — `sino-api`: `mailbox` trong contract và connector Gmail (D-498)** · `sino-api`
  - **Goal:** thư Gmail mang thư mục; ~~Spam / Thùng rác được đồng bộ,~~ nháp vẫn bỏ. **LÝ DO (người dùng 2026-11-16):** không để hộp thư lẫn thư rác giữa hai commit; việc bỏ SPAM/TRASH khỏi `HIDDEN_LABELS` chuyển sang MF-02. Sau MF-01 spam/trash vẫn bị bỏ.
  - **Files:** `provider/spi/{NormalizedMessage,Mailbox}.java`, `provider/infrastructure/gmail/{GmailMessageNormalizer,GmailProvider}.java` (~~`HIDDEN_LABELS` chỉ còn `DRAFT`~~ (chuyển sang MF-02)), connector Zalo và `FakeMessageProvider` (truyền null); test.
  - **Acceptance criteria:** spec `provider-contract` *Thư mục của tin chuẩn hóa*; `mail-folders-api` *Thư mục Gmail của từng thư* (phần chuẩn hóa: thứ tự ưu tiên, thư gửi đi không `INBOX` là null, `DRAFT` vẫn bỏ).
  - **Test:** test tay: chạy normalizer trên vài payload Gmail thật đã lưu (che nội dung) cho từng tổ hợp nhãn. Rồi unit test bảng nhãn → `mailbox`; `ModularityTests`.
  - **Depends on:** không.
  - **Thực hiện:** `Mailbox` (enum, `provider/spi`) và trường `mailbox` cuối `NormalizedMessage`; thêm constructor 14 tham số (mailbox null) để 50 chỗ dựng ở test không phải sửa, còn code main (`GmailMessageNormalizer`, `ZaloMessageNormalizer`, `WithoutNul`) truyền tường minh. `GmailMessageNormalizer.mailboxOf(labels)`: TRASH > SPAM > INBOX > ARCHIVE, `SENT` không có ba nhãn đó thì null. `HIDDEN_LABELS` giữ `DRAFT, SPAM, TRASH` (spam/trash bỏ tới MF-02, xem LÝ DO ở Goal). `WithoutNul.of` phải chép `mailbox` (nếu không mất khi lưu).
  - **Kiểm chứng:** test tay: không chạy Gmail thật; bảng 13 tổ hợp nhãn chạy qua `normalize` thật (INBOX+UNREAD, không INBOX, SPAM, TRASH, TRASH+INBOX, TRASH+SPAM, SPAM+INBOX, SENT, SENT+INBOX, SENT+TRASH, SENT+SPAM...); `GmailSyncTests` với DRAFT/SPAM/TRASH/INBOX: chỉ INBOX vào. Worktree riêng: `./mvnw test -Dtest=GmailMessageNormalizerTests,GmailSyncTests,ModularityTests,JdbcConversationStoreTests,FakeMessageProviderContractTest` -> 256 test, 0 lỗi, 8 skipped (lần chạy đầu 1 đỏ ở `throttlingCarriesTheWaitGmailAskedFor`: 429 ra PROVIDER_UNAVAILABLE, không liên quan MF-01, chạy lại xanh, có vẻ flaky theo thời gian).

- [ ] 1.2 **MF-02 — `sino-api`: cột, cờ và view `sent` / `trash` / `archived` mới (D-499, D-500)** · `sino-api`
  - **Goal:** ba danh sách trả đúng; hộp thư và `counts` không còn lẫn thư rác, thư lưu trữ bên Gmail.
  - **Files:** `db/migration/V30__conversation_mail_folders.sql`, `conversation/infrastructure/{JdbcConversationStore,ConversationSummaries}.java`, `conversation/application/{InboxView,InboxService}.java`, `conversation/api/ConversationsController.java` (`PARAMETER_VALUES`), README *Endpoints available today*; test.
  - **Acceptance criteria:** `mail-folders-api` *Danh sách Đã gửi*, *Danh sách Thư rác*, *Danh sách Đã lưu trữ gồm lưu trữ bên Gmail* (mọi scenario), cuộc ghép f05b gộp cờ bằng `bool_or`; response không đổi tên trường nào.
  - **Test:** test tay trên bản sao DB: sau migration, `view=all` và `counts` khớp số trước migration (chưa có `mailbox` nào); đặt tay `mailbox` vài thư bằng SQL rồi `curl` từng view, đối chiếu SQL. Rồi test tích hợp (Testcontainers) cho từng scenario, `ModularityTests`; lỗi gài cho điều kiện của từng view.
  - **Depends on:** MF-01.
  - **Thêm từ MF-01:** `HIDDEN_LABELS` chỉ còn `DRAFT`, cùng lúc với lọc view; đổi lại test của `GmailSyncTests` (spam/trash vào kèm `mailbox`).

- [ ] 1.3 **MF-03 — `sino-api`: đồng bộ bù một lần (D-501)** · `sino-api`
  - **Goal:** tài khoản Gmail đã kết nối có thư mục cho thư cũ và có thư rác hiện có.
  - **Files:** `provider/infrastructure/gmail/{GmailApi,GmailProvider}.java` (liệt kê id theo `q`, `includeSpamTrash`), module `sync` (việc chạy một lần, dấu đã chạy), có thể thêm migration nếu dấu cần cột; README; test.
  - **Acceptance criteria:** `mail-folders-api` *Đồng bộ bù thư mục một lần* (mọi scenario); không chặn đồng bộ thường; lỗi một tài khoản không chặn tài khoản khác.
  - **Test:** test tay với tài khoản Gmail thử (hỏi người dùng trước): có sẵn một thư lưu trữ, một thư spam, một thư trong thùng rác; chạy lượt bù, kiểm ba view và log; khởi động lại, lượt bù không chạy lại. Rồi test tích hợp với Gmail giả (WireMock như các test Gmail hiện có).
  - **Depends on:** MF-02.

## 2. Web

- [ ] 2.1 **MF-10 — `sino-web`: `/inbox?folder=` (D-502)** · `sino-web`
  - **Goal:** ba mục sidebar mở đúng danh sách.
  - **Files:** `features/inbox/{format.ts,useInboxFilter.ts,inbox.api.ts,InboxPage.tsx}`, trạng thái rỗng trong `components/`, `app/shell/Sidebar.tsx` (mục sáng), handler MSW và dữ liệu mẫu; test.
  - **Acceptance criteria:** `mail-folders-ui` *Hộp thư mở theo thư mục* (mọi scenario); test hiện có của Hộp thư và Tin nhắn còn xanh; đối chiếu canvas "Sino UI".
  - **Test:** test tay trên Chrome thật ở 1440 (MSW trước, backend sau MF-02): bấm ba mục, xem request ở Network, tiêu đề, mục sáng, trạng thái rỗng, `?folder=drafts`. Rồi Vitest cho ánh xạ `folder` → request và giao diện.
  - **Depends on:** hợp đồng ở `design.md`; người dùng trả lời về các thay đổi chưa commit trong `features/inbox/` (*Risks*).

## 3. Nghiệm thu

- [ ] 3.1 **MF-20 — Chạy thật trên máy người dùng** · quản lý + người dùng
  - **Goal:** với Gmail thật, ba mục khớp Gmail web.
  - **Acceptance criteria:** chuyển một thư vào thùng rác, báo spam, lưu trữ trên Gmail web → sau đồng bộ thấy đúng mục trong Sino; thư mới vào cuộc đã lưu trữ đưa nó về Hộp thư; `PROJECT_STATE.md`, file kiến thức phase, `openspec archive mail-folders -y`.
  - **Depends on:** MF-03, MF-10.
