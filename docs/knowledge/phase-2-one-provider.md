# Kiến thức Phase 2 — Một provider thật: Gmail

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F04a, `openspec/changes/f04a-gmail-connect` (kết nối Gmail bằng OAuth2): xong BE-30…BE-34 và FE-30, còn nghiệm thu. F04b, `openspec/changes/f04b-gmail-read` (đọc thư Gmail): xong BE-35, BE-36, BE-37.
> **Cập nhật:** 2026-10-09. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

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
| D-51 | `OAuth2Connection.requiredScopes`: callback chỉ đòi scope bắt buộc, không đòi mọi scope đã xin |
| D-54 | Callback chỉ thu hồi quyền Sino không dùng: không bao giờ thu hồi quyền của một account đang kết nối |
| D-57 | F04b chỉ làm connector đọc thư và token; lưu thư, lần nhập đầu, ước lượng số thư để F05 |
| D-58 | Thử với Gmail thật bằng một test JUnit gắn tag, chạy tay, chỉ in số đếm |
| D-59 | Lần sync đầu có thể mang mốc thời gian: `SyncCursor.initial(since)` |
| D-60 | Mã lỗi `CURSOR_EXPIRED`: cursor không đọc tiếp được, bên gọi đọc lại từ đầu |
| D-61 | Thư chỉ có HTML: lấy chữ bằng thư viện jsoup |
| D-62 | `ProviderAccess.call(accountId, (connector, context) -> ...)`: module khác gọi connector mà không thấy token; refresh một lần khi token bị từ chối |

| Task | Đã làm | Trạng thái |
|---|---|---|
| BE-30 | SPI `oauth2()`, connector Gmail khung, cấu hình Google, WireMock | xong |
| BE-31 | Bắt đầu kết nối: `POST /api/accounts/connect/{provider}`, state + PKCE trong session | xong |
| BE-32 | Callback: đổi code lấy token, kiểm scope, đăng ký, thu hồi grant không dùng | xong |
| BE-33 | Xóa account thì Google rút quyền: gửi sau commit, ngoài transaction | xong |
| BE-34 | README Google project, thử với Google thật | xong (Gmail thật: kết nối, kết nối lại, xóa) |
| FE-30 | Nút "Thêm Gmail", "Kết nối lại" | xong (phiên web) |
| BE-35 | Contract: `SyncCursor.initial(since)`, `CURSOR_EXPIRED`, kit kiểm mốc thời gian | xong |
| BE-36 | `ProviderAccess`: gọi connector với token còn hạn, refresh, hết quyền | xong |
| BE-37 | Chuẩn hóa thư Gmail: cây MIME, chữ (jsoup), tệp, người tham gia, thread | xong |

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
- **Bẫy: thông báo trùng khóa của `Collectors.toMap`.** `OAuth2Clients` gom các `ClientRegistration` thành map theo id. Không truyền hàm xử lý trùng thì gặp hai client cùng id, Java ném `IllegalStateException("Duplicate key google (attempted merging values ... and ...)")` có **cả hai đối tượng** trong thông báo. Mục 1.6 đã nói `ClientRegistration.toString()` in client secret, nên lỗi khởi động này đưa secret vào log. Cách sửa: truyền hàm thứ ba cho `toMap`, tự ném lỗi chỉ nêu id. Lỗi do review tìm ra (test thường không gặp vì chỉ có một client); test viết trước khi sửa đỏ đúng vì thông báo chứa `clientSecret='client-secret-1'`. Bài học: thông báo lỗi do thư viện tự dựng cũng là một chỗ có thể in dữ liệu, không riêng log của mình.
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

## 3. Callback: đổi code lấy token, kiểm scope, đăng ký (BE-32)

### 3.1 Luồng của `GET /api/accounts/connect/{provider}/callback`
- **Ở đâu:** `account/api/ConnectController.callback`, `account/application/ConnectService.complete`, `account/infrastructure/oauth/{OAuth2Clients.exchange, OAuth2TokenRevoker}`.

```text
ConnectController   lấy và XÓA PendingConnect theo state (trước mọi việc)
                    không session / không có / hết hạn / sai provider
                      -> 302 CONNECT_STATE_INVALID, không gọi Google
ConnectService      error=access_denied        -> CONNECT_CANCELLED
                    error khác / không có code -> CONNECT_FAILED
                    đổi code lấy token (Spring, có timeout)
                    thiếu scope bắt buộc -> thu hồi -> CONNECT_SCOPE_DENIED
                    không có refresh token       -> CONNECT_FAILED
                    hỏi connector "đây là ai" (sub, email)
                    kết nối lại mà sub khác -> thu hồi -> CONNECT_WRONG_ACCOUNT
                    register (F02, transaction duy nhất)
ConnectController   302 /accounts?connected={id}
                    302 /accounts?connectError={CODE}
```

- **Vì sao mọi lời gọi Google nằm ngoài transaction:** transaction giữ một kết nối database. Google chậm 10 giây thì kết nối đó bị giữ 10 giây vô ích; nhiều người cùng kết nối là hết kết nối. Chỉ bước `register` cuối cùng mới cần transaction.

### 3.2 State dùng một lần, lấy ra trước mọi việc
- **Là gì:** callback lấy `PendingConnect` ra khỏi session và xóa nó ngay, rồi mới làm gì khác. Kể cả khi sau đó Google lỗi, state đó cũng không dùng lại được.
- **Vì sao:** nếu chỉ xóa khi thành công, kẻ xấu có thể gọi lại cùng một state nhiều lần để thử.
- **`getSession(false)`:** chỉ lấy session đang có, không tạo mới. Callback không có session thì không có gì để lấy, nên trả `CONNECT_STATE_INVALID` mà không sinh session rác.
- **Kiểm provider:** state bắt đầu cho Gmail mà quay về đường `/api/accounts/connect/fake/callback` thì từ chối.
- **`PendingConnects` tự khóa (`synchronized`):** hai request cùng một session (hai tab) không thể cùng lấy được một state. Đây là góp ý của review BE-31.

### 3.3 Đổi code lấy token bằng Spring
- **Ở đâu:** `OAuth2Clients.exchange`.
- **Là gì:** `RestClientAuthorizationCodeTokenResponseClient` của Spring gửi `POST` tới token endpoint của Google với `code`, `redirect_uri` (của chính authorization request, nên luôn khớp lần đầu), `code_verifier` (PKCE) và client id/secret trong header `Authorization: Basic`.
- **Vì sao tự dựng `RestClient`:** để đặt timeout (kết nối 5 giây, đọc 10 giây). Bản mặc định của Spring không có timeout.
- **Bẫy 1: thay `RestClient` mà quên phần của Spring.** Bản mặc định có bộ chuyển form, bộ đọc token response và `OAuth2ErrorResponseErrorHandler`. Quên bộ xử lý lỗi thì Google trả `400 invalid_grant` chỉ còn là "HTTP 400". Kiểm tra ngược đã thử đúng lỗi này.
- **Bẫy 2: thông báo lỗi của Spring có thể chép body của Google.** Sino không dùng message đó; `reasonOf` chỉ nêu loại lỗi: mã lỗi OAuth (`invalid_grant`), mã HTTP, "không kết nối được hoặc quá thời gian", hoặc "trả lời không đọc được".
- **Java mới dùng ở đây:** `switch` theo kiểu của `failure.getCause()`, có `case null` (lỗi OAuth không có nguyên nhân bên dưới) và `case ResourceAccessException _` (dấu `_` là biến không dùng tới).

### 3.4 Scope thật được cấp (D-51)
- **Vấn đề gặp khi làm:** Sino xin `email`, nhưng token response của Google ghi `https://www.googleapis.com/auth/userinfo.email`. Nếu đòi mọi scope đã xin phải có mặt nguyên văn, lần kết nối nào với Google thật cũng hỏng. Test bằng WireMock không thấy được lỗi này, vì WireMock trả gì là do mình viết.
- **Cách làm (bạn chọn):** `OAuth2Connection` có thêm `requiredScopes`, là tập con của scope xin. Gmail chỉ đòi `gmail.readonly`. Các scope đăng nhập (`openid`, `email`) Google cho đồng ý ở bước riêng, người dùng không bỏ tick được.
- **RFC 6749 §5.1:** token response được phép bỏ `scope` khi cấp đúng như đã xin. Spring khi đó trả tập rỗng, nên Sino tự hiểu là "được cấp đúng phần đã xin".
- **Chi tiết của Spring:** thiếu `expires_in` thì Spring đặt hạn token là 1 giây sau lúc nhận, tức coi như sắp hết hạn. Cách này an toàn: F04b sẽ refresh ngay thay vì dùng một token không rõ hạn.

### 3.5 Thu hồi grant không dùng
- **Ở đâu:** `OAuth2TokenRevoker`, theo RFC 7009: `POST` form `token=...` tới địa chỉ thu hồi của provider.
- **Khi nào:** ~~thiếu scope bắt buộc, hoặc kết nối lại mà chọn nhầm tài khoản Google~~ → mọi lần đã nhận token mà kết nối không thành (thiếu scope, chọn nhầm tài khoản, không có refresh token, lấy hồ sơ lỗi, đăng ký lỗi), **trừ khi** tài khoản Google đó đang là account của bạn trong Sino (D-54, sửa sau review BE-32).
- **Vì sao có ngoại lệ:** với Google, thu hồi là rút **cả quyền** tài khoản đó đã cấp cho Sino, không riêng token vừa nhận. Ví dụ bạn có Gmail A và B; bấm "Kết nối lại" A nhưng ở Google lỡ chọn B. Nếu Sino thu hồi, token B đang lưu cũng chết theo và B hỏng âm thầm tới lần refresh sau. Vì vậy callback hỏi "đây là ai" **trước** (các scope đăng nhập luôn được cấp nên hỏi được cả khi thiếu quyền đọc thư), rồi mới quyết định có thu hồi không.
- **Kết nối lại một account vừa bị xóa:** nếu bạn xóa A trong lúc đang ở màn đồng ý của Google, callback trả `CONNECT_FAILED` và A không sống lại (trước đây `register` tìm cả account đã xóa và làm nó sống lại).
- **Thu hồi token nào:** refresh token nếu có. Với Google, thu hồi refresh token là rút cả quyền đã cấp.
- **Best-effort:** Google lỗi hay chậm thì chỉ ghi `WARN` (provider, mã HTTP), không ném lỗi ra ngoài. BE-33 dùng lại lớp này khi xóa account.

### 3.6 Kết nối lại: đúng tài khoản mới được
- **Là gì:** lúc bắt đầu kết nối lại, `PendingConnect` lưu `externalAccountId` (với Gmail là `sub`) của account đích. Ở callback, `sub` của tài khoản vừa đồng ý phải trùng giá trị đó, nếu không thì `CONNECT_WRONG_ACCOUNT` và không đổi gì.
- **Vì sao lưu từ lúc bắt đầu:** callback so sánh mà không cần đọc lại database.
- **`ProviderContext.accountId` = `null`:** khi kết nối account mới, lúc hỏi "đây là ai" thì account chưa tồn tại nên chưa có ID. Trước đây context bắt buộc phải có ID; BE-32 nới quy tắc này, vì một UUID bịa ra là dữ liệu sai.

### 3.7 Luôn là `302`, không bao giờ JSON
- **Vì sao:** callback là một lần trình duyệt chuyển trang, không phải lời gọi API của web. Web đọc kết quả từ đường dẫn: `/accounts?connected=...` hoặc `/accounts?connectError=...`.
- **Không open redirect:** địa chỉ đích là hằng số trong code, không bao giờ lấy từ tham số request. Test thử thêm `next=https://evil.test/` vào URL và kiểm `Location` vẫn là `/accounts?...`.
- **Callback công khai ở tầng security:** nếu bắt đăng nhập, mất session (khởi động lại, hết hạn) sẽ thành `401` dạng JSON giữa một lần chuyển trang, người dùng thấy một trang lỗi trần. Mở ra thì mất session là `302 CONNECT_STATE_INVALID` và web hiện thông báo. Người dùng được nhận ra bằng `PendingConnect` trong session; không có thì callback không làm gì.
- **Lưới an toàn:** lỗi bất ngờ (ví dụ database từ chối) vẫn thành `302 CONNECT_FAILED` chứ không thành trang lỗi `500`.

### 3.8 Log an toàn
- `CONNECT_FAILED` ghi lý do cụ thể (ví dụ `the token endpoint answered HTTP 500`), không bao giờ ghi `code`, token hay client secret. Có test chạy một lần thành công và một lần thất bại rồi quét toàn bộ log.
- **Chống chèn log:** tham số `error` đi qua trình duyệt, ai cũng sửa được. Sino chỉ ghi nó khi trông giống một mã lỗi OAuth (chữ, số, `_ . -`, tối đa 64 ký tự); còn lại ghi `(unrecognized)`. Nếu ghi nguyên văn, kẻ xấu có thể nhét dấu xuống dòng để tạo một dòng log giả.

### 3.9 Test với server thật
- **`ConnectCallbackTests`:** server chạy thật trên cổng ngẫu nhiên, `Browser` giữ cookie như trình duyệt và không tự đi theo `302` (để test thấy chính `302`), WireMock đóng vai ba endpoint của Google (token, userinfo, thu hồi), `Clock` giả để thử state hết hạn sau 10 phút. Mỗi mã lỗi có một test.
- **`Browser` chuyển ra `src/test/java/dev/sino/Browser.java`** để test của mọi module dùng chung; trước đây nó nằm trong `AuthApiTests`.

### 3.10 Kiểm tra ngược (BE-32)
Làm hỏng code mỗi lần một chỗ (26 lần), lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| Không kiểm `requiredScopes` nằm trong scope xin | scope bắt buộc phải nằm trong scope xin |
| Không chép `requiredScopes` thành bản chỉ đọc | sửa tập gốc không ảnh hưởng record |
| `ProviderContext` lại bắt buộc `accountId` | context không có ID khi đang kết nối; kết nối mới hỏng (5 test) |
| Gmail không đòi scope nào | Gmail đòi `gmail.readonly`; thiếu quyền đọc thì không tạo account |
| Không coi "thiếu `scope`" là "được cấp đúng phần đã xin" | token response không có `scope` |
| Bỏ timeout của token client | token endpoint chậm thì lỗi trong dưới 2 giây |
| Bỏ bộ xử lý lỗi OAuth2 của Spring | `400 invalid_grant` phải nêu được `invalid_grant` |
| Dùng message của Spring làm lý do | lý do không chép body của Google (3 test) |
| Bỏ mất refresh token | kết nối thành công, kết nối lại, thu hồi đúng token (8 test) |
| Bỏ timeout khi thu hồi | Google chậm thì thu hồi bỏ cuộc trong dưới 2 giây |
| Thu hồi lỗi thì ném ra ngoài | thu hồi lỗi chỉ là `WARN` |
| Log thu hồi chép body của Google | log không chứa token |
| `access_denied` thành `CONNECT_FAILED` | hủy ở Google là `CONNECT_CANCELLED` (2 test) |
| Ghi nguyên văn tham số `error` | log không có dòng giả |
| Bỏ kiểm scope | thiếu quyền đọc thì không tạo account (2 test) |
| Thiếu scope mà không thu hồi | Google nhận lệnh thu hồi |
| Bỏ kiểm refresh token | không có refresh token thì không tạo account |
| Bỏ kiểm "đúng tài khoản" | chọn tài khoản khác thì không đổi gì |
| Sai tài khoản mà không thu hồi | Google nhận lệnh thu hồi |
| Thu hồi access token thay vì refresh token | Google nhận đúng refresh token (2 test) |
| Bỏ kiểm provider trên đường dẫn | state của Gmail không dùng được ở đường của provider khác |
| Bỏ lưới an toàn của controller | lỗi bất ngờ vẫn là `302 CONNECT_FAILED` |
| Lấy địa chỉ redirect từ tham số `next` | `Location` luôn là `/accounts?...` |
| Callback không còn công khai | không có session là `302`, không phải `401` |
| `OAuth2Clients` khởi tạo muộn (`@Lazy`) | Gmail bật mà thiếu địa chỉ public thì app dừng ngay |
| `OAuth2Tokens.toString()` in token | chuỗi của token bị che |

---

## 4. Xóa account thì Google cũng rút quyền (BE-33)

### 4.1 Thứ tự: xóa xong, commit xong, rồi mới gọi Google
- **Ở đâu:** `account/application/AccountManagementService.remove`.

```text
TransactionTemplate.execute (một transaction)
  tìm account của owner           (404 nếu không có)
  đọc refresh token đã giải mã    (TRƯỚC khi xóa credential)
  đọc địa chỉ thu hồi của connector
  xóa mềm account, xóa credential, publish AccountRemoved
commit, trả kết nối database về pool
gọi Google thu hồi refresh token  (ngoài transaction, best-effort)
```

- **Vì sao đọc token trước:** sau khi xóa credential thì không còn gì để gửi Google.
- **Vì sao gọi Google sau commit:** nếu gọi trước mà transaction sau đó rollback, account vẫn còn trong Sino nhưng Google đã rút quyền, và account hỏng âm thầm. Gọi sau commit thì rollback ném lỗi trước, không có lệnh thu hồi nào được gửi.
- **Vì sao không dùng `TransactionSynchronization.afterCommit`:** đọc mã nguồn Spring (`AbstractPlatformTransactionManager.processCommit`) thấy `afterCommit` chạy **trước** khi kết nối database được trả về pool. Google chậm 10 giây là một kết nối bị giữ 10 giây. `TransactionTemplate` làm thứ tự rõ ràng: `execute` trả về là transaction đã xong hẳn.
- **`TransactionTemplate` là gì:** cách viết transaction bằng code thay vì `@Transactional`. Đoạn code trong lambda chạy trong một transaction; ném lỗi là rollback, chạy hết là commit. Dùng khi cần làm gì đó *sau* transaction trong cùng một method.
- **Bẫy:** `remove` phải được gọi **ngoài** transaction. Nếu nằm trong một transaction lớn hơn, `TransactionTemplate` nhập vào transaction đó, và lệnh thu hồi đi trước khi transaction lớn commit.

### 4.2 Thu hồi lỗi không làm việc xóa thất bại
- Google trả lỗi hay không trả lời: vẫn `204`, account vẫn bị xóa, log ghi `WARN` nêu provider, account id và mã HTTP, không bao giờ nêu token.
- **Vì sao:** bạn bảo Sino xóa account thì account phải biến mất khỏi Sino. Quyền còn sót ở Google bạn tự gỡ được ở trang quyền của tài khoản Google; ngược lại, một account không xóa được vì Google đang lỗi thì không gỡ được.

### 4.3 Test "sau commit" bằng cách chụp database đúng lúc Google nhận lệnh
- **`RemoveAccountRevokesTests`:** WireMock có `RequestListener`, được gọi khi nhận request, **trước khi** trả lời (đã soi bytecode của WireMock để chắc thứ tự). Listener dùng một kết nối database khác hỏi: account đã bị đánh dấu xóa chưa, credential còn không. Lúc đó Sino vẫn đang chờ Google trả lời, nên nếu Sino gọi Google trước khi commit thì kết nối khác sẽ chưa thấy thay đổi.
- **Rollback:** một `@EventListener` trong test ném lỗi khi nhận `AccountRemoved`, làm transaction xóa rollback. Kiểm: `500`, account còn, credential còn, Google không nhận lệnh nào.
- Kiểm tra ngược đã thử đúng lỗi "thu hồi ngay trong transaction": test chụp database đỏ.

### 4.4 Kiểm tra ngược (BE-33)
Làm hỏng code mỗi lần một chỗ (8 lần), lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| Thu hồi trong transaction, trước khi commit | lúc Google nhận lệnh, database đã xóa xong |
| Thu hồi trước khi xóa | transaction rollback thì không thu hồi |
| Đọc refresh token sau khi xóa credential | Google nhận đúng refresh token (2 test) |
| Không bao giờ thu hồi | Google nhận đúng refresh token (2 test) |
| Log không nêu account | cảnh báo nêu account id |
| Lỗi thu hồi bay ra ngoài | thu hồi lỗi vẫn `204` (2 test) |
| Giải mã refresh token như access token | đọc lại refresh token; xóa thu hồi đúng token (3 test) |
| Log của bộ thu hồi bỏ account | cảnh báo nêu account id (2 test) |

---

## 5. Google project và thử với Google thật (BE-34, phần README)

### 5.1 Dựng Google project
- **Ở đâu:** `apps/sino-api/README.md`, mục "Gmail: Google project and a first real connect" (7 bước, theo giao diện Google Cloud tháng 10/2026: *Google Auth Platform* gồm Branding, Audience, Data Access, Clients).
- **Testing:** chỉ các tài khoản trong danh sách test user được đồng ý; refresh token sống 7 ngày, sau đó phải kết nối lại.
- **Client secret chỉ hiện một lần** (client tạo từ tháng 6/2025): chép ngay vào `.env`; mất thì tạo secret mới trong trang của client.

### 5.2 Vì sao redirect URI phải khớp từng ký tự
- Google chỉ gửi `code` tới đúng địa chỉ đã đăng ký trong OAuth client. Nếu khớp "gần đúng" cũng được, kẻ xấu có thể đăng ký một đường dẫn na ná để hứng `code`. Vì vậy chỉ cần lệch một dấu `/` ở cuối, khác cổng, hay `http` thay cho `https` là Google báo `redirect_uri_mismatch`.
- Sino dựng redirect URI từ `SINO_PUBLIC_BASE_URL` (bỏ dấu `/` cuối), nên giá trị trong `.env` và trong Google Cloud phải đi đôi với nhau.

### 5.3 Vì sao thử thật phải dùng một tab trình duyệt
- Kế hoạch ban đầu là đăng nhập bằng `curl` rồi mở `authorizationUrl` trên trình duyệt. Cách đó không chạy: `state` và PKCE verifier nằm trong session, mà session của `curl` nằm trong cookie jar của `curl`. Trình duyệt quay về từ Google không mang cookie đó, nên callback trả `CONNECT_STATE_INVALID`. Đây chính là điều `state` được thiết kế để chặn (mục 2.2).
- Cách đúng: làm cả luồng trên `http://localhost:8080` trong một tab, gọi API từ console của trình duyệt (`fetch` gửi kèm `X-XSRF-TOKEN` đọc từ cookie).
- **Thực tế đã thử qua giao diện web** ở `:5173` (web đã có đăng nhập và nút kết nối): một lần thử kiểm cả backend lẫn web.

### 5.4 Kết quả với Google thật (2026-10-08)
- **Kết nối:** account Gmail mới, định danh là `sub` (một dãy số), tên là email, refresh token lưu dạng mã hóa.
- **D-51 được xác nhận:** scope Google ghi lại là `gmail.readonly`, `https://www.googleapis.com/auth/userinfo.email`, `openid`. Đúng như dự đoán: `email` bị đổi thành `userinfo.email`. Nếu callback đòi mọi scope đã xin nguyên văn, lần kết nối thật này đã hỏng, dù mọi test với WireMock đều xanh. Bài học: giả lập chỉ giỏi bằng hiểu biết của người viết nó về hệ thống thật.
- **Kết nối lại:** cùng ID, quay về `CONNECTED`, credential được ghi mới.
- **Xóa:** account được đánh dấu xóa, credential mất hẳn, và "Sino (dev)" biến mất khỏi trang quyền của tài khoản Google: lệnh thu hồi sau commit (BE-33) chạy thật.
- **Không lộ bí mật:** log backend và log web không chứa token, `code` hay client secret.
- **Chưa thử thật:** chọn nhầm tài khoản Google khác (cần tài khoản thứ hai) và bỏ tick quyền đọc thư; hai nhánh này có test với WireMock.

---

## 6. Contract: lần sync đầu có mốc thời gian, cursor hết hạn (BE-35)

F04b bắt đầu bằng việc sửa contract chung (F03) trước khi viết connector Gmail đọc thư. Hai chỗ: lần sync đầu biết lấy từ ngày nào, và connector báo được "cursor này hết dùng được".

### 6.1 `since` chỉ nằm ở cursor khởi tạo
- **Ở đâu:** `provider/spi/SyncCursor`.
- **Là gì:** `record SyncCursor(String value, Instant since)`. `SyncCursor.initial(since)` là lần sync đầu tính từ mốc `since`; `SyncCursor.initial()` là lần sync đầu đọc toàn bộ, và bằng `initial(null)`. Cursor tiếp theo chỉ có `value`, là chuỗi riêng của connector.
- **Để làm gì:** canvas cho người dùng chọn nhập 30 ngày, 90 ngày hay toàn bộ. F05 đổi lựa chọn đó thành một mốc ngày; connector chỉ thấy mốc, không biết con số 30 hay 90.
- **Vì sao chỉ ở cursor khởi tạo:** câu hỏi "lấy từ ngày nào" chỉ có nghĩa ở lần đầu. Sau lần đầu, connector tự ghi vị trí của nó vào `value` (Gmail: `historyId`); nếu mọi cursor đều mang thêm `since` thì có hai nguồn sự thật cho cùng một việc, và chúng có thể nói khác nhau. Constructor từ chối cursor có cả `value` lẫn `since` (`IllegalArgumentException`), nên lỗi này bị chặn ngay lúc tạo.
- **Phương án đã bỏ:** thêm một method SPI riêng cho lần đầu (connector nào cũng phải làm hai đường vào); cố định 90 ngày trong connector (lựa chọn trên canvas thành vô dụng).
- **Bẫy:** cursor của trang 2 không còn `since`, nên connector phải tự mang mốc sang các trang sau. Connector giả làm vậy bằng cursor `page-1@2026-09-15T00:00:00Z`; Gmail sẽ mang mốc trong cursor `v1|list|...` (BE-38). Quên bước này thì trang 1 đúng, trang 2 trở đi lại có thư cũ. Test `leavesOutOlderMessagesOnEveryPageOfTheFirstSync` bắt đúng lỗi đó.

```text
initial(since=15/09)          -> trang 0, bỏ thư trước 15/09
   nextCursor "page-1@2026-09-15T00:00:00Z"
                              -> trang 1, vẫn bỏ thư trước 15/09
   nextCursor "page-2@2026-09-15T00:00:00Z"
                              -> hết trang: batch rỗng, hasMore = false
```

- **Java dùng ở đây:**
  - *Compact constructor* của record (`public SyncCursor { ... }`): chạy trước khi gán field, chỗ đặt điều kiện hợp lệ.
  - *Constructor phụ* `SyncCursor(String value)` gọi `this(value, null)`: code cũ viết `new SyncCursor("page-1")` không phải sửa.
  - Record so sánh theo giá trị: `new SyncCursor(null, null)` bằng `SyncCursor.initial()` dù là hai object khác nhau. Vì vậy bản đầu có nhánh `since == null ? INITIAL : new SyncCursor(null, since)` là thừa: không test nào phân biệt được hai nhánh, nên nhánh đó đã bị bỏ.

### 6.2 `CURSOR_EXPIRED`: cursor hết dùng được
- **Ở đâu:** `provider/spi/ProviderErrorCode.CURSOR_EXPIRED`, không retryable.
- **Khi nào:** provider không đọc tiếp được từ cursor bên gọi truyền vào. Với Gmail: `historyId` quá cũ (Google chỉ giữ lịch sử thay đổi một thời gian, thường ít nhất một tuần) thì `history.list` trả `404`.
- **Bên gọi làm gì:** đọc lại từ đầu bằng `SyncCursor.initial(since)` với mốc nó tự chọn. Thư đã có trong Sino không bị trùng vì mọi item mang external ID (contract F03).
- **Vì sao không retryable:** gọi lại với cùng cursor thì vẫn hỏng y như cũ; retry chỉ tốn hạn mức.
- **Phương án đã bỏ:** connector tự đọc lại từ đầu (connector không biết mốc người dùng chọn, có thể kéo cả hộp thư, và bên gọi không biết để báo người dùng); dùng `REQUEST_REJECTED` (bên gọi không phân biệt được "cursor cũ" với "request sai").

### 6.3 Contract test kit: thêm một kiểm tra cho mọi connector
- **Ở đâu:** `src/test/java/dev/sino/provider/spi/MessageProviderContractTest`: test `theFirstSyncFromAMomentLeavesOutOlderItems` và hook `since()`. Lớp test của connector trả một mốc nằm giữa các thư mẫu.
- **Kiểm gì:** lần sync đầu từ mốc đó trả ít nhất một thư; các thư trả về là tập con của thư mẫu và **ít hơn** thư mẫu; không thư nào có `sentAt` trước mốc; conversation nào có `lastActivityAt` thì cũng không trước mốc.
- **Vì sao đòi "không rỗng" và "ít hơn mẫu":** câu "mọi thư đều sau mốc" luôn đúng khi danh sách rỗng. Không có hai điều kiện đó, một connector trả rỗng, hoặc một bộ mẫu toàn thư mới, vẫn xanh mà không chứng minh được gì.
- **Gmail:** chưa khai báo `READ_MESSAGES`, nên kiểm tra này tự bỏ qua (assumption) như các kiểm tra sync khác; `since()` của Gmail tạm trả `Instant.EPOCH` cho tới BE-38.

### 6.4 Kiểm tra ngược (BE-35)
Làm hỏng code mỗi lần một chỗ (10 lần), lần nào cũng có test đỏ:

| Lỗi cố ý | Test bắt được |
|---|---|
| Cho cursor có `value` mang cả `since` | `onlyTheInitialCursorHasAMoment` |
| `initial(since)` bỏ mốc | `anInitialCursorKeepsItsMoment` và kiểm mốc của kit (2 test nữa) |
| `CURSOR_EXPIRED` thành retryable | hai test của `ProviderErrorCodeTests` |
| Connector giả không bỏ thư nào | kiểm mốc của kit, test nhiều trang |
| Bỏ kiểm `sentAt` rỗng trước khi so mốc | test nhiều trang (thư thiếu `sentAt` phải vào danh sách bỏ qua, không làm sập) |
| So ngược: bỏ thư **sau** mốc | kiểm mốc của kit, test nhiều trang |
| Trang đầu quên mốc | kiểm mốc của kit, test nhiều trang |
| Cursor trang sau làm rơi mốc | test nhiều trang |
| Cursor có mốc hỏng làm bay lỗi lạ ra ngoài | `rejectsACursorItDidNotIssue` |
| Cursor không mốc vẫn đọc mốc | `followsItsPages` |

**Bài học từ chính lần kiểm này:** lần chạy đầu báo cả 10 lỗi "đều bị bắt", nhưng sai: `cmd` không chạy được `mvnw.cmd` (Windows không tìm lệnh trong thư mục hiện tại khi có biến `NoDefaultCurrentDirectoryInExePath`), nên build nào cũng thất bại và script tính đó là "test đỏ". Lộ ra vì script được sửa để in **tên test** đỏ và in ra không có tên nào. Từ đó script có thêm một lần chạy không làm hỏng gì, lần đó phải xanh, và chỉ tính "bắt được" khi thấy tên test đỏ. Kiểm tra ngược cũng cần được kiểm tra.

## 7. Gọi connector mà không thấy token: `ProviderAccess` (BE-36)

Từ F04b, module khác (F05 nhập thư, F07 đồng bộ) phải gọi connector Gmail với một access token còn hạn. Access token của Google sống khoảng 1 giờ; hết hạn thì phải dùng refresh token xin cái mới. BE-36 đặt toàn bộ chuyện đó trong module `account`.

### 7.1 Một hàm nhận lambda, không trả token ra ngoài (D-62)
- **Ở đâu:** `account/ProviderAccess`, `account/ProviderCall` (gói gốc, module khác dùng được); cài đặt ở `account/application/ProviderAccessService`.
- **Cách dùng:**

```text
String result = providerAccess.call(accountId, (connector, context) ->
        connector.fetchUpdates(context, cursor));
```

- **Là gì:** module khác đưa cho `account` *việc cần làm* (một lambda), chứ không xin token về tự làm. `account` nạp và giải mã credential, refresh nếu cần, dựng `ProviderContext`, gọi lambda, và nếu provider báo token bị từ chối thì refresh rồi gọi lại.
- **Vì sao không trả token (phương án A, bị loại):** token còn hạn mà Google vẫn trả `401` (bạn đổi mật khẩu, thu hồi quyền) thì bên gọi phải tự refresh và thử lại; F05 và F07 sẽ lặp lại cùng một đoạn logic, và token rời khỏi module `account` (trái D-15 A').
- **Java dùng ở đây:**
  - *Functional interface* `ProviderCall<T>`: interface có đúng một method trừu tượng, nên viết được bằng lambda `(connector, context) -> ...`.
  - *Generic method* `<T> T call(UUID accountId, ProviderCall<T> call)`: kiểu trả về theo lambda; lambda trả `SyncBatch` thì `call` trả `SyncBatch`, không cần ép kiểu.
- **Bẫy:** lambda có thể chạy **hai lần** (lần hai sau khi refresh), nên việc trong lambda phải lặp lại được mà không hỏng gì. Đọc thư thì được; gửi thư thì phải cẩn thận (F10).

### 7.2 Luồng của một lời gọi

```text
call(accountId, lambda)
  account chưa xóa?                không -> ACCOUNT_NOT_FOUND
  account AUTH_EXPIRED?            có    -> AUTH_EXPIRED, không gọi ai
  connector của provider           không còn -> UNKNOWN_PROVIDER
  đọc credential (snapshot: token, refresh token, version)
  OAuth2 và còn < 60 giây, refresh được?
      có -> refresh (gọi Google, NGOÀI transaction)
            lưu nếu credential chưa đổi (TRONG transaction)
  gọi lambda
      provider báo AUTH_EXPIRED?
        vừa refresh xong          -> hết quyền
        không refresh được        -> hết quyền
        còn lại                   -> refresh, gọi lambda lần hai
                                     vẫn AUTH_EXPIRED -> hết quyền
hết quyền = trong transaction: markAuthExpired() + AccountStatusChanged
            rồi ném ProviderException(AUTH_EXPIRED)
```

- **Mỗi lời gọi refresh tối đa một lần:** token mới tinh vẫn bị từ chối nghĩa là quyền đã mất; refresh thêm chỉ tốn một lời gọi Google.
- **Vì sao refresh trước 60 giây:** token còn 10 giây có thể hết hạn ngay giữa lúc đang đọc trang thư thứ 30.
- **Token sắp hết hạn mà không refresh được** (không có refresh token, connector không còn OAuth2): vẫn dùng. Chỉ khi provider thật sự từ chối mới chuyển `AUTH_EXPIRED`. Đánh dấu sớm là báo sai cho người dùng.

### 7.3 Gọi Google ngoài transaction, lưu token trong transaction
- **Gọi Google ngoài transaction:** một transaction giữ một kết nối database. Google chậm 10 giây là một kết nối bị giữ 10 giây; vài lời gọi như vậy cùng lúc là pool hết kết nối, cả Sino đứng (bài học BE-33).
- **Lưu trong transaction:** credential gồm nhiều cột (token, refresh token, hạn, scope, khóa mã hóa); phải ghi tất cả hoặc không ghi gì.
- **`TransactionTemplate`** (như BE-33) cho phần "hết quyền": đổi trạng thái và publish `AccountStatusChanged` trong cùng một transaction, nên không bao giờ có trạng thái đổi mà không có event, hay ngược lại.

### 7.4 Không đè lên credential mới hơn: so `version` trước khi lưu
- **Vấn đề:** trong lúc Sino đang chờ Google refresh (có thể vài giây), ba chuyện có thể xảy ra:
  - người dùng kết nối lại account, có credential mới;
  - một lời gọi khác cũng refresh xong trước;
  - người dùng xóa account, credential bị xóa.

  Nếu cứ lưu kết quả refresh, Sino sẽ đè lên credential mới, hoặc tệ hơn là **tạo lại** credential cho account vừa bị xóa: `save` thấy không có dòng nào thì tạo dòng mới.
- **Cách làm:**
  - `CredentialStore.snapshot` đọc credential kèm `version` (cột `@Version`, tăng mỗi lần ghi).
  - `replaceIfUnchanged(accountId, version, ...)` chỉ ghi khi dòng còn đúng `version` đó. Đổi rồi, hay mất rồi, thì không ghi gì.
  - Sau đó luôn đọc lại credential đang lưu và dùng nó: của mình nếu ghi được, của người kia nếu không, `ACCOUNT_NOT_FOUND` nếu không còn.
- **`@Version` (optimistic locking) làm gì ở đây:** Hibernate viết `update ... where id = ? and version = ?`. Nếu ai đó ghi chen đúng giữa lúc Sino kiểm `version` và lúc commit, câu `update` không trúng dòng nào và Spring ném `OptimisticLockingFailureException`. Sino bắt lỗi đó và xử lý như "đã bị ghi".
- **Gọi là "optimistic" vì:** không khóa gì trước, cứ làm, đến lúc ghi mới kiểm có ai chen vào không. Hợp với chuyện hiếm khi xung đột như refresh.

### 7.5 Phân loại lỗi khi refresh

| Token endpoint trả | Sino báo | Account |
|---|---|---|
| `400` `invalid_grant` | `AUTH_EXPIRED` | chuyển `AUTH_EXPIRED` + event |
| `400` lỗi OAuth khác, `401` (ví dụ `invalid_client`), `4xx` khác | `REQUEST_REJECTED` | giữ nguyên |
| `429` | `RATE_LIMITED` | giữ nguyên |
| `5xx`, quá thời gian, không kết nối được, câu trả lời không đọc được | `PROVIDER_UNAVAILABLE` | giữ nguyên |

- **Vì sao `invalid_client` không làm account hết quyền:** đó là client secret của Sino sai (cấu hình), không phải lỗi của account. Đánh dấu hết quyền thì mọi account Gmail cùng đỏ, và người dùng kết nối lại cũng không sửa được.
- **Spring lo phần giao thức:** `RestClientRefreshTokenTokenResponseClient` gửi `grant_type=refresh_token`. Đọc mã nguồn Spring Security 7.1.1 thấy: Google không gửi refresh token mới thì Spring giữ cái cũ; không gửi `scope` thì giữ scope của token cũ. Sino không phải tự viết hai chuyện đó.
- **Thông báo lỗi** chỉ nêu loại lỗi và mã HTTP hoặc mã OAuth, không bao giờ nêu nội dung Google trả về (có thể chứa token).

### 7.6 Test: chen một việc vào đúng lúc Google đang trả lời
- **`ProviderAccessTests`:** server thật, database thật, WireMock đóng vai token endpoint của Google; lambda trong test đóng vai connector: ghi lại token nó nhận, ném `AUTH_EXPIRED` mấy lần đầu tùy test.
- **Kết nối lại hay xóa account đúng lúc đang refresh:** dùng lại mẹo `RequestListener` của BE-33. WireMock gọi listener *trước khi* trả lời, nên listener ghi credential mới (hoặc xóa account) đúng lúc Sino đang chờ Google. Kiểm: Sino dùng credential mới, không đè lên; account đã xóa thì không có credential nào bị tạo lại.
- **Ghi chen giữa lúc kiểm và lúc commit:** khe thời gian quá hẹp để WireMock chen vào, nên test dùng `@MockitoSpyBean`: bọc `CredentialStore` thật, riêng `replaceIfUnchanged` thì cho một luồng khác ghi credential rồi ném `OptimisticLockingFailureException`.
- **Bẫy gặp khi viết test này:** lần đầu cho ghi ngay trong câu trả lời giả thì test đỏ, vì câu trả lời chạy bên trong transaction của `replaceIfUnchanged` (proxy `@Transactional` bọc ngoài spy). Câu trả lời ném lỗi nên transaction rollback, xóa luôn lần ghi vừa làm. Ngoài đời người ghi chen là một transaction khác, nên test cho ghi từ một luồng khác (`CompletableFuture.runAsync`).
- **Event:** `@RecordApplicationEvents` ghi lại mọi event được publish trong test; kiểm đúng một `AccountStatusChanged` từ `CONNECTED` sang `AUTH_EXPIRED`, không chứa token.

### 7.7 Kiểm tra ngược (BE-36)
Làm hỏng code mỗi lần một chỗ (28 lần), lần nào cũng có test đỏ. Một số lỗi tiêu biểu:

| Lỗi cố ý | Test bắt được |
|---|---|
| Account `AUTH_EXPIRED` vẫn được gọi | account phải kết nối lại thì không gọi gì |
| Không refresh sớm 60 giây / refresh sớm 2 giờ | token sắp hết hạn được refresh trước; token còn hạn dùng nguyên |
| Refresh khi không có refresh token, hay khi connector không còn OAuth2 | hai test "không refresh được" |
| Refresh hai lần trong một lời gọi | token vừa refresh mà bị từ chối thì không refresh nữa |
| Lần hai vẫn bị từ chối mà không chuyển `AUTH_EXPIRED` | token mới bị từ chối thì hết quyền |
| Mọi lỗi của provider đều coi là token bị từ chối | lỗi khác đi qua nguyên vẹn |
| `invalid_grant` không làm hết quyền | refresh token bị từ chối thì hết quyền |
| Không lưu token mới | token sắp hết hạn được lưu mã hóa (4 test) |
| Lỗi ghi chen trước commit bay ra ngoài | credential ghi chen vẫn thắng |
| Không publish event / chuyển nhầm sang `DEGRADED` | các test hết quyền |
| Gọi cả account đã xóa | account đã xóa hay không có thì `ACCOUNT_NOT_FOUND` |
| Log không nêu account | log nêu account id (2 test) |
| `5xx`, quá thời gian, câu trả lời hỏng thành `REQUEST_REJECTED`; `429` không thành `RATE_LIMITED` | 4 test của `OAuth2ClientsTests` |
| Bỏ timeout của client refresh | refresh chậm thất bại trong giới hạn thời gian |
| Đưa nội dung Google trả về vào thông báo lỗi | lỗi `503` không lộ nội dung |
| Lưu không cần so `version` | refresh không đè credential mới hơn (2 test) |
| `snapshot` sai `version` hoặc thiếu refresh token | test của `CredentialStoreTests` |

Một lỗi cố ý viết sai lúc đầu (Java không cho guard của `case` là hằng `false`, nên nó không biên dịch được); viết lại thành `value() == 999` thì bị bắt. Lỗi không biên dịch không chứng minh gì về test, nên phải tách riêng, không tính là "bị bắt".

### 7.8 Sau review: account vừa kết nối lại bị đánh dấu oan
- **Lỗi agent review tìm ra (MEDIUM):** bản đầu so `version` khi *lưu* token, nhưng không so khi *đánh dấu hết quyền*. Kịch bản:
  1. Bạn rút quyền của Sino ở trang Google. Account vẫn `CONNECTED`.
  2. Một lần đồng bộ dài đang chạy.
  3. Bạn kết nối lại, nên Sino có credential mới.
  4. Lần đồng bộ cũ nhận `401` và refresh bằng refresh token cũ (đã chết); Google trả `invalid_grant`.
  5. Sino đánh dấu `AUTH_EXPIRED` cho account bạn **vừa** kết nối lại.
- **Sửa:** `expire` nhận credential mà lời gọi đã dùng. Trong transaction, nó chỉ đánh dấu khi credential đang lưu vẫn là cái đó (`CredentialStore.isCurrent`: cùng dòng, cùng `version`). Đã đổi thì không đánh dấu và báo `PROVIDER_UNAVAILABLE` (retryable); lần sau dùng credential mới.
- **Bài học:** quy tắc "đừng đè lên cái mới hơn" phải áp cho **mọi** thay đổi dựa trên dữ liệu đọc từ trước, không chỉ cho việc ghi token. Ở đây đổi trạng thái account cũng là một thay đổi như thế.
- **Vì sao so cả id dòng lẫn `version`:** xóa account thì xóa luôn dòng credential. Kết nối lại account đó thì có dòng mới, `version` lại bắt đầu từ 0, nên `version` trùng mà thực ra là credential khác.
- **Các sửa nhỏ khác:**
  - Gọi `ProviderAccess` bên trong một transaction thì báo `IllegalStateException` ngay. Spec nói "MUST ngoài transaction"; trước đây chỉ có Javadoc nhắc.
  - Luật ArchUnit `ProviderAccessArchitectureTests`: ngoài `dev.sino.provider..` không class nào được gọi `ProviderContext.credentials()`. Lambda vẫn cầm `context`, nhưng chỉ để chuyển cho connector; luật này biến "module khác không đọc token" thành kiểm tra tự động, không còn là lời hứa.
- **Giới hạn còn lại** (ghi ở design): vẫn còn một khe vài mili giây giữa lúc kiểm và lúc commit. Chặn hẳn phải khóa dòng account ở cả luồng kết nối lại, quá nặng so với rủi ro.

## 8. Biến một thư Gmail thành dữ liệu chung của Sino (BE-37)

Gmail trả một thư dưới dạng JSON (`messages.get`, `format=full`). Hộp thư của Sino cần thứ khác: ai gửi, gửi cho ai, chữ của thư, có tệp gì, thuộc cuộc trò chuyện nào. BE-37 viết lớp chuyển đổi đó; nó không gọi Google (BE-38 gọi).

- **Ở đâu:** `provider/infrastructure/gmail/`:
  - `GmailMessage`: record theo JSON của Gmail;
  - `GmailMessageNormalizer`: thư thành `NormalizedMessage`, các thư thành conversation;
  - `MailHeaders`: header mã hóa, danh sách địa chỉ;
  - `HtmlText`: HTML thành chữ.

### 8.1 Một thư là một cây MIME

```text
multipart/mixed                        (cả thư)
  multipart/related
    multipart/alternative              (hai bản của cùng nội dung)
      text/plain                       <- thân thư: Sino lấy phần này
      text/html                        <- bản HTML, dùng khi không có text/plain
    image/png  Content-ID: <logo>      <- ảnh nhúng trong HTML (cid:), không phải tệp
  application/pdf  "Hợp đồng.pdf"      <- tệp đính kèm
  text/plain       "notes.txt"         <- cũng là tệp, dù là text/plain
```

- **Quy tắc chọn chữ:** phần `text/plain` đầu tiên *không phải tệp* (không có tên tệp); không có thì phần `text/html` đầu tiên, qua jsoup. Duyệt theo chiều sâu, theo thứ tự trong thư.
- **Java dùng ở đây: đệ quy.** `firstBody(part)` kiểm chính phần đó, rồi gọi lại chính nó cho từng phần con. Cây lồng bao nhiêu tầng cũng được, code vẫn ngắn.
- **Bẫy:** Gmail để thân thư lớn ở chỗ khác: có `attachmentId`, không có `data`. Phần như thế bị bỏ qua, và Sino lấy bản HTML nếu có (test `plain-as-attachment.json`).

### 8.2 Thân thư: base64url, rồi charset
- **base64url:** Gmail gửi nội dung đã mã hóa base64 kiểu URL (dùng `-` và `_` thay cho `+` và `/`) để nhét an toàn vào JSON. Giải mã bằng `Base64.getUrlDecoder()` ra **byte**, chưa phải chữ.
- **charset:** cùng một dãy byte có thể là chữ khác nhau. Ví dụ byte `E9` là "é" trong ISO-8859-1 nhưng không hợp lệ trong UTF-8. Charset nằm trong header của chính phần đó: `Content-Type: text/plain; charset="ISO-8859-1"`. Không có hoặc Java không biết charset đó thì dùng UTF-8.
- **Java:** `new String(bytes, charset)`; `Charset.forName("x-made-up")` ném `IllegalArgumentException`.
- **Sau đó:** đổi xuống dòng kiểu email (`\r\n`) thành `\n`, bỏ khoảng trắng cuối, cắt 100 000 ký tự. Khi cắt thì không chẻ đôi một ký tự gồm hai `char` (emoji là "surrogate pair" trong Java).

### 8.3 HTML thành chữ bằng jsoup (D-61)
- **Vì sao không dùng regex xóa thẻ:** HTML thật đầy chỗ bẫy: `<script>` chứa dấu `<`, comment, entity `&amp;`, thẻ không đóng. jsoup phân tích HTML như trình duyệt.
- **Cách làm:**
  - bỏ `head`, `script`, `style`, `template`;
  - đi qua cây bằng `NodeVisitor`: `head(node)` được gọi khi vào một node, `tail(node)` khi ra. Gặp chữ thì nối chữ, gặp `<br>` thì xuống dòng, ra khỏi một thẻ khối (`p`, `div`, `li`, `td`...) thì xuống dòng;
  - cuối cùng gộp khoảng trắng (kể cả `&nbsp;`) và để tối đa một dòng trống.
- **Vì sao không dùng `Jsoup.parse(html).text()`:** hàm đó gộp cả thư thành một dòng. D-61 đòi "giữ xuống dòng hợp lý".

### 8.4 Header mã hóa: RFC 2047
- Header email chỉ được chứa ASCII. Tên tiếng Việt vì vậy được mã hóa thành "encoded word": `=?UTF-8?B?Tmd1eeG7hW4gVsSDbiBBbg==?=` là "Nguyễn Văn An".
  - `B` là base64.
  - `Q` gần giống quoted-printable: `=C3=A1` là hai byte, `_` là dấu cách.
- **Hai chi tiết dễ sai:**
  - Khoảng trắng giữa hai encoded word liền nhau không thuộc về chữ.
  - Một ký tự nhiều byte có thể bị chia đôi qua hai word: "ạ" là `E1 BA A1`, word đầu kết thúc bằng `E1`. Phải gộp byte của các word liền nhau rồi mới đổi ra chữ, nếu không sẽ ra ký tự lỗi.
- **Vì sao tự viết (`MailHeaders`):** D-61 chỉ duyệt jsoup là thư viện mới. Phần cần dùng nhỏ (khoảng 100 dòng) và có test cho từng trường hợp.

### 8.5 Đọc danh sách địa chỉ
- `To: Owner@Gmail.test, "Trần, Bình" <binh@example.com>`: tách bằng `split(",")` sẽ cắt đôi "Trần, Bình".
- `entriesOf` đi từng ký tự và nhớ đang ở trong ngoặc kép, ngoặc nhọn hay chú thích `( )`. Nó chỉ tách ở dấu phẩy nằm ngoài các thứ đó, và bỏ tên nhóm (`Team: a@x, b@y;`).
- Mỗi địa chỉ được viết thường và dùng làm ID của người tham gia. Người tham gia có email trùng email của account (không phân biệt hoa thường) được đánh dấu `self`.

### 8.6 Từ thư thành cuộc trò chuyện
- Mỗi `threadId` thành một conversation loại `THREAD`:
  - tiêu đề là Subject của thư mới nhất, bỏ tiền tố `Re:`, `Fwd:`, `FW:`, `TL:`, lặp bao nhiêu lần cũng được;
  - người tham gia là hợp của các thư, mỗi người một lần, giữ tên nếu có thư nào cho tên;
  - `lastActivityAt` là thời điểm của thư mới nhất.
- **Vì sao thời điểm là `internalDate` mà không là header `Date`:** `Date` do máy người gửi tự ghi, nên có thể sai giờ, sai múi giờ hoặc bị giả. `internalDate` do Gmail ghi lúc nhận hay gửi, nên mọi thư trong hộp được xếp theo cùng một đồng hồ.

### 8.7 Tệp đính kèm: ID nào?
- Tệp là phần có tên tệp và `attachmentId`. **Không** tính ảnh nhúng (có `Content-ID`, không đánh dấu `attachment`): đó là ảnh của HTML, tính vào thì thư quảng cáo nào cũng có kẹp giấy.
- **ID của tệp là `partId`** (ví dụ `"1"`, `"0.1"`), không phải `attachmentId`. Gmail được báo là đổi `attachmentId` mỗi lần gọi `messages.get`; nếu dùng nó, mỗi lần nhập lại thì một tệp thành hai. Điều này **chưa kiểm** với Gmail thật; BE-39 kiểm.

### 8.8 Test với thư tự dựng
- Sáu file JSON trong `src/test/resources/gmail/` có đúng dạng Gmail API, sinh bằng một script tính sẵn base64url, **không phải thư thật**. Thư thật chứa dữ liệu cá nhân, không được vào repo.
- **Java và Jackson:** `GmailMessage` là record. Jackson đọc JSON vào record qua constructor chính. `@JsonIgnoreProperties(ignoreUnknown = true)` để các trường Gmail có mà Sino không dùng (`snippet`, `historyId`, `sizeEstimate`) không làm hỏng việc đọc.
- **Test viết thêm sau khi xanh:** rà nhánh nào chưa có test thì thấy thiếu 7 trường hợp, như charset có hậu tố ngôn ngữ `UTF-8*vi`, `&nbsp;`, hay tệp có dữ liệu inline. Viết thêm test, rồi kiểm tra ngược để chắc các test đó thật sự bắt lỗi.

### 8.9 Kiểm tra ngược (BE-37)
Làm hỏng code mỗi lần một chỗ (43 lần), cuối cùng lần nào cũng có test đỏ. Một số lỗi tiêu biểu:

| Lỗi cố ý | Test bắt được |
|---|---|
| Không gộp byte của hai encoded word liền nhau | ký tự bị chia đôi qua hai word |
| Giữ khoảng trắng giữa hai encoded word khác charset | hai word khác charset (test viết thêm, xem dưới) |
| `\"` trong tên làm đóng ngoặc kép | tên có dấu nháy đã thoát và dấu phẩy (test viết thêm) |
| Không bỏ tên nhóm, ngoặc nhọn không bao giờ đóng | đọc thành viên của một nhóm |
| Không viết thường email, chấp nhận địa chỉ có khoảng trắng hay hai `@` | đọc tên và địa chỉ; bỏ mục không có địa chỉ |
| Giữ `head`, bỏ qua `<br>`, không xuống dòng sau thẻ khối, không gộp khoảng trắng | các test của `HtmlTextTests` |
| Lấy HTML trước chữ thuần, lấy tệp làm thân thư, đọc phần không có `data` | thư có cả hai bản; tệp có dữ liệu inline; thân thư Gmail để ở chỗ khác |
| Giữ `\r\n`, không cắt, cắt chẻ đôi emoji | thư có cả hai bản; chữ dài; cắt không chẻ ký tự |
| Charset lạ hay thiếu charset đọc bằng ISO-8859-1, bỏ qua charset | ba test charset |
| Thư gửi đi thành thư đến, luôn "đã đọc", không bao giờ `MIXED` | thư gửi đi có tệp; thư có cả hai bản |
| Tính ảnh nhúng là tệp; ảnh gửi dạng `attachment` có `Content-ID` không là tệp; không giải mã tên tệp | hai test tệp đính kèm |
| Không đánh dấu `self`, bỏ Cc, tên sau đè tên trước | các test người tham gia |
| Thread lấy thư cũ nhất, mất tên người tham gia | các test thread |

Lần chạy đầu có **2 lỗi cố ý sống sót**, nghĩa là test còn hở:
- **Hai encoded word khác charset:** test cũ chỉ có hai word cùng charset (đi nhánh gộp byte), nên nhánh "bỏ khoảng trắng giữa hai word" chưa từng bị kiểm.
- **Dấu nháy đã thoát:** test cũ `"Anh \"Ba\""` không có dấu phẩy phía sau dấu nháy đã thoát. Hiểu sai chỗ đóng ngoặc kép vẫn ra cùng kết quả, nên test không phân biệt được đúng với sai.

Viết thêm hai test cho đúng hai chỗ đó, chạy lại hai lỗi cố ý ấy thì cả hai bị bắt. Kiểm tra ngược không chỉ chứng minh test tốt; nó còn chỉ ra chính xác test nào còn thiếu.

### 8.10 Sau review: thư lạ không được làm kẹt cả hộp thư
Agent review tìm ra ba lỗi MEDIUM, đều cùng một ý: **một thư lạ không được làm hỏng nhiều hơn chính nó.**
- **Thư chỉ gồm một tệp** (máy scan gửi PDF): phần gốc của Gmail có `partId` rỗng. Dùng nó làm ID tệp thì kiểm tra "ID không rỗng" ném lỗi, nên cả thư bị bỏ qua. Sửa: ID `root`.
- **Header không có giá trị, phần tử `null` trong danh sách:** Java ném `NullPointerException`, không phải `ProviderException`. BE-38 sẽ chỉ bắt `ProviderException` để bỏ qua *một thư*; lỗi khác làm hỏng *cả trang*, và đọc lại cùng cursor lại hỏng, nên đồng bộ kẹt mãi. Sửa: record `GmailMessage` bỏ các "lỗ" đó ngay khi đọc JSON.
- **Ký tự NUL (`\u0000`):** PostgreSQL không cho lưu ký tự này trong cột chữ. Một thư có NUL (encoder hỏng, `=00` trong header) sẽ làm F05 không lưu được trang đó, cũng kẹt mãi. Sửa: bỏ NUL khỏi chữ, tiêu đề, tên người, tên tệp.

Bài học: với dữ liệu từ bên ngoài (thư do người lạ gửi), hãy hỏi "nếu dữ liệu này dị dạng thì cái gì hỏng theo?". Câu trả lời đúng là "chỉ thư đó".

Các sửa nhỏ khác:
- `<pre>` giữ xuống dòng.
- Bỏ ký tự vô hình mà thư quảng cáo đệm đầu thư để đoạn xem trước trống. Riêng U+200D thì giữ: nó nối các phần của emoji gia đình.
- Dấu `(` không đóng trong tên (`Bob :-( <bob@x>`) không còn nuốt cả header.
- Header gập dòng được nối lại.
- Người gửi của thư `SENT` luôn là chính account, kể cả khi gửi từ alias.

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
13. Vì sao gọi Google bên trong transaction là ý tồi?
14. Vì sao test bằng WireMock không phát hiện được chuyện Google đổi `email` thành `userinfo.email`?
15. Callback trả `302` về `/accounts?connectError=...`: điều gì xảy ra nếu đường dẫn đó lấy từ tham số `next` của request?
16. Vì sao chỉ ghi tham số `error` vào log khi nó giống một mã lỗi OAuth?
17. Bạn có Gmail A và B trong Sino, kết nối lại A nhưng chọn nhầm B: vì sao Sino không được thu hồi token vừa nhận?
18. Nếu gửi lệnh thu hồi trước khi commit mà transaction rollback thì chuyện gì xảy ra với account đó?
19. Vì sao gọi Google trong `afterCommit` vẫn chưa thật sự "ngoài transaction"?
20. Vì sao Google từ chối nếu redirect URI lệch một dấu `/`?
21. Đăng nhập bằng `curl` rồi mở `authorizationUrl` trên trình duyệt thì callback trả mã gì, vì sao?
22. Vì sao mốc thời gian chỉ nằm ở cursor khởi tạo mà không ở mọi cursor?
23. Vì sao `CURSOR_EXPIRED` không retryable, và bên gọi phải làm gì khi gặp nó?
24. Test "mọi thư đều sau mốc" xanh với một batch rỗng: test đó còn chứng minh được gì?
25. Vì sao một lần kiểm tra ngược báo "test nào cũng bắt được lỗi" vẫn có thể là kết quả sai?
26. Vì sao `ProviderAccess` nhận một lambda thay vì trả access token cho module khác?
27. Lambda đưa cho `ProviderAccess` có thể chạy mấy lần? Điều đó đòi hỏi gì ở việc nó làm?
28. Vì sao gọi Google để refresh phải nằm ngoài transaction, còn lưu token mới thì nằm trong?
29. Đang refresh thì người dùng xóa account: nếu Sino cứ `save` kết quả refresh thì chuyện gì xảy ra?
30. `@Version` bắt được loại xung đột nào, và vì sao gọi là optimistic?
31. Token endpoint trả `401 invalid_client`: vì sao Sino không chuyển account sang `AUTH_EXPIRED`?
32. Vì sao so `version` khi lưu token thôi là chưa đủ, mà còn phải so trước khi đánh dấu account hết quyền?
33. Xóa account rồi kết nối lại: vì sao chỉ so `version` của credential có thể nhầm?
34. Vì sao dùng `internalDate` của Gmail chứ không dùng header `Date` của thư?
35. Thư có cả `text/plain` và `text/html`: Sino lấy phần nào, và khi nào lấy phần kia?
36. Cùng một dãy byte, đọc bằng UTF-8 và ISO-8859-1 khác nhau thế nào? Charset của một phần thư nằm ở đâu?
37. Vì sao không tách danh sách địa chỉ bằng `split(",")`?
38. Hai encoded word liền nhau: vì sao phải gộp byte của chúng rồi mới đổi ra chữ?
39. Vì sao ảnh nhúng không được tính là tệp đính kèm, và vì sao ID của tệp là `partId`?
40. Một thư có header không có giá trị ném `NullPointerException` thay vì `ProviderException`: vì sao điều đó làm kẹt cả lần đồng bộ chứ không chỉ một thư?
