## Why

Màn Tài khoản đã dựng (`fe-ui-accounts`) nhưng nút "Kết nối tài khoản" và "Đăng nhập lại" chưa làm gì: D-46 tách luồng kết nối (`ConnectWizard`, 5 bước) thành change riêng, làm khi backend có BE-31 để giao diện khớp luồng OAuth. BE-31 (`POST /api/accounts/connect/{provider}`) đã xong; F04a đã chốt luồng **chuyển cả trang** sang Google rồi quay về `/accounts?connected=…` hoặc `?connectError=…`. Đây cũng là phần web của Phase 2 (F04: "Add account → Gmail", màn kết quả kết nối).

## What Changes

- **Hộp thoại kết nối 5 bước** theo canvas `ConnectWizard` (thanh bước, tiêu đề, nội dung từng bước, câu ghi chú và nút ở chân hộp), mở từ "Kết nối tài khoản" (desktop, mobile, nút "+" của mobile).
- **Thứ tự bước theo luồng F04a (D-47):** Nhà cung cấp → Quyền (xem trước những quyền sẽ xin) → Đăng nhập (rời Sino sang trang của nhà cung cấp) → *quay về* → Đồng bộ (tùy chọn lần đồng bộ đầu) → Xong (tiến độ đồng bộ, "Mở hộp thư", "Kết nối thêm tài khoản").
- **Đăng nhập lại** (tài khoản `AUTH_EXPIRED`): mở cùng hộp thoại ở bước Quyền, gửi kèm `accountId` (kết nối lại của F04a).
- **Kết quả quay về:** `?connected={id}` mở lại hộp thoại ở bước Đồng bộ cho tài khoản đó; `?connectError={CODE}` hiện cảnh báo ở đầu trang Tài khoản theo bảng thông báo của F04a, kèm nút "Thử lại". Tham số được xóa khỏi URL để tải lại không hiện lại.
- **Chạy trên dữ liệu mẫu** như D-45: "rời sang Google" trong dữ liệu mẫu đi tới `/accounts?connected=acc-gmail`; tùy chọn đồng bộ và lần đồng bộ đầu là mutation mẫu. Nối API thật chỉ đổi thân các hàm trong `accounts.api.ts` (việc của FE-30 thuộc F04a).
- **Hợp đồng dữ liệu bổ sung** (bảng đối chiếu trong `design.md`): mỗi provider có `connectable` và `scopes` (quyền sẽ xin); ước tính số thư và thời gian theo khoảng đồng bộ; bắt đầu lần đồng bộ đầu với tùy chọn và trạng thái tiến độ.

## Capabilities

### New Capabilities
- `connect-wizard`: luồng kết nối và kết nối lại tài khoản trên web, xử lý kết quả quay về.

### Modified Capabilities
- Không có trong `openspec/specs/`. Spec `accounts-screen` (change `fe-ui-accounts`, chưa archive) được sửa trực tiếp: "Kết nối tài khoản", "Đăng nhập lại" và nút "+" của mobile không còn nằm trong danh sách nút chưa có chức năng.

## Impact

- Code: `apps/sino-web/src/features/accounts/**` (hộp thoại, kiểu, dữ liệu mẫu, hàm, hook), `AccountsPage.tsx`, `AccountDetailPage.tsx`, `components/MobileAccountList.tsx`, `components/MobileAccountDetail.tsx`, `components/ReauthAlert.tsx`.
- Không đổi backend, không gọi API. Các quyết định D-47…D-50 nêu chỗ canvas khác luồng backend đã duyệt và cách chọn.

## Non-goals

- Gọi API thật, chuyển trang thật sang Google: FE-30 của F04a (sau BE-32), chỉ đổi thân hàm.
- Luồng đăng nhập Zalo, Messenger, danh tính Google ("Đăng ký"), Telegram: chưa có connector; hiện "Sắp có" (D-50).
- Quyền gửi thư lúc kết nối: F10 (D-48).
- Nghiệm thu và archive: để sau như các màn trước (người dùng: "dựng UI trước, nghiệm thu để sau").
