# Màn Hồ sơ người dùng · Implementation Plan

> **AUTO** (người dùng duyệt 2026-11-04). Mỗi task: viết code, kiểm thử `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`; đối chiếu giao diện; cập nhật tiến độ; commit khi hoàn thành.

## 1. Hồ sơ & Khung điều hướng

- [x] 1.1 **PF-01 — Hồ sơ OpenSpec, project-mode và PROJECT_STATE (D-420)**
  - **Files:** `openspec/changes/fe-ui-profile/**`, `project-mode.yaml`, `PROJECT_STATE.md`.
  - **Acceptance criteria:** `openspec validate fe-ui-profile --strict` hợp lệ.
  - **Thực hiện:** Tạo hồ sơ OpenSpec `fe-ui-profile` (`proposal.md`, `design.md`, `specs/user-profile-screen/spec.md`, `tasks.md`); thêm `fe-ui-profile: AUTO` vào `project-mode.yaml`; thêm dòng task vào `PROJECT_STATE.md`. `openspec validate fe-ui-profile --strict` hợp lệ.

- [x] 1.2 **PF-02 — Tầng dữ liệu mẫu và tích hợp điều hướng (D-420, D-422)**
  - **Files:** `features/profile/{profile.types.ts,profile.sample.ts,useProfile.ts}`, `app/router.tsx`, `app/shell/UserMenu.tsx`.
  - **Acceptance criteria:** Route `/profile` hoạt động, menu người dùng có "Hồ sơ cá nhân", dữ liệu mẫu khởi tạo được nạp.
  - **Thực hiện:** Tạo tầng dữ liệu mẫu `profile.sample.ts` và hook `useProfile.ts` quản lý state trong TanStack Query cache; cập nhật `UserMenu.tsx` bổ sung menuitem "Hồ sơ cá nhân" (icon `User`) dẫn tới `/profile`; đăng ký route `/profile` trong `router.tsx` dưới `RequireAuth` và `AppShell`.
  - **Bằng chứng:** `src/app/shell/UserMenu.test.tsx` pass 1/1.

## 2. Giao diện trang Hồ sơ người dùng

- [x] 2.1 **PF-03 — Giao diện ProfilePage và các khối chức năng (D-421, D-423)**
  - **Files:** `features/profile/{ProfilePage.tsx,components/*}`.
  - **Acceptance criteria:** Hiển thị đủ 4 khối: Thông tin cá nhân (sửa được tên, sđt, bio, avatar), Đổi mật khẩu, Tài khoản liên kết, Phiên hoạt động; responsive trên Desktop & Mobile.
  - **Thực hiện:** Xây dựng `ProfilePage.tsx` bố cục 2 cột (Desktop) và 1 cột (Mobile/Tablet):
    - `ProfileHeaderCard.tsx`: Avatar lớn với nút camera đổi ảnh, Tên hiển thị, Email, Badge trạng thái hoạt động, vai trò, địa điểm, ngày tham gia.
    - `ProfileInfoForm.tsx`: Form cập nhật họ tên, sđt, chức danh, địa điểm, bio kèm feedback thành công và nút khôi phục.
    - `SecuritySection.tsx`: Đổi mật khẩu (mật khẩu hiện tại, mới, xác nhận khớp), ẩn/hiện mật khẩu, thẻ thông tin 2FA.
    - `ConnectedAccountsSection.tsx`: Danh sách tài khoản kết nối (Google, Zalo) qua `useAccounts()`.
    - `ActiveSessionsSection.tsx`: Danh sách phiên đăng nhập (Chrome trên Windows - hiện tại, iPhone, MacBook) kèm nút đăng xuất thiết bị khác.
    - Dialog thay đổi ảnh đại diện (chọn ảnh mẫu hoặc nhập URL).

## 3. Kiểm thử & Nghiệm thu

- [x] 3.1 **PF-04 — Kiểm thử toàn diện và hoàn thiện (D-421, D-423)**
  - **Files:** `features/profile/**`, `PROJECT_STATE.md`.
  - **Acceptance criteria:** `tsc -b` không lỗi, `pnpm lint` không lỗi, test pass, `pnpm build` thành công.
  - **Bằng chứng:**
    - `pnpm exec tsc -b`: 0 lỗi compilation.
    - `pnpm lint`: 0 lỗi.
    - `vitest run src/features/profile src/app/shell/UserMenu.test.tsx`: 2 files, 6/6 tests pass.
    - `pnpm build`: build production thành công sạch sẽ (client + ssr prerender).
