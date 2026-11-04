# Hồ sơ người dùng, phần 1: thông tin cá nhân và ảnh đại diện (`profile-info`)

## Bối cảnh

- Màn `/profile` (`fe-ui-profile`, ANTIGRAVITY, D-420…D-423) chạy trên `profile.sample.ts` và cache TanStack Query; `UserProfileData` có `displayName, email, phoneNumber, jobTitle, bio, avatarUrl, joinedAt, location, role, twoFactorEnabled`. Hộp đổi ảnh hiện nhận ảnh mẫu hoặc một URL.
- `sino-api`: `app_user (id, email, display_name, status, created_at, updated_at)` (V2). `OwnerProvisioner` chạy mỗi lần khởi động, tìm owner theo `sino.owner.email`, tạo nếu chưa có, rồi `rename(sino.owner.display-name)`. `GET /api/auth/me` trả `{email, displayName}` qua `OwnerProfile`.
- Ảnh đã có mẫu lưu trong DB: `sticker` + `sticker_content (bytea)` (V21), đọc qua `GET /api/stickers/{id}/content`.
- Canvas "Sino UI" chưa có frame Hồ sơ; màn `/profile` hiện theo D-421 của `fe-ui-profile`. Change này chỉ đổi hộp chọn ảnh và nhãn "Sắp có", không đổi bố cục.

## Quyết định đã chốt (người dùng, 2026-11-04)

### D-475 — Tách quản lý hồ sơ thành ba change
Phần 1 (change này): thông tin cá nhân + ảnh. Phần 2: đổi mật khẩu (mật khẩu chuyển từ `SINO_OWNER_PASSWORD` vào DB, đổi cách đăng nhập và chữ ký cookie ghi nhớ của F01). Phần 3: phiên đăng nhập (Spring Session JDBC hoặc registry). 2FA sau nữa. Mỗi phần một đề án, duyệt riêng.

### D-476 — Tên hiển thị: web thắng sau lần đầu
`OwnerProvisioner` chỉ dùng `sino.owner.display-name` khi **tạo** owner. Owner đã có thì giữ tên trong DB; không còn `rename` lúc khởi động. Cấu hình `display-name` vẫn bắt buộc (cần cho lần tạo đầu, DB trống). README và `.env.example` ghi rõ: đổi biến này sau lần chạy đầu không có tác dụng, đổi tên ở màn Hồ sơ.

### D-477 — Ảnh: `bytea`, web cắt sẵn
- Web cắt vuông và thu về 256×256, xuất WebP (trình duyệt không xuất được WebP thì PNG), rồi gửi.
- Máy chủ nhận `multipart/form-data`, phần `file`, tối đa **1 MB**; đọc vài byte đầu để kiểm đúng PNG, JPEG hay WebP (không tin `Content-Type` của client); cạnh không quá 1024 px (đọc kích thước từ phần đầu tệp, không giải mã cả ảnh). Sai thì `400` / `413` theo định dạng lỗi chung.
- Lưu trong bảng riêng một-một với owner, kèm `content_type`, `sha256`, `updated_at`. Ảnh mới thay ảnh cũ.
- `GET /api/profile/avatar` trả byte với `Content-Type` đã lưu, `ETag` = sha256, `Cache-Control: private, no-cache`; `If-None-Match` khớp thì `304`. Không có ảnh thì `404`.
- `avatarUrl` trong các phản hồi là `/api/profile/avatar?v=<8 ký tự đầu của sha256>` (đổi ảnh thì địa chỉ đổi, trình duyệt không dùng ảnh cũ), hoặc `null`.

### D-478 — Trường hồ sơ
| Trường | Sửa được | Giới hạn | Trống |
|---|---|---|---|
| `displayName` | có | 1–200 ký tự sau khi cắt khoảng trắng, không NUL | không được trống |
| `phoneNumber` | có | ≤ 30 ký tự, chỉ chữ số, khoảng trắng, `+ ( ) - .` | `null` |
| `jobTitle` | có | ≤ 100 | `null` |
| `location` | có | ≤ 100 | `null` |
| `bio` | có | ≤ 500, giữ xuống dòng | `null` |
| `email` | không | từ cấu hình (phần 2 mới bàn đổi) | |
| `role` | không | luôn `OWNER` | |
| `joinedAt` | không | `app_user.created_at` | |
`twoFactorEnabled` không có ở API (D-479).

## Quyết định agent tự chốt (người dùng xem lại khi duyệt)

### D-479 — Khối chưa có backend giữ dữ liệu mẫu, có nhãn "Sắp có"
Đổi mật khẩu, Phiên đăng nhập, thẻ 2FA vẫn hiện như hiện nay nhưng nút gửi bị tắt và có nhãn "Sắp có". Lý do: bỏ hẳn thì màn mất bố cục `fe-ui-profile` đã duyệt; để nút chạy trên dữ liệu mẫu thì người dùng tưởng đã đổi được mật khẩu thật.

### D-480 — `PATCH` không có version, lần lưu sau thắng
Chỉ một owner, form lưu cả khối một lần bằng nút "Lưu thay đổi" (không tự lưu như Ghi chú). Hai tab cùng sửa hồ sơ hiếm, mất mát là vài trường chữ; không đáng thêm `409`. `PATCH` chỉ đổi các trường có trong body; chuỗi trống (sau khi cắt) xóa trường tùy chọn.

### D-481 — `PUT /api/profile/avatar` trả lại hồ sơ
Trả `200` với cả hồ sơ (gồm `avatarUrl` mới), để web cập nhật cache `profile` và `me` mà không phải đọc lại. `DELETE` trả `204`, idempotent (không có ảnh vẫn `204`).

## Decision Needed

### DN-1 — Lưu trường hồ sơ ở đâu
- **A. Thêm cột vào `app_user`** (`phone_number`, `job_title`, `location`, `bio`), ảnh ở bảng `user_avatar`. Đơn giản nhất, một entity `AppUser`.
- **B. Bảng `user_profile` một-một với `app_user`**, ảnh ở `user_avatar`. `app_user` giữ phần đăng nhập (phần 2 sẽ thêm `password_hash` vào đó), phần hồ sơ tách riêng; thêm một entity và một lần nối.
- **Đề xuất: A.** Chỉ một owner, các trường nhỏ và luôn đọc cùng nhau; tách bảng không đem lại gì ở quy mô này. Ảnh vẫn tách vì `bytea` không nên nằm trong hàng đọc ở mọi request `/me`.

### DN-2 — Ai sửa `apps/sino-web/src/features/profile/**`
Các file này và `UserMenu.tsx` đang ghi chủ là ANTIGRAVITY trong `PROJECT_STATE.md` (task `fe-ui-profile`, DONE nhưng chưa archive, chưa thấy commit).
- **A. ANTIGRAVITY commit và archive `fe-ui-profile` trước, rồi trả file; `sino-web` làm PI-04, PI-05.** Đề xuất: lịch sử git sạch, `user-profile-screen` có trong `openspec/specs/` trước khi change này sửa nó.
- **B. Người dùng giao luôn PI-04, PI-05 cho ANTIGRAVITY** (cùng người dựng màn).
- **C. `sino-web` nhận file ngay**, chưa chờ archive. Nhanh nhất, nhưng đè lên phần chưa commit của agent khác.

## Hợp đồng API

```text
GET /api/profile                         200
{
  "email": "owner@sino.test",
  "displayName": "Đại Quản Gia",
  "phoneNumber": "+84 912 345 678" | null,
  "jobTitle": null, "location": null, "bio": null,
  "role": "OWNER",
  "joinedAt": "2026-09-30T08:00:00Z",
  "avatarUrl": "/api/profile/avatar?v=3f9a1c2b" | null
}

PATCH /api/profile                       200, cùng dạng như GET
{ "displayName"?: string, "phoneNumber"?: string, "jobTitle"?: string, "location"?: string, "bio"?: string }
   trường không gửi: giữ; "" hay chỉ khoảng trắng: xóa (displayName: 400)
   trường lạ (email, role...): 400 VALIDATION_FAILED

PUT /api/profile/avatar   multipart, phần "file"     200, hồ sơ
   > 1 MB: 413; không phải PNG/JPEG/WebP hay cạnh > 1024: 400
GET /api/profile/avatar                  200 image/*, ETag | 304 | 404
DELETE /api/profile/avatar               204

GET /api/auth/me                         200 { "email", "displayName", "avatarUrl" }
```
Mọi endpoint cần đăng nhập; `PATCH`, `PUT`, `DELETE` cần CSRF như các endpoint khác.

## Luồng web

```text
Hồ sơ  --GET /api/profile-->  form (giá trị máy chủ)
  "Lưu thay đổi" --PATCH (chỉ trường đã đổi)--> 200: cache profile + me đổi
                                             400: lỗi hiện dưới ô của trường
Ảnh: chọn tệp -> cắt vuông (canvas) -> 256x256 WebP/PNG -> PUT
                                             200: cache profile + me đổi, ảnh thanh trên đổi theo
                                             413/400: báo trong hộp, ảnh cũ giữ nguyên
```

## Rủi ro

- Người đã quen đổi tên bằng `.env`: sau D-476 không còn tác dụng. Giảm: README, `.env.example`, và log `INFO` lúc khởi động khi tên cấu hình khác tên trong DB ("tên hiển thị lấy từ DB; đổi ở màn Hồ sơ").
- Ảnh độc (tệp không phải ảnh mang đuôi ảnh): kiểm magic bytes, trả đúng `Content-Type` đã lưu và `X-Content-Type-Options: nosniff`.
