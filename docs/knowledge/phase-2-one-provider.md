# Kiến thức Phase 2 — Một provider thật: Gmail

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F04a, `openspec/changes/f04a-gmail-connect` (kết nối Gmail bằng OAuth2). Đang làm: xong BE-30.
> **Cập nhật:** 2026-10-07. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

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
| BE-31…BE-34 | Bắt đầu kết nối, callback, thu hồi khi xóa, thử với Google thật | chưa làm |
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

## Tự kiểm tra

1. Vì sao Sino không cần biết mật khẩu Gmail của bạn?
2. Thêm một method vào interface mà không làm hỏng các class đang implement nó thì làm thế nào?
3. Vì sao `OAuth2Connection` không được chứa client secret?
4. Vì sao định danh tài khoản Gmail bằng `sub` chứ không bằng email?
5. Không đặt timeout cho lời gọi HTTP thì chuyện gì có thể xảy ra với server?
6. Vì sao `@ConditionalOnProperty` không hợp với biến khai báo kiểu `${SINO_GOOGLE_CLIENT_ID:}`?
7. Một dòng log in đối tượng `ClientRegistration` gây ra chuyện gì?
