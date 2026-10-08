# Luồng kết nối tài khoản với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit.
> Người dùng ủy quyền 2026-10-08: "viết và dựng luôn đi không cần hỏi tôi"; quyết định D-47…D-50 do agent chốt, ghi ở `design.md` để người dùng xem lại.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit.

## 1. Dữ liệu

- [x] 1.1 **CN-01 — Hợp đồng bổ sung, dữ liệu mẫu, hàm chữ, hook**
  - **Thực hiện (2026-10-08, AUTO):** `connect.types.ts` (`ConnectableProvider`, `SyncRange`, `SyncOptions`, `SyncEstimate`, `InitialSyncStatus`); `connect.sample.ts` (5 provider, chỉ Gmail `connectable`; ước tính và tiến độ đầu theo khoảng: 30 ngày 420 thư / 1–2 phút, 90 ngày 1.180 / 3–5, toàn bộ 6.400 / 15–25); `connect.format.ts` (mô tả provider, nhãn Đọc/Gửi/Đăng ký hoặc "Sắp có", danh tính đăng nhập, câu "để làm gì" của quyền, câu quyền không xin, chữ của 5 bước theo thứ tự D-47, thông báo lỗi, ước tính, tiến độ); `accounts.api.ts` thêm `fetchConnectProviders`, `startConnect` (mẫu trả `/accounts?connected=…`), `leaveTo`, `fetchSyncEstimate`, `startInitialSync`; `useConnect.ts` (`useConnectProviders`, `useStartConnect` gọi rồi rời trang, `useSyncEstimate` theo khoảng, `useStartInitialSync` ghi tiến độ vào tài khoản trong danh sách).
  - **Làm khác kế hoạch:** scenario "Bắt đầu đồng bộ" của spec đổi sang giữ 90 ngày, thêm scenario "Ước tính theo khoảng đồng bộ". **LÝ DO:** ước tính và tiến độ đi theo khoảng đã chọn, nên tiến độ "412 / 1.180" của canvas chỉ đúng với 90 ngày. Mã scope gửi dạng ngắn như trang chi tiết (`gmail.readonly`, `userinfo.email`), không gửi `openid` (ghi ở `design.md`).
  - **Kiểm chứng (2026-10-08):** RED 16/16 trên stub; GREEN 77/77 trong `src/features/accounts`. Kiểm tra ngược 28 lỗi gài: 25 bị bắt; 2 lọt vì test thiếu ca (chữ bước 3 với danh tính khác "Google"; lần đồng bộ đầu với khoảng khác 90 ngày) → thêm ca → bị bắt; 1 lỗi gài viết sai cú pháp làm file test không chạy → viết lại → bị bắt. `pnpm lint` 0/0, `pnpm test` 164/164, `pnpm build` ok.
  - **Files:** `src/features/accounts/{connect.types,connect.format,useConnect}.ts`, `accounts.api.ts`, `accounts.sample.ts`, `accounts.types.ts`, test.
  - **Hướng làm:** kiểu đúng `design.md`; danh mục mẫu 5 provider (chỉ Gmail `connectable`, scope `gmail.readonly` + `userinfo.email`); `startConnect` mẫu trả `/accounts?connected=…`; `leaveTo`; ước tính và lần đồng bộ đầu mẫu (1.180 thư, 3–5 phút; 412 / 1.180, còn 3 phút).
  - **Test:** mô tả provider, nhãn Đọc/Gửi, câu quyền, thông báo lỗi (mã lạ → câu chung), ước tính, tiến độ; dữ liệu mẫu nhất quán; hook gọi đúng hàm với đúng tham số; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `connect-wizard`.

## 2. Hộp thoại

- [x] 2.1 **CN-02 — Hộp thoại 5 bước: chọn provider, quyền, đăng nhập; mở từ các nút**
  - **Thực hiện (2026-10-08, AUTO):** `components/ConnectWizard.tsx` (Dialog rộng 640px, cao tối đa màn hình, thân hộp tự cuộn; dòng "KẾT NỐI TÀI KHOẢN · N/5", thanh 5 bước có `aria-current="step"`; bước 1 nhóm nút chọn theo `.opt` với nhãn Đọc/Gửi hoặc "Sắp có"; bước 2 quyền sẽ xin kèm câu "để làm gì", khi đăng nhập lại có hàng tài khoản; bước 3 hình nối Sino → khóa → nhà cung cấp, "Đăng nhập bằng …", nút "Tiếp tục tới …" gọi `useStartConnect` rồi rời trang, lỗi thì hiện cảnh báo); `ProviderIcon` thêm dấu Google, Telegram. Trang Tài khoản giữ trạng thái hộp thoại; "Kết nối tài khoản" (desktop, mobile) và "+" mở bước 1. "Đăng nhập lại" (cảnh báo trên danh sách và chi tiết, nút mobile) thành liên kết `/accounts?reconnect={id}`, trang mở bước 2 cho tài khoản đó rồi bỏ tham số (`replace`). Spec `accounts-screen` của `fe-ui-accounts` bỏ ba nút này khỏi danh sách "chưa có chức năng".
  - **Làm khác kế hoạch:** đọc `?reconnect` một lần cho mỗi lượt vào trang (`location.key`) ngay lúc render, effect chỉ xóa tham số khỏi URL. **LÝ DO:** cách đầu (đặt state trong effect) bị lint `react(set-state-in-effect)` báo: gây vẽ lại dây chuyền; theo key còn đúng khi bấm cùng một liên kết lần hai (có test).
  - **Kiểm chứng (2026-10-08):** RED 10 test đỏ (8 test mới + 2 test cũ phải đổi vì "Đăng nhập lại" thành liên kết); GREEN, cuối cùng 9/9 test hộp thoại. Kiểm tra ngược 25 lỗi gài: 24 bị bắt, 1 lọt ("Quay lại" ở bước 3 về bước 1, test chỉ bấm "Quay lại" ở bước 2) → thêm ca → bị bắt. Chrome (1440px sáng / tối, 390px sáng / tối): đủ 3 bước, hộp 640px / 358px, không cuộn ngang; Tab đi vòng trong hộp (nhóm nút chọn → Tiếp tục → Đóng). `pnpm lint` 0/0, `pnpm test` 173/173, `pnpm build` ok.
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
