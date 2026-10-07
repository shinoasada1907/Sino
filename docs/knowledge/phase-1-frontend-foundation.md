# Kiến thức Phase 1 — Đăng nhập cho trình duyệt và nền móng web

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** change 1 của Phase 1, `openspec/changes/fe-f01-web-foundation` (D-22 + F01-FE). Đang làm: xong BE-27.
> **Cập nhật:** 2026-10-07. Đường dẫn backend tính từ `apps/sino-api/`, frontend từ `apps/sino-web/`.

---

## 0. Bức tranh: vì sao phải đổi cách đăng nhập

Ở Phase 0 chỉ có curl gọi API, nên mỗi request mang theo tên và mật khẩu (HTTP Basic, D-02). Trình duyệt thì khác:

```text
TRƯỚC (HTTP Basic, Phase 0)
  mỗi request:  Authorization: Basic base64(tên:mật khẩu)
  -> JavaScript phải giữ mật khẩu để gửi đi; XSS là lộ mật khẩu
  -> 401 kèm WWW-Authenticate: Basic làm trình duyệt bật hộp thoại xấu xí
  -> EventSource (SSE, F08) không gửi được header Authorization

SAU (session cookie, D-22 = A)
  1 lần:        POST /api/auth/login {email, password}
                <- Set-Cookie: SESSION (HttpOnly: JavaScript không đọc được)
  mọi request:  trình duyệt tự gửi cookie
                + header X-XSRF-TOKEN cho POST/PATCH/DELETE (chống CSRF)
```

| Quyết định | Nội dung |
|---|---|
| D-22 = A | Đăng nhập bằng email + mật khẩu, server cấp session cookie, có CSRF |
| D-32 | Bỏ hẳn HTTP Basic |
| D-33 | Đăng nhập bằng email của owner và `SINO_OWNER_PASSWORD` trong env |
| D-34 | "Giữ đăng nhập trên máy này" = cookie remember-me 30 ngày |
| D-35 | Sai 5 lần thì khóa 15 phút, đếm theo email |
| D-36 | Web và API cùng một origin; khi dev, Vite chuyển `/api` sang backend |

| Task | Đã làm | Trạng thái |
|---|---|---|
| BE-27 | Mật khẩu owner và khóa ghi nhớ trong cấu hình, kiểm lúc khởi động | xong |
| BE-28 | API `/api/auth/*`, session, CSRF, remember-me, bỏ HTTP Basic | chưa làm |
| BE-29 | Khóa tạm 5 lần / 15 phút | chưa làm |
| FE-01…FE-05 | Nền móng web, API client, trang đăng nhập, khung app, nghiệm thu | chưa làm |

---

## 1. Mật khẩu owner và khóa ghi nhớ (BE-27)

### 1.1 Băm mật khẩu bằng BCrypt
- **Ở đâu:** `identity/application/LoginSettings.java`, bean `PasswordEncoder` trong `identity/application/LoginConfiguration.java`.
- **Là gì:** "băm" (hash) là phép biến đổi một chiều: từ mật khẩu tính ra được bản băm, nhưng từ bản băm không tính ngược lại được mật khẩu. Lúc đăng nhập, app băm mật khẩu người dùng gõ vào rồi so với bản băm đã lưu.
- **BCrypt khác SHA-256 ở đâu:** SHA-256 được thiết kế để **nhanh**, nên kẻ có bản băm thử được hàng tỷ mật khẩu mỗi giây. BCrypt cố ý **chậm** (khoảng 0,1 giây mỗi lần) và tự thêm "muối" (salt) ngẫu nhiên, nên cùng một mật khẩu băm hai lần ra hai kết quả khác nhau, và việc đoán thử trở nên rất tốn kém.
- **`{bcrypt}` ở đầu bản băm:** `PasswordEncoderFactories.createDelegatingPasswordEncoder()` tạo một encoder "chuyển tiếp": phần trong ngoặc nhọn cho biết thuật toán nào đã băm giá trị đó. Nhờ vậy, user HTTP Basic cũ (mật khẩu dạng `{noop}...`, không băm) vẫn đăng nhập được cho tới khi BE-28 bỏ nó, còn mật khẩu mới thì băm bằng BCrypt.
- **Vì sao băm một lần lúc khởi động:** mật khẩu chỉ cần ở dạng gốc đúng một lúc, để tạo bản băm. Từ đó, việc xác thực chỉ dùng bản băm.
- **Bẫy:** bean cấu hình `OwnerProperties` vẫn giữ giá trị gốc trong bộ nhớ (Spring cần nó để khởi tạo). Vì vậy `toString()` của nó phải che mật khẩu, để không bao giờ in ra log.

### 1.2 Kiểm cấu hình lúc khởi động, không bao giờ in giá trị
- **Ở đâu:** constructor của `LoginSettings`.
- **Là gì:** thiếu `SINO_OWNER_PASSWORD`, mật khẩu ngắn hơn 12 ký tự, thiếu `SINO_REMEMBER_ME_KEY`, hoặc khóa ngắn hơn 32 ký tự thì constructor ném lỗi, và Spring dừng khởi động (fail-fast).
- **Thông báo chỉ nêu tên cấu hình:** ví dụ `sino.owner.password (SINO_OWNER_PASSWORD) must be set and at least 12 characters long`, không có giá trị.
- **Vì sao không dùng `@Size` của Bean Validation:** khi Bean Validation từ chối, Spring Boot in kèm **giá trị bị từ chối** trong thông báo, tức là in luôn mật khẩu. Đây là bài học từ BE-12 (khóa mã hóa), nên các giá trị bí mật luôn được kiểm bằng tay.
- **Đếm ký tự thật:** độ dài được đếm bằng `codePointCount` chứ không phải `length()`. Một emoji là 2 `char` trong Java nhưng chỉ là 1 ký tự. Có test riêng cho điều này (11 emoji vẫn bị từ chối).

### 1.3 Che secret trong `toString()` của record
- **Ở đâu:** `OwnerProperties`, `AuthProperties`, `LoginSettings`.
- **Bẫy của record:** Java tự sinh `toString()` in **mọi** field. Chỉ một dòng log in đối tượng cấu hình là đủ làm lộ mật khẩu. Vì vậy cả ba class tự viết `toString()`, thay giá trị bằng `****`. Test `neverPrintsTheSecrets` canh việc này.

### 1.4 Vì sao `UserDetailsService` của owner chưa có ở BE-27
- **`UserDetailsService` là gì:** interface của Spring Security trả lời câu hỏi "với tên đăng nhập này, người dùng là ai, bản băm mật khẩu là gì".
- **Bẫy gặp phải:** khi ứng dụng có **hai** bean `UserDetailsService` (user API của HTTP Basic và owner), Spring Security không biết dùng cái nào, nên không dùng cái nào cho việc đăng nhập. HTTP Basic, vốn còn dùng tới BE-28, sẽ hỏng và gần như mọi test web đỏ.
- **Cách xử lý:** BE-27 chỉ chuẩn bị dữ liệu (`LoginSettings`: email, bản băm, khóa). BE-28 bỏ HTTP Basic rồi mới thêm `UserDetailsService` của owner, nên lúc nào cũng chỉ có một bean.

### 1.5 Kiểm tra ngược (BE-27)
- Làm hỏng code mỗi lần một chỗ, và lần nào cũng có test đỏ: lệch một ký tự ở giới hạn 12/32; bỏ kiểm mật khẩu; bỏ kiểm khóa; giữ mật khẩu gốc thay vì bản băm; thông báo lỗi in giá trị; đếm `char` thay vì ký tự thật; `toString()` in mật khẩu; `toString()` in khóa.

---

## Tự kiểm tra

1. Vì sao HTTP Basic không hợp với một web app chạy trong trình duyệt? Nêu ba lý do.
2. Băm khác mã hóa (như AES ở Phase 0) ở chỗ nào? Vì sao mật khẩu thì băm, còn token Gmail thì mã hóa?
3. Vì sao BCrypt cố ý chậm, và vì sao chậm lại là điều tốt?
4. `{bcrypt}` ở đầu bản băm dùng để làm gì?
5. Vì sao mật khẩu và khóa không được kiểm bằng `@Size`?
6. Nếu có hai bean `UserDetailsService` thì chuyện gì xảy ra?
