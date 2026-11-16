## Why

Người dùng (2026-10-27) muốn "quản lý file phương tiện" trong chat Zalo, và 2026-11-04 hỏi lại về danh sách file và link. Hôm nay cột "Chi tiết hội thoại" có sẵn khối Ảnh & video, Tệp tài liệu, Liên kết nhưng luôn trống, vì không có dữ liệu nào đổ vào (`files: null`, `linkedUrl` không ai điền). Tin thoại, video và link gửi tới Sino cũng chỉ hiện chữ giữ chỗ.

zca-js 2.2.0 không có hàm lấy kho của Zalo, nên kho được dựng từ tin Sino đã lưu (người dùng chọn 2026-10-27); tin trước lúc kết nối thì không có.

Đây là change thứ tư trong năm change hoàn thiện chat Zalo (roadmap F09, *Hoàn thiện chat Zalo*), sau `zalo-avatars`, `zalo-nicknames`, `zalo-mentions`.

## What Changes

- **`sino-zalo`:** đọc thêm tin thoại (`chat.voice`), video (`chat.video.msg`), link (`chat.recommended`, `chat.link`) và gửi địa chỉ của chúng cho `sino-api`. Trước đó đo hình dạng thật của ba loại tin này, vì Sino chưa từng nhận được tin thoại hay video nào.
- **`sino-api`:** lưu các tin đó đúng loại, kèm địa chỉ; `GET /api/conversations/{id}/messages` trả thêm địa chỉ để web phát và vẽ. API mới `GET /api/conversations/{id}/media` liệt kê Ảnh/Video, File, Link, Âm thanh của một cuộc trò chuyện, gồm cả link nằm trong chữ thường.
- **Canvas:** quản lý vẽ khung kho, người dùng duyệt trước khi giao web.
- **Web:** cột "Chi tiết hội thoại" hiện dữ liệu thật và thêm khối Âm thanh; "Xem tất cả" mở danh sách đủ bốn tab; điện thoại có đường vào. Khung chat phát được tin thoại, video và vẽ thẻ link.

## Capabilities

### New Capabilities
- `zalo-media-messages`: `sino-zalo` và `sino-api` đọc tin thoại, video, link của Zalo và lưu đúng loại.
- `conversation-media-api`: `sino-api` liệt kê phương tiện đã lưu của một cuộc trò chuyện theo loại, có phân trang.
- `chat-media-library-ui`: web hiện kho của cuộc trò chuyện, và phát tin thoại, video, thẻ link trong khung chat.

### Modified Capabilities
(không có)

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, README *API so far*; test.
- **`apps/sino-api`:** `provider/spi/NormalizedMessage.java`, `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`; `conversation` (`InboxMessage`, `MessageHistory`, `MessageResponse`, service và controller mới cho `/media`); README *Endpoints available today*; test, `ModularityTests`. Không có migration (DN-1 = A).
- **`apps/sino-web`:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/{ConversationInfo,ChatThread}.tsx`, màn danh sách kho mới, `InboxPage.tsx`, `app/router.tsx`; test.
- **`design/sino-ui/project/`** và canvas trên claude.ai: khung kho (desktop, 390).
- **Phụ thuộc:** web làm trên `ConversationInfo.tsx` và `InboxPage.tsx` đang có thay đổi chưa commit của `chat-ui-refactor`, `messages-by-account`; bộ test của `sino-web` đang bị xóa trong thư mục làm việc (xem `tasks.md`, *Điều kiện trước khi giao web*).
- **Chạy thật** cần tài khoản Zalo của người dùng và một nick khác để gửi tới: ML-01 và ML-20.

## Non-goals

- **Lấy kho hay lịch sử từ máy chủ Zalo:** zca-js không có hàm; `getGroupChatHistory` trả `404` ở spike 2026-10-14. Tin trước lúc kết nối không vào kho.
- **Đọc lại tin cũ:** tin thoại và link đã lưu thành chữ giữ chỗ thì giữ nguyên, vì địa chỉ của chúng chưa bao giờ được lưu.
- **Ghi âm và gửi tin thoại:** change sau, `zalo-voice-messages`.
- **Chép ảnh và tệp về máy chủ Sino:** DN-2 = A. Nếu ML-20 đo thấy địa chỉ chết nhanh, quản lý trình lại; việc chép là một change riêng.
- **Kho cho Gmail:** thư có giao diện riêng, API đọc được nhưng web không gọi.
- **Tìm kiếm trong kho, nhảy tới tin trong chat, xóa khỏi kho, tải nhiều tệp một lúc.**
- **Biến link trong chữ thành link bấm được ở khung chat:** kho có liệt kê, khung chat giữ nguyên.
- **Các nút khác của cột "Chi tiết hội thoại"** (Hồ sơ, Nhãn dán, Chặn kênh, Thông báo đẩy).
