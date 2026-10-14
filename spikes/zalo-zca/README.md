# Spike F09 — Zalo cá nhân qua zca-js

Code thử, dùng xong bỏ. Mục đích: trả lời "Sino có đọc và gửi tin Zalo **cá nhân** được không" trước khi thiết kế F09 (`openspec/roadmap.md`, Phase 5). Không phải code của `sino-api`; nếu F09 chọn Zalo, kiến trúc (service Node chạy cạnh hay cách khác) là quyết định riêng.

> **Cảnh báo.** zca-js là thư viện **không chính thức**, giả làm Zalo Web. README của nó: *"Using this API could get your account locked or banned."* Tài liệu tiếng Việt: dùng nó là làm trái chính sách Zalo. **Chỉ quét QR bằng nick Zalo phụ.**

## Chạy

Node ≥ 18, chạy trong thư mục này:

```text
pnpm install
node spike.mjs login              # Q1: lần đầu quét QR (qr.png tự mở), lưu phiên vào .session/
node spike.mjs check              # Q1: chỉ thử phiên đã lưu, không bao giờ hiện QR
node spike.mjs listen 30          # Q2, Q4: nghe tin 30 phút
node spike.mjs history 5          # Q3: lịch sử 1-1 (requestOldMessages) và nhóm (getGroupChatHistory)
node spike.mjs send <threadId> user "test từ Sino spike"   # Q4: gửi
```

Mọi lệnh ghi một dòng JSON mỗi sự kiện ra màn hình và `logs/<lệnh>.jsonl`. Chỉ ghi metadata (ID, loại, giờ, độ dài), **không ghi nội dung tin**. `threadId` để gửi lấy từ log `listen`.

## Câu hỏi và kết quả

| # | Câu hỏi | Cách thử | Kết quả |
|---|---|---|---|
| Q1 | Phiên lưu lại có dùng được sau khi tắt mở, không cần quét QR lại? Sống bao lâu? | `login` lần đầu; `check` (không bao giờ hiện QR) sau vài giờ, vài ngày | 2026-10-14: dùng lại được sau 10 giây và 3 phút. Sau 24 giờ / 72 giờ: chưa đo |
| Q2 | Mở Zalo Web / Zalo PC / điện thoại song song thì listener có bị ngắt? | `listen`, rồi mở từng nơi; xem `disconnected`/`closed` (mã `3000` = `DuplicateConnection`, `3003` = `KickConnection`) | 2026-10-14: dùng app điện thoại + mở chat.zalo.me → bị đá sau 45 giây (`3003 KICKOUT_BY_WORKER`), nối lại rồi `1006`, **phiên bị hủy** (đăng nhập bằng cookie bị từ chối, phải quét lại). Chỉ dùng điện thoại: sống đủ 20 phút. 24 giờ, Zalo PC: chưa đo |
| Q3 | Lấy lại lịch sử được bao xa, theo từng cuộc trò chuyện hay cả tài khoản? | `history` | 2026-10-14: `requestOldMessages` chỉ trả tin **sau** `lastId` (trang 2 với `lastId` = tin 03:23 trả tin 03:26); `lastId` = null trả 2 tin của buổi trước. `getGroupChatHistory` → `404`. Không lấy được lịch sử cũ. Cửa sổ bù tin khi tắt lâu: chưa đo |
| Q4 | Nhận tin mới (1-1, nhóm, ảnh, tin của chính mình từ máy khác) và gửi tin có ổn? | `listen` + nhắn từ nick chính; `send` | 2026-10-14: 2 tin nhóm (`chat.photo`, `webchat` 65 ký tự), mỗi tin đến sau khoảng 0,2 giây. Tin 1-1, tin tự gửi, gửi: chưa đo |
| Q5 | Có cảnh báo, đăng xuất hay khóa tài khoản trong lúc thử? | quan sát app Zalo trên điện thoại | 2026-10-14: chưa thấy cảnh báo, ngoài lần bị đá ở Q2 |

Kế hoạch tích hợp: `openspec/changes/zalo-personal/`. Các phép đo còn lại làm cùng lần nghiệm thu thật (task ZL-13, trước đây là ZL-00; người dùng chọn 2026-10-14, D-270).

## Dọn sau khi xong

- Xóa `.session/` (cookie + imei: ai có là vào được nick đó).
- Trong app Zalo trên điện thoại: Cài đặt → Tài khoản và bảo mật → thiết bị đăng nhập → đăng xuất phiên web của spike.
