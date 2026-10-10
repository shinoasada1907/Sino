## Why

Hộp thư đã có thư Gmail thật và tự cập nhật (F05, F07, F08), nhưng mở một cuộc trò chuyện thì chỉ thấy đoạn đầu của thư mới nhất (D-71): không đọc được cả thư, không thấy các thư trước, không mở được tệp đính kèm. Người dùng (2026-10-10): "giờ làm giao diện gửi mail và hiển thị nội dung mail đi", rồi giao toàn quyền chốt: "tự xử hết luôn đi". Change này là **F06 — Message History** của roadmap. Phần gửi thư là change riêng `f10-reply`.

## What Changes

- **Đọc cả cuộc trò chuyện:** `GET /api/conversations/{id}/messages`, thư mới nhất trước, phân trang bằng con trỏ như danh sách Hộp thư. Mỗi thư có người gửi, người nhận (khi biết), giờ, chủ đề, phần chữ, dạng nội dung và danh sách tệp (D-123).
- **Hiện thư HTML an toàn (D-120):** lúc nhập, Sino lưu thêm HTML gốc của thư. Khi trả cho web, backend làm sạch HTML theo danh sách thẻ cho phép. Web hiện HTML trong iframe sandbox: không chạy script, liên kết mở tab mới. Thư không có HTML thì hiện chữ, URL bấm được.
- **Ảnh từ xa tắt sẵn (D-121):** ảnh lấy từ máy chủ của người gửi chỉ tải khi người dùng bấm "Hiện ảnh", để người gửi không biết thư đã được mở.
- **Thư nhập trước change này (D-122):** những thư này chỉ có chữ. Lần đầu mở, Sino lấy lại nội dung từ Gmail rồi lưu. Gmail lỗi thì hiện phần chữ đã có.
- **Tệp đính kèm (D-125):** tải qua Sino. Sino không lưu tệp và luôn trả về dưới dạng tải xuống. Ảnh nhúng trong thư (`cid:`) hiện được trong HTML.
- **Thư cũ hơn (D-124):** nút "Xem thư cũ hơn" ở đầu cuộc trò chuyện.
- **Contract provider:** thêm hai hàm tùy chọn: đọc lại nội dung một thư và tải một tệp. Gmail cài cả hai.
- **Web:** khung đọc thư (`EmailThread`) dùng API thật thay cho đoạn xem trước. Thư mới đến trong lúc đang đọc tự hiện, nhờ luồng realtime đã có.

## Capabilities

### New Capabilities
- `message-history`: API danh sách thư của một cuộc trò chuyện, thứ tự, phân trang, các trường, người nhận.
- `mail-content`: lưu HTML khi nhập, làm sạch HTML, ảnh từ xa, lấy bù nội dung cho thư cũ, API nội dung một thư.
- `attachment-download`: tải tệp qua Sino, ảnh nhúng, header an toàn.
- `inbox-thread` (web): đọc cả cuộc trò chuyện trên web, HTML trong iframe sandbox, "Hiện ảnh", thư cũ hơn, tải tệp, lỗi.

### Modified Capabilities
- `provider-contract`: hàm tùy chọn đọc lại nội dung một thư và tải một tệp.

## Impact

- Code backend (phiên backend): `dev/sino/conversation/**` (API thư, nội dung, tệp; lưu HTML và người nhận khi nhập), `dev/sino/provider/spi` (hai hàm tùy chọn), `dev/sino/provider/infrastructure/gmail/**` (lấy HTML khi chuẩn hóa, đọc lại một thư, tải tệp), lớp làm sạch HTML bằng jsoup (dependency đã có từ D-61).
- Migration: thêm cột cho `message` (HTML gốc, dạng nội dung, người nhận) và `attachment` (ảnh nhúng).
- Web (phiên web): `features/inbox` (API, hook danh sách thư, `EmailThread`, khung hiện HTML).
- Thứ tự archive: sau `f05-unified-inbox` (bảng `message`, `attachment`).

## Non-goals

- Gửi và trả lời thư: change `f10-reply`.
- Gập phần trích thư cũ trong một thư ("On … wrote:", `gmail_quote`).
- Nhớ "luôn hiện ảnh" theo người gửi; đi qua proxy để tải ảnh.
- Chat (Telegram…): API dùng được cho chat khi F09 có provider chat; `ChatThread` trên API để tới lúc đó.
- Nút "Mở trong Gmail", tìm trong cuộc trò chuyện, xem trước tệp ngay trong Sino.
- Lưu nội dung tệp đính kèm trong Sino.
