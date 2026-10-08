# Màn Tài khoản với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Task nào người dùng nhận ("để tôi làm AC-xx") thì chạy TRAINING.
> Brainstorm 2026-10-08 (D-45, D-46), thiết kế được duyệt ("oke duyệt"). Người dùng: dựng giao diện trước, nghiệm thu để sau.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Khung app

- [x] 1.1 **AC-01 — Tab "Thêm", trang con trên mobile, Dialog**
  - **Thực hiện (2026-10-08, AUTO):** `navItems.MORE_PATHS` (các màn dưới "Thêm" theo `MobileMore`); `TabBar`: tab "Thêm" là `Link` tự đặt `aria-current` khi đường dẫn nằm dưới "Thêm" (kể cả trang con); `AppShell` đọc `handle` của các route đang khớp (`useMatches`): `mobilePageHeader` → thanh trên của khung app có `max-md:hidden`, `hideTabBar` → không vẽ thanh dưới; `MobilePageHeader` (nút quay lại có tên đọc được, tiêu đề `h1`, dòng phụ, nút phụ; chỉ hiện dưới 768px); `src/shared/ui/dialog.tsx` (shadcn Dialog viết tay để giữ `Button` đã chỉnh, theo `.modal`: lớp phủ `--scrim`, đầu / thân / chân hộp thoại, nút "Đóng").
  - **Làm khác kế hoạch:** `Dialog` không sinh bằng `shadcn add`. **LÝ DO:** lệnh đòi ghi đè `button.tsx` (Dialog phụ thuộc Button) và sẽ xóa phần đã chỉnh theo canvas; mã lấy từ `--dry-run --view` rồi viết lại. Test tìm đầu trang con qua tiêu đề của nó. **LÝ DO:** `<header>` nằm trong `<main>` không phải landmark "banner".
  - **Kiểm chứng (2026-10-08):** RED: 3 test mới đỏ (chưa có đầu trang con, thanh dưới chưa ẩn, tab "Thêm" chưa sáng); 2 test của `Dialog` xanh ngay (mã sinh sẵn) và 2 test mốc xanh. GREEN 46/46 trong `src/app` + `src/shared`. Kiểm tra ngược 8 lỗi bằng script, cả 8 bị bắt (gồm 2 lỗi của `Dialog`: bỏ nút "Đóng", chặn Esc). Trường hợp trang con `/accounts/:id` vẫn giữ tab "Thêm" sáng sẽ có test ở AC-04 (route chưa có). `pnpm lint` 0/0, `pnpm test` toàn bộ xanh, `pnpm build` ok.
  - **Goal / Why:** các màn dưới "Thêm" (Tài khoản là màn đầu tiên) có đúng điều hướng mobile của canvas; hộp thoại dùng chung cho các xác nhận.
  - **Files:** `src/app/shell/{TabBar,AppShell,navItems}.tsx`, `src/app/shell/MobilePageHeader.tsx`, `src/shared/ui/dialog.tsx` (shadcn, chỉnh theo `.modal`), test.
  - **Hướng làm:** tab "Thêm" sáng theo danh sách đường dẫn của `MobileMore`; route `handle.mobilePageHeader` → khung app ẩn thanh trên của mobile, `handle.hideTabBar` → ẩn thanh dưới (đọc bằng `useMatches`); `MobilePageHeader` theo `.mob-top.has-back`; `Dialog` theo `.modal` (`modal-head`, `modal-body`, `modal-foot`, lớp phủ `--scrim`).
  - **Test:** tab "Thêm" sáng ở `/settings`, `/accounts`; router thử với route có `handle` → không có thanh trên mobile của khung app, có/không thanh dưới; `MobilePageHeader` có nút quay lại với tên đọc được; `Dialog` mở bằng nút, có tên, "Hủy" và Esc đóng.
  - **Acceptance criteria:** requirement *Tab Thêm trên mobile*, *Trang con trên mobile* (spec `web-app-shell` của change này).

## 2. Dữ liệu

- [x] 2.1 **AC-02 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm, mutation**
  - **Thực hiện (2026-10-08, AUTO):** gom phần dùng chung của hai màn trước: `src/shared/domain.ts` (`Instant`, `ProviderType`, `AccountStatus`, `ProviderInfo`), `src/shared/format.ts` (`formatCount`, `foldText` bỏ dấu để tìm, `providerNameOf`, `methodLabel`), `formatDate`/`formatSince` vào `src/shared/time/local.ts`; màn Tổng quan và khung app dùng lại (không đổi hành vi). Màn Tài khoản: `accounts.types.ts` (hợp đồng), `accounts.sample.ts` (giờ viết đúng như canvas, dời theo đồng hồ thật), `accounts.api.ts`, `useAccounts.ts` (`useAccounts`, `useAccount`, `useSetChannel` cập nhật lạc quan và trả lại khi lưu lỗi, `useDisconnectAccount` sửa cache danh sách + khung app + Tổng quan), `format.ts` (21 hàm chữ của hai trang).
  - **Làm khác kế hoạch:**
    - ~~`AccountDetailData` gồm cả tài khoản~~ → chi tiết = hàng tài khoản lấy từ danh sách + `AccountExtras` (scopes, sites, syncRuns, activity). **LÝ DO:** một tài khoản chỉ nằm một chỗ trong cache, nên bật/tắt kênh hay ngắt kết nối chỉ sửa một chỗ và hai trang luôn khớp nhau; `design.md`, spec và `proposal.md` đã sửa theo.
    - Thêm `accounts.api.ts` (4 hàm gửi/nhận, hiện trả dữ liệu mẫu). **LÝ DO:** test cần giả "lưu lỗi" để kiểm phần trả công tắc về chỗ cũ; đồng thời đây là chỗ duy nhất phải đổi khi nối API (D-45).
    - `SITES_DETECTED` có thêm `method`. **LÝ DO:** canvas ghi "tài khoản **Google** này" (danh tính đăng nhập), không phải tên nhà cung cấp "Gmail".
    - Chữ theo canvas thay cho dự kiến: hoạt động "Bạn cấp thêm quyền gửi thư." (nhãn ngắn riêng, không dùng "Gửi thư thay bạn"); kênh đang tạm dừng ghi "Lần cuối 21:04 hôm qua" và trang tự thêm nhãn "Tạm dừng" (`MobileAccountDetail`).
    - "Đồng bộ gần nhất" tính từ dữ liệu (14:04, lần của Zalo) thay vì "14:02" vẽ sẵn trên canvas. **LÝ DO:** canvas tự mâu thuẫn (Zalo "vừa xong" lúc 14:05).
  - **Kiểm chứng (2026-10-08):** RED: 16 test của `format.ts` đỏ trên bản stub, 11/13 test của dữ liệu mẫu + hook đỏ (2 test còn lại kiểm "không làm gì" nên stub qua được). GREEN 34/34 trong `src/features/accounts`. Kiểm tra ngược 60 lỗi gài bằng script, cả 60 bị bắt. `pnpm lint` 0/0, `pnpm test` 120/120, `pnpm build` ok.
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
