## Why

Người dùng (2026-11-12): "tôi muốn đổi lại UI của web này đi nhìn nó đẹp hơn chút", với ba lỗi: nhạt và thiếu cá tính, rối và chật chội, thiếu tinh tế. Người dùng chọn hướng "gọn sắc kiểu Linear", gam màu lấy từ ảnh hoàng hôn, phạm vi toàn bộ app, rồi duyệt bản thiết kế "Sino UI — Sunset" (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs) và nói "giao việc apply cho UI này đi".

Giao diện hiện tại chỉ có thang xám và đen/trắng (nút chính `#111`), không có màu nhấn nào. Canvas Sunset thay toàn bộ token bằng nền ấm, một màu nhấn hổ phách, các màu phân loại (mật ong, tím hoàng hôn), font tiêu đề Space Grotesk, và nới khoảng cách.

## What Changes

- **Token và font**: `apps/sino-web/src/index.css` nhận bộ token của canvas Sunset (`project/sunset.css`) cho cả hai theme. Thêm `--accent`, `--accent-soft`, `--accent-ink`, `--honey`, `--dusk`…; font tiêu đề Space Grotesk (tự host bằng `@fontsource-variable/space-grotesk`).
- **Thành phần dùng chung** (`shared/ui/*`): nút chính dùng màu nhấn, thẻ, nhãn, công tắc, ô nhập, avatar màu đào theo canvas.
- **Bộ khung**: sidebar (logo "mặt trời", nhóm mục, số đếm màu nhấn), topbar, thanh tab điện thoại.
- **Các màn có trong canvas Sunset**: Tổng quan, Hộp thư, Tin nhắn, Lịch, Việc cần làm, Ghi chú, Tài khoản, Cài đặt, cùng Hộp thư và Trò chuyện trên điện thoại. Bố cục và khoảng cách theo canvas, còn dữ liệu và hành vi giữ nguyên.
- **Các màn chưa có trong canvas Sunset** (wizard kết nối, onboarding, hồ sơ, sticker, trang giới thiệu và Privacy, các trạng thái lỗi/đang tải/trống): chỉ nhận token và thành phần mới, không vẽ lại bố cục (D-485).
- **Nguồn thiết kế**: canvas Sunset thay canvas "Sino UI" làm thiết kế cuối cùng. Bản sao vào `design/sino-ui-sunset/project/`, `CLAUDE.md` đổi link (D-482).

## Capabilities

### New Capabilities
- `sunset-visual-language`: bộ token, font, thành phần và bộ khung theo canvas Sunset, áp lên mọi màn của web.

### Modified Capabilities
- Không đổi hành vi của capability nào; chỉ đổi giao diện.

## Impact

- **Code**: `apps/sino-web/src/index.css`, `src/main.tsx` (font), `package.json` (một dependency font), `src/shared/ui/**`, `src/app/shell/**`, các `features/*/` của những màn trong canvas, và test bị ảnh hưởng (chủ yếu snapshot/class).
- **Đụng nhiều file đang có thay đổi chưa commit** của `zalo-nicknames` (NK-04) và `profile-info` (PI-04/05). Vì vậy change này chỉ bắt đầu khi hai việc đó đã commit (xem `tasks.md`).
- Không đổi backend, API, route hay dữ liệu.
- File chung của quản lý: `CLAUDE.md`, `design/`, `PROJECT_STATE.md`.

## Non-goals

- Thêm tính năng mới mà canvas Sunset có vẽ nhưng app chưa có: các số liệu thống kê trên Tổng quan nếu API chưa trả, biểu đồ đồng bộ 24 giờ, gợi ý task "Sino gợi ý từ tin nhắn", mật độ danh sách hay cỡ chữ trong Cài đặt. Chỗ nào chưa có dữ liệu thì giữ như hiện tại, không bịa số.
- Vẽ lại bố cục các màn chưa có trong canvas Sunset.
- Đổi trang của `apps/sino-site`.
