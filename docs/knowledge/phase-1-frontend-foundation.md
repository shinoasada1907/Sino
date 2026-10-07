# Kiến thức Phase 1 — Đăng nhập cho trình duyệt và nền móng web

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** change 1 của Phase 1, `openspec/changes/fe-f01-web-foundation` (D-22 + F01-FE). Đang làm: xong BE-27, BE-28.
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
| BE-28 | API `/api/auth/*`, session, CSRF, remember-me, bỏ HTTP Basic | xong |
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

## 2. Đăng nhập bằng session, CSRF, remember-me (BE-28)

### 2.1 Luồng đăng nhập từ đầu tới cuối
- **Ở đâu:** `common/security/SecurityConfig.java` (luật truy cập, CSRF, remember-me, đăng xuất), `identity/api/AuthController.java` (`/me`, `/login`), `identity/application/SignInService.java`, `identity/application/LoginConfiguration.java` (các bean đăng nhập).

```text
1. GET /api/auth/me
     <- 401 + cookie XSRF-TOKEN=abc (JavaScript đọc được)
2. POST /api/auth/login
     header X-XSRF-TOKEN: abc
     body {email, password, rememberMe}
     server: kiểm CSRF (header phải = cookie)
             so mật khẩu với bản băm BCrypt
             đổi session ID, lưu "ai đang đăng nhập" vào session
     <- 204 + cookie JSESSIONID (HttpOnly, SameSite=Lax)
            [+ cookie remember-me nếu chọn ghi nhớ]
3. GET /api/accounts (cookie tự đi kèm)
     <- 200
4. POST /api/auth/logout + header X-XSRF-TOKEN
     <- 204: hủy session, xóa cookie ghi nhớ
```

### 2.2 Cookie session
- **`HttpOnly`:** JavaScript không đọc được, nên một đoạn script bị chèn vào trang (XSS) không lấy cắp được phiên.
- **`SameSite=Lax`:** trình duyệt không gửi cookie này theo request POST/PATCH/DELETE xuất phát từ trang web khác. Đây là lớp chặn CSRF thứ nhất.
- **`Secure`:** chỉ gửi qua HTTPS; bật bằng `SINO_SESSION_COOKIE_SECURE=true` khi chạy thật.
- **Hết hạn sau 30 phút không dùng.** Cấu hình ở `server.servlet.session` trong `application.yaml`.

### 2.3 CSRF: vì sao giờ phải bật
- **CSRF là gì:** một trang độc (ví dụ `evil.example`) bí mật gửi request tới Sino, và trình duyệt **tự kèm cookie** của Sino theo request đó. Server tưởng là người dùng tự làm.
- **Vì sao trước đây tắt được:** với HTTP Basic và không có session, không có cookie nào tự đi kèm, nên CSRF không có gì để lợi dụng. Có session cookie rồi thì phải bật.
- **"Double submit cookie":** server đặt cookie `XSRF-TOKEN` mà JavaScript **của Sino** đọc được; web gửi lại giá trị đó trong header `X-XSRF-TOKEN`. Trang `evil.example` không đọc được cookie của Sino (luật same-origin của trình duyệt), nên không gửi được header đúng.
- **`csrf.spa()`:** cấu hình có sẵn của Spring Security 7 cho SPA. Lỗi CSRF trả `403 CSRF_TOKEN_INVALID`; web sẽ lấy token mới rồi thử lại một lần (FE-02).

### 2.4 Endpoint đăng nhập tự viết
- **Vì sao không dùng `formLogin()` có sẵn:** nó nhận form HTML và trả về chuyển hướng (redirect), trong khi web cần JSON vào, Problem Details ra.
- **`AuthenticationManager` + `DaoAuthenticationProvider`:** so mật khẩu bằng `PasswordEncoder`. Với email không tồn tại, nó vẫn chạy BCrypt trên một bản băm giả, nên hai trường hợp mất cùng một khoảng thời gian, và kẻ dò không đoán được email nào có thật qua tốc độ trả lời.
- **Session fixation và `ChangeSessionIdAuthenticationStrategy`:** nếu kẻ xấu cài sẵn một session ID vào trình duyệt nạn nhân, rồi nạn nhân đăng nhập trên chính session đó, kẻ xấu sẽ dùng chung được phiên. Đổi session ID ngay lúc đăng nhập là chặn được.
- **`HttpSessionSecurityContextRepository.saveContext`:** lưu "ai đang đăng nhập" vào session, để các request sau biết người đó là ai.
- **Đăng xuất dùng `LogoutFilter` có sẵn:** nó hủy session, xóa cookie ghi nhớ và xóa CSRF token. Trả `204` kể cả khi chưa đăng nhập (đăng xuất lặp lại cũng vô hại).

### 2.5 Remember-me và cái bẫy của BCrypt
- **Cookie remember-me chứa gì:** email, hạn dùng và một chữ ký SHA-256. Chữ ký được tính từ email, hạn dùng, "mật khẩu" của người dùng và khóa bí mật. Đổi mật khẩu thì chữ ký cũ không còn khớp, nên cookie cũ hết tác dụng.
- **Bẫy:** "mật khẩu" mà Spring lấy ra là **bản băm BCrypt**, mà BCrypt thêm muối ngẫu nhiên. Mỗi lần khởi động lại, bản băm của **cùng một mật khẩu** lại khác, nên mọi cookie ghi nhớ sẽ chết sau khi server khởi động lại. Như vậy là trái hẳn mục đích "giữ đăng nhập" (D-34).
- **Cách sửa:** remember-me dùng một "dấu vân tay" ổn định, `HMAC-SHA256(SINO_REMEMBER_ME_KEY, mật khẩu)`, tính một lần lúc khởi động. Dấu này không đổi qua các lần khởi động, nhưng đổi khi mật khẩu hoặc khóa đổi. Việc đăng nhập bình thường vẫn so bằng BCrypt.
- **`setAlwaysRemember(true)`:** Spring mặc định tìm tham số `remember-me` trong form, mà body của Sino là JSON; vì vậy controller tự quyết định có gọi `loginSuccess` hay không, dựa vào trường `rememberMe`.

### 2.6 Bỏ HTTP Basic, `401` không có `WWW-Authenticate`
- Header `WWW-Authenticate: Basic` làm trình duyệt bật hộp thoại đăng nhập của chính nó. Bỏ Basic thì bỏ luôn header đó, và mọi `401` là JSON Problem Details để web tự xử lý.

### 2.7 Bẫy Jackson 3: kiểu nguyên thủy
- `rememberMe` lúc đầu là `boolean`. Web không gửi trường đó thì Jackson 3 (mặc định mới) **từ chối**, trả `400 MALFORMED_REQUEST`. Đổi sang `Boolean` (thiếu thì là `null`, coi như `false`). Bài học: trường tùy chọn trong request thì dùng kiểu bọc (`Boolean`, `Integer`), không dùng kiểu nguyên thủy.

### 2.8 Test với server thật
- **Vì sao không dùng MockMvc cho phần này:** MockMvc giả lập session bằng `MockHttpSession`, không có cookie `JSESSIONID` thật, nên không kiểm được `HttpOnly`, `SameSite`, việc đổi session ID hay remember-me khi mất cookie session.
- **`@SpringBootTest(webEnvironment = RANDOM_PORT)`** chạy Tomcat thật trên một cổng ngẫu nhiên; test dùng `java.net.http.HttpClient` kèm một "trình duyệt" nhỏ tự giữ cookie.
- **Hai lần khởi động trong một test:** `RememberMeAcrossRestartsTests` dựng hai Spring context riêng (mỗi context là một lần khởi động) để chứng minh cookie từ lần trước vẫn dùng được.
- **Test web slice cũ:** đăng nhập bằng `with(user("owner@sino.test"))`, và mọi request thay đổi dữ liệu thêm `with(csrf())`.

### 2.9 Kiểm tra ngược (BE-28)
- 12 lỗi, mỗi lần một lỗi bằng script, 11 lỗi bị bắt ngay: tắt CSRF; bỏ đổi session ID; ký cookie ghi nhớ bằng bản băm BCrypt (chỉ test "hai lần khởi động" bắt được, đúng là lý do nó tồn tại); luôn cấp cookie ghi nhớ; trả lại `WWW-Authenticate`; bật lại HTTP Basic; `/me` hay `/login` không công khai; bỏ `SameSite`; email không chuẩn hóa; email lạ trả khác sai mật khẩu.
- **Lỗi sống sót và bài học:** "đăng xuất mà không hủy session" không làm test nào đỏ. Lý do: kể cả khi không hủy session, `SecurityContextLogoutHandler` vẫn thay thông tin đăng nhập trong session bằng một context rỗng, nên qua HTTP người dùng vẫn bị đăng xuất. Spec đòi "hủy session", nên có thêm một test MockMvc kiểm `session.isInvalid()`. Chạy lại lỗi đó thì test mới đỏ.
- **Bài học chung:** kiểm tra ngược không chỉ để "đếm đỏ". Một lỗi sống sót cho biết hoặc test còn hở, hoặc hai cách viết thật sự tương đương; phải tìm hiểu xem là trường hợp nào.

---

## Tự kiểm tra

1. Vì sao HTTP Basic không hợp với một web app chạy trong trình duyệt? Nêu ba lý do.
2. Băm khác mã hóa (như AES ở Phase 0) ở chỗ nào? Vì sao mật khẩu thì băm, còn token Gmail thì mã hóa?
3. Vì sao BCrypt cố ý chậm, và vì sao chậm lại là điều tốt?
4. `{bcrypt}` ở đầu bản băm dùng để làm gì?
5. Vì sao mật khẩu và khóa không được kiểm bằng `@Size`?
6. Nếu có hai bean `UserDetailsService` thì chuyện gì xảy ra?
7. Vì sao bật session cookie thì bắt buộc phải bật CSRF, còn HTTP Basic trước đây thì không?
8. Trang `evil.example` vì sao không gửi được header `X-XSRF-TOKEN` đúng?
9. Session fixation là gì, và đổi session ID lúc đăng nhập chặn nó thế nào?
10. Vì sao cookie remember-me không thể được ký bằng bản băm BCrypt của mật khẩu?
11. Vì sao test đăng nhập dùng server thật thay vì MockMvc?
