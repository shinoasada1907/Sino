## Why

Người dùng (2026-10-14) gửi thư viện [zca-js](https://github.com/RFS-ADRENO/zca-js): "có cách tích hợp zalo cá nhân rồi nè", rồi "phần tích hợp zalo này bạn lên kế hoạch rồi tôi làm". Roadmap F09 ghi Zalo cá nhân không có API chính thức và cần **spike khả thi** trước khi thiết kế. Spike `spikes/zalo-zca/` (2026-10-14, nick Zalo phụ của người dùng) cho thấy đăng nhập QR, dùng lại phiên không cần quét lại và nhận tin thời gian thực đều chạy được. Nhưng mở chat.zalo.me bằng cùng nick thì phiên của Sino bị đá và bị hủy, và không lấy được lịch sử cũ. Change này đưa Zalo cá nhân vào Sino như **provider thứ hai (F09)**, với một cổng đi/không đi đo độ bền trước khi code phần lớn.

zca-js là thư viện **không chính thức**: nó giả làm Zalo Web, và tài liệu của nó nói dùng nó là trái chính sách Zalo, có thể bị khóa tài khoản. Người dùng chấp nhận rủi ro này, với điều kiện người kết nối phải được cảnh báo và đồng ý trước (D-272).

## What Changes

- **Service mới `apps/sino-zalo`** (Node + TypeScript + zca-js): đăng nhập QR, giữ một listener cho mỗi tài khoản Zalo, gom tin mới vào bộ đệm, báo `sino-api` khi có tin, gửi tin chữ. Service không lưu gì xuống đĩa; chỉ `sino-api` gọi được nó, bằng khóa bí mật dùng chung (D-273, D-282).
- **Kết nối bằng mã QR** trong `sino-api`, dùng chung cho mọi provider kết nối kiểu này: bắt đầu, hỏi trạng thái, kết nối lại đúng tài khoản cũ. Phiên Zalo được lưu mã hóa như token Gmail (D-274, D-275).
- **Connector `ZaloProvider`** theo contract F03:
  - `fetchUpdates` kéo tin từ bộ đệm theo cursor `msgId`; `registerPush` cùng webhook `/api/webhooks/zalo` báo có tin mới (D-277).
  - `sendMessage` + `findSentMessages` để trả lời bằng chữ (D-280).
  - Bảng đổi lỗi: bị đá hay bị Zalo từ chối phiên thì account thành "Cần đăng nhập lại" (D-276, D-281).
- **Không nhập lịch sử cũ:** account Zalo nhận tin từ lúc kết nối; tin lỡ lúc mất kết nối được bù bằng `requestOldMessages(lastId)` (D-278).
- **Công tắc `sino.zalo.enabled`:** tắt thì Zalo quay về "Sắp có" và mọi phiên dừng; dữ liệu đã lưu giữ nguyên (D-272).
- **`GET /api/providers`** cho biết mỗi provider kết nối bằng cách nào (`OAUTH2`, `QR`) và hiện có kết nối được không, thay cho `connectable: true` mà web đang tự gán (D-50).
- **Web:** bước Zalo trong hộp thoại kết nối gồm cảnh báo rủi ro, ô đồng ý, mã QR, các trạng thái (chờ quét, đã quét, xong, hết hạn, bị từ chối) và kết nối lại.
- **Cổng ZL-00:** đo độ bền của listener (24 giờ), cửa sổ bù tin, tin 1-1/nhóm/tự gửi, tuổi thọ phiên, Zalo PC. Kết quả quyết định có làm tiếp từ ZL-03 không (D-270).

## Capabilities

### New Capabilities
- `zalo-gateway`: service `sino-zalo`: API nội bộ, đăng nhập QR, vòng đời phiên và listener, bộ đệm và cursor, bù tin, báo có tin, gửi tin, chống gửi trùng, giới hạn tốc độ, health, không lưu đĩa và không ghi nội dung tin vào log.
- `zalo-provider`: connector Zalo trong `sino-api`: capability, hồ sơ account, `fetchUpdates`, chuẩn hóa tin, webhook, `sendMessage`, `findSentMessages`, bảng đổi lỗi, bật phiên khi khởi động, công tắc tắt, tắt/xóa account.
- `qr-connect`: luồng kết nối bằng mã QR của `sino-api`: bắt đầu, hỏi trạng thái, hoàn tất bằng use case đăng ký của F02, kết nối lại đúng tài khoản.
- `zalo-connect-web`: bước Zalo trên web: cảnh báo và đồng ý, mã QR, trạng thái, kết nối lại.

### Modified Capabilities
- `provider-contract`: thêm kiểu kết nối bằng mã QR, tùy chọn, như `oauth2()`.
- `provider-catalog-api`: thêm `connectMethod` và `connectable` cho mỗi provider.

## Impact

- **Code mới:** `apps/sino-zalo/**` (service riêng, `package.json` riêng, chạy bằng pnpm).
- **Backend:**
  - `dev/sino/provider/infrastructure/zalo/**` (connector, client HTTP, chuẩn hóa, webhook).
  - `dev/sino/provider/spi/**` (kiểu kết nối QR), `dev/sino/provider/api/ProviderResponse.java`.
  - `dev/sino/account/**` (luồng kết nối QR, kết nối lại).
  - `application.yaml` (`sino.zalo.*`), `.env.example` (`SINO_ZALO_SECRET`, `SINO_ZALO_BASE_URL`).
  - Không có migration: phiên nằm trong bảng credential sẵn có, `credential_type` = `TOKEN` (D-14).
- **Web:** `apps/sino-web/src/features/accounts/**` (bước QR, `connectMethod`).
- **Trang công khai:** `apps/sino-site` (chính sách quyền riêng tư: Zalo, phiên lưu mã hóa, rủi ro; "Zalo sắp có" thành "có") ở ZL-13.
- **CI:** job cho `sino-zalo` (lint, typecheck, test) ở ZL-12.
- **Người làm:** người dùng code toàn bộ (TRAINING, `project-mode.yaml` `zalo-personal`). Claude lên kế hoạch, hướng dẫn từng task (chỉ đưa đoạn code mới kèm chỗ chèn và giải thích), review, chạy test.
- **Rủi ro:** nick Zalo có thể bị khóa; Zalo đổi giao thức thì zca-js phải cập nhật; người dùng mở Zalo Web bằng cùng nick thì Sino bị đăng xuất.

## Non-goals

- Lịch sử tin trước lúc kết nối (zca-js 2.2.0 không lấy được: `getGroupChatHistory` trả 404, `requestOldMessages` chỉ trả tin sau `lastId`).
- Xem hoặc tải ảnh, tệp, sticker, giọng nói: bản đầu chỉ hiện chữ thay thế như `[Ảnh]`.
- Gửi ảnh hay tệp, trích dẫn tin khi trả lời, reaction, thu hồi tin, đánh dấu đã xem, báo đang gõ.
- Zalo Official Account (API chính thức cho doanh nghiệp), Messenger, Telegram.
- Chạy nhiều instance `sino-zalo` và chia tài khoản giữa chúng: một instance đủ cho phạm vi D-40 (dưới 100 người dùng).
- Chọn nơi chạy `sino-zalo` khi lên production: theo nơi chạy `sino-api`, chưa chọn.
