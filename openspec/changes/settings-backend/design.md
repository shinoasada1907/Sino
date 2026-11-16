## Mode

**AUTO** (người dùng, 2026-10-21: "Duyệt, AUTO"; `project-mode.yaml` `task_overrides.settings-backend`). Phần backend (SB-01…SB-03) do phiên `sino-api-e0` làm, phần web (SB-10, SB-11) do phiên `sino-web-03`. Người dùng chốt phạm vi và duyệt hợp đồng API trình bày trong chat; D-401…D-407 do agent chốt, cần xem lại. Kiểm thử theo luật của repo: test tay trước (backend: chạy app và gọi API thật; web: Chrome thật), test tự động sau.

## Context

- Màn Cài đặt (`fe-ui-settings`, SE-01…SE-04) giữ giá trị trong cache của TanStack Query (`useSettingsSample`, D-394), theme trong `localStorage` (`sino.theme`, D-395).
- `sino-api` chưa có module nào cho cài đặt; phiên đăng nhập nằm trong bộ nhớ của server (không có Spring Session). Mỗi người dùng là `ownerId` của `CurrentUser`.
- Quy ước API (`openspec/specs/api-conventions`): JSON camelCase, lỗi RFC 9457, dữ liệu sai là `400 VALIDATION_FAILED` với `errors` `{ field, message }`, JSON không đọc được là `400 MALFORMED_REQUEST`.
- Danh sách tài khoản đã có tổng số tin đang lưu (`storedMessages` của `/api/accounts`), chưa có dung lượng.

## Đã chốt (người dùng, 2026-10-21)

- **Phạm vi:** lưu tuỳ chọn và số liệu thật (phương án bỏ: thêm phiên đăng nhập; làm đủ cả xuất, xoá, Web Push).
- **Hợp đồng API** dưới đây (D-401…D-403) và cách chia việc giữa hai phiên; **mode AUTO**.

## Decisions

### D-401 — Hình dạng của bản cài đặt · agent chốt, người dùng duyệt
```json
{
  "theme": "SYSTEM",
  "dateFormat": "DMY",
  "motion": "FULL",
  "notifications": {
    "newMessages": true, "importantOnly": false, "syncErrors": true,
    "newRegistrations": true, "reminders": true, "scheduledFailed": true
  },
  "quietHours": { "start": "22:00", "end": "07:00" },
  "timeZone": "Asia/Ho_Chi_Minh",
  "morningTime": "09:00",
  "defaultReminderMinutes": 15,
  "weekStart": "MONDAY"
}
```
- `theme`: `SYSTEM` | `LIGHT` | `DARK`. `dateFormat`: `DMY` (02/10/2026 · 14:05) | `ISO` (2026-10-02 · 14:05) | `LONG` (Thứ Sáu, 2 tháng 10). `motion`: `FULL` | `REDUCED` | `OFF`. `weekStart`: `MONDAY` | `SUNDAY`.
- `quietHours`: `null` là tắt; `start` và `end` là `HH:mm`, khác nhau, có thể qua nửa đêm.
- `timeZone`: một ID IANA mà `java.time.ZoneId` đọc được.
- `morningTime`: `HH:mm` từ `05:00` tới `12:00`.
- `defaultReminderMinutes`: `null` (không nhắc) hoặc một trong 5, 10, 15, 30, 60, 120, 1440.
- Giá trị mặc định khi người dùng chưa lưu gì là đúng mẫu trên (giá trị của canvas).

### D-402 — `GET` và `PATCH /api/settings` · agent chốt, người dùng duyệt
`GET /api/settings` trả `200` với bản cài đặt; chưa có dòng nào thì trả mặc định và **không** ghi gì. `PATCH /api/settings` theo JSON Merge Patch: trường có mặt thay giá trị cũ, trường vắng giữ nguyên, `quietHours: null` và `defaultReminderMinutes: null` là tắt; riêng `notifications` được gộp từng công tắc (gửi `{ "notifications": { "importantOnly": true } }` chỉ đổi một công tắc). Trả `200` với bản đầy đủ sau khi đổi. Giá trị sai, tên trường lạ (kể cả trong `notifications`) là `400 VALIDATION_FAILED` với `errors` và không ghi gì; `PATCH` rỗng (`{}`) trả bản hiện có. Hai `PATCH` cùng lúc không làm mất thay đổi của nhau (cập nhật trong một giao dịch, khoá dòng).

### D-403 — `GET /api/settings/storage` · agent chốt, người dùng duyệt
Trả `{ "messages": 3912, "bytes": 432013312 }`: `messages` là số thư và tin Sino đang lưu của mọi tài khoản của người dùng (~~cùng con số với `storedMessages` của danh sách tài khoản~~; **sửa sau SB-03:** tổng `storedMessages` của các tài khoản chưa xoá, con số mà `/api/accounts/{id}/initial-sync` cho từng tài khoản; `/api/accounts` không có nó. Tin của tài khoản đã xoá không tính. **LÝ DO:** câu cũ chỉ sai chỗ, phiên `sino-api-e0` chỉ ra khi làm SB-03); `bytes` là dung lượng các dòng của người dùng trong cơ sở dữ liệu (tin, nội dung HTML, metadata, tệp đính kèm chỉ có tên và cỡ, sticker), tính bằng `pg_column_size` hay cách tương đương mà phiên backend chốt và ghi lại. Một con số gần đúng là đủ: web hiện theo MB.

### D-404 — Lưu trữ · agent chốt
Bảng `user_settings`: `user_id` (khoá chính, khoá ngoại tới người dùng, `ON DELETE CASCADE`), mỗi trường một cột có `CHECK` cho giá trị cho phép (`notifications` có thể là sáu cột `boolean` hoặc một `jsonb` có kiểm, phiên backend chốt), `updated_at`. Migration lấy số kế tiếp lúc làm (hiện là V23; nếu `zalo-reactions` RX-06 đã lấy V23 thì V24). Module `settings` theo luật Modulith của repo (`api` / `application` / `infrastructure`, `ModularityTests`).

### D-405 — Web đọc, ghi và áp theme · agent chốt
`useSettingsSample` được thay bằng `useSettings` (query `['settings']`) và `useUpdateSettings` (mutation `PATCH` với phần đổi): đổi hiện ngay trong cache, máy chủ trả lỗi thì trả cache về và báo dưới dòng đó. Theme: đổi ngay trên máy như hiện nay và ghi `PATCH { theme }`; ~~khi mở app (đã đăng nhập) web đọc `theme` đã lưu và áp nếu khác lựa chọn trên máy~~. **Đổi khi làm (SB-10):** trình duyệt **chưa từng chọn** theme (không có `sino.theme`) thì lấy theme đã lưu; trình duyệt **đã chọn** thì giữ lựa chọn của nó và ghi nó lên máy chủ; đổi theme ở bất kỳ đâu (Cài đặt, menu người dùng, "Thêm") đều được ghi. **LÝ DO:** API trả giá trị mặc định khi chưa lưu gì, nên "bản đã lưu luôn thắng" sẽ đẩy người đã chọn Tối từ trước về "Theo hệ thống". Ánh xạ: `SYSTEM`/`LIGHT`/`DARK` ↔ `system`/`light`/`dark`; `DMY`/`ISO`/`LONG` ↔ ba định dạng của màn; `quietHours` ↔ ba lựa chọn của canvas (giá trị khác do API trả thì hiện thêm như một lựa chọn).

### D-406 — "Dữ liệu Sino đang lưu" thật · agent chốt
Mục Quyền riêng tư đọc `GET /api/settings/storage`: "N thư và tin nhắn · X MB" (MB làm tròn); đang tải thì "Đang tính…", lỗi thì "Chưa tính được". Danh sách thiết bị Web Push và phiên đăng nhập vẫn là dữ liệu mẫu (ngoài phạm vi).

### D-407 — Chia việc giữa hai phiên · agent chốt
Phiên `sino-api-e0` làm SB-01…SB-03 và chỉ sửa `apps/sino-api/**` cùng `tasks.md` của change này (phần của nó). Phiên `sino-web-03` làm SB-10, SB-11 với MSW theo hợp đồng trên trong lúc chờ, rồi nghiệm thu trên backend thật (SB-20). Hợp đồng chỉ đổi khi cả hai phiên cùng biết và người dùng duyệt.

## Risks / Trade-offs

- [Theme trên máy khác với theme đã lưu] → bản đã lưu thắng khi mở app; đổi trên máy ghi ngay lên máy chủ.
- [Migration trùng số với `zalo-reactions`] → lấy số kế tiếp lúc làm (D-404).
- [`bytes` khó tính đúng] → chấp nhận gần đúng; cách tính ghi ở task.
