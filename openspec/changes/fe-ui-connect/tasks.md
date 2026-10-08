# Luồng kết nối tài khoản với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit.
> Người dùng ủy quyền 2026-10-08: "viết và dựng luôn đi không cần hỏi tôi"; quyết định D-47…D-50 do agent chốt, ghi ở `design.md` để người dùng xem lại.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit.

## 1. Dữ liệu

- [ ] 1.1 **CN-01 — Hợp đồng bổ sung, dữ liệu mẫu, hàm chữ, hook**
  - **Files:** `src/features/accounts/{connect.types,connect.format,useConnect}.ts`, `accounts.api.ts`, `accounts.sample.ts`, `accounts.types.ts`, test.
  - **Hướng làm:** kiểu đúng `design.md`; danh mục mẫu 5 provider (chỉ Gmail `connectable`, scope `gmail.readonly` + `userinfo.email`); `startConnect` mẫu trả `/accounts?connected=…`; `leaveTo`; ước tính và lần đồng bộ đầu mẫu (1.180 thư, 3–5 phút; 412 / 1.180, còn 3 phút).
  - **Test:** mô tả provider, nhãn Đọc/Gửi, câu quyền, thông báo lỗi (mã lạ → câu chung), ước tính, tiến độ; dữ liệu mẫu nhất quán; hook gọi đúng hàm với đúng tham số; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `connect-wizard`.

## 2. Hộp thoại

- [ ] 2.1 **CN-02 — Hộp thoại 5 bước: chọn provider, quyền, đăng nhập; mở từ các nút**
  - **Files:** `components/ConnectWizard.tsx`, `AccountsPage.tsx`, `components/MobileAccountList.tsx`, `components/ReauthAlert.tsx`, `AccountDetailPage.tsx`, `components/MobileAccountDetail.tsx`, spec `accounts-screen` của `fe-ui-accounts`, test.
  - **Test:** mở từ "Kết nối tài khoản" và "+"; thanh bước; "Sắp có" bị vô hiệu; đi 3 bước → `leaveTo` nhận URL; "Đăng nhập lại" → bước 2, gửi `accountId`; "Quay lại"; Esc đóng; Chrome 3 kích thước × 2 theme.
  - **Acceptance criteria:** *Mở luồng kết nối*, *Chọn nhà cung cấp*, *Xem quyền trước khi đăng nhập*, *Đăng nhập lại*.

## 3. Quay về

- [ ] 3.1 **CN-03 — Kết quả quay về: tùy chọn đồng bộ, hoàn tất, lỗi**
  - **Files:** `components/ConnectWizard.tsx`, `components/ConnectError.tsx`, `AccountsPage.tsx`, test.
  - **Test:** `?connected` → bước 4, tham số bị xóa (không thêm lịch sử); tùy chọn gửi đúng; bước 5 có tiến độ, "Mở hộp thư" tới `/inbox`, "Kết nối thêm tài khoản" về bước 1; `?connectError` từng mã → đúng câu, mã lạ → câu chung, "Thử lại" mở bước 1; `connected` lạ bị bỏ qua; Chrome.
  - **Acceptance criteria:** *Kết quả quay về*.

## 4. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 4.1 **CN-04 — Nghiệm thu, tài liệu, archive** (sau khi archive `fe-ui-overview`, `fe-ui-accounts`)
