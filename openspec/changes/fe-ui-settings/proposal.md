## Why

Người dùng (2026-10-21): "Tiếp theo là làm UI phần cài đặt", rồi duyệt thiết kế và thêm "đưa phần quản lý sticker vào cài đặt luôn". Đường dẫn `/settings` đang là trang "đang được dựng". Canvas "Sino UI" có màn `Settings` (desktop), `MobileSettings` và `MobileSettingsNotifications`. Như các màn khác, giao diện dựng trước trên dữ liệu mẫu (D-42); backend của các cài đặt chưa có.

## What Changes

- **Trang `/settings`** theo canvas `Settings`: cột mục lục (dính khi cuộn, đánh dấu mục đang xem) và 9 mục: Giao diện, Ngôn ngữ, Chuyển động, Thông báo, Lịch và nhắc nhở, Quyền riêng tư và dữ liệu, Nguồn đã kết nối, Bảo mật, Về Sino.
- **Sticker trong Cài đặt:** mục lục có thêm "Sticker" mở `/settings/stickers`, nơi màn quản lý sticker hiện có nằm trong khung Cài đặt. Thanh bên bỏ mục "Sticker"; `/stickers` chuyển sang `/settings/stickers`.
- **Điện thoại** theo `MobileSettings`: danh sách nhóm; trang con `/settings/notifications` theo `MobileSettingsNotifications`; trang con cho Chuyển động, Quyền riêng tư và dữ liệu, Bảo mật dùng lại nội dung của mục desktop; dòng "Sticker" mở `/settings/stickers`.
- **Dữ liệu:** Theme chạy thật (`ThemeProvider` có sẵn). Nguồn đã kết nối lấy tài khoản thật; Phiên bản lấy từ app. Mọi thứ khác là dữ liệu mẫu theo canvas: bấm được, giữ trong trang, không lưu, không áp vào app; nút hành động cần backend chưa làm gì.

## Capabilities

### New Capabilities
- `settings-screen`: màn Cài đặt desktop, tablet và điện thoại, mục lục, các mục trên dữ liệu mẫu, sticker trong Cài đặt.

### Modified Capabilities
- Không có.

## Impact

- **Code:** `apps/sino-web/src/features/settings/**` (mới), `src/app/router.tsx` (route `/settings`, `settings/:section`, `settings/stickers`, chuyển `/stickers`), `src/app/shell/{navItems.ts,MorePage.tsx}` (bỏ "Sticker" khỏi thanh bên và "Thêm") và test của chúng.
- **Không sửa** `src/features/stickers/**` (thuộc change `sticker-packs`): màn sticker chỉ được đặt vào chỗ mới.
- Không đổi backend, không gọi API mới.

## Non-goals

- Lưu cài đặt, áp cài đặt vào app (định dạng ngày giờ, múi giờ, đầu tuần, chuyển động), thông báo đẩy, xuất hay xóa dữ liệu, phiên đăng nhập: cần backend, change sau.
- Đổi ngôn ngữ: canvas chỉ có nút "VI".
- Trang "Có gì mới", "Điều khoản", "Phần mềm nguồn mở": liên kết tới trang có sẵn nếu có (`/privacy`), còn lại chưa làm gì.
