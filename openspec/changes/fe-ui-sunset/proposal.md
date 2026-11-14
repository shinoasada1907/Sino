## Why

Người dùng (2026-11-12): "tôi muốn đổi lại UI của web này đi nhìn nó đẹp hơn chút", với ba lỗi: nhạt và thiếu cá tính, rối và chật chội, thiếu tinh tế. Bản đầu của canvas "Sino UI — Sunset" (gọn sắc kiểu Linear, gam hoàng hôn) được duyệt cùng ngày.

Ngày 2026-11-14 người dùng gửi một ảnh mẫu phong cách mềm (thẻ bento bo tròn lớn, nút viên thuốc, chữ tròn, nền phớt hồng, họa tiết nhỏ) và muốn Sino "được cá nhân hóa hơn theo phong cách này", màu do người dùng đổi được. Hỏi giữ bố cục gọn cho màn làm việc hay đổi hết, người dùng chọn "đổi hết luôn". Canvas được vẽ lại theo đó (cùng link, https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs), người dùng nói "Ưng, sửa đề án".

Giao diện hiện tại chỉ có thang xám và đen/trắng (nút chính `#111`), không có màu nhấn nào.

## What Changes

- **Phong cách mềm cho cả app**: token, font Nunito, thẻ bo 24 px, bóng mềm thay cho viền, nút/nhãn/ô tìm/mục sidebar dạng viên thuốc, khung sidebar và các cột nổi tách khỏi mép, họa tiết (dấu cộng, chấm bi) ở thẻ lớn và tắt được. Mặc định là nền sáng.
- **Người dùng chọn màu**: 5 bộ màu dựng sẵn (Anh đào mặc định, Hoàng hôn, Bạc hà, Oải hương, Đơn sắc), mỗi bộ có sáng và tối, cộng một màu nhấn tự chọn. Có thêm độ bo Mềm/Gọn và công tắc họa tiết. Tất cả lưu trong cài đặt người dùng (`/api/settings`), nên áp cho mọi thiết bị.
- **Thành phần dùng chung** (`shared/ui/*`) và **bộ khung** (sidebar, topbar, thanh tab điện thoại) theo canvas.
- **Các màn có trong canvas**: Tổng quan (vẽ lại kiểu bento có khối chào và ảnh đại diện lớn), Hộp thư, Tin nhắn, Lịch, Việc cần làm, Ghi chú, Tài khoản, Cài đặt › Giao diện (chọn bộ màu, màu nhấn, sáng/tối, độ bo, họa tiết), Hộp thư và Trò chuyện trên điện thoại. Dữ liệu và hành vi giữ nguyên.
- **Các màn chưa có trong canvas** (wizard kết nối, onboarding, hồ sơ, sticker, trang giới thiệu và Privacy, các trạng thái): nhận token và thành phần mới, bố cục giữ nguyên (D-485).
- **Nguồn thiết kế**: canvas Sunset thay canvas "Sino UI" làm thiết kế cuối cùng (D-482).

## Capabilities

### New Capabilities
- `sunset-visual-language`: phong cách mềm, bộ màu và màu nhấn người dùng chọn, bộ khung và các màn theo canvas Sunset.

### Modified Capabilities
- `user-settings`: thêm `palette`, `accentColor`, `corners`, `decorations`.

## Impact

- **sino-api**: module `settings`: một migration `V28` thêm 4 cột vào `user_settings`, đọc/ghi qua `GET`/`PATCH /api/settings` sẵn có, cùng test. Không có endpoint mới.
- **sino-web**: `src/index.css`, `src/main.tsx` (font), `package.json` (`@fontsource-variable/nunito`), `src/shared/ui/**`, `src/shared/theme/**` (áp bộ màu), `src/app/shell/**`, `features/settings/**`, các `features/*/` của những màn trong canvas, và test liên quan.
- **Đụng nhiều file đang dở chưa commit.** SU-01 chỉ bắt đầu khi `apps/sino-web` sạch (xem `tasks.md`).
- File chung của quản lý: `CLAUDE.md`, `design/`, `PROJECT_STATE.md`.

## Non-goals

- **Ảnh nền Tổng quan do người dùng tải lên**: canvas có vẽ, nhưng cần chỗ lưu ảnh ở backend nên để change sau. Trong change này, ô đó hiện "Sắp có".
- Đóng gói hình minh họa hay nhân vật có bản quyền.
- Thêm số liệu mà API chưa có (biểu đồ đồng bộ, số theo nguồn nếu chưa có): không hiện số giả.
- Đổi trang của `apps/sino-site`.
