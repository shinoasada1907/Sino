## Why

Thư viện sticker của `custom-stickers` chỉ là một lưới phẳng, và ảnh được gửi lên nguyên như trong máy. Người dùng (2026-10-20) muốn hai thứ trước khi gửi sticker vào chat Zalo: xếp sticker thành **bộ** như Zalo, và khi tải nhiều ảnh lên thì **xem trước và chỉnh từng ảnh** (chọn vùng cắt, phóng to, xoay) rồi mới lưu. Change này làm hai việc đó; khung chọn và gửi sticker trong chat Zalo là change `zalo-send-images`, dùng bộ sticker của change này làm các tab.

## What Changes

- **Bộ sticker (backend, module `sticker`):** bảng mới `sticker_pack` (tên, chủ, thời điểm tạo), cột `sticker.pack_id` (một sticker nằm trong tối đa một bộ; không có bộ là "Chưa xếp bộ"). API mới `GET/POST /api/sticker-packs`, `PATCH/DELETE /api/sticker-packs/{id}`. `POST /api/stickers` nhận thêm phần `packId` tùy chọn; `PATCH /api/stickers/{id}` mới để đổi tên hoặc chuyển bộ; mỗi sticker trong `GET /api/stickers` có thêm `packId`. Xóa một bộ không xóa sticker: chúng về "Chưa xếp bộ" (theo đề xuất DN-1).
- **Màn Sticker theo bộ (web):** lưới chia thành từng phần theo bộ, "Chưa xếp bộ" ở cuối; tạo, đổi tên, xóa bộ; chuyển một sticker sang bộ khác.
- **Bước xem trước và chỉnh trước khi lưu (web):** chọn hoặc thả nhiều ảnh thì không gửi ngay nữa mà mở bước "Thêm sticker": danh sách các ảnh đã chọn, ảnh đang chọn hiện lớn với khung cắt (kéo, đổi cỡ, phóng to, xoay 90°), ô tên, và một ô chọn bộ cho cả lượt (bộ có sẵn, "Bộ mới…" hoặc "Chưa xếp bộ"). "Lưu" gửi lần lượt từng ảnh theo đúng phần đã chỉnh. Ảnh tĩnh được cắt và xuất lại bằng canvas của trình duyệt (PNG, cạnh dài nhất tối đa 512 điểm ảnh, không phóng to ảnh nhỏ); ảnh động (GIF, WebP động) chỉ xem trước, đặt tên, chọn bộ, không cắt được ở bước này (theo đề xuất DN-3). Ảnh JPEG được nhận ở bước này và được đổi sang PNG trên trình duyệt trước khi gửi (theo đề xuất DN-4); API vẫn chỉ nhận PNG, GIF, WebP như cũ.
- **Phụ thuộc mới của web:** `react-easy-crop` (MIT) cho khung cắt, phóng to, xoay, kéo bằng chuột, cảm ứng và bàn phím (theo đề xuất DN-5).

## Capabilities

### New Capabilities
- `sticker-packs`: bộ sticker của người dùng phía máy chủ: dữ liệu, giới hạn, API `/api/sticker-packs`, chuyển sticker giữa các bộ.
- `sticker-upload-editor`: bước "Thêm sticker" của web: nhiều ảnh, xem trước, cắt, phóng to, xoay, đặt tên, chọn bộ, xuất ảnh đã chỉnh, lưu lần lượt.

### Modified Capabilities
- `custom-stickers` (của change `custom-stickers`, chưa archive): tải lên nhận `packId`; danh sách có `packId`; thêm `PATCH /api/stickers/{id}` (tên, bộ).
- `web-sticker-library` (của change `custom-stickers`, chưa archive): lưới chia theo bộ; chọn hoặc thả tệp mở bước "Thêm sticker" thay cho gửi ngay; JPEG không còn bị chặn ở web (được đổi sang PNG).

## Impact

- **Backend:** module `sticker` (`domain`, `application`, `infrastructure`, `api`); migration mới `V22__sticker_create_sticker_pack.sql` (số kế tiếp trên `dev` lúc viết; kiểm lại trước khi làm); cấu hình `sino.stickers.max-packs-per-owner`; mã lỗi mới `STICKER_PACK_NOT_FOUND`, `STICKER_PACK_NAME_TAKEN`, `STICKER_PACK_LIMIT_REACHED`. Không module nào khác đổi.
- **Web:** `apps/sino-web/src/features/stickers/**` (màn, hook, kiểu, MSW), phụ thuộc `react-easy-crop`; không đổi điều hướng.
- **Tài liệu:** `apps/sino-api/README.md` (các hàng API mới), file kiến thức Phase 5 (mục mới, `.docx` sinh bằng GenOffice), `PROJECT_STATE.md`.
- **Thứ tự archive:** sau `custom-stickers` (hai delta sửa spec của change đó).

## Non-goals

- **Gửi sticker trong chat Zalo:** change `zalo-send-images`.
- **Cắt ảnh động** (GIF, WebP động): cần giải mã và mã hóa lại từng khung trên trình duyệt; để sau khi có nhu cầu thật.
- **Vẽ, viết chữ, xóa nền, bộ lọc màu** trên ảnh; **một ảnh cắt thành nhiều sticker** (người dùng chọn "mỗi ảnh chỉnh riêng trước khi lưu").
- **Sắp xếp tay** thứ tự bộ và thứ tự sticker trong bộ; **ảnh bìa tự chọn** cho bộ (bìa là sticker mới nhất của bộ).
- **Chỉnh lại một sticker đã lưu:** sticker không đổi nội dung (D-335 của `custom-stickers`: cache vĩnh viễn); muốn khác thì xóa rồi tải lại.
- **Chia sẻ bộ cho người khác, nhập bộ sticker của Zalo.**
