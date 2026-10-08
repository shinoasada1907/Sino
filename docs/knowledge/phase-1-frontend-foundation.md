# Kiến thức Phase 1 — Đăng nhập cho trình duyệt và nền móng web

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** change 1 của Phase 1, `openspec/changes/fe-f01-web-foundation` (D-22 + F01-FE), change `openspec/changes/fe-ui-overview` (dựng giao diện trước với dữ liệu mẫu, D-42) change `openspec/changes/fe-ui-accounts` (màn Tài khoản) và change `openspec/changes/fe-ui-connect` (luồng kết nối tài khoản). Đã xong: BE-27, BE-28, BE-29, FE-01, UI-01, UI-02, UI-03, AC-01, AC-02, AC-03, AC-04, CN-01, CN-02, CN-03.
> **Cập nhật:** 2026-10-08. Đường dẫn backend tính từ `apps/sino-api/`, frontend từ `apps/sino-web/`.

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
| BE-29 | Khóa tạm 5 lần / 15 phút | xong |
| FE-01 | Cài stack, design token, sáng/tối, proxy `/api`, test, CI frontend | xong |
| FE-02…FE-05 | API client, trang đăng nhập, khung app có xác thực, nghiệm thu | tạm hoãn (D-44) |
| UI-01 | Router, khung app co giãn (sidebar / rail / thanh dưới), trang "đang được dựng", 404 | xong |
| UI-02 | Hợp đồng dữ liệu Tổng quan, dữ liệu mẫu, hàm định dạng giờ và chữ | xong |
| UI-03 | Màn Tổng quan: phần đầu trang và 7 thẻ, co giãn theo canvas; thanh trên sửa theo canvas | xong |
| UI-04 | Nghiệm thu, chốt hợp đồng dữ liệu, archive | chưa làm |

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

## 3. Khóa tạm khi đoán mật khẩu (BE-29, D-35)

### 3.1 Bộ đếm `LoginAttempts`
- **Ở đâu:** `identity/application/LoginAttempts.java`, dùng trong `SignInService.authenticate`.
- **Là gì:** đếm số lần đăng nhập sai liên tiếp cho từng email (đã chuẩn hóa). Lần sai 1–4 trả về số lần còn lại (4, 3, 2, 1); lần thứ 5 khóa email đó 15 phút.

```text
sai lần 1..4  -> 401 INVALID_CREDENTIALS, remainingAttempts = 4, 3, 2, 1
sai lần 5     -> 429 LOGIN_LOCKED, retryAfterSeconds = 900, Retry-After: 900
đang khóa     -> 429 ngay, KHÔNG so mật khẩu (đúng hay sai cũng vậy)
hết 15 phút   -> mở khóa, đếm lại từ đầu
đăng nhập đúng-> bộ đếm về 0
```

- **Vì sao kiểm khóa trước khi so mật khẩu:** nếu so mật khẩu trước, khóa gần như vô dụng: kẻ dò vẫn đoán tiếp được trong lúc khóa, và chỉ cần câu trả lời khác đi một chút (đoán đúng thì vào được, hoặc thời gian trả lời khác nhau) là biết lần nào đúng. Thêm nữa, mỗi lần thử vẫn tốn một lần chạy BCrypt của server. Có test riêng: đúng mật khẩu khi đang khóa vẫn bị `429` và không có session.
- **Đếm cả email không tồn tại:** để câu trả lời cho "email lạ" và "sai mật khẩu" giống hệt nhau, kể cả `remainingAttempts`.

### 3.2 Giới hạn bộ nhớ, và cái bẫy khi giới hạn
- **Vì sao phải giới hạn:** bộ đếm nằm trong bộ nhớ. Kẻ tấn công gửi hàng triệu email bịa thì bảng đếm phình mãi. Vì vậy: một mục tự hết hạn 15 phút sau lần sai cuối, và tối đa 10 000 email.
- **`LinkedHashMap` giữ thứ tự:** mỗi lần sai, mục được xóa rồi thêm lại vào cuối, nên đầu bảng luôn là email có lần sai cũ nhất. Bảng đầy thì bỏ mục đầu.
- **Bẫy:** nếu bỏ cả mục **đang khóa**, kẻ tấn công chỉ cần gửi 10 000 email bịa là "đẩy" được khóa của owner ra ngoài, rồi đoán tiếp. Vì vậy mục đang khóa không bao giờ bị bỏ. Có test riêng: `aLockIsNotPushedOutByOtherEmails`.
- **`synchronized`:** nhiều request đăng nhập có thể chạy song song trên nhiều luồng; khóa cả method để bảng đếm không bị hỏng. Đăng nhập hiếm khi diễn ra, nên chờ nhau một chút không đáng kể.

### 3.3 Thời gian từ bean `Clock`
- **Ở đâu:** `common/time/ClockConfiguration.java` (một bean `Clock.systemUTC()`).
- **Vì sao:** code gọi `clock.instant()` thay vì `Instant.now()`, nên test thay được đồng hồ. Unit test dùng một đồng hồ tự viết (`MovableClock`) để tua 14 phút, 15 phút. Test với server thật dùng `@MockitoBean Clock`, và mỗi test bắt đầu ở một mốc giờ cách nhau một tiếng, nên lần sai của test trước đã "quên" khi test sau chạy. Không cần thêm một method "reset" chỉ để test dùng.

### 3.4 Problem Details có thêm trường, và header `Retry-After`
- **Ở đâu:** `common/error/SinoException.java`, `common/web/GlobalExceptionHandler.java`.
- `SinoException` mang được thêm vài trường an toàn để hiện cho client (ví dụ `remainingAttempts`). Các trường chuẩn (`type`, `title`, `status`, `detail`, `instance`, `code`) không ghi đè được.
- Lỗi loại `RATE_LIMITED` có `retryAfterSeconds` thì tự gửi thêm header chuẩn HTTP `Retry-After`, để client nào cũng biết phải chờ bao lâu. F07 sẽ dùng lại khi provider báo "chậm lại".
- `retryAfterSeconds` được làm tròn **lên**, để client không thử lại sớm hơn một chút so với lúc mở khóa.

### 3.5 Bẫy: module test chỉ nạp "hàng xóm" trực tiếp
- **Ở đâu:** `account/application/AccountRegistrationServiceTests` (`@ApplicationModuleTest(mode = DIRECT_DEPENDENCIES)`).
- **Chuyện gì xảy ra:** các test chạy riêng đều xanh, nhưng full `verify` có một lớp đỏ: `LoginAttempts` đòi bean `Clock` mà không có.
- **Vì sao:** module test của Spring Modulith không nạp cả ứng dụng. Ở chế độ `DIRECT_DEPENDENCIES`, nó nạp module đang test và các module mà module đó **dùng bean** trực tiếp. Log của test in rõ: dấu `+` là có nạp, dấu `-` là không.

```text
account  (module đang test)
  + identity   có nạp: account dùng bean của identity
  + provider   có nạp
  - common     KHÔNG nạp: account chỉ dùng kiểu (SinoException)
identity
  -> cần bean Clock, nằm ở common  => không có => không khởi động
```

- **Cách xử lý đúng của Modulith:** "phụ thuộc của phụ thuộc" thì test tự cấp, bằng mock hoặc một bean thay thế. Ở đây test thêm `@Bean Clock`.
- **Bài học:** thêm một bean mới mà module khác phụ thuộc vào thì phải chạy full `verify`, vì chỉ module test mới lộ ra loại lỗi này.

### 3.6 Kiểm tra ngược (BE-29)
Làm hỏng code mỗi lần một chỗ, và lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| So mật khẩu trước, kiểm khóa sau | đúng mật khẩu khi đang khóa vẫn vào được |
| Khóa ở lần sai thứ 6 | đếm lùi, khóa ở lần 5 (12 test đỏ) |
| Khóa 14 phút thay vì 15 | `retryAfterSeconds` = 900, mở khóa ở phút 15 |
| Đăng nhập đúng không xóa bộ đếm | đếm lại từ đầu sau khi đăng nhập đúng |
| Không bao giờ quên lần sai | quên sau 15 phút kể từ lần sai cuối |
| Không chuẩn hóa email | `" Owner@X "` và `"owner@x"` là một email |
| Bỏ cả mục đang khóa khi bảng đầy | khóa không bị "đẩy" ra |
| Bảng không giới hạn | giữ tối đa N email, bỏ cái cũ nhất |
| Không gửi header `Retry-After` | header `Retry-After: 900` |
| Bỏ các trường phụ của lỗi | `remainingAttempts`, `retryAfterSeconds` có trong body |

---

## 4. Nền móng web (FE-01)

### 4.0 Bức tranh: các mảnh của frontend

```text
LÚC DEV
  trình duyệt --> http://localhost:5173 (Vite dev server)
                    /src/*.tsx  -> dịch TypeScript + JSX, trả ngay (HMR)
                    /api/...    -> proxy --> Spring Boot localhost:8080
  => trình duyệt chỉ thấy MỘT địa chỉ:
     cookie session và XSRF-TOKEN được lưu cho localhost:5173

LÚC BUILD (pnpm build)
  tsc -b        kiểm kiểu toàn bộ src (không sinh file)
  vite build    gom code thành dist/index.html + dist/assets/*.js, *.css, font
```

| Mảnh | Vai trò | Tương đương bên Java |
|---|---|---|
| pnpm | cài thư viện, chạy script | Maven |
| Vite | dev server, đóng gói khi build | Spring Boot DevTools + plugin đóng gói của Maven |
| TypeScript | JavaScript có kiểu, `tsc` kiểm lỗi kiểu | `javac` |
| React | vẽ giao diện bằng component | (không có tương đương trực tiếp) |
| Tailwind CSS | viết style bằng class ngắn trong JSX | (không có) |
| shadcn/ui + Radix | component có sẵn (nút, ô nhập, menu) | thư viện UI |
| TanStack Query | gọi API, cache, trạng thái loading/lỗi (dùng từ FE-02) | (không có) |
| React Router | chuyển trang theo URL (dùng từ FE-03/FE-04) | `@RequestMapping` của trang |
| Vitest + Testing Library + MSW | chạy test, dựng component trong DOM giả, giả mạng | JUnit + MockMvc + WireMock |

### 4.1 pnpm, `package.json` và lockfile
- **Ở đâu:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- **Là gì:** `package.json` khai báo thư viện cần dùng (`dependencies` cho code chạy trong trình duyệt, `devDependencies` cho công cụ: build, test, lint) và các script (`pnpm dev`, `pnpm test`...). `pnpm-lock.yaml` ghi **chính xác** phiên bản của mọi thư viện, kể cả thư viện con, giống việc Maven luôn tải đúng một phiên bản đã ghi.
- **`^5.104.1` nghĩa là gì:** cho phép bản vá và bản nhỏ mới hơn (5.x.y) nhưng không lên 6. Lockfile mới là thứ đảm bảo hai máy cài giống hệt nhau, nên CI chạy `pnpm install --frozen-lockfile`: lockfile lệch với `package.json` thì dừng, không tự sửa.
- **`packageManager: pnpm@11.21.0`:** ghi phiên bản pnpm của dự án; CI (`pnpm/action-setup`) đọc trường này để cài đúng bản. Trên máy thì tự cài: `npm install -g pnpm@11` (Node 25 trở đi không còn kèm `corepack`).
- **Bẫy 1, script cài đặt:** một số thư viện chạy script ngay lúc cài (postinstall). Từ pnpm 10, các script này bị chặn mặc định vì một thư viện bị chiếm quyền có thể chạy mã độc trên máy bạn ngay khi cài. pnpm 11 còn **báo lỗi** (`ERR_PNPM_IGNORED_BUILDS`, thoát mã 1, CI sẽ đỏ) nếu ta chưa quyết. MSW có một script như vậy, chỉ để chép file service worker cho chế độ chạy trong trình duyệt, thứ ta không dùng; nên `pnpm-workspace.yaml` ghi `allowBuilds: msw: false` (quyết định tường minh: không cho chạy).
- **Bẫy 2, bản major quá mới:** MSW 3.0.0 ra ngày 2026-09-28, mà Vitest 5 vẫn khai báo cần `msw ^2`. Chọn MSW 2.15 (ổn định từ tháng 7) thay vì bản mới nhất. Bài học: "mới nhất" chưa chắc là "đúng"; xem `peerDependencies` và ngày phát hành.

### 4.2 Vite và proxy `/api`
- **Ở đâu:** `vite.config.ts` (`server.proxy`).
- **Là gì:** lúc dev, mọi request có đường dẫn bắt đầu bằng `/api/` được Vite chuyển tiếp sang `http://localhost:8080`; phần còn lại (`/`, `/accounts`, file `.tsx`) do Vite tự trả.
- **Vì sao khóa là `/api/` có dấu `/` ở cuối:** Vite so khớp theo **tiền tố** (`startsWith`). Với khóa `/api`, một trang web tên `/apis` hay `/api-keys` cũng bị đẩy sang backend. Đã kiểm: `/apis` và `/api-keys` vẫn do Vite trả.
- **Vì sao proxy thay vì bật CORS ở Spring (D-36):** trình duyệt coi `localhost:5173` và `localhost:8080` là **hai origin khác nhau** (khác cổng là khác origin). Gọi thẳng sang 8080 thì phải bật CORS có cookie, cookie phải `SameSite=None; Secure`, tức phải chạy HTTPS cả khi dev, thêm nhiều cấu hình dễ sai. Có proxy thì trình duyệt chỉ thấy một origin: cookie `SameSite=Lax` chạy tự nhiên, không cần CORS. Khi deploy (F12), web và API cũng sẽ nằm sau một origin.
- **Đã kiểm thế nào:** dựng một "backend giả" ở cổng 8080, gọi `http://localhost:5173/api/auth/me` thì backend giả nhận được request và cookie `XSRF-TOKEN` nó gửi về đi qua nguyên vẹn; còn `/accounts` vẫn do Vite trả `index.html`.
- **Bẫy:** backend chưa chạy thì `/api/...` trả `502` rỗng, log Vite ghi `http proxy error ... ECONNREFUSED`. `pnpm preview` (chạy bản build) **không** có proxy.

### 4.3 TypeScript: alias `@/` và kiểm kiểu khi build
- **Ở đâu:** `tsconfig.json`, `tsconfig.app.json` (`paths`), `vite.config.ts` (`resolve.alias`).
- **Là gì:** `import { Button } from '@/shared/ui/button'` thay cho `'../../shared/ui/button'`. Phải khai ở **hai** nơi: `tsconfig` để TypeScript hiểu khi kiểm kiểu, `vite.config.ts` để Vite tìm được file khi chạy và build.
- **Bẫy:** TypeScript 6 đánh dấu `baseUrl` là lỗi thời, nên chỉ dùng `paths` với đường dẫn tương đối (`./src/*`). `pnpm build` chạy `tsc -b` trước `vite build`: Vite tự nó **không** kiểm kiểu (chỉ bỏ phần kiểu đi cho nhanh), nên thiếu bước `tsc` thì lỗi kiểu vẫn lọt vào bản build.

### 4.4 Tailwind CSS và design token từ canvas
- **Ở đâu:** `src/index.css`.
- **Tailwind là gì:** thay vì viết file CSS riêng, ta ghép các class nhỏ ngay trong JSX: `h-11 rounded-sm bg-primary px-4.5 text-sm font-semibold`. Khi build, Tailwind quét code và chỉ sinh CSS cho các class thật sự được dùng.
- **Design token là gì:** tên vai trò của màu, font, bo góc ("nền", "chữ mờ", "nút chính") thay vì mã màu cụ thể. Đổi theme chỉ là đổi giá trị của token, không phải sửa từng component.
- **Hai lớp:**

```text
Lớp 1: biến CSS chép NGUYÊN từ canvas (design/sino-ui/project/sino.css)
  :root, .theme-light   { --bg: #F2F2EF; --text: #111111; --inverse: #111111; ... }
  .theme-dark           { --bg: #070707; --text: #F7F7F4; --inverse: #F7F7F4; ... }

Lớp 2: @theme inline nối biến đó sang tên class của Tailwind
  --color-background: var(--bg)        -> class bg-background
  --color-primary:    var(--inverse)   -> class bg-primary, text-primary
  --radius-sm:        10px             -> class rounded-sm
```

- **Vì sao hai lớp:** lớp 1 giữ đúng tên của canvas nên đối chiếu được với thiết kế từng dòng; lớp 2 cho component dùng tên quen của Tailwind/shadcn (`bg-primary`, `text-muted-foreground`). Thêm component shadcn mới thì nó tự ăn màu canvas.
- **`inline` để làm gì:** class sinh ra trỏ thẳng tới `var(--inverse)`, nên khi `<html>` đổi từ `theme-light` sang `theme-dark`, giá trị đổi ngay mà không cần sinh lại CSS.
- **Bẫy:** bo góc của Tailwind mặc định khác canvas (`rounded-sm` mặc định là 4px); ở đây đã ghi đè thành thang của canvas (6 / 10 / 14 / 20px). Các góc 8px và 12px của canvas viết là `rounded-[8px]` và `rounded-xl`.

### 4.5 Giao diện sáng/tối
- **Ở đâu:** `src/shared/theme/theme.ts` (đọc, lưu, áp theme), `ThemeProvider.tsx`, `themeContext.ts` (`useTheme`), `ThemeToggle.tsx`.

```text
mở trang
  -> có lựa chọn đã lưu ("light"/"dark") trong localStorage["sino.theme"]? -> dùng nó
  -> không có, hoặc giá trị lạ ("blue")                                    -> theo hệ điều hành
                                                                               (prefers-color-scheme)
  -> đặt class theme-light hoặc theme-dark lên <html>
bấm nút đổi theme
  -> lưu vào localStorage (lỗi thì bỏ qua) -> đổi class trên <html>
```

- **React Context:** `ThemeProvider` giữ theme hiện tại trong state, và mọi component bên dưới đọc được qua `useTheme()` mà không phải truyền tay qua từng tầng. Gọi `useTheme()` ngoài provider thì báo lỗi ngay, để không âm thầm chạy sai.
- **Vì sao bọc `try/catch` quanh `localStorage`:** cửa sổ ẩn danh của vài trình duyệt, hoặc khi người dùng chặn dữ liệu trang web, việc đọc/ghi `localStorage` **ném lỗi** chứ không trả `null`. Không bọc thì cả app trắng màn hình chỉ vì không nhớ được màu nền.
- **Vì sao kiểm giá trị đọc ra:** `localStorage` ai cũng sửa được (DevTools, phiên bản cũ của app). Chỉ nhận đúng `"light"` hoặc `"dark"`, giá trị khác thì coi như chưa chọn.
- **`useLayoutEffect` thay vì `useEffect`:** `useLayoutEffect` chạy **trước** khi trình duyệt vẽ khung hình đầu, nên trang không bị chớp màu sai khi React vừa hiện.
- **Bẫy, chớp trắng trước khi JavaScript chạy:** trước khi script chạy, `<html>` chưa có class theme nào, nên trang dùng màu sáng mặc định; người dùng hệ điều hành tối sẽ thấy chớp trắng. `index.css` có một luật nhỏ: hệ điều hành tối và `<html>` chưa có class thì nền tối. Còn lại một trường hợp: người dùng đã chọn ngược với hệ điều hành (ví dụ hệ điều hành sáng, chọn tối) thì **mỗi lần tải trang** vẫn chớp màu của hệ điều hành trong lúc tải gói JavaScript. Cách bỏ hẳn là thêm một script inline nhỏ trong `index.html` đặt class trước khi trang hiện; đổi lại, logic đọc theme nằm ở hai nơi, và F12 phải cho phép script đó trong Content-Security-Policy (dùng mã băm `sha256-...` là được). Chưa làm, để người dùng quyết.

### 4.6 shadcn/ui, Radix và `cn`
- **Ở đâu:** `src/shared/ui/*.tsx`, `components.json`.
- **Là gì:** shadcn không phải thư viện cài vào `node_modules` mà là một **công cụ chép code**: `pnpm dlx shadcn@latest add button` chép file `button.tsx` vào dự án, và từ đó nó là code của ta, sửa thoải mái. Bên trong dùng **Radix** cho phần khó: bàn phím, focus, thuộc tính `aria-*` cho trình đọc màn hình (ví dụ menu thả xuống mở bằng phím, đóng bằng Esc).
- **`cva` (class-variance-authority):** khai báo các biến thể của nút (`primary`, `secondary`, `ghost`, `danger`) và kích thước (`default`, `sm`, `icon`, `icon-sm`) ở một chỗ; `<Button variant="secondary" size="sm">` tự ghép đúng class.
- **`cn`:** ghép class và để class sau thắng class trước khi trùng loại: `cn('h-9', 'h-11')` cho `h-11`. Nhờ vậy truyền `className="w-full"` từ ngoài vào là ghi đè được. shadcn 4.21 lấy hàm này từ gói npm `cn` của chính shadcn (thay cho cặp `clsx` + `tailwind-merge` trước đây).
- **Bẫy, `cn` phải biết tên riêng của theme:** `cn` đoán loại của class theo tên. `shadow-sm`, `shadow-lg` là cỡ bóng; còn tên lạ như `shadow-popover` thì nó đoán là **màu** của bóng. Kết quả: `cn('shadow-popover', 'shadow-none')` giữ cả hai, và class nào thắng tùy thứ tự trong file CSS chứ không phải thứ tự ta viết. Vì vậy có `src/shared/lib/utils.ts`: một wrapper khai `popover` là cỡ bóng (`createCn({ extend: { theme: { shadow: ['popover'] } } })`), có test riêng. `shadcn add` luôn sinh `import { cn } from "cn"`, nên `.oxlintrc.json` có luật `no-restricted-imports`: import thẳng `cn` là `pnpm lint` đỏ. Wrapper còn có lợi phụ: `cn` mới ở bản 0.4, nếu bản sau đổi API thì chỉ sửa một chỗ.
- **Đã chỉnh theo canvas:** nút cao 44px, bo 10px, chữ 600 14px, viền focus 2px; ô nhập nền `surface`, focus có vòng 3px; công tắc 40 x 24 với núm 16px; menu nền `raised`, viền `border-strong`, bóng `shadow-pop`.
- **Bẫy, viền focus biến mất (review bắt được):** nút có `outline-none` (bỏ viền mặc định khi bấm chuột) và `focus-visible:outline-2` (viền 2px khi dùng bàn phím). Trong Tailwind 4, `outline-none` đặt một biến `--tw-outline-style: none`, còn `outline-2` lấy kiểu viền **từ chính biến đó**, nên viền dày 2px nhưng kiểu vẫn là `none`: không hiện gì. Người dùng bàn phím (Tab) không biết mình đang ở nút nào, trái WCAG 2.4.7. Sửa: thêm `focus-visible:outline-solid`. Đo trên Chrome thật bằng cách bấm Tab: trước khi sửa `outline-style: none`, sau khi sửa `solid 2px` đúng màu `--ring`. Bài học: kiểm giao diện phải gồm cả **bàn phím**, không chỉ chuột và ảnh chụp.
- **Bẫy, variant tự định nghĩa:** component sinh ra dùng `data-open:` và `data-checked:`, nhưng Radix chỉ gắn `data-state="open"` hay `data-state="checked"`. `shadcn init` thường thêm các variant này vào CSS bằng cách cài cả gói CLI `shadcn` (khoảng 300 gói con). Ta chỉ chép đúng bốn variant cần dùng vào đầu `index.css`. Thiếu chúng thì class không có tác dụng gì mà **cũng không báo lỗi**: công tắc bật mà vẫn xám.

### 4.7 Font tự host
- **Ở đâu:** `main.tsx` (`import '@fontsource-variable/inter'`), `--font-sans` trong `index.css`.
- **Vì sao không dùng Google Fonts như canvas:** mỗi lần mở trang, trình duyệt sẽ gửi IP của người dùng cho Google. Sino đọc tin nhắn riêng tư, tự cài trên máy mình, nên không để request nào đi ra bên thứ ba. Gói `@fontsource-variable` đóng font vào bản build; nhiều file `.woff2` (latin, vietnamese, cyrillic...) nhưng trình duyệt chỉ tải bộ chữ trang thật sự dùng.

### 4.8 Test frontend
- **Ở đâu:** `src/shared/theme/theme.test.tsx`, `src/test/setup.ts`, `src/test/msw/server.ts`, khối `test` trong `vite.config.ts`.

```text
pnpm test (Vitest)
  môi trường jsdom: một "trình duyệt giả" trong Node (có document, localStorage; không vẽ gì)
  setup.ts
    - thêm matcher toBeInTheDocument, toHaveClass (jest-dom)
    - bật MSW: request nào không có handler -> test ĐỎ (không bao giờ gọi mạng thật)
    - sau mỗi test: gỡ component (cleanup), xóa handler đã thêm
  test: render(<ThemeProvider><ThemeToggle/></ThemeProvider>)
        -> tìm nút như người dùng: getByRole('button', { name: 'Chuyển sang giao diện sáng' })
        -> userEvent.click(...) -> kiểm class của <html>
```

- **Testing Library tìm phần tử theo vai trò và nhãn**, không theo class hay id: nếu test tìm được nút bằng tên đọc cho trình đọc màn hình, thì người dùng khiếm thị cũng tìm được. Đây là lý do nút đổi theme (chỉ có icon) phải có `aria-label`.
- **Giả hệ điều hành và bộ nhớ:** jsdom không có `matchMedia`, nên test tự gắn một bản giả trả "tối" hoặc "sáng" (`vi.stubGlobal`). Để giả trình duyệt chặn bộ nhớ, test cho `Storage.prototype.getItem/setItem` ném `SecurityError` (`vi.spyOn`); `restoreMocks: true` trả lại như cũ sau mỗi test.
- **Mô phỏng "tải lại trang":** `unmount()` component, xóa class trên `<html>`, rồi `render` lại một provider mới. Provider mới chỉ còn `localStorage` để biết lựa chọn cũ, đúng như khi tải lại thật.
- **Mặc định cho mọi test:** `setup.ts` giả `matchMedia` là "không ưu tiên tối" trước mỗi test, và `unstubGlobals: true` gỡ nó sau mỗi test. Nếu không, mọi test sau này dựng `ThemeProvider` (trang đăng nhập, khung app) sẽ sập với `window.matchMedia is not a function`; test `uses the light theme when the test environment states no OS preference` canh việc này.
- **Request quên handler phải làm test đỏ:** chiến lược `onUnhandledRequest: 'error'` của MSW chỉ làm `fetch` ném lỗi mạng. Nếu code đang test **bắt** lỗi đó (API client của FE-02 đổi nó thành `NETWORK_ERROR`), test vẫn xanh vì lý do sai. `setup.ts` ghi lại mọi request không có handler và làm test đỏ ở `afterEach` với thông báo `Requests without an MSW handler: GET ...`. Đã kiểm bằng một test tạm cố tình nuốt lỗi.
- **Test viết trước:** chạy với một `ThemeProvider` rỗng thì cả 5 test đỏ (không có class theme nào), viết code xong thì 5/5 xanh. Sau review có thêm 1 test theme và 3 test cho `cn` (đỏ trước: `shadow-popover shadow-none`; xanh sau khi có wrapper), tổng 9/9.
- **Kiểm tra ngược (8 lỗi cố ý, cả 8 bị bắt):**

| Lỗi cố ý | Test bắt được |
|---|---|
| Đọc `localStorage` không có `try/catch` | trình duyệt chặn bộ nhớ vẫn chạy |
| Ghi `localStorage` không có `try/catch` | trình duyệt chặn bộ nhớ vẫn chạy |
| Bỏ qua lựa chọn đã lưu | giữ theme sau khi tải lại |
| Bỏ qua hệ điều hành (luôn sáng) | lần đầu theo hệ điều hành tối (4 test đỏ) |
| Không bao giờ lưu | giữ theme sau khi tải lại |
| Không gỡ class cũ khi đổi | sau khi đổi, `<html>` không còn `theme-dark` |
| Nhận mọi giá trị đã lưu | bỏ qua giá trị lạ (`"blue"`) |
| Nút đổi theme không gọi lưu | giữ theme sau khi tải lại |

- **Kiểm trên trình duyệt thật:** Chrome headless điều khiển qua DevTools Protocol: hệ điều hành sáng thì nền `#F2F2EF`; bấm đổi thì tối và lưu `dark`; tải lại vẫn tối; màn hình 390px không tràn ngang; font Inter đã tải.

### 4.9 Review độc lập
- Sau khi code chạy, một agent review chỉ đọc (không sửa code) soi lại toàn bộ thay đổi. Kết quả: không có lỗi nghiêm trọng nhất; 1 lỗi mức cao (viền focus, mục 4.6); 2 lỗi trung bình (`cn` với `shadow-popover`; test thiếu `matchMedia`); vài lỗi nhỏ: proxy khớp tiền tố, `data-inset={false}` vẫn làm menu thụt lề, MSW không làm đỏ test khi lỗi bị bắt, favicon vẫn là logo Vite, `corepack` không còn trên Node 26. Tất cả đã sửa và kiểm lại, trừ chuyện chớp theme (mục 4.5), để người dùng quyết.
- **Bài học:** mọi lỗi kể trên đều đã qua lint, test và build xanh. Chúng chỉ lộ ra khi có người đọc kỹ cách công cụ thật sự hoạt động (CSS Tailwind sinh ra, cách `cn` đoán loại class, chiến lược của MSW). Xanh mới là điều kiện cần.

### 4.10 CI frontend
- **Ở đâu:** `.github/workflows/frontend-ci.yml`.
- **Là gì:** mỗi lần push hay mở pull request có đụng `apps/sino-web/**`, GitHub chạy: cài đúng pnpm theo `packageManager`, Node 26, `pnpm install --frozen-lockfile`, rồi `lint`, `test`, `build`. Giống `backend-ci.yml` chạy `./mvnw verify` cho backend.
- **Bẫy:** CI chỉ thực sự chạy khi code được push, mà push cần bạn cho phép. Trước đó, bằng chứng là ba lệnh chạy trên máy.

## 5. Dựng giao diện trước với dữ liệu mẫu (fe-ui-overview)

### 5.0 Bức tranh: vì sao đổi thứ tự
- **Chuyện gì đổi (D-42, người dùng 2026-10-07):** thay vì làm API client rồi đăng nhập trước (FE-02…FE-05), web được dựng **từng màn một với dữ liệu mẫu**, chưa có đăng nhập (D-44). Màn đầu tiên là Tổng quan (D-43). Mỗi màn là một change OpenSpec riêng.
- **"Hợp đồng dữ liệu" là gì:** mỗi màn có một kiểu TypeScript mô tả đúng dữ liệu nó cần. Kiểu đó là bản "đặt hàng" giao cho backend: backend làm hoặc chỉnh API sao cho trả đúng hình dạng ấy.

```text
TRƯỚC (vertical slice):  API backend -> API client -> màn hình
SAU (D-42):              màn hình + dữ liệu mẫu
                         -> kiểu dữ liệu (hợp đồng)
                         -> backend làm API khớp
hook useShellData() / useOverview()
  hiện tại: trả dữ liệu mẫu
  sau này:  gọi API thật (component không phải sửa)
```

- **Nguyên tắc của hợp đồng:** API trả **dữ liệu thô** (thời điểm ISO-8601 UTC, số đếm, mã enum); giao diện tự đổi ra chữ ("2 phút trước", "Hai tài khoản..."). Như vậy API không dính vào ngôn ngữ hay múi giờ hiển thị.

### 5.1 React Router: bảng route và route bố cục
- **Ở đâu:** `src/app/router.tsx` (bảng route), `src/main.tsx` (tạo router trình duyệt).
- **Là gì:** một mảng mô tả "đường dẫn nào hiện cái gì". Route `/` có `element: <AppShell />` và các route con; `AppShell` đặt `<Outlet />` ở chỗ muốn hiện trang con. Nhờ vậy khung app vẽ một lần, chỉ phần nội dung đổi khi chuyển trang.

```text
/                 AppShell (khung app)
  (index)         -> chuyển tới /overview (Navigate replace)
  overview, inbox, calendar, ..., more
                  -> trang "đang được dựng" (UI-03 thay /overview)
*                 NotFoundPage (404, NGOÀI khung app)
```

- **`NavLink`:** giống `<a>` nhưng tự gắn `aria-current="page"` khi đường dẫn đang mở. CSS dựa vào thuộc tính đó (`aria-[current=page]:bg-raised`) để tô mục đang chọn, nên không cần tự viết logic "mục nào đang mở".
- **Vì sao bảng route tách khỏi việc tạo router:** test dùng `createMemoryRouter(routes, { initialEntries: ['/calendar'] })` (router giữ đường dẫn trong bộ nhớ, không cần thanh địa chỉ); app thật dùng `createBrowserRouter(routes)` trong `main.tsx`. Cùng một bảng route, hai cách chạy.
- **Bẫy:** `replace` trong `<Navigate to="/overview" replace />` thay mục lịch sử thay vì thêm mục mới; thiếu nó thì bấm "Back" từ `/overview` sẽ về `/` rồi lại bị đẩy sang `/overview`, kẹt mãi.

### 5.2 Khung app co giãn theo kích thước
- **Ở đâu:** `src/app/shell/AppShell.tsx`, `Sidebar.tsx`, `Rail.tsx`, `TabBar.tsx`, `Topbar.tsx`.
- **Breakpoint của Tailwind:** class có tiền tố `md:` chỉ áp từ 768px, `xl:` từ 1280px, đúng mốc `Breakpoints` của canvas. "Mobile trước": class không tiền tố là cho màn nhỏ, rồi ghi đè dần cho màn lớn.

```text
                    < 768px         768-1279px        >= 1280px
Sidebar 248px       hidden          hidden            xl:flex
Rail 72px           hidden          md:flex           xl:hidden
TabBar dưới đáy     (hiện)          md:hidden         md:hidden
lưới AppShell       2 hàng          md:grid-cols-[72px_1fr]   xl:grid-cols-[248px_1fr]
```

- **Vì sao dựng cả ba ngay:** khung app dùng chung cho mọi màn; sửa bố cục về sau tốn công và dễ hỏng hơn làm đúng từ đầu.
- **Bẫy, test không thấy CSS:** jsdom không chạy CSS, nên trong test cả sidebar, rail lẫn thanh dưới đều "hiện" cùng lúc. Test tìm trong từng phần bằng `data-slot` (`shellPart('rail')`). Việc phần nào thật sự hiện ở bề rộng nào thì kiểm trên Chrome thật (mục 5.6).

### 5.3 Dữ liệu của khung app: `ShellData`, dữ liệu mẫu, `useShellData`
- **Ở đâu:** `src/app/shell/shell.types.ts`, `shell.sample.ts`, `useShellData.ts`.
- **Là gì:** `ShellData` gồm tên owner, số tài khoản, các số đếm trên điều hướng, số thông báo chưa đọc, trạng thái đồng bộ. `createShellSample(now)` sinh dữ liệu mẫu theo canvas, mốc thời gian tính theo `now` ("2 phút trước" lúc nào mở cũng đúng). `useShellData()` lấy dữ liệu qua TanStack Query.
- **Vì sao đi qua TanStack Query dù chỉ là dữ liệu mẫu:** khi có API, chỉ đổi `queryFn` từ "trả mẫu" sang "gọi `/api/...`"; cache, trạng thái đang tải và việc tải lại đã có sẵn. `staleTime: Infinity` để dữ liệu mẫu không bị tải lại.
- **Vì sao tách khỏi dữ liệu màn Tổng quan (chốt khi làm):** khung app hiện ở **mọi** màn. Nếu số đếm nằm trong dữ liệu Tổng quan, màn nào cũng phải tải dữ liệu Tổng quan chỉ để vẽ khung.
- **Test nạp sẵn dữ liệu:** `renderApp(path, { shell })` tạo một `QueryClient` mới rồi `setQueryData(SHELL_QUERY_KEY, shell)` trước khi vẽ, nên test đổi được số đếm, tên, trạng thái mà không phải giả hàm nào.

### 5.4 Điều hướng đọc được bằng trình đọc màn hình
- **Ở đâu:** `navItems.ts` (`badgeOf`), các link trong `Sidebar`, `Rail`, `TabBar`.
- **Vấn đề:** link "Hộp thư" với con số 12 đặt cạnh nhau sẽ được đọc thành "Hộp thư12", vô nghĩa. Trên rail chỉ có icon, không có chữ nào để đọc.
- **Cách làm:** con số hiện ra nhưng có `aria-hidden="true"` (trình đọc màn hình bỏ qua); thêm một đoạn chữ `sr-only` (ẩn với mắt, vẫn được đọc): ", 12 chưa đọc". Rail dùng `aria-label="Hộp thư, 12 chưa đọc"`. Số 0 thì không đọc gì thêm.
- **Landmark:** `<nav aria-label="Điều hướng chính">` cho trình đọc màn hình nhảy thẳng tới vùng điều hướng. Ba bản (sidebar, rail, thanh dưới) cùng tên vẫn ổn, vì phần bị `display: none` thì cũng biến khỏi cây trợ năng, lúc nào cũng chỉ còn một.

### 5.5 Thời gian: "2 phút trước" và cái bẫy đồng hồ cũ
- **Ở đâu:** `src/shared/time/relative.ts` (`formatAgo`), `useNow.ts`, `Topbar.tsx`.
- **`formatAgo(from, now)`:** dưới 1 phút "vừa xong", dưới 1 giờ "N phút trước", dưới 1 ngày "N giờ trước", còn lại "N ngày trước"; giờ ở tương lai (đồng hồ hai máy lệch nhau) cũng là "vừa xong". Nhận `now` từ ngoài để test truyền một thời điểm cố định.
- **`useNow()`:** giữ giờ hiện tại trong state và cập nhật mỗi phút, để chữ "2 phút trước" tự thành "3 phút trước".
- **Lỗi thật, ảnh chụp bắt được:** thanh trên hiện "1 phút trước" cho dữ liệu 2 phút. Lý do: `useNow` chốt giờ lúc khung app vừa hiện, còn dữ liệu đến sau đó một chút; phép trừ dùng một "bây giờ" đã cũ, nên sai tới gần một phút (với API thật cũng vậy).
- **Cách sửa sai đầu tiên, và vì sao bỏ:** đọc `new Date()` ngay trong lúc render. Lint báo `react(purity)`: hàm render của React phải **thuần**, cùng đầu vào thì cùng kết quả; React (và React Compiler) dựa vào điều đó để vẽ lại đúng.
- **Cách sửa đúng:** TanStack Query ghi lại thời điểm nhận dữ liệu (`dataUpdatedAt`). Thanh trên lấy mốc **muộn hơn** giữa nhịp đồng hồ và lúc nhận dữ liệu: `new Date(Math.max(clock.getTime(), receivedAt))`. Vừa thuần, vừa đúng.
- **Test tái hiện:** dùng `vi.useFakeTimers({ toFake: ['Date'] })` để điều khiển giờ: khung app hiện lúc 07:00:00, dữ liệu đến lúc 07:00:50 với lần đồng bộ lúc 06:58:50. Bản lỗi hiện "1 phút trước", test đỏ; bản sửa hiện "2 phút trước". **Bẫy trong chính test:** lần viết đầu, dữ liệu nạp sẵn đã hiện đúng chữ "2 phút trước" nên test xanh mà không chứng minh gì; phải cho trạng thái ban đầu hiện chữ khác.

### 5.6 Kiểm chứng UI-01
- **Test viết trước:** 20 test mới đỏ đúng lý do (chưa có sidebar, rail, thanh dưới, thanh trên, tiêu đề trang), viết code xong thì xanh; cuối cùng 32/32.
- **Kiểm tra ngược:** 13 lỗi cố ý, 11 bị bắt ngay. Hai lỗi sống sót đều là **test còn hở**, không phải code tương đương: (1) số 0 vẫn được đọc ", 0 chưa đọc" trên rail và thanh dưới (sidebar vô tình che lỗi vì nó không vẽ số 0); (2) trạng thái IDLE nhưng còn mốc đồng bộ cũ (đã xóa hết tài khoản). Thêm hai test, chạy lại thì cả hai bị bắt. Lần cuối 14/14.
- **Chrome thật** (DevTools Protocol, bản build), 1440 / 1024 / 390px × sáng / tối: mỗi bề rộng chỉ hiện đúng một loại điều hướng, không tràn ngang, Tab qua điều hướng có viền focus, `/calendar` hiện trang "đang được dựng", đường dẫn lạ hiện 404.

### 5.7 Hợp đồng dữ liệu Tổng quan và dữ liệu mẫu (UI-02)
- **Ở đâu:** `src/features/overview/overview.types.ts` (`OverviewData`), `overview.sample.ts`, `useOverview.ts`; bản chép trong `openspec/changes/fe-ui-overview/design.md` kèm bảng "đã có / cần thêm / API mới".
- **Cấu trúc:** `providers` (danh mục provider, lấy từ `GET /api/providers` đã có), `accounts`, rồi năm phần `inbox`, `today`, `syncActivity`, `registrations`, `activity`. Năm phần này **được phép là `null`**: backend chưa làm phần nào thì trả `null`, thẻ đó hiện "Chưa có dữ liệu", các thẻ khác vẫn chạy. Nhờ vậy backend làm `GET /api/overview` được từng phần.
- **Vì sao có `providers` trong dữ liệu:** để giao diện gọi tên "Gmail", "Zalo" theo dữ liệu, không viết cứng. Provider lạ (ví dụ `telegram`) thì viết hoa chữ đầu.
- **Kiểu "hoặc cái này hoặc cái kia" của TypeScript:** `ActivityItem` là một *discriminated union*: mỗi loại hoạt động (`kind`) có trường riêng (`SYNC_RECOVERED` có `downtimeMinutes`, `ACCOUNT_CONNECTED` có `externalAccountId`). Trong `switch (item.kind)`, TypeScript tự biết trường nào có mặt; thêm một loại mới mà quên xử lý thì `tsc` báo lỗi.
- **Dữ liệu mẫu đi theo đồng hồ:** `createOverviewSample(now)` tính mọi mốc thời gian lùi hoặc tiến từ `now` (ví dụ tin nhắn "4 giờ 24 phút trước"). Mở lúc 14:05 thì ra đúng giờ của canvas (09:41, 16:00, "15:00 hôm qua"); mở lúc khác vẫn hợp lý. Test kiểm các ràng buộc: tổng chưa đọc bằng tổng theo nguồn, số trên điều hướng khớp màn Tổng quan, 24 ô cách nhau đúng một giờ.

### 5.8 Giờ và ngày theo múi giờ
- **Ở đâu:** `src/shared/time/local.ts`, các hàm trong `src/features/overview/format.ts`.
- **`Intl.DateTimeFormat`:** công cụ có sẵn của trình duyệt (và Node) để đọc một thời điểm theo **múi giờ** bất kỳ: `formatToParts` trả ra năm, tháng, ngày, giờ, phút, thứ của thời điểm đó tại múi giờ ấy. API gửi giờ UTC; giao diện đổi ra giờ của người dùng.
- **"Ngày lịch" khác "24 giờ":** 23:30 hôm nay và 00:30 ngày mai chỉ cách nhau một giờ nhưng là hai ngày khác nhau. Vì vậy "Hôm qua", "Quá hạn 2 ngày" tính bằng hiệu số ngày lịch tại múi giờ của người dùng (`calendarDaysBetween`), không chia số mili giây cho 86 400 000. Có test riêng cho ca 23:30 / 00:30.
- **Làm tròn có chủ ý:** "N phút trước" làm tròn **xuống** (chưa đủ 2 phút thì vẫn là 1 phút); "sau N giờ" làm tròn **gần nhất** (1 giờ 55 phút là "sau 2 giờ", như canvas).
- **Bẫy, test phụ thuộc múi giờ máy chạy:** máy bạn ở giờ Việt Nam, còn máy CI của GitHub ở UTC; cùng một test sẽ thấy "09:41" ở máy này và "02:41" ở máy kia. `vite.config.ts` đặt `test.env.TZ = 'Asia/Ho_Chi_Minh'` để mọi nơi chạy test cùng một múi giờ. Các hàm định dạng cũng nhận múi giờ làm tham số, nên unit test truyền thẳng vào.
- **Số kiểu Việt Nam:** `(1284).toLocaleString('vi-VN')` cho "1.284" (dấu chấm ngăn hàng nghìn).

### 5.9 Màn Tổng quan: lưới thẻ co giãn (UI-03)
- **Ở đâu:** `src/features/overview/OverviewPage.tsx`, `cards/*.tsx`.
- **Một bộ component, ba bố cục:** canvas có ba artboard (`Dashboard`, `TabletDashboard`, `MobileDashboard`) với bộ thẻ khác nhau. Không viết ba trang riêng; mỗi thẻ nhận class theo breakpoint:

```text
thẻ               mobile (<768)   tablet (768-1279)   desktop (>=1280, 12 cột)
Hộp thư hợp nhất  có               2 cột               7 cột, cao 2 hàng
Hôm nay           có, LÊN ĐẦU      ẩn                  5 cột, cao 2 hàng
Tài khoản         có               1 cột               4 cột
Dịch vụ 24 giờ    ẩn               1 cột               4 cột
Đăng ký           có (thu gọn)     1 cột               4 cột
Hoạt động         ẩn               1 cột               8 cột
Lối tắt           ẩn               ẩn                  4 cột
```

- **`order` của CSS:** trên mobile thẻ Hôm nay lên trước Hộp thư mà không cần đổi thứ tự trong code: class `-order-1 md:order-none` đẩy nó lên đầu lưới chỉ ở màn nhỏ.
- **Mỗi thẻ là một vùng có tên:** `<section aria-labelledby>` trỏ tới tiêu đề `<h2>` của thẻ. Trình đọc màn hình liệt kê được các vùng ("Hộp thư hợp nhất", "Tài khoản"…), và test tìm thẻ đúng cách người dùng tìm: `getByRole('region', { name: 'Tài khoản' })`.
- **Biểu đồ đọc được:** thanh tỷ lệ và biểu đồ cột không có chữ, nên mỗi cái là `role="img"` kèm `aria-label` mô tả bằng lời ("Gmail: 7 chưa đọc, 58%", "Số thư đồng bộ mỗi giờ trong 24 giờ qua. Messenger lỗi lúc 21 giờ, Zalo chậm lúc 13 giờ."). Màu không phải cách duy nhất để biết giờ nào có lỗi.
- **Nút chưa có chức năng:** "Đồng bộ ngay", "Kết nối tài khoản", "Đăng nhập lại", "Xem lại", các lối tắt vẫn là `<button type="button">` thật (bấm Tab tới được, có viền focus), chỉ chưa gắn hành động. Nút dẫn sang màn khác ("Mở hộp thư", "Mở lịch", "Xem tất cả") là `Link` của React Router.
- **Bám canvas, sửa cả phần đã làm:** khi người dùng chốt canvas là thiết kế cuối cùng (2026-10-08), thanh trên của UI-01 được sửa lại: thêm nút "VI" (chưa có chức năng), nút đổi sáng/tối chỉ còn ở desktop, đúng như từng artboard.

### 5.10 Kiểm chứng UI-02 và UI-03
- **Test viết trước:** 29 test định dạng và 6 test dữ liệu mẫu đỏ trước; 11 test của màn Tổng quan đỏ trước (chưa có vùng nào). Cuối cùng 79/79.
- **Kiểm tra ngược:** UI-02, 19 lỗi cố ý, 18 bị bắt ngay; lỗi sống sót ("Hôm qua" cho cả 2 ngày trước) chỉ ra test thiếu ca 2 ngày, thêm vào thì bị bắt. Trước đó tự soát và thêm 2 ca ranh giới mà một lỗi làm tròn sẽ lọt qua (7/4/1 trên 12 làm tròn hay làm tròn xuống đều ra 58/33/8). UI-03, 15 lỗi, 14 bị bắt; lỗi sống sót là do **chính lỗi cố ý viết sai** (`history.pushState` không đi qua React Router nên ở app thật cũng không chuyển trang); viết lại bằng `useNavigate` thì bị bắt. Bài học: trước khi kết luận "test hở", kiểm xem lỗi cố ý có thực tế không.
- **Đồng hồ cố định trên Chrome thật:** qua DevTools Protocol, đặt múi giờ `Asia/Ho_Chi_Minh` (`Emulation.setTimezoneOverride`) và chèn một đoạn script chạy trước trang (`Page.addScriptToEvaluateOnNewDocument`) làm `Date` luôn bắt đầu từ 14:05 thứ Sáu 02/10/2026. Dữ liệu mẫu vì thế ra đúng giờ của canvas, và ảnh chụp so được trực tiếp với ảnh artboard người dùng gửi: cùng giờ, cùng nội dung, cùng bố cục, ở 1440px tối và sáng, 1024px và 390px.

## 6. Màn Tài khoản (fe-ui-accounts)

### 6.0 Bức tranh: hai trang, một nguồn dữ liệu
- **Phạm vi (D-45, D-46, người dùng 2026-10-08):** trang danh sách `/accounts` và trang chi tiết `/accounts/:accountId`, trên desktop, tablet và mobile. Tìm, lọc, mở chi tiết, bật/tắt kênh và ngắt kết nối **chạy thật trên dữ liệu mẫu** trong cache của TanStack Query (tải lại trang thì mất). Luồng kết nối 5 bước làm sau, cùng API bắt đầu kết nối (BE-31).
- **Dữ liệu nằm ở đâu:** mỗi mục trong cache có một "khóa" (query key). Trang nào cần gì thì đọc khóa đó; mỗi thay đổi đi qua một mutation và sửa đúng các khóa liên quan.

```text
cache (TanStack Query)
  ['accounts']                  danh sách: AccountsData
  ['accounts', id, 'extras']    phần thêm của 1 tài khoản: quyền, website, lịch sử, hoạt động
  ['shell']                     số đếm trên điều hướng
  ['overview']                  màn Tổng quan

trang danh sách  đọc ['accounts']
trang chi tiết   đọc ['accounts'] (hàng của tài khoản) + ['accounts', id, 'extras']

useSetChannel        sửa ['accounts']
useDisconnectAccount sửa ['accounts'], ['shell'], ['overview'], xóa ['accounts', id, 'extras']
```

### 6.1 Tab "Thêm" và trang con trên mobile: `handle` của route (AC-01)
- **Ở đâu:** `src/app/shell/navItems.ts` (`MORE_PATHS`), `TabBar.tsx`, `AppShell.tsx` (`ShellHandle`), `MobilePageHeader.tsx`, `src/app/router.tsx`.
- **Tab "Thêm":** trên mobile, Tài khoản, Ghi chú, Dịch vụ, Cài đặt… nằm dưới tab "Thêm" (canvas `MobileMore`). Tab này sáng khi đường dẫn **bằng hoặc bắt đầu bằng** một đường dẫn trong `MORE_PATHS` (`/accounts` và `/accounts/acc-gmail` đều tính).
- **`handle` là gì:** một object tùy ý gắn vào route trong bảng route. Khung app đọc `handle` của mọi route đang khớp bằng `useMatches()` và gộp lại. Trang danh sách khai báo `{ mobilePageHeader: true }`: khung app ẩn thanh trên của mobile, vì trang tự vẽ đầu trang có nút quay lại. Trang chi tiết thêm `hideTabBar: true`: không có thanh dưới, đúng như canvas `MobileAccountDetail`.

```text
route /accounts            handle { mobilePageHeader }
route /accounts/:accountId handle { mobilePageHeader, hideTabBar }
        |
AppShell: useMatches() -> gộp handle
  mobilePageHeader -> thanh trên của khung app: max-md:hidden
  hideTabBar       -> không vẽ TabBar
```

- **Vì sao không để trang tự ẩn khung app:** trang nằm **bên trong** khung app (`<Outlet />`), không với ra ngoài được. `handle` để trang "khai báo nhu cầu", còn khung app quyết định, nên dòng chảy vẫn một chiều từ ngoài vào trong.
- **Đầu trang con dính ở mép trên:** `sticky top-0` giữ nó đứng yên khi danh sách cuộn, như `mob-top` của canvas.
- **Bẫy, landmark:** `<header>` nằm trong `<main>` không phải landmark "banner" (chỉ `<header>` cấp trang mới là banner). Test không tìm được nó bằng `getByRole('banner')`, nên tìm qua tiêu đề `h1` của nó rồi `closest('header')`.

### 6.2 Hộp thoại dùng chung `Dialog` (AC-01, dùng ở AC-04)
- **Ở đâu:** `src/shared/ui/dialog.tsx`, `src/features/accounts/components/DisconnectDialog.tsx`.
- **Radix Dialog tự làm gì:** vẽ hộp thoại vào cuối `<body>` (portal) để không bị khung cha cắt; **giữ focus bên trong** (Tab đi vòng giữa các nút của hộp, không lọt ra trang phía sau); Esc đóng; gắn tên cho hộp từ `DialogTitle`; đóng xong thì **trả focus về nút đã mở nó**.
- **Vì sao viết tay thay vì `shadcn add dialog`:** lệnh đó đòi ghi đè `button.tsx` (Dialog dùng Button) và sẽ xóa phần đã chỉnh theo canvas. Mã được lấy từ `--dry-run --view` rồi viết lại, giữ Button đã chỉnh.
- **Vì sao trang chi tiết có hai hộp thoại:** có hai nút mở, một của desktop, một của mobile; luôn có một nút bị ẩn bằng CSS. Mỗi nút gắn một hộp riêng (`DialogTrigger` của nó). Nếu dùng chung một hộp, Radix có thể ghi nhớ nút đang bị ẩn làm "nút mở", và lúc đóng không trả focus về đâu được, người dùng bàn phím mất chỗ đứng.
- **An toàn khi xóa:** công tắc "Xóa luôn tin nhắn đã lưu" về **tắt** mỗi khi hộp đóng mà không xác nhận, để lần mở sau không mang theo một lựa chọn nguy hiểm đã hủy.

### 6.3 Gom phần dùng chung trước khi viết màn thứ hai (AC-02)
- **Ở đâu:** `src/shared/domain.ts` (`Instant`, `ProviderType`, `AccountStatus`, `ProviderInfo`), `src/shared/format.ts` (`formatCount`, `foldText`, `providerNameOf`, `methodLabel`), `src/shared/time/local.ts` (`formatDate`, `formatSince`).
- **Vì sao:** kiểu trạng thái tài khoản, tên provider, số kiểu "1.284" là của **cả hai** màn Tổng quan và Tài khoản. Để trong `features/overview` thì màn Tài khoản phải phụ thuộc màn Tổng quan, hoặc chép lại. Chép thì hai bản sẽ lệch nhau.
- **Kiểm chứng "không đổi hành vi":** tách xong, toàn bộ 86 test cũ vẫn xanh trước khi viết dòng nào của màn mới.
- **`foldText` (tìm không dấu):** `"Nguyễn Đức"` thành `"nguyen duc"`. `normalize('NFD')` tách chữ có dấu thành chữ gốc cộng dấu rời (`ễ` = `e` + dấu mũ + dấu ngã); bỏ mọi dấu rời bằng `/\p{M}/gu`; rồi viết thường. **Bẫy:** `đ` không phải "d + dấu" trong Unicode mà là một chữ riêng, NFD không tách được, nên phải thay riêng `đ`/`Đ` thành `d`/`D`.

### 6.4 Một tài khoản chỉ nằm một chỗ trong cache (AC-02)
- **Ở đâu:** `src/features/accounts/useAccounts.ts` (`useAccounts`, `useAccount`), `accounts.types.ts` (`AccountsData`, `AccountItem`, `AccountExtras`).
- **Là gì:** trang chi tiết **không** tải lại tài khoản. Nó lấy hàng của tài khoản từ danh sách đã có, và chỉ tải riêng phần thêm (`AccountExtras`).
- **Để làm gì:** bật/tắt một kênh ở trang chi tiết chỉ sửa **một chỗ**, và cột "Dịch vụ" ngoài danh sách tự đổi theo. Nếu chi tiết giữ bản sao riêng, mỗi thay đổi phải sửa hai bản, quên một bản là hai trang hiện hai số khác nhau.
- **Làm khác kế hoạch:** thiết kế ban đầu có `AccountDetailData` chứa cả tài khoản; đã đổi và ghi lý do trong `tasks.md`.
- **Bẫy 1, "không tìm thấy" quá sớm:** lúc danh sách còn đang tải, `account` cũng là `undefined`. Nếu kết luận "không tìm thấy" ngay, trang sẽ chớp thông báo lỗi trước khi hiện đúng. Vì vậy `notFound = list !== undefined && account === undefined`.
- **Bẫy 2, gọi API vô ích:** phần thêm chỉ tải khi tài khoản có thật (`enabled: account !== undefined`); với `id` lạ thì không gửi yêu cầu nào.

### 6.5 Mutation: cập nhật lạc quan và trả lại khi lỗi (AC-02)
- **Ở đâu:** `useAccounts.ts` (`useSetChannel`, `useDisconnectAccount`, `withChannel`, `withoutAccount`), `accounts.api.ts`.
- **Cập nhật lạc quan (optimistic update):** công tắc đổi **ngay khi bấm**, không chờ server trả lời; nếu lưu lỗi thì trả về chỗ cũ. Với TanStack Query:

```text
bấm công tắc
  onMutate:   chụp lại danh sách hiện tại (previous)
              ghi danh sách mới vào cache  -> giao diện đổi ngay
  mutationFn: gửi lên server (hiện tại: dữ liệu mẫu, không gửi gì)
  onError:    ghi lại previous vào cache   -> công tắc về chỗ cũ
```

- **Vì sao với công tắc thì lạc quan, còn ngắt kết nối thì không:** công tắc sai thì trả lại được, người dùng thấy ngay; ngắt kết nối là việc lớn, phải chờ server xác nhận rồi mới bỏ tài khoản và chuyển trang.
- **Hàm thuần `withChannel`, `withoutAccount`:** nhận dữ liệu cũ, **trả object mới**, không sửa object cũ. React và TanStack Query so sánh bằng tham chiếu: sửa thẳng object cũ thì "trước" và "sau" là cùng một object, màn hình có thể không vẽ lại, và bản chụp `previous` để trả lại cũng bị sửa theo. Test kiểm cả việc dữ liệu đầu vào còn nguyên.
- **`accounts.api.ts`, chỗ duy nhất đổi khi nối API:** bốn hàm `fetchAccounts`, `fetchAccountExtras`, `saveChannel`, `deleteAccount`, hiện trả dữ liệu mẫu. Nối API thật thì chỉ sửa thân bốn hàm này.
- **Test giả lỗi mạng:** `vi.mock('./accounts.api', ...)` thay riêng `saveChannel` bằng một hàm giả, rồi `mockRejectedValueOnce(new Error('offline'))` cho lần gọi đầu thất bại. Test kiểm công tắc trở về bật.

### 6.6 Trang danh sách: bảng ARIA và liên kết phủ cả hàng (AC-03)
- **Ở đâu:** `src/features/accounts/AccountsPage.tsx`, `components/AccountsTable.tsx`, `components/MobileAccountList.tsx`, `src/shared/ui/segmented.tsx`.
- **Bảng bằng vai trò ARIA:** canvas vẽ bảng bằng `div` lưới CSS. Thêm `role="table"`, `row`, `columnheader`, `cell` để trình đọc màn hình biết đây là bảng, đi được theo hàng và cột, đọc tên cột kèm từng ô. Test cũng tìm "hàng có `an.nguyen@gmail.com`" bằng `getByRole('row', { name: /an\.nguyen@gmail\.com/ })`.
- **Liên kết phủ cả hàng (stretched link):**

```text
<div role="row" class="relative ...">       <- hàng là mốc định vị
  ... các ô ...
  <a href="/accounts/acc-gmail"
     aria-label="Mở chi tiết tài khoản Gmail an.nguyen@gmail.com"
     class="after:absolute after:inset-0">  <- lớp ::after phủ kín hàng
    (mũi tên)
  </a>
</div>
```

  Bấm vào đâu trên hàng cũng trúng lớp phủ của liên kết. Phím Tab chỉ dừng **một lần** mỗi hàng, tên đọc ra rõ ràng. Gắn `onClick` cho cả hàng thì chuột bấm được nhưng bàn phím và trình đọc màn hình không biết hàng bấm được.
- **Tìm và lọc:** chữ đang gõ và nút lọc là `useState` của trang; danh sách hiện ra là `filterAccounts(accounts, { query, filter }, nameOf)`, một hàm thuần đã có test riêng. Dòng đầu "TÀI KHOẢN · 3 ĐÃ KẾT NỐI" luôn đếm **tất cả**, không đếm theo kết quả lọc.
- **Nút lọc `Segmented` (canvas `.seg`):** mỗi nút có `aria-pressed="true|false"`, trình đọc màn hình đọc "đã nhấn" cho nút đang chọn.
- **Mobile dùng lại trạng thái của thẻ Tổng quan:** "Ổn định", thanh 64%, "Quyền hết hạn từ 21:04 hôm qua" do cùng hàm `accountStatusView` tạo ra, nên hai màn luôn nói giống nhau.
- **Tablet (canvas không vẽ):** giữ đủ 7 cột; bảng rộng tối thiểu 896px, hẹp hơn thì bảng **cuộn ngang trong khung của nó**, cả trang không cuộn.

### 6.7 Bẫy `position: absolute` thoát khỏi khung cuộn (AC-03)
- **Triệu chứng:** ở 768px cả trang cuộn ngang được, dù bảng đã có khung `overflow-x-auto`. Test trong jsdom không thấy (jsdom không tính bố cục); chỉ Chrome thật mới lộ ra.
- **Nguyên nhân:** tiêu đề cột cuối có chữ ẩn "Chi tiết" với class `sr-only`, mà `sr-only` dùng `position: absolute`. Một phần tử absolute chỉ bị khung cha **cắt** khi khung đó (hoặc một cha nằm giữa) có `position`. Khung cuộn của bảng chưa có, nên chữ ẩn "thoát" ra, nằm ngoài mép phải và kéo giãn cả trang.
- **Cách tìm:** liệt kê mọi phần tử có mép phải vượt bề rộng cửa sổ; trong danh sách có `SPAN.sr-only`.
- **Cách sửa:** thêm `relative` cho khung cuộn. Bài học: `overflow` cắt con thường, nhưng con `absolute` thì còn tùy "khối chứa" của nó.

### 6.8 Test chập chờn: đo trước khi sửa (AC-03)
- **Triệu chứng:** test "opens the inbox, the calendar and the notifications" của màn Tổng quan thỉnh thoảng đỏ (3 trên 27 lần chạy cả bộ), không đổi dòng code nào. Lỗi: không tìm thấy liên kết "Mở lịch" sau khi quay về `/overview`.
- **Giả thuyết đầu tiên:** truy vấn `findByRole` chậm vì phải tính tên đọc được của mọi phần tử. **Số đo nói khác:** truy vấn cả màn chỉ mất khoảng 26ms; thứ tốn thời gian là React **vẽ lại cả màn** sau khi điều hướng: 260–380ms, và lâu hơn khi 15 file test chạy song song làm máy bận. Khi vượt 1 giây (mức chờ mặc định của `findBy…`), test đỏ.
- **Cách sửa:** `configure({ asyncUtilTimeout: 3000 })` trong `src/test/setup.ts`. Không che lỗi thật: phần tử không bao giờ xuất hiện thì test vẫn đỏ, chỉ đỏ sau 3 giây thay vì 1 giây. Sau khi sửa: 0/12 lần đỏ.
- **Bài học:** với lỗi chập chờn, đo trước rồi mới sửa. Nếu tin giả thuyết đầu, cách sửa sẽ là "thu hẹp truy vấn", vừa tốn công vừa không chữa được.

### 6.9 Trang chi tiết: thẻ có tên, công tắc, phần rỗng (AC-04)
- **Ở đâu:** `src/features/accounts/AccountDetailPage.tsx`, `components/SectionCard.tsx`, `components/Channels.tsx`, `components/DetailCards.tsx`, `components/MobileAccountDetail.tsx`.
- **Lưới 12 cột, thẻ 7/5 như canvas:** `grid-cols-12`, thẻ `col-span-7` và `col-span-5` xen nhau. Mỗi thẻ là `<section aria-labelledby>` trỏ tới `<h2>` của nó, nên là một vùng có tên ("Kênh đã kết nối", "Quyền đã cấp"…).
- **Công tắc kênh:** `Switch` của Radix có `role="switch"` và `aria-checked`; trình đọc màn hình đọc "Thư đến, công tắc, bật". Kênh cần thêm quyền thì `disabled`. Kênh của tài khoản hết quyền mà đang bật thì hiện nhãn "Tạm dừng" thay cho công tắc (canvas mobile).
- **Phần chưa có dữ liệu:** `scopes`, `sites`, `syncRuns`, `activity` có thể là `null`; thẻ tương ứng ghi "Chưa có dữ liệu", các thẻ khác vẫn hiện. Mở Zalo (dữ liệu mẫu để trống cả bốn phần) để xem.
- **Tiêu đề thanh trên ở tablet:** khung app tìm tiêu đề theo **tiền tố** đường dẫn, nên `/accounts/acc-gmail` vẫn ghi "Tài khoản".
- **Bẫy trong test, dữ liệu tải sau:** phần thêm đến **sau** lần vẽ đầu (một `Promise`). Đọc ngay bằng `getByText` thì chưa có gì; phải dùng `findByText` để chờ.

### 6.10 Kiểm chứng AC-01…AC-04
- **Test viết trước, mỗi task:** AC-01 3 test khung app đỏ trước; AC-02 16 test hàm chữ cộng 11 test dữ liệu mẫu và hook đỏ trước; AC-03 10/10 test trang đỏ trên trang rỗng; AC-04 4 test hàm chữ cộng 12/12 test trang đỏ trước. Cuối cùng 148/148.
- **Kiểm tra ngược:** AC-01 8/8 bị bắt; AC-02 60/60; AC-03 25 lỗi, 23 bị bắt, 2 lọt (dòng đầu đếm theo kết quả lọc; danh sách mobile bị lọc theo), thêm kiểm tra thì bị bắt; AC-04 42 lỗi, 41 bị bắt, 1 lọt (công tắc nào cũng gửi kênh "Thư đến", vì test chỉ bấm đúng "Thư đến"), thêm test bấm "Gửi thư" thì bị bắt.
- **Chrome thật** (đồng hồ cố định 14:05): 1440 / 1024 / 768 / 390px × sáng / tối cho cả hai trang; không trang nào cuộn ngang; Tab tới nút mở chi tiết có viền 2px; bấm giữa hàng mở chi tiết; hộp thoại giữ focus, Esc trả focus về nút mở; xác nhận ngắt kết nối về danh sách còn 2 tài khoản.
- **Bẫy của script kiểm tra:** gửi phím Enter qua DevTools Protocol mà thiếu `text: '\r'` thì Chrome không coi là bấm nút, hộp thoại không mở. Lỗi nằm ở script, không phải ở trang: trước khi sửa trang, kiểm xem công cụ đo có đúng không.

## 7. Luồng kết nối tài khoản (fe-ui-connect)

### 7.0 Bức tranh: đi rồi về
- **Ở đâu:** `src/features/accounts/components/ConnectWizard.tsx`, `ConnectError.tsx`, `connect.types.ts`, `connect.format.ts`, `connect.sample.ts`, `useConnect.ts`, `accounts.api.ts`, `AccountsPage.tsx`.
- **Là gì:** hộp thoại 5 bước của canvas `ConnectWizard`, mở từ "Kết nối tài khoản" và "Đăng nhập lại". Phần giữa của luồng **không** nằm trong Sino: người dùng rời Sino sang trang của Google, rồi Google gửi họ về.

```text
"Kết nối tài khoản" -> 1 Nhà cung cấp -> 2 Quyền -> 3 Đăng nhập
"Đăng nhập lại"     -> /accounts?reconnect=id -----> 2 Quyền (kèm accountId)
                                   3: POST /api/accounts/connect/{provider} -> { authorizationUrl }
                                      window.location.assign(authorizationUrl)   (rời Sino)
                         ... trang của Google: chọn tài khoản, đồng ý quyền ...
backend callback -> 302 /accounts?connected=id      -> 4 Đồng bộ -> 5 Xong
                 -> 302 /accounts?connectError=CODE -> cảnh báo + "Thử lại"
```

- **Dữ liệu mẫu đóng vai cả Google:** `startConnect` mẫu trả `authorizationUrl = /accounts?connected=acc-gmail`, nên trên trình duyệt thật vòng "đi rồi về" chạy đủ mà không cần Google. Khi nối API (FE-30 của F04a), chỉ đổi thân các hàm trong `accounts.api.ts`.

### 7.1 Khi canvas và backend vênh nhau (D-47…D-50)
- **Chuyện gì:** canvas vẽ cửa sổ bật lên (popup) của Google, xem lại quyền **sau** khi đăng nhập, có công tắc "Gửi thư · tùy chọn" và bước chọn khoảng đồng bộ. Backend F04a (người dùng đã duyệt) chuyển **cả trang**, xin quyền **ngay trong** yêu cầu gửi sang Google, chỉ xin quyền đọc (gửi để F10), và để F04b chốt cửa sổ nhập thư.
- **Cách chọn (agent chốt theo ủy quyền, ghi ở `design.md` để người dùng xem lại):** giữ luồng backend, giao diện theo canvas nhiều nhất có thể.
  - **D-47:** đổi thứ tự: Quyền lên trước Đăng nhập. Quyền đã cấp ở Google rồi thì "xem lại" không còn quyết định được gì.
  - **D-48:** bỏ công tắc "Gửi thư": hiện một lựa chọn không có thật còn tệ hơn không hiện.
  - **D-49:** giữ bước Đồng bộ như một **đề xuất có hình dạng cụ thể** cho F04b (khoảng 30 / 90 / toàn bộ, ước tính số thư).
  - **D-50:** provider chưa có luồng kết nối hiện "Sắp có" theo dữ liệu `connectable`, không viết cứng.
- **Bài học:** khi bản vẽ và hợp đồng đã duyệt mâu thuẫn, không âm thầm làm theo một bên. Ghi rõ chỗ khác, phương án bị loại, và cái giá nếu đổi ý (ở đây: chỉ phần web phải sửa).

### 7.2 Rời trang và quay về
- **`leaveTo(url)`** (`accounts.api.ts`) gọi `window.location.assign(url)`: trình duyệt tải trang mới, toàn bộ state của React mất. Vì vậy mọi thứ cần biết khi quay về phải nằm **trong URL** (`?connected=id`) hoặc ở server, không nằm trong bộ nhớ.
- **Vì sao bọc trong một hàm riêng:** jsdom không chuyển trang được; test thay `leaveTo` bằng hàm giả (`vi.mock`) rồi kiểm nó được gọi với đúng địa chỉ.
- **Xóa tham số sau khi đọc:** `setSearchParams(..., { replace: true })`. `replace` thay mục lịch sử hiện tại thay vì thêm mục mới. Nếu không xóa, tải lại trang sẽ mở lại hộp thoại hoặc hiện lại lỗi; nếu xóa mà không `replace`, nút "Back" sẽ đưa người dùng về đúng địa chỉ có tham số và mọi chuyện lặp lại.

### 7.3 State của hộp thoại là union theo bước
- **Ở đâu:** `WizardState` trong `ConnectWizard.tsx`.

```text
{ step: 1 | 2 | 3, provider, accountId }   trước khi rời Sino
{ step: 4, accountId, options }            sau khi về: tùy chọn đồng bộ
{ step: 5, accountId, status }             đã bắt đầu đồng bộ: tiến độ
```

- **Vì sao không gom hết vào một object nhiều trường tùy chọn:** mỗi bước chỉ có đúng những trường nó cần; TypeScript báo lỗi nếu bước 5 thiếu `status`, hay bước 4 lỡ đọc `provider`.
- **Bẫy, thu hẹp kiểu:** `state.step <= 3 ? state.provider : ...` bị `tsc` báo lỗi, vì TypeScript chỉ thu hẹp union qua so sánh **bằng** (`===`) hoặc kiểm thuộc tính, không qua `<=`. Sửa: `'provider' in state`.

### 7.4 Đặt state theo URL mà không dùng effect
- **Cách đầu và vì sao bỏ:** đọc `?reconnect` trong `useEffect` rồi `setWizard(...)`. Lint `react(set-state-in-effect)` báo: effect chạy **sau** khi vẽ, đặt state xong React phải vẽ lại thêm một lần (vẽ dây chuyền); effect nên dành cho việc đồng bộ với hệ thống bên ngoài.
- **Cách đúng, "điều chỉnh state khi đầu vào đổi":** mỗi lượt điều hướng có một `location.key` riêng. Trang nhớ key đã xử lý; gặp key mới thì **ngay lúc render** đọc tham số và đặt state (React cho phép gọi `setState` trong render nếu có điều kiện chặn như vậy). Effect chỉ còn làm việc với hệ thống bên ngoài: xóa tham số khỏi URL.
- **Lợi thêm:** bấm "Đăng nhập lại" của cùng một tài khoản lần thứ hai vẫn mở hộp thoại, vì đó là một lượt điều hướng mới (key mới). Có test cho đúng ca này.

### 7.5 Nút chọn và ô chọn theo canvas, vẫn là phần tử gốc
- **Nhóm nút chọn nhà cung cấp:** `<input type="radio">` thật, `appearance-none` để tự vẽ vòng tròn, `checked:border-[5px]` cho chấm đặc; thẻ bao ngoài đổi viền bằng `has-checked:` (CSS `:has()`). Nhờ là radio thật: cả nhóm chỉ là **một điểm dừng** của phím Tab, mũi tên lên/xuống đổi lựa chọn, `disabled` làm "Sắp có" không chọn được, trình đọc màn hình đọc đúng "nút chọn, 1 trên 5".
- **Ô "Đồng bộ thư từ":** `<select>` thật với `appearance-none` và mũi tên vẽ thêm; nhãn gắn bằng `htmlFor` + `useId` nên test tìm được `getByRole('combobox', { name: 'Đồng bộ thư từ' })`.
- **Công tắc có nhãn:** `<label>` bọc `Switch`; nút `role="switch"` lấy tên từ chữ trong nhãn, bấm vào chữ cũng gạt được.

### 7.6 Kiểm chứng CN-01…CN-03
- **Test viết trước:** CN-01 16 test đỏ; CN-02 10 test đỏ (8 mới, 2 test cũ phải đổi vì "Đăng nhập lại" thành liên kết); CN-03 7 test đỏ. Cuối cùng 180/180.
- **Kiểm tra ngược:** CN-01 28 lỗi, 25 bị bắt ngay, 2 lọt do thiếu ca (chữ bước 3 với danh tính khác "Google"; khoảng đồng bộ khác 90 ngày), 1 lỗi gài viết sai cú pháp làm cả file test không chạy (script tưởng là "lọt"; đọc kỹ thì số test chạy bị hụt). CN-02 25 lỗi, 24 bị bắt, 1 lọt ("Quay lại" ở bước 3). CN-03 23 lỗi, 22 bị bắt; lỗi lọt nằm ở một đoạn chặn **không bao giờ chạy tới**, nên đoạn đó bị bỏ thay vì viết test cho một tình huống không có thật.
- **Chrome thật:** vòng đầy đủ: bước 1–3, `window.location.assign` thật, quay về `/accounts` không còn tham số, hộp thoại tự mở ở bước 4, chọn 30 ngày thì ước tính đổi, bước 5 có tiến độ và danh sách phía sau đổi theo; 1440 / 390px × sáng / tối; Tab đi vòng trong hộp thoại.
- **Bẫy lint "fast refresh":** file component export thêm một hằng số (`DEFAULT_SYNC_OPTIONS`) thì Vite không tải lại nóng component được (`react(only-export-components)`); hằng số chuyển sang `connect.types.ts`.

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
12. Vì sao phải kiểm khóa trước khi so mật khẩu?
13. Nếu bộ đếm bỏ cả những email đang bị khóa khi bảng đầy, kẻ tấn công làm được gì?
14. Vì sao code dùng một bean `Clock` thay vì gọi thẳng `Instant.now()`?
15. Module test của `account` không nạp `common`. Vì sao trước BE-29 điều đó không gây lỗi, còn sau BE-29 thì có?
16. Vì sao đặt proxy ở Vite thay vì bật CORS ở Spring? Hai origin khác nhau ở chỗ nào khi chỉ khác cổng?
17. `pnpm-lock.yaml` khác `package.json` ở đâu, và vì sao CI dùng `--frozen-lockfile`?
18. Vì sao pnpm chặn script cài đặt của thư viện, và `allowBuilds: msw: false` nói điều gì?
19. Design token chia hai lớp (biến của canvas, rồi `@theme inline`) để được lợi gì?
20. Nếu bỏ `try/catch` quanh `localStorage`, người dùng nào sẽ gặp lỗi và lỗi trông ra sao?
21. Vì sao Testing Library tìm nút theo vai trò và tên (`getByRole`) thay vì theo class?
22. Component shadcn dùng `data-checked:` mà CSS chưa định nghĩa variant đó thì chuyện gì xảy ra, và vì sao khó phát hiện?
23. Vì sao `pnpm build` phải chạy `tsc -b` trước `vite build`?
24. Nút có `outline-none` và `focus-visible:outline-2` mà vẫn không hiện viền khi bấm Tab. Vì sao, và kiểm lỗi này bằng cách nào?
25. Vì sao `cn('shadow-popover', 'shadow-none')` giữ cả hai class, và wrapper trong `src/shared/lib/utils.ts` sửa điều đó thế nào?
26. "Hợp đồng dữ liệu" của một màn là gì, và vì sao API nên trả dữ liệu thô thay vì chữ đã định dạng?
27. Route bố cục với `<Outlet />` giúp gì? Vì sao 404 nằm ngoài khung app?
28. Vì sao `<Navigate to="/overview" replace />` cần `replace`?
29. Vì sao trong test cả sidebar, rail và thanh dưới đều "hiện", và test xử lý chuyện đó thế nào?
30. Con số 12 cạnh chữ "Hộp thư" được trình đọc màn hình đọc ra sao nếu không làm gì, và `aria-hidden` + `sr-only` sửa thế nào?
31. Vì sao đọc `new Date()` ngay trong render là sai, và `dataUpdatedAt` giải quyết lỗi "1 phút trước" thế nào?
32. Một lỗi cố ý sống sót nói lên điều gì? Hai lỗi sống sót ở UI-01 là gì?
33. Vì sao các phần của `OverviewData` được phép là `null`, và màn hiện gì khi một phần là `null`?
34. Vì sao "Hôm qua" phải tính bằng ngày lịch theo múi giờ, không phải "cách đây 24 giờ"?
35. Vì sao test đặt `TZ = Asia/Ho_Chi_Minh`? Không đặt thì chuyện gì xảy ra trên CI?
36. Làm sao một bộ component hiện ba bộ thẻ khác nhau cho desktop, tablet, mobile, và đưa thẻ Hôm nay lên đầu trên mobile?
37. Vì sao biểu đồ cột có `role="img"` và `aria-label`?
38. Ở UI-03, lỗi cố ý "lối tắt chuyển trang bằng `history.pushState`" sống sót. Vì sao đó không phải lỗ hổng của test?
39. Route `handle` dùng để làm gì, và vì sao khung app gộp `handle` của mọi route đang khớp thay vì để trang tự ẩn thanh trên?
40. Vì sao `<header>` của trang con nằm trong `<main>` không phải landmark "banner", và test tìm nó bằng cách nào?
41. Radix Dialog tự làm những gì cho người dùng bàn phím? Vì sao trang chi tiết có hai hộp thoại thay vì một?
42. `foldText("Nguyễn Đức")` ra gì? Vì sao phải thay riêng chữ "đ"?
43. Vì sao trang chi tiết lấy tài khoản từ cache của danh sách thay vì tải riêng? Lợi gì khi bật/tắt kênh?
44. Vì sao `notFound` chỉ được đúng khi danh sách đã tải xong?
45. Cập nhật lạc quan là gì? Nếu lưu lỗi thì chuyện gì xảy ra, và test giả lỗi mạng thế nào?
46. Vì sao `withChannel` phải trả object mới thay vì sửa thẳng object cũ?
47. Liên kết phủ cả hàng hoạt động thế nào, và vì sao tốt hơn gắn `onClick` cho cả hàng?
48. Vì sao chữ ẩn `sr-only` làm cả trang cuộn ngang ở 768px, và vì sao thêm `relative` cho khung cuộn thì hết?
49. Test chập chờn ở màn Tổng quan: giả thuyết đầu là gì, số đo nói gì, và vì sao nâng thời gian chờ không che lỗi thật?
50. Ở AC-04, lỗi cố ý "công tắc nào cũng gửi kênh Thư đến" sống sót. Test đã hở chỗ nào, và sửa thế nào?
51. Vì sao bước "Quyền" phải đứng trước bước "Đăng nhập" trong luồng chuyển trang của F04a?
52. `window.location.assign` khác điều hướng của React Router ở chỗ nào? Vì sao thông tin cần khi quay về phải nằm trong URL?
53. Vì sao xóa `?connected` khỏi URL phải dùng `replace: true`? Không xóa, hoặc xóa mà không `replace`, thì chuyện gì xảy ra?
54. `WizardState` là union theo bước. Vì sao `state.step <= 3 ? state.provider : …` bị `tsc` báo lỗi, và sửa thế nào?
55. Vì sao đọc tham số URL rồi `setState` trong `useEffect` bị lint báo? Cách dùng `location.key` khác gì, và vì sao nó còn đúng khi bấm cùng một liên kết hai lần?
56. Vì sao nhóm chọn nhà cung cấp dùng `<input type="radio">` thật thay vì `div` bấm được? Kể ba thứ người dùng bàn phím và trình đọc màn hình được hưởng.
