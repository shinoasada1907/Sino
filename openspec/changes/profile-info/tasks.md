# Hồ sơ người dùng, phần 1 · Implementation Plan

> **AUTO** (người dùng, 2026-11-04: "A, AUTO"). Quyết định kiến trúc vẫn do người dùng chốt (DN-1, DN-2 ở `design.md`).
> **Thứ tự:** PI-01 → PI-02 → PI-03 ở `sino-api` (một kỹ sư, nối tiếp). PI-04 dựng được trên MSW theo hợp đồng ở `design.md` song song với backend, sau khi DN-2 xong; PI-05 sau PI-04; lượt Chrome thật sau khi PI-03 vào `dev`. PI-10 sau tất cả, có người dùng. `fe-ui-profile` phải archive trước khi archive change này.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests`, chạy trong git worktree riêng; test tay trên bản sao DB (`pg_dump`) và app của worktree ở cổng 8091, Gmail / Zalo / sync tắt. `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. Backend

- [ ] 1.1 **PI-01 — `sino-api`: migration, trường hồ sơ và tên giữ qua khởi động lại (D-476, D-478, DN-1)** · `sino-api`
  - **Goal:** `app_user` (hoặc `user_profile`, theo DN-1) có các trường hồ sơ; `OwnerProvisioner` chỉ đặt tên khi tạo owner.
  - **Files:** migration Flyway mới (số trống kế tiếp, hiện V25) `identity_add_profile`; `identity/infrastructure/AppUser.java` (trường mới, phương thức sửa có kiểm giới hạn); `identity/application/OwnerProvisioner.java` (bỏ `rename` khi đã có, log `INFO` khi tên cấu hình khác tên lưu); `apps/sino-api/README.md`, `apps/sino-api/.env.example` (ghi chú `SINO_OWNER_DISPLAY_NAME`); test.
  - **Acceptance criteria:** `account-owner` (mọi scenario, gồm *Tên đã sửa trên web giữ qua lần khởi động lại*); ràng buộc DB là sàn dưới kiểm tra của Java (như V20).
  - **Test:** test tay trên bản sao DB: chạy migration, xem cột và ràng buộc bằng `psql \d`; đổi `display_name` bằng SQL, khởi động lại với tên cấu hình khác, tên giữ, log có dòng INFO. Rồi test tích hợp cho provisioner và test đơn vị cho giới hạn của `AppUser`; `ModularityTests`.
  - **Depends on:** DN-1.

- [ ] 1.2 **PI-02 — `sino-api`: `GET` / `PATCH /api/profile`, `avatarUrl` trong `/api/auth/me` (D-478, D-480)** · `sino-api`
  - **Goal:** đọc và sửa hồ sơ theo hợp đồng ở `design.md`.
  - **Files:** `identity/api/{ProfileController,ProfileResponse,UpdateProfileRequest}.java` (mới), `identity/application/ProfileService.java` (mới), `identity/api/MeResponse.java`, `OwnerProfile` (thêm `avatarUrl`); README *Endpoints available today*; test.
  - **Acceptance criteria:** `user-profile-api` *Đọc hồ sơ của owner*, *Sửa thông tin hồ sơ*; `web-authentication` *Người dùng hiện tại*; trường lạ bị `400` (`FAIL_ON_UNKNOWN_PROPERTIES` chỉ cho request này, hoặc kiểm tay).
  - **Test:** test tay trên bản sao DB (8091): `curl` `GET`, `PATCH` từng trường, chuỗi trống, tên trống, số sai, `email` trong body, thiếu CSRF (403). Rồi test API (MockMvc) cho từng scenario.
  - **Depends on:** PI-01.

- [ ] 1.3 **PI-03 — `sino-api`: ảnh đại diện (D-477, D-481)** · `sino-api`
  - **Goal:** `PUT` / `GET` / `DELETE /api/profile/avatar`.
  - **Files:** bảng `user_avatar` trong migration của PI-01 (hay migration riêng nếu PI-01 đã vào `dev`); `identity/infrastructure/{UserAvatar,UserAvatarRepository}.java`, kiểm loại và kích thước ảnh từ byte đầu (dùng lại cách của module `sticker` nếu có, không kéo phụ thuộc chéo module: chép hay đưa vào `common` thì ghi LÝ DO), `ProfileController`, `ProfileService`; `spring.servlet.multipart` nếu giới hạn chung nhỏ hơn 1 MB; README; test.
  - **Acceptance criteria:** `user-profile-api` *Ảnh đại diện* (mọi scenario); `avatarUrl` của `/api/profile` và `/api/auth/me` đổi theo ảnh.
  - **Test:** test tay trên bản sao DB (8091): `curl -F file=@…` với WebP, PNG, JPEG thật, tệp chữ đổi đuôi `.png`, ảnh 2 MB, ảnh 2000×2000; `GET` có và không `If-None-Match`; `DELETE` hai lần. Rồi test API cho từng scenario; lỗi gài một lần cho hàm kiểm loại ảnh.
  - **Depends on:** PI-02.

## 2. Web

- [ ] 2.1 **PI-04 — `sino-web`: hồ sơ trên API (D-478, D-479, D-480)** · `sino-web`
  - **Goal:** khối Thông tin cá nhân đọc và lưu qua API; tên mới hiện ngay ở thanh trên và menu; khối chưa có máy chủ có "Sắp có".
  - **Files:** `features/profile/{profile.api.ts (mới), profile.types.ts, useProfile.ts, profile.sample.ts}`, `components/{ProfileInfoForm,ProfileHeaderCard,SecuritySection,ActiveSessionsSection}.tsx`, `features/auth/` (kiểu `me` có `avatarUrl`), handler MSW + fixture; test.
  - **Acceptance criteria:** `user-profile-screen` *Thông tin cá nhân lưu ở máy chủ*, *Khối chưa có máy chủ*; test cũ của `fe-ui-profile` còn xanh (đổi mong đợi thì ghi LÝ DO).
  - **Test:** test tay ở dev server trên MSW (hay backend 8091 sau PI-02): sửa, lưu, tải lại; số sai thì lỗi dưới ô; xem request ở tab Network chỉ có trường đã đổi. Rồi Vitest.
  - **Depends on:** DN-2; hợp đồng ở `design.md` (không chờ PI-02 để dựng).

- [ ] 2.2 **PI-05 — `sino-web`: đổi ảnh bằng tệp (D-477, D-481)** · `sino-web`
  - **Goal:** chọn tệp, cắt vuông, thu 256×256, gửi; "Xóa ảnh"; ảnh ở thanh trên và menu theo `me.avatarUrl`.
  - **Files:** hộp đổi ảnh trong `features/profile/ProfilePage.tsx` (hay tách `components/AvatarDialog.tsx`), hàm thuần cắt và thu nhỏ (`avatarImage.ts`), `app/shell/{Topbar,UserMenu}.tsx` (chỉ phần ảnh); test.
  - **Acceptance criteria:** `user-profile-screen` *Đổi ảnh đại diện bằng tệp*.
  - **Test:** test tay Chrome thật: ảnh dọc, ảnh ngang, PNG trong suốt, tệp không phải ảnh; ảnh thanh trên đổi ngay; "Xóa ảnh". Rồi Vitest cho tính khung cắt (hàm thuần) và luồng hộp với MSW.
  - **Depends on:** PI-04.

## 3. Nghiệm thu

- [ ] 3.1 **PI-10 — Nghiệm thu với người dùng, archive** · quản lý
  - Chrome thật trên backend thật (sau PI-03): `/profile` ở 1440, 1024, 390 × dark và light; sửa, tải lại, khởi động lại `sino-api`, tên còn; đổi ảnh và xóa ảnh.
  - `fe-ui-profile` đã archive; rồi `openspec archive profile-info -y`; file kiến thức `docs/knowledge/` có phần của change này.
