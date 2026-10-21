## Mode

**AUTO** (người dùng, 2026-10-21: "AUTO: Claude tự làm", hỏi vì `new_features` là TRAINING; `project-mode.yaml` `task_overrides.fe-ui-settings`). Người dùng chốt phạm vi dữ liệu ("Chỉ giao diện, dữ liệu mẫu"), duyệt thiết kế trình bày trong chat ("duyệt") kèm hai đề xuất của agent (tài khoản thật ở "Nguồn đã kết nối"; trang con trên điện thoại cho ba mục canvas chưa vẽ), và thêm "đưa phần quản lý sticker vào cài đặt luôn". D-392…D-400 do agent chốt, cần xem lại. Kiểm thử theo luật của repo: test tay trước (Chrome thật), test tự động sau.

## Context

- **Canvas** (bản `1792119157-a180`, khớp bản sao trong repo): `Settings` (desktop 1440: lưới `220px | 1fr`, cách 48 px, đệm 32 px; `.set-nav` dính; `.set-body` tối đa 860 px; mỗi `.set-sec` có viền trên; mỗi `.set-row` là lưới `1fr | auto` với nhãn đậm, mô tả mờ và control), `MobileSettings` (nhóm `list-group` có nhãn nhỏ), `MobileSettingsNotifications`. Chưa có khung tablet, chưa có trang con điện thoại cho Chuyển động, Quyền riêng tư, Bảo mật.
- **App:** `/settings` có trong `NAV_ITEMS` (nhóm footer) và `MORE_PATHS`, đang là `UnderConstructionPage`. `ThemeProvider` chỉ có `light` / `dark` (lần đầu theo hệ điều hành, lưu `sino.theme`); `MorePage` có công tắc theme nhanh. `Segmented`, `Switch`, `Status`, `Badge`, `Button`, `ProviderIcon` có sẵn trong `shared/ui`. Màn sticker là `/stickers` (`StickersPage`, change `custom-stickers` / `sticker-packs`).

## Đã chốt (người dùng, 2026-10-21)

- **Mode:** AUTO.
- **Dữ liệu:** chỉ giao diện, dữ liệu mẫu (phương án bỏ: chạy thật phần chỉ cần trình duyệt; làm cả backend).
- **Thiết kế trong chat được duyệt**, cùng: "Nguồn đã kết nối" dùng tài khoản thật; Chuyển động, Quyền riêng tư và dữ liệu, Bảo mật có trang con trên điện thoại.
- **Sticker vào Cài đặt.**

## Decisions

### D-392 — Bố cục theo cỡ màn · agent chốt
Từ 1280 px: cột mục lục 220 px dính và thân tối đa 860 px như canvas. 768–1279 px: không có cột mục lục (chỗ hẹp, canvas không có khung tablet), các mục xếp dọc với tiêu đề trang. Dưới 768 px: danh sách nhóm của `MobileSettings`; dòng nào có nội dung dài thì mở trang con.

### D-393 — Mục lục · agent chốt
Mỗi mục là một liên kết `#giao-dien`, `#ngon-ngu`… như canvas; mục đang xem được đánh dấu (`aria-current="location"`) theo `IntersectionObserver` trên các `section`. "Nguồn đã kết nối" có chấm đỏ khi có tài khoản cần xử lý (số thật của shell). "Sticker" đứng sau "Nguồn đã kết nối" và là một đường dẫn (`/settings/stickers`), không phải một mục cuộn.

### D-394 — Dữ liệu mẫu giữ trong phiên · agent chốt
`settings.sample.ts` giữ giá trị theo canvas (định dạng ngày `02/10/2026 · 14:05`, mức chuyển động "Đầy đủ", các công tắc thông báo, giờ yên lặng 22:00–07:00, múi giờ `Asia/Ho_Chi_Minh`, "sáng mai" 09:00, nhắc 15 phút, tuần bắt đầu Thứ Hai, 3.912 tin · 412 MB, hai thiết bị Web Push, hai phiên đăng nhập). `useSettingsSample()` đặt chúng trong cache của TanStack Query (`staleTime: Infinity`), nên một thay đổi còn khi chuyển giữa trang chính và trang con, và mất khi tải lại trang. Không gì được lưu hay áp vào app.

### D-395 — Theme thật có "Theo hệ thống" · agent chốt
`shared/theme` có thêm lựa chọn `system`: `ThemeContext` thêm `preference` (`system` | `light` | `dark`) và `choose(preference)`; `theme` (sáng hay tối đang dùng) và `toggleTheme` giữ nguyên cho chỗ đang dùng. `system` theo `prefers-color-scheme` và đổi theo khi hệ điều hành đổi; lưu `sino.theme` = `system`. Trước đây chưa chọn gì đã theo hệ điều hành, nên người dùng cũ không thấy khác.

### D-396 — Nguồn đã kết nối và Phiên bản dùng dữ liệu thật · agent chốt
"Nguồn đã kết nối" liệt kê tài khoản của người dùng (hook có sẵn của màn Tài khoản): biểu tượng nhà cung cấp, địa chỉ, trạng thái; "Quản lý trong Tài khoản" mở `/accounts`. "Phiên bản" lấy `version` của `apps/sino-web/package.json`. Lý do: dữ liệu mẫu ở đây sẽ nói sai về tài khoản thật của người dùng, như luật "số thật hoặc không có" của `shell-real-counts`.

### D-397 — Sticker trong Cài đặt · agent chốt
`/settings/stickers` hiển thị `StickersPage` có sẵn trong khung Cài đặt (cột mục lục từ 1280 px; trang con có nút quay lại dưới 768 px). `/stickers` chuyển hẳn (`replace`) sang `/settings/stickers`, nên liên kết cũ ("Mở thư viện sticker" của khung chọn sticker) vẫn dùng được. Thanh bên và trang "Thêm" bỏ mục "Sticker". Không sửa file nào trong `features/stickers` (thuộc `sticker-packs`). **Phương án bỏ:** đặt thư viện sticker như một mục cuộn trong trang Cài đặt (màn sticker có lưới, bộ, bước sửa ảnh: quá dài cho một mục).

### D-398 — Trang con trên điện thoại · agent chốt
`/settings/notifications` theo `MobileSettingsNotifications` (thông báo cùng lịch và nhắc nhở). `/settings/motion`, `/settings/privacy`, `/settings/security` dùng lại đúng phần nội dung của mục desktop, có tiêu đề trang con và nút quay lại, ẩn thanh tab. Từ 768 px các đường dẫn này mở trang Cài đặt và cuộn tới mục tương ứng.

### D-399 — Nút hành động chưa làm gì · agent chốt
Gửi thử, Gỡ, Xuất dữ liệu, Xóa dữ liệu, Đăng xuất thiết bị khác, Có gì mới, Phần mềm nguồn mở hiện đúng canvas và chưa làm gì. "Chính sách quyền riêng tư" mở `/privacy` (có sẵn).

### D-400 — Control theo `shared/ui` · agent chốt
`.seg` → `Segmented`; `.toggle` → `Switch`; `select` của canvas → `select` gốc có kiểu của `.input` (như các màn khác); thẻ theme (`.theme-tile` với hình xem trước) dựng riêng trong `features/settings`. Mọi control có nhãn nối với tên dòng.

## Risks / Trade-offs

- [Người dùng tưởng cài đặt đã được lưu] → không ghi gì trên màn (canvas không có), nhưng tài liệu và báo cáo nói rõ; change sau nối backend.
- [`ThemeProvider` đổi] → giữ nguyên `theme` / `toggleTheme`; test của theme và của `MorePage` chạy lại.
- [Bỏ "Sticker" khỏi thanh bên] → người dùng tìm sticker ở Cài đặt; `/stickers` vẫn dẫn tới đúng chỗ.
