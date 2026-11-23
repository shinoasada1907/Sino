## Why

Người dùng (2026-11-20) muốn tin **chia sẻ vị trí** và **danh thiếp** mà người khác gửi qua Zalo hiện được trong Sino, giống Zalo trên điện thoại. Hôm nay hai loại tin này tới `sino-api` nhưng chỉ hiện chữ giữ chỗ `[Tin Zalo chưa hỗ trợ]` (`ZaloMessageNormalizer.bodyOf`, nhánh `default`).

Chỉ **nhận và hiện**. Không gửi vị trí, không gửi danh thiếp. Thẻ ngân hàng và mã QR ngân hàng **không làm** trong change này vì là dữ liệu nhạy cảm (người dùng, 2026-11-20).

## What Changes

- **`sino-zalo`:** đo hình dạng thật của tin vị trí (`chat.location.new`) và danh thiếp (`chat.recommended` dạng danh thiếp), rồi đọc chúng và gửi cho `sino-api` thành hai trường mới `location` và `contactCard`.
- **`sino-api`:** lưu hai loại tin này với chữ tóm tắt (`[Vị trí] …`, `[Danh thiếp] …`) và dữ liệu trong `metadata`. Lịch sử tin trả thêm `location` và `contactCard` để web vẽ.
- **Canvas:** quản lý vẽ thẻ vị trí và thẻ danh thiếp trong khung chat; người dùng duyệt trước khi giao web.
- **Web:** khung chat vẽ thẻ vị trí (địa chỉ, nút mở bản đồ) và thẻ danh thiếp (avatar, tên, số điện thoại nếu có).

## Capabilities

### New Capabilities
- `zalo-location-card-messages`: `sino-zalo` và `sino-api` đọc và lưu tin vị trí và danh thiếp mà người khác gửi qua Zalo.
- `chat-location-card-ui`: khung chat của web hiện thẻ vị trí và thẻ danh thiếp.

### Modified Capabilities
(không có)

## Non-Goals

- Gửi vị trí hay danh thiếp từ Sino.
- Thẻ ngân hàng, mã QR ngân hàng, đọc tài khoản ngân hàng đã lưu trong Zalo (`getListBankAccount`).
- Bản đồ nhúng trong khung chat (xem DN-1).
- Vị trí trực tiếp (chia sẻ vị trí theo thời gian thực), nếu Zalo giao nó khác `chat.location.new`.
- Đưa vị trí và danh thiếp vào kho phương tiện của `zalo-media-library`.

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, README *API so far*; test.
- **`apps/sino-api`:** `provider/spi/NormalizedMessage.java` (khóa metadata mới), `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`, `conversation` (`InboxMessage`, `MessageHistory`, `MessageResponse`); README *Endpoints available today*; test. Không có migration (DN-2 = A).
- **`apps/sino-web`:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/ChatThread.tsx` và hai component thẻ mới; test.
- **`design/sino-ui/project/`:** bản sao canvas sau khi vẽ hai thẻ.
- **Quan hệ với `zalo-media-library`:** cả hai cùng đọc `chat.recommended`. Change này lo nhánh danh thiếp, change kia lo nhánh link (DN-3).
