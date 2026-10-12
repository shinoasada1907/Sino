# Mở rộng F05 — Một chuỗi ở nhiều tài khoản là một dòng · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng chọn gom thành một dòng và duyệt thiết kế (2026-10-12): D-180…D-187 là người dùng duyệt.
> Change dùng chung: phiên web làm mục 2; phiên backend nhận mục 1 và được sửa task của mình khi nhận.

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [ ] 1.1 **BE-80 — Nhóm của một chuỗi: cột, gom khi lưu, gom dữ liệu đã có (D-180)**
  - **Goal / Why:** nhận ra các bản của một chuỗi ở nhiều tài khoản.
  - **Thực hiện:** design mục Backend 1 và chốt kỹ thuật: V20 (`thread_group_id`, index `rfcMessageId`, `thread_group_id`), gom dữ liệu đã có; `JdbcConversationStore` gom sau khi lưu, khóa theo chủ.
  - **Test:** design mục Testing (Gom); dữ liệu đã có trước change được gom đúng.
  - **Acceptance criteria:** spec `thread-merge` *Nhóm của một chuỗi ở nhiều tài khoản*.

- [ ] 1.2 **BE-81 — API Hộp thư theo nhóm (D-181…D-183, D-185, D-187)**
  - **Thực hiện:** design mục Backend 2, 3: một item mỗi nhóm, `accountIds`, bản chính, trường gộp, keyset; số đếm; lọc; mã của bản bất kỳ → mã nhóm; `PATCH` mọi bản; `participants` gộp; sự kiện mang mã nhóm.
  - **Acceptance criteria:** spec `thread-merge` *Một dòng cho một nhóm*, *Số đếm và bộ lọc theo nhóm*, *Mở và đổi một nhóm bằng mã của bất kỳ bản nào*.

- [ ] 1.3 **BE-82 — Thư và trả lời theo nhóm (D-184, D-186)**
  - **Thực hiện:** design mục Backend 4, 5: thư bỏ trùng và chọn bản, cursor; nội dung, tệp, xóa theo nhóm; `reply` và gửi trên bản chính.
  - **Acceptance criteria:** spec `thread-merge` *Thư của một nhóm*, *Trả lời một nhóm*.

- [ ] 1.4 **BE-83 — Chạy thật với hai tài khoản Gmail, README**
  - **Test:** dữ liệu thật của người dùng (`tienct07`, `bonzed2001`): mỗi chuỗi "xin chào" / "hihi" một item với hai `accountIds`; thư 3 chứ không 6; số đếm. Không gửi thư thật nếu người dùng không cho phép rõ ràng.

## 2. Web — phiên web

> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`. Làm theo Contract trước, test bằng MSW.

- [x] 2.1 **FE-80 — `accountIds`, dòng và đầu chuỗi ghi mọi tài khoản (D-182)**
  - **Thực hiện (2026-10-12, AUTO):** `ConversationItem.accountIds` (bắt buộc); `inbox.api.ts` `accountIds?` → `[accountId]` khi API chưa có; dữ liệu mẫu (`rows` rồi thêm `accountIds`), fixture `c-1` là chuỗi gộp `acc-1` + `acc-2`, `c-2` như API cũ; `format.rowAccount` → `rowAccounts` (theo `accountIds`, bản chính trước); `threadSubtitle(item, accounts[], …)` nối địa chỉ bằng ", "; `ConversationList` ghi mọi địa chỉ; `EmailThread` nhận `accounts` (InboxPage tính từ `accountIds`); `ChatThread` truyền `[account]` (chat không gộp).
  - **Làm khác kế hoạch:** thêm một sửa bố cục ở đầu chuỗi: icon và chữ nguồn gộp thành một cụm không xuống dòng. **LÝ DO:** Chrome cho thấy hai địa chỉ đẩy icon lên một dòng riêng ở cả 1440 và 390.
  - **Kiểm chứng (2026-10-12):** RED 4/4 (`rowAccounts` chưa có; `threadSubtitle` ra "Gmail · undefined"; adapter thiếu `accountIds`; màn không có nhãn hai địa chỉ), GREEN; test IN-10 đỏ vì dữ liệu test chỉ đổi `accountId` → sửa dữ liệu theo hợp đồng mới. Chrome thật (headless, `vite` :5174, API qua CDP, chuỗi gộp `c-1`): dòng ghi hai địa chỉ ở 1440/1024/390 (cắt "…" khi thiếu chỗ, tài khoản chính luôn đọc được), một tài khoản giữ "Gmail" từ 1280px; đầu chuỗi ghi đủ hai địa chỉ, icon cùng hàng với chữ (lần 1 icon ở dòng riêng → sửa); thư một tài khoản không đổi; không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `pnpm test` 557/557 (67 file), `pnpm build` 0. File kiến thức mục 18 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Đã biết, ngoài phạm vi:** cột trái của đầu chuỗi ở 1440 hẹp (~176px) vì cụm nút bên phải (có từ IN-02, ghi ở IN-06), nên hai địa chỉ xuống 3 dòng.
  - **Acceptance criteria:** spec `inbox-merged-threads` *Dòng của chuỗi gộp ghi mọi tài khoản*.

- [ ] 2.2 **FE-81 — Mở chuỗi gộp: "Bạn · địa chỉ", "Gửi từ", chuyển mã (D-183, D-184, D-186)**
  - **Acceptance criteria:** spec `inbox-merged-threads` *Thư của bạn ghi địa chỉ trong chuỗi gộp*, *Ô trả lời ghi tài khoản gửi trong chuỗi gộp*, *Mã của bản khác chuyển về mã của nhóm*.

- [ ] 2.3 **FE-82 — Chạy với backend thật (sau BE-83)**
  - **Test:** web :5173 với hai tài khoản Gmail: dòng, mở, đọc / lưu trữ, trả lời (chỉ khi người dùng cho phép gửi thật).

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Definition of Done, archive** (`design.md` mục Definition of Done; `openspec archive f05b-merged-threads -y` sau các change F05, F06, F10 mà nó dựa vào).
