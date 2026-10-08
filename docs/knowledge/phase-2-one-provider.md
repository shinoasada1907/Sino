# Kiến thức Phase 2 — Một provider thật: Gmail

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F04a, `openspec/changes/f04a-gmail-connect` (kết nối Gmail bằng OAuth2). Đang làm: xong BE-30, BE-31.
> **Cập nhật:** 2026-10-08. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

---

## 0. Bức tranh: kết nối một Gmail vào Sino

Sino không bao giờ biết mật khẩu Gmail của bạn. Google hỏi bạn có đồng ý cho Sino đọc thư không, rồi đưa cho Sino một **token** (giấy phép có hạn). Đó là OAuth2.

```text
Web: bấm "Thêm Gmail"
  -> POST /api/accounts/connect/gmail
     <- authorizationUrl (kèm state + PKCE)        BE-31
trình duyệt sang Google: chọn tài khoản, đồng ý
  -> Google gọi về /api/accounts/connect/gmail/callback?code&state
     server: đổi code lấy token, hỏi "đây là ai",
             lưu account + token đã mã hóa          BE-32
     <- 302 về /accounts?connected=...
Xóa account -> báo Google thu hồi token             BE-33
```

| Quyết định | Nội dung |
|---|---|
| D-15 = A' | Module `account` giữ token và tự refresh (làm ở F04b) |
| C5 | Đường dẫn `/api/accounts/connect/{provider}` |
| D-37 | Tách F04: F04a lấy quyền, F04b đọc thư |
| D-38 | Luồng OAuth2 do Sino viết, dùng linh kiện cấp thấp của Spring |
| D-39 | Giả lập Google trong test bằng WireMock |
| D-40 | Google project: Testing khi dev, "In production" không thẩm định khi dùng thật |
| D-41 | Backend F04a làm song song với web của Phase 1 |

| Task | Đã làm | Trạng thái |
|---|---|---|
| BE-30 | SPI `oauth2()`, connector Gmail khung, cấu hình Google, WireMock | xong |
| BE-31 | Bắt đầu kết nối: `POST /api/accounts/connect/{provider}`, state + PKCE trong session | xong |
| BE-32…BE-34 | Callback, thu hồi khi xóa, thử với Google thật | chưa làm |
| FE-30 | Nút "Thêm Gmail", "Kết nối lại" | chưa làm |

---

## 1. Connector khai báo cách kết nối, không tự làm (BE-30)

### 1.1 Method mặc định trong interface: `oauth2()`
- **Ở đâu:** `provider/spi/MessageProvider.java`, `provider/spi/OAuth2Connection.java`.
- **Là gì:** `default Optional<OAuth2Connection> oauth2()` là một method có sẵn thân hàm ngay trong interface (từ Java 8). Connector nào không ghi đè thì nhận kết quả mặc định: `Optional.empty()`, nghĩa là "tôi không kết nối bằng OAuth2".
- **Để làm gì:** thêm khả năng mới vào contract mà **không phải sửa** các connector cũ (connector giả trong test vẫn chạy nguyên). Đây cũng là cách F03 đã thêm `displayName()`.
- **`Optional` thay vì `null`:** kiểu trả về nói rõ "có thể không có", bên gọi buộc phải xử lý cả hai trường hợp.

### 1.2 `OAuth2Connection` không chứa secret
- **Là gì:** một record gồm registration id (`google`), scope cần xin, tham số riêng (`access_type=offline`, `prompt=consent`) và địa chỉ thu hồi token.
- **Vì sao không có client secret, không có token:** contract là thứ mọi module nhìn thấy. Secret chỉ nằm trong `ClientRegistration` của Spring, được dựng từ biến môi trường. Connector cũng **không tự** đổi code lấy token hay refresh token; việc đó thuộc module `account` (D-15 = A'), dùng chung cho mọi provider OAuth2.
- **Record tự kiểm dữ liệu:** constructor rút gọn (compact constructor) từ chối registration id rỗng, scope rỗng, và chép `Set`/`Map` thành bản chỉ đọc (`Set.copyOf`, `Map.copyOf`), để bên ngoài sửa tập hợp gốc cũng không ảnh hưởng.

### 1.3 Định danh Gmail là `sub`, không phải email
- **Ở đâu:** `provider/infrastructure/gmail/GmailProvider.getAccountProfile`.
- **Là gì:** gọi endpoint userinfo của Google bằng access token, lấy `sub` (mã số cố định của tài khoản Google) làm `externalAccountId`, email làm tên hiển thị.
- **Vì sao:** email có thể đổi; `sub` thì không. Nếu dùng email, đổi email là Sino tưởng một tài khoản mới.

### 1.4 Gọi Google bằng `RestClient`, có giới hạn thời gian
- **Ở đâu:** constructor của `GmailProvider`.
- **Là gì:** `RestClient` là client HTTP của Spring. Nó chạy trên `HttpClient` của JDK với **connect timeout** 5 giây (chờ bắt tay) và **read timeout** 10 giây (chờ trả lời).
- **Vì sao phải có timeout:** mặc định, chờ là chờ mãi. Google treo thì luồng xử lý request của Sino cũng treo theo, nhiều request như vậy là server hết luồng.
- **Dịch lỗi HTTP sang lỗi của Sino:**

```text
401           -> AUTH_EXPIRED          token hết hạn hoặc bị thu hồi
429           -> RATE_LIMITED          kèm Retry-After nếu Google nói
5xx, timeout  -> PROVIDER_UNAVAILABLE  thử lại sau được
4xx khác      -> REQUEST_REJECTED
JSON đọc hỏng -> PAYLOAD_NORMALIZATION_FAILED
```

- **Bẫy:** thông báo lỗi **không bao giờ** chứa token hay nội dung Google gửi về, vì thông báo có thể vào log. Có test riêng: Google trả về một body chứa token, thông báo lỗi vẫn sạch.

### 1.5 Bật Gmail theo cấu hình: `Condition` tự viết
- **Ở đâu:** `provider/infrastructure/gmail/GmailConfiguration.java`.
- **Là gì:** hai lớp cấu hình lồng nhau, mỗi lớp gắn một `Condition` (điều kiện Spring kiểm trước khi tạo bean):

```text
client id rỗng VÀ secret rỗng  -> lớp Off: không có Gmail, log "Gmail is off"
có ít nhất một                 -> lớp On: kiểm đủ cả hai
    thiếu một -> dừng khởi động, thông báo nêu TÊN biến
    đủ cả hai -> bean ClientRegistration "google" + GmailProvider
```

- **Vì sao không dùng `@ConditionalOnProperty`:** biến được khai báo `${SINO_GOOGLE_CLIENT_ID:}`, nên khi không đặt, giá trị là chuỗi rỗng. `@ConditionalOnProperty` coi chuỗi rỗng là "có giá trị" và vẫn bật (đã thử bằng một test tạm khi làm BE-30: biến rỗng thì bean vẫn được tạo). `Condition` tự viết dùng `StringUtils.hasText`, coi rỗng và toàn khoảng trắng là "không có".
- **Để làm gì:** app, test và CI chạy được khi chưa có Google project. Thiếu một nửa cấu hình là lỗi gõ, nên dừng ngay (fail-fast) thay vì lặng lẽ tắt Gmail.
- **Không để Spring Boot tự bật OAuth2 client:** Sino không đặt `spring.security.oauth2.client.registration.*` và không tạo `ClientRegistrationRepository`. Test `GmailWiringTests` kiểm context không có các bean OAuth2 client của Spring Boot, vì cách lưu token của Spring chỉ giữ được một Gmail mỗi người (F02 design).

### 1.6 Bẫy: `ClientRegistration.toString()` in client secret
- **Phát hiện:** soi bytecode bằng `javap` thấy `toString()` của `ClientRegistration` (Spring Security 7.1.1) nối thẳng `clientSecret` vào chuỗi.
- **Hệ quả:** một dòng log kiểu `log.info("using {}", registration)` là lộ secret. Quy tắc: không bao giờ log `ClientRegistration` hay request đổi token chứa nó. Sino tự che secret trong `GmailProperties.toString()`.
- **Bài học chung:** đừng tin `toString()` của thư viện với đối tượng có chứa bí mật; kiểm rồi mới log.

### 1.7 Contract test kit chạy theo capability
- **Ở đâu:** `src/test/java/dev/sino/provider/spi/MessageProviderContractTest.java`.
- **Chuyện gì:** kit của F03 luôn chạy test sync. Gmail ở F04a chưa đọc thư (capability rỗng), nên các test đó chỉ chạy khi connector khai báo `READ_MESSAGES` (`assumeTrue`), giống hệt test gửi tin chỉ chạy khi có `SEND_MESSAGES`.
- **Thêm test đối xứng:** không có `READ_MESSAGES` thì `fetchUpdates` phải báo `CAPABILITY_NOT_SUPPORTED` và không gọi Google. Spec `provider-contract` được sửa theo (delta MODIFIED).

### 1.8 WireMock: một "Google giả" chạy HTTP thật
- **Ở đâu:** `GmailProviderTests` (`WireMockServer` cổng ngẫu nhiên).
- **Là gì:** WireMock là một HTTP server nhỏ chạy trong test. Ta dặn trước "gặp request GET `/v1/userinfo` có header `Authorization: Bearer ...` thì trả JSON này", rồi kiểm lại request nó nhận được.
- **Vì sao không giả lập bằng Mockito:** giả lập `RestClient` bằng Mockito thì không kiểm được header thật, timeout thật hay cách JSON thật được đọc. Với HTTP thật, test chạy đúng đường code như khi gọi Google.
- **Dùng `WireMockServer` trực tiếp**, không dùng extension JUnit 5 của WireMock, vì dự án chạy JUnit 6.

### 1.9 Kiểm tra ngược (BE-30)
Làm hỏng code mỗi lần một chỗ (16 lần), lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| `oauth2()` mặc định không còn rỗng | connector không khai báo thì `oauth2()` rỗng |
| Cho registration id rỗng / scope rỗng | record từ chối dữ liệu thiếu |
| Không chép `Set` scope | sửa tập gốc không ảnh hưởng record |
| Bỏ `access_type=offline` | tham số gửi Google đúng |
| Dùng email làm định danh | profile là `sub`; thiếu `sub` thì từ chối |
| `401` không còn là `AUTH_EXPIRED` | token bị từ chối, và 403 vẫn là `REQUEST_REJECTED` |
| Bỏ read timeout | Google chậm thì báo lỗi trong dưới 2 giây |
| `5xx` thành `REQUEST_REJECTED` | Google lỗi thì `PROVIDER_UNAVAILABLE` |
| Bỏ qua `Retry-After` | `RATE_LIMITED` kèm 30 giây |
| Nhét body của Google vào thông báo lỗi | thông báo lỗi không có token, không có body |
| Chỉ có client id vẫn khởi động | thiếu secret thì dừng |
| Điều kiện "có một" thành "có cả hai" | thiếu một thì dừng (2 test) |
| `toString()` in secret | `GmailProperties` che secret |
| Bỏ ghi đè token URI | địa chỉ Google mặc định và địa chỉ của test |
| Khai báo `READ_MESSAGES` khi chưa đọc được thư | capability rỗng, và kit chạy test sync rồi đỏ |

---

## 2. Bắt đầu kết nối: state, PKCE, session (BE-31)

### 2.1 Luồng của `POST /api/accounts/connect/{provider}`
- **Ở đâu:** `account/api/ConnectController`, `account/application/ConnectService`, `account/infrastructure/oauth/OAuth2Clients`.

```text
ConnectController   lấy owner hiện tại, gọi start
ConnectService      tìm connector (404 UNKNOWN_PROVIDER)
                    lấy oauth2() (422 CONNECT_NOT_SUPPORTED nếu rỗng)
                    kết nối lại? account phải của owner, chưa xóa,
                    cùng provider (404 ACCOUNT_NOT_FOUND)
OAuth2Clients       dựng request gửi Google: state, PKCE, scope,
                    tham số riêng, login_hint, redirect URI
ConnectController   cất PendingConnect vào session, trả authorizationUrl
```

- **Vì sao chia ba lớp:** controller lo HTTP và session; service lo quy tắc nghiệp vụ (account nào được kết nối lại) và không biết HTTP; lớp `infrastructure/oauth` lo phần giao thức với Spring. Đổi một lớp không kéo theo lớp khác.

### 2.2 `state`: chống CSRF cho luồng OAuth
- **Là gì:** 32 byte ngẫu nhiên từ `SecureRandom`, mã hóa base64url (43 ký tự). Google trả nguyên giá trị này về ở callback.
- **Chống cái gì:** kẻ xấu tự kết nối Gmail của *họ*, dừng ở bước callback, rồi lừa bạn mở đường link callback đó. Không có `state`, Sino của bạn sẽ nhận Gmail của kẻ xấu, và thư bạn gửi từ Sino sau này đi qua tài khoản của họ. Có `state` gắn với session của bạn thì đường link đó vô dụng: state trong link không có trong session của bạn.
- **Vì sao `SecureRandom`:** `Random` thường đoán được dãy số tiếp theo; `SecureRandom` thì không.

### 2.3 PKCE: lấy trộm `code` cũng vô dụng
- **Là gì:** Sino tạo một chuỗi bí mật (`code_verifier`), gửi Google **bản băm** SHA-256 của nó (`code_challenge`, kiểu `S256`). Khi đổi `code` lấy token (BE-32), Sino gửi bản gốc; Google băm lại và so.
- **Chống cái gì:** `code` đi qua thanh địa chỉ trình duyệt, có thể lọt vào lịch sử hoặc log. Kẻ có `code` mà không có verifier thì không đổi được token.
- **Ở đâu:** `OAuth2AuthorizationRequestCustomizers.withPkce()` của Spring thêm cả hai vào request; verifier nằm trong `attributes` của `OAuth2AuthorizationRequest`, không bao giờ ra khỏi server.

### 2.4 Vì sao cất trong session, không cất trong database
- **Session gắn với một trình duyệt.** Chỉ trình duyệt đã bắt đầu mới hoàn tất được; đó chính là điều `state` cần bảo vệ.
- **`PendingConnects`:** một `LinkedHashMap` theo `state`, cất trong session: mỗi state dùng **một lần** (`take` xóa ngay, kể cả khi sau đó lỗi), sống **10 phút**, tối đa **5** cái (mở nhiều tab vẫn được; thừa thì bỏ cái cũ nhất). `LinkedHashMap` giữ thứ tự thêm vào, nên cái cũ nhất luôn đứng đầu: `pollFirstEntry()` lấy nó ra.
- **Cái hết hạn không cần dọn riêng:** cái hết hạn luôn là cái cũ nhất, nên khi đầy nó bị bỏ trước; còn `take` không bao giờ trả cái đã hết hạn. Bản đầu có thêm một dòng `removeIf` dọn cái hết hạn mỗi lần thêm. Kiểm tra ngược cho thấy xóa dòng đó đi thì không test nào đỏ, và suy luận cũng ra không có trường hợp nào nó làm khác đi (gọi là *mutant tương đương*). Dòng code không thay đổi được kết quả nào là dòng thừa, nên đã bỏ.
- **Khóa session khi sửa:** hai tab bấm cùng lúc là hai request song song trên cùng session; `synchronized (WebUtils.getSessionMutex(session))` để map không bị hỏng.
- **`Serializable`:** đối tượng trong session nên ghi ra được (một số cấu hình lưu session ra đĩa hoặc chia sẻ giữa các server). Có test ghi ra rồi đọc lại.

### 2.5 `login_hint` khi kết nối lại
- **Là gì:** gợi ý cho Google chọn sẵn tài khoản nào. Sino gửi `externalAccountId` của account, với Gmail là `sub`.
- **Vì sao không gửi email như design ban đầu:** Sino không lưu email riêng; tên hiển thị mặc định là email nhưng bạn đổi tên được. Tài liệu Google ghi `login_hint` nhận email **hoặc** `sub`.

### 2.6 Redirect URI từ `SINO_PUBLIC_BASE_URL`
- **Là gì:** `SINO_PUBLIC_BASE_URL` + `/api/accounts/connect/gmail/callback`. Khi dev là `http://localhost:5173`, đi qua proxy của Vite (D-36).
- **Vì sao không tự đoán từ request:** header `Host` của request giả được; Google cũng đòi redirect URI khớp từng ký tự với URI đã đăng ký.
- **Kiểm lúc khởi động:** có connector OAuth2 mà thiếu địa chỉ, hoặc địa chỉ không phải `http(s)`, hoặc có `?`/`#` thì dừng ngay. Có connector OAuth2 mà thiếu client của nó cũng dừng. Không có connector OAuth2 thì không cần địa chỉ (test và CI vẫn chạy).
- **Test cả app khi chưa có Google project (`GmailOffTests`):** không client id, không secret, không địa chỉ: app vẫn chạy, `/api/providers` không có `gmail`, và `POST /api/accounts/connect/gmail` trả `404 UNKNOWN_PROVIDER`. Test đơn vị của `OAuth2Clients` đã kiểm quy tắc "không có connector OAuth2 thì không cần địa chỉ"; test này kiểm thêm phần lắp ráp: khi Gmail tắt, Spring thật sự không tạo bean Gmail, `OAuth2Clients` nhận danh sách rỗng và app khởi động được.

### 2.7 Kiểm tra ngược (BE-31)
Làm hỏng code mỗi lần một chỗ (18 lần), lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| `take` chỉ đọc, không xóa state | mỗi state chỉ lấy được một lần |
| Không bao giờ hết hạn | sống đúng 10 phút |
| Đúng phút thứ 10 vẫn còn dùng được | sống đúng 10 phút |
| Không giới hạn số kết nối đang chờ | giữ 5 cái mới nhất |
| Thừa thì bỏ cái **mới** nhất | giữ 5 cái mới nhất; cái hết hạn nhường chỗ chứ không đẩy cái mới |
| Bỏ PKCE | URL có `code_challenge` kiểu `S256` khớp với verifier (3 test) |
| State 16 byte thay vì 32 | state dài 43 ký tự base64url |
| Bỏ `login_hint` | kết nối lại thì có `login_hint` (2 test) |
| Bỏ tham số riêng của connector | URL có `access_type=offline`, `prompt=consent` (2 test) |
| Redirect URI lấy từ mẫu của `ClientRegistration` | redirect URI = địa chỉ public + đường callback (3 test) |
| Không kiểm địa chỉ public | địa chỉ rỗng, thiếu `http(s)`, có `?` hay `#` thì dừng |
| Giữ dấu `/` cuối của địa chỉ | không ra `//api/...` |
| Connector OAuth2 thiếu client vẫn khởi động | thiếu client thì dừng, thông báo nêu tên connector và client |
| Đòi địa chỉ public cả khi Gmail tắt | `GmailOffTests` (app không khởi động được) và test đơn vị |
| Cho kết nối lại account của provider khác | account của provider khác là `404` |
| Quên cất vào session | session có kết nối đang chờ (3 test) |
| Tên provider sai định dạng ném lỗi thô | tên không thể là provider vẫn là `404 UNKNOWN_PROVIDER` |
| Kết nối lại mà không gửi định danh | kết nối lại thì có `login_hint` = `sub` |

---

## Tự kiểm tra

1. Vì sao Sino không cần biết mật khẩu Gmail của bạn?
2. Thêm một method vào interface mà không làm hỏng các class đang implement nó thì làm thế nào?
3. Vì sao `OAuth2Connection` không được chứa client secret?
4. Vì sao định danh tài khoản Gmail bằng `sub` chứ không bằng email?
5. Không đặt timeout cho lời gọi HTTP thì chuyện gì có thể xảy ra với server?
6. Vì sao `@ConditionalOnProperty` không hợp với biến khai báo kiểu `${SINO_GOOGLE_CLIENT_ID:}`?
7. Một dòng log in đối tượng `ClientRegistration` gây ra chuyện gì?
8. Không có `state`, kẻ xấu làm gì được với Sino của bạn?
9. PKCE bảo vệ trường hợp nào mà `state` không bảo vệ được?
10. Vì sao `take` phải xóa state ngay cả khi lần dùng đó thất bại?
11. Vì sao `login_hint` dùng `sub` chứ không dùng tên hiển thị của account?
12. Xóa một dòng code mà không test nào đỏ: khi nào nên thêm test, khi nào nên xóa luôn dòng đó?
