# Màn Tài khoản với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Task nào người dùng nhận ("để tôi làm AC-xx") thì chạy TRAINING.
> Brainstorm 2026-10-08 (D-45, D-46), thiết kế được duyệt ("oke duyệt"). Người dùng: dựng giao diện trước, nghiệm thu để sau.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Khung app

- [ ] 1.1 **AC-01 — Tab "Thêm", trang con trên mobile, Dialog**
  - **Goal / Why:** các màn dưới "Thêm" (Tài khoản là màn đầu tiên) có đúng điều hướng mobile của canvas; hộp thoại dùng chung cho các xác nhận.
  - **Files:** `src/app/shell/{TabBar,AppShell,navItems}.tsx`, `src/app/shell/MobilePageHeader.tsx`, `src/shared/ui/dialog.tsx` (shadcn, chỉnh theo `.modal`), test.
  - **Hướng làm:** tab "Thêm" sáng theo danh sách đường dẫn của `MobileMore`; route `handle.mobilePageHeader` → khung app ẩn thanh trên của mobile, `handle.hideTabBar` → ẩn thanh dưới (đọc bằng `useMatches`); `MobilePageHeader` theo `.mob-top.has-back`; `Dialog` theo `.modal` (`modal-head`, `modal-body`, `modal-foot`, lớp phủ `--scrim`).
  - **Test:** tab "Thêm" sáng ở `/settings`, `/accounts`; router thử với route có `handle` → không có thanh trên mobile của khung app, có/không thanh dưới; `MobilePageHeader` có nút quay lại với tên đọc được; `Dialog` mở bằng nút, có tên, "Hủy" và Esc đóng.
  - **Acceptance criteria:** requirement *Tab Thêm trên mobile*, *Trang con trên mobile* (spec `web-app-shell` của change này).

## 2. Dữ liệu

- [ ] 2.1 **AC-02 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm, mutation**
  - **Files:** `src/features/accounts/{accounts.types,accounts.sample,useAccounts,format}.ts`, test.
  - **Hướng làm:** kiểu đúng `design.md`; mẫu theo canvas (Gmail, Zalo 64%, Messenger hết quyền 21:04 hôm qua; 3.912 thư); `useAccounts`, `useAccount(id)` qua TanStack Query; `useSetChannel`, `useDisconnectAccount` sửa cache của cả danh sách lẫn chi tiết.
  - **Test:** từng hàm (lọc, tìm không dấu, chữ trạng thái, lần cuối, sức khỏe, tóm tắt, cảnh báo, số kênh bật, nhãn quyền, câu hoạt động, thời lượng); dữ liệu mẫu nhất quán; mutation đổi đúng tài khoản và đúng kênh; kiểm tra ngược.
  - **Acceptance criteria:** requirement *Dữ liệu của màn Tài khoản theo hợp đồng*.

## 3. Danh sách

- [ ] 3.1 **AC-03 — Trang danh sách `/accounts`**
  - **Files:** `src/features/accounts/AccountsPage.tsx`, `components/*`, `src/app/router.tsx`, test.
  - **Test:** scenario của spec (dòng đầu, dải tóm tắt, cảnh báo, hàng Zalo), tìm không dấu, lọc "Cần xử lý", không khớp → thông báo, bấm hàng → chi tiết, nút chưa có chức năng không đổi gì; Chrome 3 kích thước × 2 theme.
  - **Acceptance criteria:** requirement *Danh sách tài khoản*, *Tìm và lọc tài khoản*, *Nút chưa có chức năng trên màn Tài khoản*.

## 4. Chi tiết

- [ ] 4.1 **AC-04 — Trang chi tiết `/accounts/:id`, bật/tắt kênh, ngắt kết nối**
  - **Files:** `src/features/accounts/AccountDetailPage.tsx`, `components/*`, `src/app/router.tsx`, test.
  - **Test:** scenario của spec (mở Gmail, "3 bật · 1 tắt"), tắt "Thư đến" → "2 bật · 2 tắt" và cột Dịch vụ 2, kênh cần thêm quyền không bấm được, hủy / xác nhận ngắt kết nối, `syncRuns = null` → "Chưa có dữ liệu", `id` lạ → không tìm thấy; Chrome 3 kích thước × 2 theme, hộp thoại bẫy focus.
  - **Acceptance criteria:** requirement *Chi tiết tài khoản*, *Bật tắt kênh*, *Ngắt kết nối tài khoản*.

## 5. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 5.1 **AC-05 — Nghiệm thu, hợp đồng dữ liệu cuối, tài liệu, archive** (sau khi archive `fe-ui-overview`)
