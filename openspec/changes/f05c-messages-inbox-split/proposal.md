## Why

Hộp thư hôm nay gộp email và chat vào một danh sách. Xem lại các frame chat của canvas (2026-10-15), người dùng đề xuất tách thành hai màn: "Tin nhắn" cho chat (Zalo, Messenger, Telegram…) và "Hộp thư" cho email. Hai loại đọc khác nhau (chat là bong bóng theo ngày, email là thread có tiêu đề, thư mới), và Zalo cá nhân (`zalo-personal`) sắp đưa provider chat đầu tiên vào Sino. Tách ngay bây giờ thì Zalo vào đúng màn từ đầu, không phải sửa lại sau.

Người dùng duyệt thiết kế ba phần (2026-10-16): phần 1 giao diện, phần 2 API và backend (mục 2.6 chọn A), phần 3 canvas, task, test; change chạy AUTO vì là sửa Hộp thư đang làm, không phải feature mới.

## What Changes

- **Hai mục điều hướng (D-300, D-301):** "Tin nhắn" (`/messages`) và "Hộp thư" (`/inbox`), mỗi mục có số chưa đọc riêng; không có màn gộp. Tab bar mobile: Tổng quan · Tin nhắn · Hộp thư · Việc · Thêm; Lịch chuyển vào "Thêm".
- **Canvas trước (D-302):** vẽ lại các frame bị ảnh hưởng và frame mới của Tin nhắn trên canvas "Sino UI", người dùng duyệt, bản sao trong repo theo sau, rồi mới code web.
- **Routes và tự chuyển (D-303):** `/messages`, `/messages/:id`, `/inbox`, `/inbox/:id`, `/inbox/new` (thư mới chỉ có ở email). Mở một cuộc trò chuyện ở màn sai loại thì web thay đường dẫn bằng màn đúng, cả hai chiều.
- **Hai màn danh sách (D-304):** cùng bố cục, cùng các chip view, mỗi màn đếm riêng; cột nguồn chỉ có provider cùng loại; "Thư mới" chỉ ở Hộp thư; dòng báo "N tin mới" ở Tin nhắn, "N thư mới" ở Hộp thư.
- **Trạng thái trống và lối vào (D-305):** Tin nhắn chưa có tài khoản chat thì hiện "Kết nối tài khoản"; nút cuối của hộp thoại kết nối mở màn theo loại provider vừa nối; thẻ "Hộp thư hợp nhất" ở Tổng quan giữ nội dung gộp, nút "Mở hộp thư" tách thành "Tin nhắn" và "Hộp thư".
- **Provider khai loại (D-306):** `ProviderKind` (`EMAIL`, `CHAT`), `MessageProvider.kind()` bắt buộc; descriptor và `GET /api/providers` có `kind`.
- **API theo loại (D-307):** `GET /api/conversations?kind=email|chat`, `GET /api/conversations/counts?kind=…` và trường mới `unreadByKind`; `kind` của từng dòng lấy theo provider thay vì theo `ConversationType`.
- **Provider ngoài registry (D-308, phương án A):** tính là `EMAIL`, ghi log cảnh báo; không migration.

## Capabilities

### New Capabilities
- `messages-screen` (web): màn Tin nhắn (`/messages`, `/messages/:id`): danh sách chat, hội thoại chat, trạng thái trống, dòng báo "N tin mới", tự chuyển giữa Tin nhắn và Hộp thư.

### Modified Capabilities
- `provider-contract`: connector khai loại `EMAIL` hoặc `CHAT`.
- `provider-registry`: descriptor có loại; connector có công tắc tắt vẫn ở trong registry.
- `provider-catalog-api`: mỗi provider trên `GET /api/providers` có `kind`.
- `inbox-api` (của `f05-unified-inbox`, chưa archive): lọc và đếm theo loại, `unreadByKind`, `kind` theo provider, provider ngoài registry.
- `inbox-screen` (của `fe-ui-inbox`, chưa archive): Hộp thư chỉ còn email; hội thoại chat chuyển sang `messages-screen`.
- `web-app-shell` (của `fe-ui-overview`, `fe-ui-accounts`, chưa archive): điều hướng có Tin nhắn; Lịch nằm dưới "Thêm" trên mobile.
- `overview-screen` (của `fe-ui-overview`, chưa archive): thẻ Hộp thư hợp nhất có hai nút.
- `connect-wizard` (của `fe-ui-connect`, chưa archive): nút cuối theo loại provider.
- `inbox-live` (của `f07-f08-realtime-inbox`, chưa archive): số trên điều hướng theo loại.

## Impact

- **Backend** (`apps/sino-api`): module `provider` (`ProviderKind`, `MessageProvider`, `ProviderDescriptor`, `DefaultProviderRegistry`, `ProviderResponse`, `GmailProvider`, các provider giả trong test); module `conversation` (`ConversationsController`, `InboxService`, `CountsResponse`, `ConversationResponse`, `InboxItem`). Không migration. Không đổi sự kiện SSE, không đổi `GET /api/accounts`.
- **Web** (`apps/sino-web`): `app/shell` (`navItems`, `AppShell`, `MorePage`), `app/router.tsx`, `features/inbox` (dùng chung cho hai màn), `features/overview/cards/InboxCard.tsx`, `features/accounts/components/ConnectWizard.tsx`, `shared/domain` (`ProviderInfo.kind`), dữ liệu mẫu và MSW.
- **Canvas:** frame `Sidebar`, `Rail`, `TabBar`, `MobileMore`, `Inbox`, `TabletInbox`, `MobileInbox`, `Conversation`, `MobileConversation`, `ThreadState`, `InboxState`, `Dashboard` (ba cỡ), `ConnectWizardStep5` (bản tối và sáng); frame mới `Messages`, `TabletMessages`, `MobileMessages`.
- **Change khác:** `zalo-personal` (ZL-06 khai `kind() = CHAT`, ZL-11 nút "Mở Tin nhắn"); `f10-new-mail` (BE-84: tài khoản gửi phải là `EMAIL`).
- **Thứ tự:** backend của change này làm sau BE-82 của `f05b-merged-threads` (cùng sửa `InboxService`); archive sau `f05-unified-inbox`, `f07-f08-realtime-inbox`, `fe-ui-overview`, `fe-ui-accounts`, `fe-ui-connect`, `fe-ui-inbox` (D-309).

## Non-goals

- Một màn gộp cả chat và email (bỏ, D-300).
- Bắt đầu một cuộc chat mới từ Sino; gửi tin chat thật (ZL-09 của `zalo-personal`).
- Đổi bố cục danh sách, các chip view hay trang mở một cuộc trò chuyện.
- Lưu loại vào database (phương án B của mục 2.6, không chọn); thêm `kind` vào sự kiện SSE hay `GET /api/accounts`.
- Tách thẻ "Hộp thư hợp nhất" ở Tổng quan thành hai thẻ.
- Tìm kiếm, thao tác trên tin (nhắc, tạm ẩn, hẹn gửi, việc, lịch hẹn, ghi chú): change sau (D-52).
