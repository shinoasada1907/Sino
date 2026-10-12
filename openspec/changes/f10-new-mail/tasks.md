# F10 (mở rộng) — Tạo thư mới · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng chọn phạm vi, chỗ soạn, cách giữ thư chưa gửi xong và duyệt thiết kế (2026-10-12): D-190…D-195 là người dùng duyệt.
> Change dùng chung: phiên web làm mục 2; phiên backend nhận mục 1 và được sửa task của mình khi nhận.
> **Gửi thư thật thay người dùng chỉ khi người dùng cho phép rõ ràng**, tới địa chỉ người dùng chọn (BE-86, FE-85).

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [ ] 1.1 **BE-84 — `POST /api/conversations`: tạo cuộc trò chuyện, gửi thread mới, chống trùng (D-192, D-195, D-197)**
  - **Thực hiện:** design mục Backend 1–3 và chốt kỹ thuật (tóm tắt của cuộc trò chuyện mới, đồng bộ nhập trước, contract provider, sự kiện).
  - **Acceptance criteria:** spec `new-mail` *Tạo cuộc trò chuyện bằng một thư mới*, *Không gửi trùng thư mới*, *Thư mới đã được đồng bộ nhập trước*, phần `409`/`502`/`504` của *Gửi thư mới lỗi và kết quả không rõ*.

- [ ] 1.2 **BE-85 — Thư mở đầu chưa gửi xong và đối chiếu (D-195, D-196)**
  - **Thực hiện:** design mục Backend 4, 5: `OPENING_NOT_SENT`, "Gửi lại" qua `/messages` gửi như thư mới, "Bỏ" xóa cuộc trò chuyện, đối chiếu `UNKNOWN` không có thread.
  - **Acceptance criteria:** spec `new-mail` *Thư mở đầu chưa gửi xong*, phần đối chiếu của *Gửi thư mới lỗi và kết quả không rõ*.

- [ ] 1.3 **BE-86 — Chạy thật, README**
  - **Test:** chỉ khi người dùng cho phép gửi, tới địa chỉ người dùng chọn: một thư mới, một thread mới ở Gmail, một dòng trong Sino sau đồng bộ, gọi lại cùng ID không gửi thêm.

## 2. Web — phiên web

> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`. Làm theo Contract trước, test bằng MSW.

- [x] 2.1 **FE-83 — Nút "Thư mới", trang `/inbox/new`, ô soạn, tài khoản gửi, kiểm người nhận, rời trang (D-191, D-193, D-197)**
  - **Thực hiện:** design mục Web: `InboxAccount.sending`, `parseRecipients`, `NewMail`, route `inbox/new` (báo phiên planner trước khi sửa `router.tsx`), nút ở ba cỡ, `useBlocker` + `beforeunload`, tài khoản dùng lần trước. Nút "Gửi" kiểm dữ liệu; gửi thật ở FE-84.
  - **Đã làm (2026-10-12, AUTO):** `InboxAccount.sending` (adapter: capability `SEND_MESSAGES` của nhà cung cấp, trạng thái tài khoản, capability của tài khoản, theo thứ tự của BE-58); `format.parseRecipients`, `defaultSender`, `sendingNote`, `MAX_RECIPIENTS`; `components/NewMail.tsx` (Từ: chữ khi một tài khoản, `select` có tài khoản không gửi được bị khóa kèm lý do; Tới, Tiêu đề, Nội dung; lỗi theo ô với `aria-invalid`; dòng báo khi không tài khoản nào gửi được: "Cấp quyền gửi" / "Kết nối lại" / "Thêm nguồn"; hộp "Bỏ thư đang soạn?" bằng `useBlocker`, `beforeunload`); `newMail.ts` (`NewMailDraft`, `LEAVE_FREELY`, `lastSender`, `rememberSender`); `ConversationList` có `NewMailLink` (1280px: đầu danh sách; tablet: cuối hàng chip; mobile: icon trên đầu trang); `InboxPage({ compose })`; route `inbox/new` (`hideTabBar`) trước `inbox/:conversationId`.
  - **Làm khác kế hoạch:** ba helper `rowTitles` và một kiểm "không có dòng" của `InboxStates` đếm mọi link trong vùng danh sách. **LÝ DO:** nút "Thư mới" là link trong vùng đó; helper giờ chỉ lấy link có `data-slot="row-title"`, ý của test giữ nguyên.
  - **Kiểm chứng (2026-10-12):** RED 11/11 (hàm thuần chưa có, adapter thiếu `sending`, màn chưa có nút và form); test "rời ô trống" xanh từ đầu (canh hành vi cũ); GREEN 7/7 màn + hàm thuần + adapter. Chrome thật (headless, `vite` :5174, API qua CDP, `tienct07` gửi được, `bonzed2001` chưa cấp quyền): đúng một nút "Thư mới" hiện ở 1440 / 1024 / 390; ô soạn ở cột phải (560 / 632px) với danh sách vẫn hiện, ở 390 chiếm toàn màn, ẩn danh sách và thanh dưới; "Từ" có `bonzed2001@gmail.com · Cần cấp quyền gửi` bị khóa; gõ chữ rồi bấm một dòng → "Bỏ thư đang soạn?", đường dẫn giữ `/inbox/new`; không cuộn ngang. Lỗi Chrome tìm ra: ở 390 thanh nút nằm giữa màn (lưới ba hàng với phần đầu bị ẩn) → form thành flex dọc. Lint: cảnh báo `only-export-components` → tách `newMail.ts`. `pnpm lint` 0, `tsc -b` 0, `pnpm test` 608/608 (71 file), `pnpm build` 0. File kiến thức mục 19 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** spec `inbox-new-mail` *Nút "Thư mới" và trang soạn*, *Tài khoản gửi*, *Kiểm người nhận và nội dung*, *Rời trang khi còn chữ*.

- [ ] 2.2 **FE-84 — Gửi thư mới và sau khi gửi (D-194, D-195)**
  - **Thực hiện:** `createConversation`, `useCreateConversation`; `201` / `502` / `504` → sang cuộc trò chuyện; lỗi mạng → khóa, "Gửi lại", "Bỏ"; `400`, `409`, backend chưa có đường tạo; `OPENING_NOT_SENT` không ô trả lời; "Bỏ" thư mở đầu về danh sách.
  - **Acceptance criteria:** spec `inbox-new-mail` *Sau khi bấm Gửi*, *Cuộc trò chuyện có thư mở đầu chưa gửi xong*.

- [ ] 2.3 **FE-85 — Chạy với backend thật (sau BE-86)**
  - **Test:** web :5173, gửi một thư mới chỉ khi người dùng cho phép, tới địa chỉ người dùng chọn.

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Definition of Done, archive** (`design.md` mục Definition of Done; `openspec archive f10-new-mail -y` sau `f10-reply`).
