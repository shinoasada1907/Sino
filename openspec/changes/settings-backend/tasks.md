# Lưu cài đặt của người dùng · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** (backend: chạy app từ worktree và gọi API thật bằng `curl`, xem DB; web: Chrome thật), rồi mới viết test tự động; kiểm chứng; ghi chú và bằng chứng tại task; commit lên `dev`. Push chỉ khi người dùng bảo.
> **Hai phiên (D-407):** phần 1 do phiên `sino-api-e0`, phần 2 do phiên `sino-web-03`. Hợp đồng API ở `design.md` D-401…D-403; đổi hợp đồng thì báo phiên kia và hỏi người dùng.
> **Lệnh kiểm tra.** `apps/sino-api`: `./mvnw -B -ntp test` trong một worktree riêng (không build trong cây chính khi người dùng chạy app từ IntelliJ). `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. `sino-api` (phiên `sino-api-e0`)

- [ ] 1.1 **SB-01 — Bảng `user_settings`, module `settings`, giá trị mặc định (D-401, D-404)**
  - **Files:** `db/migration/V2x__settings_create_user_settings.sql`, `dev/sino/settings/**` (+ `package-info.java`), test.
  - **Acceptance criteria:** đọc khi chưa có dòng trả mặc định mà không ghi; `ModularityTests` xanh.
  - **Test:** test tay: chạy app từ worktree, xem bảng; rồi Testcontainers.

- [ ] 1.2 **SB-02 — `GET` và `PATCH /api/settings` (D-401, D-402)**
  - **Acceptance criteria:** spec `user-settings` phần "Đọc cài đặt của người dùng" và "Đổi cài đặt".
  - **Test:** test tay bằng `curl` (đăng nhập, đọc, đổi từng loại trường, gộp `notifications`, `null`, giá trị sai, trường lạ, `{}`, đăng xuất rồi đọc lại); rồi Testcontainers + MockMvc (hai `PATCH` song song không mất thay đổi).

- [ ] 1.3 **SB-03 — `GET /api/settings/storage` (D-403), README**
  - **Acceptance criteria:** spec "Số liệu dữ liệu đang lưu"; cách tính `bytes` ghi tại task; bảng API trong `apps/sino-api/README.md`.
  - **Test:** test tay trên DB thật của người dùng (số khớp `storedMessages` của `/api/accounts`); rồi Testcontainers (người dùng khác không được tính).

## 2. `sino-web` (phiên `sino-web-03`)

- [ ] 2.1 **SB-10 — Đọc và ghi cài đặt qua API (D-405)**
  - **Files:** `features/settings/{settings.api.ts,useSettings.ts,…}`, các mục, `shared/theme/**`, test.
  - **Acceptance criteria:** spec "Màn Cài đặt dùng cài đặt đã lưu" (trừ số liệu).
  - **Test:** Chrome thật trên backend thật khi SB-02 xong (trước đó MSW); rồi Vitest + MSW (đổi hiện ngay, lỗi trả về, theme đã lưu được áp).

- [ ] 2.2 **SB-11 — "Dữ liệu Sino đang lưu" thật (D-406)**
  - **Acceptance criteria:** spec "Màn Cài đặt dùng cài đặt đã lưu" phần số liệu.
  - **Test:** Chrome thật khi SB-03 xong; rồi Vitest.

## 3. Nghiệm thu

- [ ] 3.1 **SB-20 — Chạy thật hai phía, tài liệu, kết thúc**: đổi từng cài đặt trên web, tải lại, đăng xuất / đăng nhập, xem DB; file kiến thức; `openspec validate settings-backend --strict`; archive sau `fe-ui-settings`.
