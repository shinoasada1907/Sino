## Why

Hôm nay Sino chỉ **nhận và hiện** sticker (sticker của Zalo gửi tới, kể cả sticker động: `ZL-14`, `ZL-15`). Người dùng không có chỗ nào để **tự có** sticker của mình: không tải lên được, không lưu được, không xem lại được.

Người dùng muốn có một chỗ trong Sino để tạo bộ sticker riêng: **sticker động là GIF**, **sticker tĩnh là ảnh** (ưu tiên PNG; "csv" trong yêu cầu được hiểu là SVG, xem D-329).

Đọc từ code (2026-10-19), ba thứ đang thiếu và quyết định hình dạng của change:

- **Không có chỗ lưu và nhận tệp:** `sino-api` không có endpoint nhận tệp (không có multipart nào), và D-125 của `f06-message-history` quy định tệp đính kèm thư chỉ tải qua Sino, **không lưu**. Sticker thì khác: là tài sản của người dùng nên phải lưu.
- **Web chỉ nói JSON:** `shared/api/client.ts` luôn đặt `Content-Type: application/json` và `JSON.stringify` body, nên chưa gửi được `multipart/form-data`.
- **Gửi đi chỉ có chữ:** `SendMessageCommand.textContent` bắt buộc không rỗng, gateway Zalo chỉ có `sendText`, `ProviderCapability` không có khả năng gửi tệp. Gửi sticker qua Zalo là một việc lớn riêng, và cần đo xem Zalo (kết nối không chính thức qua `zca-js`) có giữ GIF động khi nhận như ảnh đính kèm không.

## What Changes

Người dùng chốt ngày 2026-10-19 (xem D-328…D-330): **thư viện trước, gửi qua Zalo sau**; định dạng **PNG + GIF (+ WebP)**, SVG để sau; lưu trong **PostgreSQL, cột bytea**.

Change này làm **thư viện sticker của người dùng**:

- **Backend:** module `sticker` mới. `POST /api/stickers` (multipart) nhận một ảnh PNG, GIF hoặc WebP, nhận ra loại bằng **nội dung** (không tin tên tệp hay `Content-Type` do client khai), đo kích thước từ phần đầu tệp mà không giải mã ảnh, tự tính ra tĩnh hay động, từ chối quá cỡ, quá dung lượng, trùng nội dung, quá hạn mức. `GET /api/stickers` liệt kê, `GET /api/stickers/{id}/content` trả ảnh, `DELETE /api/stickers/{id}` xóa. Hai bảng: metadata và nội dung tách nhau để danh sách không kéo theo byte của ảnh.
- **Web:** màn `Sticker` (`/stickers`): lưới sticker (GIF tự chạy), tải lên bằng nút chọn tệp hoặc kéo thả, kiểm tra sơ bộ phía client, báo lỗi của máy chủ bằng tiếng Việt, xóa có xác nhận. Cần thêm `api.upload` vào client vì client hiện chỉ gửi JSON.
- **Thiết kế giao diện:** canvas "Sino UI" là thiết kế cuối cùng và **chưa có màn Sticker**, nên trước khi dựng màn phải có khung canvas được người dùng duyệt (ST-00, như `CV-01` của `f05c-messages-inbox-split`).

## Non-goals

Để sau, không nằm trong change này:

- **Gửi sticker của người dùng qua Zalo** (và qua bất kỳ nhà cung cấp nào). Cần change riêng (`custom-stickers-send`), mở đầu bằng một spike đo trên nick phụ: `zca-js` gửi PNG/GIF như ảnh đính kèm được không, GIF còn động khi tới Zalo không, giới hạn dung lượng, `msgId` của thư gửi, nhịp gửi. Phần mở rộng contract (một `ProviderCapability` cho tệp đính kèm, `SendMessageCommand` mang tệp và chữ có thể rỗng, `ZaloGateway.sendAttachment`) cũng nằm ở đó.
- **Chọn sticker trong khung soạn tin** (picker): thuộc về change gửi, vì chọn mà không gửi được thì vô nghĩa.
- **SVG** (D-329): có thể chứa script (XSS) và Zalo có thể không nhận. Khi cần: làm sạch rồi đổi sang PNG ở server trước khi lưu, không bao giờ phục vụ SVG gốc.
- **Công cụ tạo sticker trong app** (cắt, thêm chữ, ghép khung): quá lớn, tách thành change riêng sau thư viện.
- **Đổi tên, sắp xếp, gom thành bộ (pack), gắn nhãn, tìm kiếm** sticker. Tên chỉ đặt lúc tải lên.
- **Ảnh thu nhỏ (thumbnail) tạo ở server** và chế độ "chỉ chạy GIF khi rê chuột" (DN-4): bước 1 hiện GIF tự chạy.
- **Lưu ở object storage (S3) hoặc đĩa** (D-330), **chia sẻ sticker giữa người dùng**, **đồng bộ sticker của Zalo về thư viện**.
- **Xử lý `prefers-reduced-motion` cho GIF**: CSS không dừng được GIF; là hệ quả của DN-4.

## Capabilities

### New Capabilities
- `custom-stickers`: API thư viện sticker của người dùng (tải lên, danh sách, nội dung, xóa), kiểm tra ảnh, hạn mức.
- `web-sticker-library`: màn Sticker trên web (lưới, tải lên, xóa, các trạng thái).

### Modified Capabilities
(không có)

## Impact

- **Backend (`apps/sino-api`):** module `dev.sino.sticker` mới (`api`, `application`, `domain`, `infrastructure`); migration Flyway mới (hai bảng `sticker`, `sticker_content`); cấu hình multipart tường minh trong `application.yaml`; ánh xạ lỗi tải lên quá cỡ; README (bảng API). `ModularityTests` phải vẫn xanh (module mới chỉ dùng `identity.CurrentUser`).
- **Web (`apps/sino-web`):** `src/shared/api/client.ts` (`api.upload`), `src/features/stickers/**` mới, `src/app/router.tsx` (route `/stickers`), `src/app/shell/navItems.ts` (mục Sticker; `MORE_PATHS`, và dòng ở trang Thêm).
- **Thiết kế:** `design/sino-ui/project/**` thêm khung màn Sticker (ST-00).
- **Dữ liệu:** bảng mới, không đụng bảng nào có sẵn. Dung lượng database tăng theo số sticker (tối đa theo hạn mức, DN-1).
- **Không đổi:** `sino-zalo`, contract nhà cung cấp, luồng gửi tin, bảng `message`/`attachment`.
