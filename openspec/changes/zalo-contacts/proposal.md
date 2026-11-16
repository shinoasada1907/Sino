## Why

Người dùng (2026-11-02) muốn "đồng bộ tin nhắn gồm cả những người nhắn trước đó", và chọn nghĩa: **danh sách cuộc trò chuyện cũ, không cần tin cũ** — người và nhóm Zalo đã nhắn với mình trước khi nối Sino phải tìm được trong Sino để nhắn tiếp. Hôm nay một cuộc trò chuyện Zalo chỉ có trong Sino khi có tin mới tới sau lúc kết nối; người chưa nhắn lại thì không có cách nào mở chat với họ từ Sino (D-304: Tin nhắn không có nút mở cuộc chat mới). Tin cũ thì không lấy được: hai spike ngày 2026-11-02 cho thấy zca-js 2.2.0 không trả lịch sử trước lúc đăng nhập (giữ D-278).

Brainstorm và thiết kế làm trong phiên kỹ sư `sino-zalo` (sino-30) theo lệnh người dùng; người dùng chọn phiên này ghi đề án, mode AUTO. Đây là change đầu trong ba change đồng bộ Zalo người dùng xếp thứ tự **D → A → B**: change này (D, danh bạ), rồi bù tin lỡ (A, `zalo-message-catch-up`, chưa ghi), rồi trạng thái hai chiều (B, chưa thiết kế).

## What Changes

- **`sino-zalo`:** route mới `GET /accounts/:accountId/contacts` trả toàn bộ bạn bè (`getAllFriends`) và nhóm (`getAllGroups` + `getGroupInfo` theo lô), tên Zalo gốc, ảnh, số thành viên nhóm.
- **`sino-api`:** bảng `contact` (migration V25) giữ danh bạ của mỗi tài khoản có capability mới `CONTACTS`; đồng bộ ngay sau khi tài khoản nối, mỗi 60 phút, và khi người dùng bấm "Làm mới"; tìm theo tên không phân biệt dấu (`GET /api/contacts`); gửi **tin đầu tiên** tới một người trong danh bạ tạo cuộc trò chuyện ngay lúc bấm Gửi, như thư mới của F10 (D-192), nên không có cuộc trò chuyện trống nào trong Hộp thư.
- **Canvas:** quản lý vẽ nút "Nhắn tin mới" ở danh sách Tin nhắn, ô tìm danh bạ (desktop: hộp thoại; 390: cả trang) và khung chat chưa có tin; người dùng duyệt trước khi giao web.
- **Web:** nút "Nhắn tin mới" ở danh sách Tin nhắn (cùng chỗ với "Thư mới" của Hộp thư); ô tìm bạn bè và nhóm; chọn người đã có cuộc trò chuyện thì mở nó, chưa có thì mở khung chat trống để gửi tin đầu tiên.

## Capabilities

### New Capabilities
- `zalo-contacts-list`: `sino-zalo` liệt kê bạn bè và nhóm của một tài khoản Zalo.
- `contacts-api`: `sino-api` lưu, đồng bộ và tìm danh bạ theo tài khoản, và mở cuộc trò chuyện mới bằng tin đầu tiên.
- `new-chat-ui`: web có nút "Nhắn tin mới", ô tìm danh bạ và khung chat chưa có tin.

### Modified Capabilities
(không có)

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (hàm mới trên `ZaloConnection`), file route mới (ví dụ `sessions/contactRoutes.ts`) đăng ký trong `app.ts`, README *API so far* và *Layout*; test.
- **`apps/sino-api`:** migration `V25__contact_create_contact.sql`; `provider` (capability `CONTACTS`, facet `Optional<Contacts> contacts()` trên `MessageProvider`, bản Zalo trong `provider/infrastructure/zalo`); module chứa danh bạ (D-427), việc định kỳ 60 phút cạnh `sync/application/NicknameSyncSchedule`, nghe `AccountConnected`; endpoint tìm, làm mới, gửi tin đầu tiên; README *Endpoints available today*; test, `ModularityTests`.
- **`apps/sino-web`:** `features/inbox/` (nút ở danh sách Tin nhắn, ô tìm, khung chat chưa có tin, `inbox.api.ts`), router (`messages/new`); test.
- **`design/sino-ui/project/`** và canvas trên claude.ai: frame nút, ô tìm, chat chưa có tin (desktop, 390).
- **D-304** (f05c, "Tin nhắn không có nút mở cuộc chat mới") được thay bởi D-431 của change này.
- **Đụng `messages-by-account`** (duyệt 2026-11-02, AUTO): change đó dựng lại màn Tin nhắn (`MessagesPage`, tab, cột tài khoản) và canvas `Messages`. Canvas (CT-04) và web (CT-05) của change này làm **sau** phần canvas và web của nó, trên màn đã dựng lại; `sino-zalo` (CT-01) và `sino-api` (CT-02, CT-03) không phụ thuộc, làm ngay được.
- **Hợp đồng giữa các app** chốt trước trong `design.md` (D-425, D-429, D-430), nên `sino-zalo` và `sino-api` làm song song được.
- **Chạy thật** cần tài khoản Zalo của người dùng: CT-20 làm trên máy người dùng, có người dùng.

## Non-goals

- **Tin cũ** trong các cuộc trò chuyện (zca-js 2.2.0 không lấy được; D-278, spike 2026-11-02).
- **Thứ tự "nhắn gần nhất"**: Zalo không cho giờ tin cuối qua các API này; danh bạ sắp theo tên.
- **Người lạ chưa kết bạn**: không có trong `getAllFriends`; chỉ nhắn được khi họ nhắn trước (tin tới tạo cuộc trò chuyện như hôm nay).
- **Tin đầu tiên là sticker, ảnh hay tệp**: tin đầu tiên chỉ là chữ; có cuộc trò chuyện rồi thì ô soạn đầy đủ như hôm nay.
- **Danh bạ Gmail**, gợi ý người nhận cho thư mới.
- **Kết bạn, tạo nhóm, rời nhóm** từ Sino.
- **Bù tin lỡ và báo khoảng thiếu** (change A), **trạng thái hai chiều** (change B).
