# Kiến thức Phase 2 — Một provider thật: Gmail

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F04a, `openspec/changes/f04a-gmail-connect` (kết nối Gmail bằng OAuth2): xong BE-30…BE-34 và FE-30, còn nghiệm thu. F04b, `openspec/changes/f04b-gmail-read` (đọc thư Gmail): xong BE-35…BE-39 và nghiệm thu; còn archive (sau F04a). F05, `openspec/changes/f05-unified-inbox` (lưu thư, lần nhập đầu, Hộp thư): xong BE-40, BE-41, BE-42, BE-43.
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
| BE-38 | `GmailProvider.fetchUpdates`: lần đầu, theo dõi thay đổi, lỗi, capability | xong |
| BE-39 | Test Gmail thật chạy tay (`-Preal-gmail`), README, nghiệm thu F04b | xong (Gmail thật: đọc 5 thư, refresh) |

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

## 9. Gmail đọc thư thật: lần đầu và theo dõi thay đổi (BE-38)

BE-38 nối các mảnh lại: `ProviderAccess` (BE-36) đưa token, `GmailProvider.fetchUpdates` gọi Gmail API, lớp chuẩn hóa (BE-37) biến thư thành dữ liệu chung. Gmail giờ khai báo capability `READ_MESSAGES`, `THREADS`, `ATTACHMENTS`, và bộ test chung của F03 chạy đủ phần đọc thư cho Gmail.

- **Ở đâu:** `provider/infrastructure/gmail/`:
  - `GmailApi`: mọi lời gọi tới Google, có giới hạn thời gian, và dịch lỗi;
  - `GmailCursor`: đọc và ghi cursor;
  - `GmailProvider`: điều phối.

### 9.1 Hai giai đoạn

```text
Lần đầu (cursor khởi tạo, có thể có since)
  users.getProfile            -> email (nhận "mình"), historyId H lúc bắt đầu
  messages.list q=after:<since>, 50 thư/trang
  messages.get từng thư       -> chuẩn hóa
  còn trang:  cursor v1|list|H|<since>|<pageToken>   hasMore = true
  hết trang:  cursor v1|history|H|<since>             hasMore = false

Theo dõi thay đổi (cursor v1|history|H|<since>)
  users.getProfile            -> E = historyId lúc này (trước trang đầu)
  history.list từ H: thư mới, nhãn thêm, nhãn bớt
  messages.get mỗi thư MỘT lần, bỏ thư cũ hơn since
  còn trang:  cursor v1|history|H|<since>|E|<pageToken>
  hết trang:  cursor v1|history|E|<since>
  Gmail không còn giữ thay đổi từ H (404) -> CURSOR_EXPIRED
```

### 9.2 Vì sao ghi `historyId` lúc **bắt đầu** lần đọc đầu
- `historyId` là số thứ tự của mọi thay đổi trong hộp thư; nó chỉ tăng.
- Lần đọc đầu có thể kéo dài nhiều trang, nhiều phút. Thư đến trong lúc đó nằm ở đầu danh sách (mới nhất trước), tức là ở những trang Sino *đã đọc qua*, nên lần đọc đầu bỏ sót chúng.
- Nếu lấy `historyId` lúc *kết thúc*, các thư đó nằm trước mốc theo dõi và mất luôn. Lấy lúc *bắt đầu* thì lần theo dõi đầu tiên đọc lại mọi thứ từ lúc bắt đầu: không sót thư nào.
- Cái giá: vài thư có thể được trả hai lần. Vô hại, vì mọi item có external ID và F05 sẽ ghi đè thay vì tạo bản trùng (contract F03).
- Test `theLastPageOfTheFirstSyncMovesOnToTheChangesSinceItStarted`: profile lúc đó đã là 2000, nhưng cursor vẫn là `v1|history|1000`.

### 9.3 Cursor là chuỗi Sino tự viết
- `v1|list|1000|1759998600000|page-2` chứa đủ thứ để đi tiếp: `historyId` lúc bắt đầu, mốc `since` tính bằng mili giây (để trang 2 vẫn lọc theo mốc, bài học BE-35), và token trang của Gmail.
- **"v1":** nếu sau này đổi định dạng, cursor cũ vẫn nhận ra được.
- **Kiểm trước khi gọi Google:** cursor không đúng định dạng thì `REQUEST_REJECTED` ngay, không tốn một lời gọi nào. Test đếm số request tới Gmail giả: phải là 0.
- **Java:** `record GmailCursor` cùng các hàm tạo tĩnh `firstSync`, `changesSince`, `of(value)`; regex `Pattern`/`Matcher` để đọc chuỗi.

### 9.4 Thư nào bị bỏ, thư nào bị "bỏ qua có ghi lại"
- **Bỏ im lặng:** thư nháp, Spam, Trash (theo nhãn), và thư đã bị xóa giữa lúc liệt kê và lúc lấy (`404`). Đó không phải lỗi, chỉ là không thuộc hộp thư.
- **Bỏ qua có ghi lại (`SkippedItem`):** thư Sino không chuẩn hóa được, ví dụ thiếu From, hoặc Gmail trả JSON không đọc được cho riêng thư đó.
- **Cả lời gọi thất bại:** lỗi mạng, `5xx`, hết hạn mức, token bị từ chối, hay trang danh sách không đọc được. Không trả nửa batch: bên gọi thử lại với cùng cursor.
- **Mỗi thư một lần:** một thư vừa được thêm vừa đổi nhãn xuất hiện nhiều lần trong `history.list`. `LinkedHashSet` vừa bỏ trùng vừa giữ thứ tự Gmail trả.

### 9.5 Đọc lý do của lỗi 403
- Gmail trả `403` cho cả "vượt hạn mức" lẫn "không có quyền". Cái trước là tạm thời (`RATE_LIMITED`, thử lại sau), cái sau thì không (`REQUEST_REJECTED`).
- Lý do nằm trong body JSON: `"reason": "userRateLimitExceeded"`. Sino dò bằng regex **chỉ để phân loại**; body không bao giờ vào thông báo lỗi, vì có thể chứa token hay dữ liệu thư.

### 9.6 Test với một Gmail API giả
- **`GmailSyncTests`:** WireMock trả lời như Gmail API (`/gmail/v1/users/me/...`), dùng các thư mẫu của BE-37.
- **Hai "hộp thư" trên một server:** bộ test chung F03 cần một connector bình thường và một connector có thư hỏng. Hai connector trỏ tới hai tiền tố đường dẫn khác nhau (`""` và `/broken`) của cùng một WireMock.
- **Kiểm request, không chỉ kết quả:** test kiểm Sino gửi đúng `q=after:...`, `maxResults=50`, `historyTypes`, `format=full`, header `Authorization`. Nếu Sino gửi sai, Gmail thật sẽ trả kết quả khác, và chỉ nhìn kết quả thì không phát hiện được.

### 9.7 Sau review: giữ đúng khoảng người dùng chọn, không mất thay đổi
Agent review tìm ra một lỗi MEDIUM và vài chỗ "chưa kiểm". Sửa hết, kèm bằng chứng:
- **Thư cũ lọt vào qua đường theo dõi thay đổi (MEDIUM).** Bạn chọn nhập 30 ngày, rồi trên Gmail bấm "đánh dấu tất cả đã đọc" cho 40 000 thư quảng cáo cũ. Mỗi lần đổi nhãn là một bản ghi trong `history.list`, nên bản đầu kéo cả 40 000 thư cũ vào Sino.
  - Sửa: `since` ở lại trong *mọi* cursor, và connector bỏ thư có `sentAt` trước `since`.
  - Cùng chỗ sửa đó cũng chữa luôn việc `after:` của Gmail chỉ tính theo giây: mốc 10,5 giây vẫn lọt thư lúc 10,3 giây.
- **Đứt kết nối giữa lúc đọc thư bị coi là "thư hỏng".** Đọc mã nguồn `DefaultRestClient` của Spring 7.0.9 thì thấy: lỗi IO xảy ra *trong lúc đọc body* bị gói thành `RestClientException` có `IOException` bên trong, không phải `ResourceAccessException`. Bản đầu coi đó là JSON hỏng, đẩy thư vào danh sách bỏ qua, cursor đi tiếp: thư mất vĩnh viễn vì một lần mạng chập chờn.
  - Dựng lại bằng WireMock: header gửi ngay, body nhỏ giọt chậm hơn read timeout. Trước khi sửa, test đỏ đúng như dự đoán.
  - Sửa: lần theo chuỗi `getCause()`, gặp `IOException` thì đó là lỗi mạng (`PROVIDER_UNAVAILABLE`, thử lại được).
  - Bài học: phân loại lỗi theo **nguyên nhân**, không theo kiểu ngoại lệ ở lớp ngoài cùng.
- **Lượt đọc history nhiều trang:** bản đầu kết thúc ở `historyId` Gmail trả cùng trang cuối. Nếu Gmail lật trang trên một ảnh chụp cố định, những thay đổi xảy ra trong lúc lật trang sẽ mất.
  - Sửa: kết thúc ở `historyId` đọc *trước* trang đầu. Lần sau đọc lại một ít, trùng thì vô hại.
  - Đây vẫn là nguyên tắc của mục 9.2: khi không chắc, chọn đọc trùng thay vì có thể bỏ sót.
- **Page token Gmail không còn nhận (`400`):** bản đầu báo `REQUEST_REJECTED` nên mỗi lần thử lại đều hỏng y như cũ. Giờ báo `CURSOR_EXPIRED`, bên gọi đọc lại từ đầu.
- **Page token có ký tự `+`, `/`, `{`:** gửi dưới dạng *biến URI*, Spring mã hóa đầy đủ. Viết thẳng vào mẫu URI thì `{` bị hiểu là chỗ thay biến.

### 9.8 Kiểm tra ngược (BE-38)
Làm hỏng code mỗi lần một chỗ (29 lần), lần nào cũng có test đỏ. Một số lỗi tiêu biểu:

| Lỗi cố ý | Test bắt được |
|---|---|
| Cursor quên `since`, trang sau quên `since` | lần đầu theo mốc; trang cuối của lần đầu |
| Bỏ `q=after:`, trang 100 thư, bỏ `historyTypes`, bỏ `format=full` | các test kiểm request |
| Quên token trang (list hoặc history) | đọc hết hộp thư nhiều trang; còn thay đổi ở trang sau |
| `404` của history không thành `CURSOR_EXPIRED`; `404` của một thư làm hỏng cả lời gọi | cursor hết hạn; thư bị xóa giữa chừng |
| `403` hết hạn mức thành "từ chối", mất `Retry-After` | hạn mức; chờ theo `Retry-After` |
| Gọi Google trước khi kiểm cursor | cursor lạ bị từ chối mà không có request nào |
| Lần đầu kết thúc ở `historyId` khác lúc bắt đầu | trang cuối của lần đầu |
| Lấy một thư hai lần, giữ thư nháp/Spam/Trash | mỗi thư một lần; bỏ nháp, Spam, Trash |
| Thư không đọc được làm hỏng cả trang | thư hỏng bị bỏ qua (cả trong bộ test chung F03) |
| Bỏ `labelsRemoved`, không bỏ bản ghi `null` | các test history |
| Bỏ capability `THREADS`, không có conversation | test capability; test "mình" trong thư |

Sau review thêm 14 lỗi cố ý cho phần sửa (cursor bỏ `since` hay điểm kết thúc, không lọc thư cũ, kết thúc lượt history ở `historyId` mới nhất, đứt kết nối coi là thư hỏng, page token hết hạn, page token ghi thẳng vào mẫu URI, body rỗng, `RESOURCE_EXHAUSTED`): cả 14 có test đỏ.

## 10. Thử với Gmail thật bằng một test chạy tay (BE-39)

WireMock chỉ giỏi bằng hiểu biết của người viết nó về Google (bài học D-51 ở mục 5.4). BE-39 cho phần đọc thư chạy với hộp thư Gmail thật của bạn trước khi F05 lưu thư (D-58).

### 10.1 Test có tag, chạy tay
- **Ở đâu:** `src/test/java/.../gmail/RealGmailTests.java`, gắn `@Tag("real-gmail")`.
- **Chạy:** `./mvnw test -Preal-gmail`, từ `apps/sino-api`. Cần database Compose đang chạy và một Gmail đã kết nối qua web.
- **Vì sao không chạy trong `./mvnw verify` hay CI:**
  - cần một tài khoản Gmail thật, đã kết nối, cùng client secret của Google, mà CI không có và không được có;
  - kết quả phụ thuộc hộp thư lúc đó, nên không lặp lại được;
  - nó chạm vào dữ liệu cá nhân.

  Test của CI phải chạy được ở bất cứ đâu và luôn cho cùng kết quả.
- **Maven và JUnit:**
  - Surefire loại tag `real-gmail` bằng `excludedGroups`.
  - Profile Maven `real-gmail` (`-Preal-gmail`) bỏ loại trừ đó và chỉ chọn tag này (`groups`).
  - Lệnh kiểu `-Dgroups=real-gmail` không đủ, vì loại trừ luôn thắng lựa chọn.
- **Profile Spring `local`:** test dùng `@ActiveProfiles("local")`, nên đọc `.env` và database Compose giống hệt backend khi chạy trên máy.
- **Bẫy đã gặp:** lúc đầu test dùng `webEnvironment = NONE` để khỏi mở cổng, nhưng context không lên: cấu hình bảo mật cần `HttpSecurity`, mà bean này chỉ có khi có web context. Môi trường web *giả* (mặc định của `@SpringBootTest`) có web context mà không mở cổng nào, nên backend đang chạy ở `:8080` không bị ảnh hưởng.

### 10.2 Bỏ qua chứ không đỏ
- Chưa kết nối Gmail thì test gọi `assumeFalse(...)`: JUnit đánh dấu **bỏ qua** (skipped), không phải thất bại. "Không có gì để kiểm" khác với "kiểm mà sai".
- Lần chạy đầu (account Gmail đã bị xóa ở BE-34) cho đúng kết quả đó: 2 test bỏ qua, kèm lý do "Connect a Gmail account on this machine first".

### 10.3 Chỉ in số đếm
- Test in các dòng `[real-gmail] ...`: bao nhiêu thư, bao nhiêu có chữ, bao nhiêu bị bỏ qua... Không bao giờ in nội dung thư, tiêu đề hay địa chỉ: log của test có thể bị chép, dán, lưu lại.
- **Test thứ hai chỉ báo cáo**, không kiểm gì. Nó trả lời các câu design để lại cho Gmail thật:
  - `attachmentId` có đổi giữa hai lần đọc không (lý do dùng `partId`);
  - bao nhiêu thư có ảnh nhúng, trong đó bao nhiêu không đến từ danh sách thư (có thể là ảnh người gửi dán vào);
  - thư chuyển tiếp dạng tệp (`message/rfc822`);
  - header gập dòng.
- **Lấy token trong test:** test gọi thẳng Gmail API bằng token lấy trong lambda của `ProviderAccess`. Luật ArchUnit "chỉ connector đọc `credentials()`" (mục 7.8) chỉ áp cho code chính, không áp cho test.

### 10.4 Kết quả với Gmail thật
**Kết quả ngày 2026-10-09:**
- **Kết nối:** bạn kết nối lại Gmail qua web bằng tài khoản test user. Một tài khoản khác bị Google chặn ngay trên trang của Google (`403 access_denied`): chế độ Testing chỉ cho các test user, và Sino không hề nhận được lời gọi nào.
- **Đọc 7 ngày gần nhất:** 5 thư, 5 conversation, cả 5 thư có chữ, 0 bị bỏ qua, 0 tiêu đề hay tên còn dạng `=?...?=`, cả 5 conversation nhận ra chính account.
- **Refresh thật:** đặt hạn token trong database local về quá khứ rồi chạy lại. `ProviderAccess` refresh với Google thật: hạn mới thêm khoảng 1 giờ, `version` của credential tăng 0 → 1, refresh token giữ nguyên, account vẫn `CONNECTED`. Log không có token nào.
- **Các câu hỏi để ngỏ:** hộp thư test 7 ngày qua không có thư kèm tệp, ảnh nhúng hay thư chuyển tiếp, nên câu "`attachmentId` có đổi không" là **0 trên 0**: chưa trả lời. `partId` đúng trong cả hai trường hợp. Muốn biết thì gửi một thư có tệp vào hộp thư test rồi chạy lại.
- **Nghiệm thu còn tìm ra một lỗ:** scenario "connector không có `READ_MESSAGES` phải từ chối đọc" trước đây được kiểm nhờ Gmail *chưa* đọc được thư. BE-38 làm Gmail đọc được, nên không còn connector nào chạy kiểm tra đó. Đã thêm một mẫu connector giả "chỉ gửi". Bài học: một test bị **bỏ qua** ở mọi nơi thì không bảo vệ gì cả, và chỉ đối chiếu từng scenario với test mới thấy điều đó.

---

## 11. F05 mở đầu: ước lượng số thư và thư hàng loạt (BE-40)

F05 (`openspec/changes/f05-unified-inbox`) lưu thư vào database và cho người dùng nhập thư lần đầu. Trước khi có bảng nào, BE-40 thêm vào contract hai thứ mà các task sau cần:
- **số thư ước lượng**, cho bước "Đồng bộ" của canvas: số thư và số phút dự kiến (D-65);
- **dấu "thư hàng loạt"**, cho tab "Cần trả lời" (D-68).

### 11.1 Method mặc định trong interface: `estimateMessages`
- **Ở đâu:** `provider/spi/MessageProvider.java`.
- **Là gì:** `default OptionalLong estimateMessages(ProviderContext context, Instant since)`, mặc định trả `OptionalLong.empty()`. `since = null` nghĩa là toàn bộ hộp thư.
- **Để làm gì:** hỏi connector "nhập từ mốc này thì khoảng bao nhiêu thư?".
- **Vì sao có cài đặt mặc định** (câu gợi ý của task):
  - Ước lượng là thứ *có thì tốt*. Connector không biết đếm vẫn đúng hợp đồng khi trả "không biết", và bên gọi xử lý được câu trả lời đó: API ước lượng của BE-45 trả `messages` rỗng (spec `initial-sync`).
  - Thêm method có `default` không làm hỏng class nào đang implement interface (câu 2 của phần Tự kiểm tra). Connector giả, Gmail, các connector của F09 sau này chỉ cài khi muốn.
  - `fetchUpdates` thì không có câu trả lời mặc định nào đúng. Trả một batch rỗng nghĩa là "không có thư": một lời nói dối im lặng, connector quên cài thì Sino tưởng hộp thư trống. Để nó `abstract` thì trình biên dịch bắt mỗi connector phải tự quyết.
  - `sendMessage` có `default` vì với connector không gửi được, câu trả lời đúng là ném `CAPABILITY_NOT_SUPPORTED`.
- **Vì sao `OptionalLong`** chứ không phải `Long` có thể `null` hay số `-1`: kiểu trả về nói luôn "có thể không có", nên bên gọi khó quên kiểm. `OptionalLong` giữ `long` nguyên thủy, không bọc thành `Long`.
- **Luật của contract:**
  - số trả về không âm;
  - chỉ là ước lượng: vòng nhập dừng khi `hasMore = false`, không bao giờ dừng vì "đã đủ số ước lượng";
  - connector không có `READ_MESSAGES` trả rỗng và không gọi provider.
- **Kit F03** có thêm hai kiểm tra: connector đọc được thì ước lượng rỗng hoặc ≥ 0; connector không đọc được thì rỗng. Mẫu "chỉ gửi" của connector giả được cấu hình sẵn một ước lượng (5) mà vẫn phải trả rỗng. Nhờ vậy kiểm tra thứ hai thật sự kiểm một điều gì đó (bài học ở mục 10.4).

### 11.2 Gmail ước lượng thế nào
```text
estimateMessages(context, since)
  since có      -> GET .../messages?q=after:<giây>&maxResults=1 -> resultSizeEstimate
  since = null  -> GET .../profile                              -> messagesTotal
  thiếu số, số âm         -> rỗng
  401                     -> ProviderException AUTH_EXPIRED
  5xx, mất kết nối        -> ProviderException PROVIDER_UNAVAILABLE
  JSON đọc không được     -> ProviderException PAYLOAD_NORMALIZATION_FAILED
```
- **Vì sao `maxResults=1`:** Sino chỉ cần con số Gmail gửi kèm danh sách, không cần chính danh sách. Một lời gọi, trả nhanh.
- **Một đường gọi cho cả hai việc:** `GmailApi.list(...)` dùng chung cho đọc một trang thư (`maxResults=50`) và cho ước lượng (`maxResults=1`). Vì thế lỗi của cả hai được dịch giống nhau qua `call()` (mục 9.5).
- **Bẫy:**
  - `resultSizeEstimate` đúng như tên của nó: một ước lượng, có thể lệch nhiều với hộp thư lớn.
  - `messagesTotal` đếm cả nháp, spam, thùng rác, những thư Sino bỏ ra (mục 9.4).

  Vì thế web luôn ghi "khoảng", và khi số đã nhập vượt ước lượng thì mẫu số tăng theo (design F05). Với toàn bộ hộp thư thì ngược lại: số đã nhập thường thấp hơn ước lượng, nên lúc `DONE` web phải hiện "xong" bất kể con số ước lượng (ghi cho BE-45).
- **Vì sao toàn bộ hộp thư dùng `messagesTotal`** mà không dùng `resultSizeEstimate` của một danh sách không có `q`: D-65 chọn như vậy. `messagesTotal` là số đếm chính xác (chỉ dư phần nháp, spam, thùng rác), còn `resultSizeEstimate` vốn thô với hộp thư lớn. Cách nào sát hơn là câu hỏi đo đạc: BE-46 so cả hai với số thư nhập thật.
- **Phương án bị loại:** liệt kê hết ID để đếm cho đúng. Cách đó cần hàng trăm lời gọi trước khi nhập được thư nào.
- **Lỗi khi ước lượng:** connector ném `ProviderException` như mọi thao tác khác; bên gọi (BE-45) coi đó là không có ước lượng. Một ước lượng hỏng không được chặn việc nhập thư.

### 11.3 Khóa metadata dùng chung `bulk`
- **Ở đâu:** hằng số `NormalizedMessage.BULK` trong `spi`; Gmail đặt khóa này trong `GmailMessageNormalizer`.
- **Là gì:** `metadata["bulk"] = "true"` khi thư được gửi hàng loạt: bản tin, quảng cáo, thông báo tự động. Connector không biết thì bỏ trống, và thiếu khóa nghĩa là không hàng loạt.
- **Để làm gì:** "Cần trả lời" là conversation có thư mới nhất là thư đến **và** không hàng loạt (D-68). Không có dấu này thì mọi bản tin, mọi quảng cáo đều thành "cần trả lời".
- **Vì sao là một khóa metadata, không phải trường mới của record:**
  - Thêm một thành phần vào record `NormalizedMessage` làm đổi constructor, nên mọi chỗ đang tạo record đều phải sửa. Record không có tham số mặc định.
  - Đây là một gợi ý mà nhiều connector không biết. `metadata` vốn là chỗ cho "giá trị nhỏ không có trường chuẩn hóa".
- **Vì sao hằng số nằm trong `spi`:** tên khóa là một phần của hợp đồng. Connector và module `conversation` (BE-43) dùng cùng một hằng số, không ai gõ lại chuỗi `"bulk"`.
- **Gmail đánh dấu khi:**
  - thư có nhãn `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_UPDATES` hoặc `CATEGORY_FORUMS`: các tab mà Gmail tự xếp thư hàng loạt vào;
  - hoặc thư có header `List-Unsubscribe` (RFC 2369): phần mềm gửi thư hàng loạt thêm link hủy đăng ký vào đây. Một bản tin Gmail để ở tab Chính vẫn được nhận ra (thư mẫu `newsletter.json`).

  Nhãn `CATEGORY_PERSONAL` (tab Chính), `IMPORTANT` hay nhãn do người dùng tạo thì không.
- **Bẫy:**
  - Tên header không phân biệt hoa thường: `list-unsubscribe` vẫn là nó. `GmailMessage.Part.header` đã so như vậy từ BE-37, và có test riêng cho chữ thường.
  - Thư đi qua một nhóm (Google Groups, kể cả địa chỉ chung kiểu `support@` dựng bằng nhóm) thường mang `List-Unsubscribe`, nên theo quy tắc này bị coi là hàng loạt dù người viết là người thật: conversation vẫn ở Hộp thư nhưng không vào "Cần trả lời". D-68 không bàn tới trường hợp này. Review BE-40 nêu ra, và bạn chốt **D-74 = A**: giữ quy tắc, thư qua nhóm vẫn là hàng loạt. Điều này chưa kiểm với hộp thư thật.
  - Sửa thư mẫu cũ phải sửa cả assertion cũ: `html-only.json` có nhãn `CATEGORY_PROMOTIONS`, nên test trước đây kiểm "metadata chỉ có `subject`" giờ phải là `subject` và `bulk`.

### 11.4 Connector giả có ước lượng
- `FakeMessageProvider.builder(...).estimate(1180)` trả số đó với mọi mốc.
- Không cấu hình thì trả rỗng. Không có `READ_MESSAGES` thì trả rỗng, kể cả khi đã cấu hình.
- BE-45 dùng nó để test API ước lượng và vòng nhập mà không cần Gmail.

### 11.5 Kiểm tra ngược (BE-40)
Làm hỏng code mỗi lần một chỗ (16 lần), lần nào cũng có test đỏ; lần chạy mốc khi chưa sửa gì thì xanh.

| Lỗi cố ý | Test bắt được |
|---|---|
| Đảo hai nhánh có mốc / toàn bộ hộp thư | ước lượng từ một mốc; toàn bộ hộp thư |
| Giữ số âm; bỏ số 0; bỏ kiểm `null` (lỗi khi mở hộp `Long`) | không có số dùng được; hộp thư trống |
| Ước lượng xin cả trang 50 thư, hoặc quên `q=after:` | ước lượng từ một mốc (kiểm request) |
| Bỏ từng nhãn trong bốn nhãn hàng loạt; đòi mọi nhãn đều là nhãn hàng loạt; bỏ hẳn phần nhãn | thư ở tab hàng loạt; thư quảng cáo |
| Bỏ phần `List-Unsubscribe` | bản tin ở tab Chính; header chữ thường |
| Thư nào cũng là hàng loạt | thư cá nhân; thư trả lời có cả text và HTML |
| Hàm mặc định trả `0` thay vì rỗng | hàm mặc định không ước lượng |
| Connector giả ước lượng dù không có `READ_MESSAGES` | kiểm tra "không đọc được thì không ước lượng" của bộ test chung |

---

## 12. Module khác đọc danh sách account: `AccountDirectory` (BE-41)

Từ F05, hai module mới cần biết về account. `conversation` (Hộp thư, BE-44) cần biết owner có những account nào còn được hiện. `sync` (lần nhập đầu, BE-45) cần biết account có thuộc owner không và của provider nào. BE-41 cho họ một cửa đọc.

### 12.1 Interface ở gói gốc, cài đặt ở `application`
- **Ở đâu:** `account/AccountDirectory.java` và `account/AccountSummary.java` (gói gốc của module); cài đặt ở `account/application/AccountDirectoryService.java`.
- **Là gì:**
  - `accountsOf(ownerId)`: các account chưa xóa của owner, cũ trước mới;
  - `find(ownerId, accountId)`: account đó, hoặc `Optional.empty()` khi nó không thuộc owner, đã xóa hay không tồn tại.

  Mỗi account là một `AccountSummary(id, provider, status, externalAccountId)`.
- **Vì sao tách interface và cài đặt:** Spring Modulith coi gói gốc của module là API công khai, còn gói con là nội bộ. Module khác chỉ được dùng `AccountDirectory`; nếu nó chạm vào `AccountDirectoryService` thì `ModularityTests` đỏ. Cách làm giống `ProviderAccess` ở mục 7.
- **Không thêm truy vấn mới:** service dùng lại hai truy vấn mà API account đang dùng (`...AndRemovedAtIsNull`). Luật "account đã xóa coi như không có" chỉ nằm ở một chỗ.
- **`@Transactional(readOnly = true)`:** cả lần đọc nằm trong một transaction chỉ đọc. Hibernate biết sẽ không có gì để ghi, nên bỏ bước so sánh entity trước khi commit.

### 12.2 Vì sao module khác không được tự `JOIN` bảng `connected_account` (câu gợi ý của task)
- **Bảng là chi tiết bên trong của module `account`.** Đổi tên cột hay đổi luật thì module tự `JOIN` vỡ mà không ai báo trước. Modulith và ArchUnit chỉ thấy phụ thuộc giữa các class Java. Một câu `JOIN` nằm trong chuỗi SQL qua mặt mọi kiểm tra đó.
- **Luật phải đi cùng dữ liệu.** Account đã xóa vẫn nằm trong bảng (D-13 B), và account của owner khác phải coi như không có. Nếu mỗi module tự viết lại các điều kiện đó, sẽ có ngày một chỗ quên `removed_at IS NULL`: thư của account đã xóa hiện lại trong Hộp thư (trái D-66).
- **Ngay cạnh là bảng credential.** Module khác không có lý do gì để đến gần token.
- **Cái giá:** hai bước thay vì một câu `JOIN`. Bên gọi lấy danh sách account trước, rồi lọc dữ liệu của mình theo các ID đó. Mỗi owner chỉ có vài account, nên rẻ.

### 12.3 Trả một record riêng, không trả entity
- **Không trả `ConnectedAccount`:** entity có các method đổi trạng thái (`disable()`, `markAuthExpired()`...) và được JPA theo dõi. Module khác cầm entity trong transaction của mình là có thể sửa account mà module `account` không hay biết. Thêm một cột vào entity cũng tự động lộ cột đó ra ngoài.
- **`AccountSummary` là record bất biến, bốn trường:** không credential, không tên hiển thị hay ảnh. Test `carriesNoCredentialAndNoProfileData` giữ đúng bốn trường đó: ai thêm trường thứ năm thì phải sửa test, tức là phải nghĩ lại.
- **Trả cả account `DISABLED`, `AUTH_EXPIRED`** (cả `accountsOf` lẫn `find`, có test cho từng trạng thái): cửa đọc không quyết thay bên gọi. Hộp thư sẽ ẩn account `DISABLED` (BE-44). Màn đồng bộ thì vẫn cần thấy account `AUTH_EXPIRED` để báo "kết nối lại". Luật lọc thuộc về bên dùng.

### 12.4 Bẫy khi test thứ tự "cũ trước mới"
- Hai account tạo liền nhau trong một test có thể có cùng `created_at`. Khi đó test có thể xanh hay đỏ tùy lần chạy.
- Vì vậy test lưu account trước, rồi đặt `created_at` bằng SQL.
- Không có `ORDER BY` thì PostgreSQL trả dòng theo cách nó chọn để đọc, và test không được trùng với bất kỳ cách nào trong số đó:
  - đọc lần lượt cả bảng: ra theo thứ tự các dòng nằm trong bảng. Một câu `UPDATE` ghi bản mới của dòng vào cuối bảng, nên thứ tự này là thứ tự **cập nhật**, không phải thứ tự lưu;
  - đọc qua index unique `(user_id, provider, external_account_id)`: ra theo provider rồi ID bên provider.

  Test chọn thứ tự lưu, thứ tự cập nhật và thứ tự của index đều khác thứ tự mong đợi. Khi đó kết quả đúng thì chỉ có thể là nhờ `ORDER BY created_at`.
- **Sau review:** bản đầu của test cập nhật đúng theo thứ tự mong đợi. Reviewer chỉ ra rằng như vậy một truy vấn quên `ORDER BY` có thể vẫn xanh. Chạy thử thì lỗi đó vẫn bị bắt, vì lần đó PostgreSQL đọc qua index. Nhưng đó là may mắn, nên thứ tự cập nhật đã được đổi.
- Sau câu SQL phải gọi `entityManager.clear()`. Nếu không, JPA trả bản entity đang giữ trong bộ nhớ, với `created_at` cũ.

### 12.5 Kiểm tra ngược (BE-41)
Làm hỏng code mỗi lần một chỗ (12 lần, sau review thêm 2), lần nào cũng có test đỏ; lần chạy mốc khi chưa sửa gì thì xanh.

| Lỗi cố ý | Test bắt được |
|---|---|
| Danh sách giữ account đã xóa; `find` thấy cả account đã xóa | account đã xóa bị bỏ ra |
| Danh sách gồm account của mọi owner; `find` không kiểm owner | account của owner khác bị bỏ ra |
| Mới trước cũ; quên hẳn `ORDER BY` (thêm sau review) | danh sách cũ trước mới, mọi trạng thái |
| Trạng thái luôn `CONNECTED`, provider luôn `gmail`, tên hiển thị thay cho ID bên provider | danh sách; tìm một account |
| `find` chỉ trả account `CONNECTED` (thêm sau review) | tìm account mọi trạng thái |
| Bỏ từng kiểm tra `null` của `AccountSummary` (bốn lần) | mọi trường đều bắt buộc |

---

## 13. Lưu thư vào database: module `conversation` (BE-42)

Từ F05, Sino giữ thư trong database của mình (D-63). BE-42 dựng bốn bảng và hàm `ConversationStore.store(accountId, batch)`, nhận một trang thư mà connector trả về.

```text
conversation               một cuộc trò chuyện của một account     UNIQUE (account_id, external_conversation_id)
  conversation_participant   người tham gia                       UNIQUE (conversation_id, external_participant_id)
  message                    thư                                  UNIQUE (conversation_id, external_message_id)
    attachment               thông tin tệp (chưa có nội dung)     UNIQUE (message_id, external_attachment_id)

store(accountId, batch)          trong transaction của bên gọi
  1. conversation        upsert; thư nhắc tới conversation lạ -> tạo bản tối thiểu (UNKNOWN)
  2. người tham gia      upsert; người gửi không có trong danh sách -> thêm, chỉ có ID
  3. thư                 upsert; không đổi gì thì không ghi
  4. tệp                 upsert; tệp không còn trong thư -> xóa
  -> StoreResult(newMessages, updatedMessages)
```

### 13.1 SQL thuần qua `JdbcClient`, không entity JPA
- **Ở đâu:** `conversation/infrastructure/JdbcConversationStore.java`; interface `ConversationStore` và record `StoreResult` ở gói gốc `conversation`, nên module `sync` (BE-45) dùng được.
- **Là gì:** `JdbcClient` (Spring 6.1+) gửi câu SQL với tham số có tên (`:account`), rồi đổi từng dòng kết quả thành đối tượng Java.
- **Vì sao không dùng JPA như module `account`:** việc chính ở đây là upsert hàng loạt theo khóa bên ngoài, và sau này là truy vấn danh sách Hộp thư (BE-44). JPA không có `ON CONFLICT`, và một entity cho mỗi thư chỉ làm thêm việc. Đây là một chốt kỹ thuật trong design F05.
- **ID:** `DEFAULT uuidv7()`. PostgreSQL 18 có sẵn hàm này, nên ID vẫn là UUIDv7 như mọi bảng khác (D-08) dù không có Hibernate sinh ID.
- **Không có khóa ngoại sang `connected_account`:** bảng đó thuộc module `account` (mục 12.2). Giữa hai module chỉ giữ ID. Account bị xóa thì thư vẫn còn (D-66).

### 13.2 Upsert: `INSERT ... ON CONFLICT ... DO UPDATE` (câu gợi ý của task)
Câu hỏi: `ON CONFLICT DO UPDATE` khác gì cách JPA "tìm theo khóa, không thấy thì `save`" khi hai lượt cùng lưu một thư?
- **Cách "tìm rồi lưu"** gồm hai câu lệnh. Lượt A tìm, không thấy. Lượt B tìm, cũng không thấy, vì A chưa commit. Cả hai cùng `INSERT`:
  - có ràng buộc `UNIQUE`: một lượt nổ lỗi trùng khóa, và cả transaction của nó (cả trang thư) bị rollback;
  - không có ràng buộc: hai bản của cùng một thư.
- **`ON CONFLICT`** là một câu lệnh. PostgreSQL tự kiểm tra trùng khóa ngay lúc chèn. Lượt đến sau chờ lượt kia commit, rồi chuyển sang nhánh `DO UPDATE`. Không lỗi trùng khóa, không bản trùng. (Đúng với mức cô lập mặc định `READ COMMITTED` mà Sino dùng; ở mức cao hơn, lượt sau nhận lỗi serialization.)
- **Điều kiện cần:** phải có ràng buộc `UNIQUE` đúng trên cột nêu trong `ON CONFLICT (...)`. Vì vậy mỗi bảng có một khóa `UNIQUE` theo ID bên ngoài.
- Lần nhập đầu (BE-45) và đồng bộ định kỳ (F07) có thể cùng lưu một thư: đây là lý do chính để chọn upsert.

### 13.2b Hai lượt cùng account: khóa theo account (sau review)
- **Vấn đề reviewer chỉ ra:** upsert khóa dòng, kể cả dòng không đổi, và giữ khóa tới khi commit.
  - Lượt A lưu conversation theo thứ tự [X, Y], lượt B theo thứ tự [Y, X].
  - A khóa X, B khóa Y, rồi mỗi lượt chờ lượt kia: **deadlock**.
  - PostgreSQL phát hiện và hủy một transaction, nên một trang thư bị rollback.
- **Cách sửa:** câu đầu tiên của `store` là `SELECT pg_advisory_xact_lock(hashtextextended('conversation:' || account, 0))`.
  - **Advisory lock** là khóa theo một con số do ứng dụng chọn, không gắn với dòng nào. Bản `_xact` tự nhả khi transaction kết thúc.
  - Các lượt lưu của cùng một account vì vậy chạy lần lượt. Account khác có số khác nên không phải chờ.
  - Hai account hiếm khi trùng số. Nếu trùng, chúng chỉ phải chờ nhau, không hỏng gì.
- **Test:** hai luồng thật, mỗi luồng một transaction.
  - Lượt đầu lưu rồi giữ transaction mở.
  - Lượt thứ hai của **cùng** account, vào một conversation khác (không đụng dòng nào của lượt đầu), phải chờ.
  - Lượt của account **khác** chạy xong ngay.
- **Chưa xong ở đây:** `PATCH` của BE-44 sửa conversation và thư. Nó phải lấy cùng khóa này, không chỉ để khỏi deadlock: mục 14.9 cho thấy thiếu khóa thì số liệu có thể sai. Đã ghi vào task BE-44.

### 13.2c Ký tự NUL: chặn ngay ở cửa (sau review)
- PostgreSQL không lưu được ký tự NUL (`\u0000`) trong `text` lẫn `jsonb`.
- Chỉ một ký tự như vậy, chẳng hạn trong Message-ID của một thư lạ, là cả trang thư bị từ chối. Lần thử lại nào cũng vấp đúng trang đó, nên cursor không bao giờ tiến.
- Connector Gmail đã bỏ NUL khỏi chữ và tiêu đề (BE-37), nhưng chưa bỏ khỏi Message-ID hay địa chỉ.
- `store` vì vậy bỏ NUL khỏi mọi chuỗi của trang (`WithoutNul`) trước khi ghi. Đây là giới hạn của nơi lưu, nên nơi lưu tự lo, và connector nào cũng được bảo vệ.

### 13.3 Không đổi gì thì không ghi: `DO UPDATE ... WHERE ... IS DISTINCT FROM`
- 02B mục 11: thư không đổi gì không được cập nhật. Không có `WHERE`, mỗi lần đồng bộ lại sẽ ghi lại mọi thư. Mỗi lần ghi PostgreSQL tạo một bản mới của dòng, làm bảng phình và tốn thời gian dọn.
- `WHERE (m.text_content, m.status, ...) IS DISTINCT FROM (EXCLUDED.text_content, EXCLUDED.status, ...)` so cả bộ cột một lần. `EXCLUDED` là dòng định chèn.
- **"Không ghi" chưa phải "không khóa":** dòng không đổi thì không có bản mới, nhưng vẫn bị khóa tới khi transaction commit (mục 13.2b).
- **Vì sao `IS DISTINCT FROM` chứ không phải `<>`:** với `NULL`, `<>` cho ra `NULL` (không biết), nên thư đổi từ "không có chữ" sang "có chữ" sẽ không được ghi. `IS DISTINCT FROM` coi `NULL` là một giá trị bình thường.
- **`RETURNING id, xmax = 0`:** câu lệnh trả về dòng nó vừa chèn hoặc vừa sửa; dòng không đổi thì không trả gì.
  - `xmax` là một cột ẩn của PostgreSQL. Với dòng vừa chèn thì nó bằng 0; với dòng vừa sửa qua `ON CONFLICT` thì khác 0. Nhờ vậy một câu lệnh biết thư là mới hay đã cập nhật.
  - Không có dòng trả về thì thư không đổi. Lúc đó `store` đọc ID của thư bằng một câu `SELECT` riêng, vì bước tệp cần ID đó.
  - Đây là chi tiết bên trong của PostgreSQL, ai cũng dùng nhưng tài liệu chính thức không hứa. Test "lưu lần đầu được 2 thư mới" sẽ báo nếu nó đổi.
- **Thư "đã cập nhật"** là thư có dòng đổi, hoặc có tệp được thêm, sửa hay xóa.

### 13.4 Gộp chứ không đè
- **Người tham gia:** `display_name = COALESCE(EXCLUDED.display_name, p.display_name)`. Lần này không có tên thì giữ tên cũ; có tên mới thì lấy tên mới. Ảnh cũng vậy. `is_self = p.is_self OR EXCLUDED.is_self`: đã từng là chính account thì luôn là chính account.
- **Conversation:** loại lấy theo connector, trừ `UNKNOWN`: một trang không biết loại không được hạ `THREAD` đã biết xuống `UNKNOWN` (`COALESCE(NULLIF(EXCLUDED.type, 'UNKNOWN'), c.type)`). Ảnh giữ như người tham gia. Tiêu đề chỉ được điền khi chưa có. BE-43 sẽ thêm "hoặc khi trang có thư mới hơn".
- **Conversation tối thiểu:** thư nhắc tới một conversation mà batch không mô tả thì được tạo một dòng loại `UNKNOWN`, không tiêu đề, bằng `ON CONFLICT DO NOTHING`. Dòng tối thiểu không bao giờ đè lên dòng đầy đủ. Ngược lại, khi bản đầy đủ đến sau, nó thay bản tối thiểu.
- **Tệp:** upsert từng tệp, rồi `DELETE` những tệp của thư không còn trong danh sách. Bẫy: `NOT IN ()` với danh sách rỗng là SQL sai, nên khi thư không còn tệp nào thì xóa hết bằng một câu riêng.

### 13.5 Chạy trong transaction của bên gọi: `Propagation.MANDATORY`
- `@Transactional(propagation = MANDATORY)` bắt buộc đã có transaction từ trước: gọi `store` khi chưa có thì ném `IllegalTransactionStateException`, chưa ghi gì.
- **Vì sao:** BE-45 lưu một trang thư và ghi cursor tiếp theo **trong cùng một commit** (spec `initial-sync`). Nếu `store` tự mở và tự commit transaction riêng, thư có thể đã lưu mà cursor chưa tiến (hay ngược lại) khi lỗi xảy ra giữa hai bước.
- **Test:** đánh dấu riêng một test `@Transactional(propagation = NOT_SUPPORTED)` để nó chạy ngoài transaction của test.

### 13.6 Ranh giới với BE-43
BE-42 chỉ làm bước 1–4 của design. Phần còn lại để BE-43, có test riêng:
- **Đã đọc:** thư mới lấy trạng thái đọc của provider (`is_read = provider_read`). Thư đã lưu thì chưa động tới hai cột này (test `aChangedReadStateIsLeftForTheReadRuleOfBe43`). Quy tắc "thay đổi mới nhất thắng" của D-67 là việc của BE-43.
- **Tổng hợp:** các cột như số chưa đọc, đoạn xem trước, cần trả lời đã có trong bảng (V6), nhưng BE-43 mới tính. `last_message_at` bắt buộc có giá trị ngay lúc tạo conversation, nên BE-42 đặt nó bằng thời điểm của thư mới nhất trong trang, không có thư thì lấy `lastActivityAt` của connector. Không có cả hai thì để 1970: conversation không có thư nào nằm cuối danh sách, không lên đầu.

### 13.7 Test với database thật
- **`@JdbcTest`:** chỉ dựng phần JDBC, transaction và Flyway, không dựng web hay JPA. Mỗi test chạy trong một transaction và bị rollback lúc kết thúc, nên các test không thấy dữ liệu của nhau.
- **"Không ghi lại dòng nào" kiểm thế nào:** trong một transaction, `now()` luôn trả cùng một giờ, nên `updated_at` không cho biết dòng có bị ghi lại hay không. Test dùng `ctid`, vị trí vật lý của dòng: PostgreSQL ghi bản mới cho mọi câu `UPDATE`, nên `ctid` đổi khi dòng bị ghi, kể cả ghi đúng giá trị cũ.
- **Mỗi cột một ca:** test tham số hóa đổi từng trường của thư (người gửi, chiều, loại, chữ, trạng thái, giờ, thư được trả lời, metadata). Mỗi ca kiểm ba điều: kết quả là "1 thư cập nhật", `ctid` đổi, và giá trị trong database đúng giá trị mới. Thiếu một cột ở `WHERE` thì thay đổi không được ghi. Thiếu một cột ở `SET` thì dòng có ghi, nhưng giá trị không đổi.
- **Bẫy thứ tự thư:** Gmail liệt kê thư mới trước. Test "thời điểm thư mới nhất" chạy cả hai thứ tự. Nếu chỉ có một thứ tự, code chọn nhầm "thư đến sau trong batch" vẫn xanh.
- **Giờ khi truyền vào JDBC:** truyền `OffsetDateTime` theo UTC. JDBC 4.2 quy định kiểu này cho `timestamptz`; `Instant` không có trong bảng quy định đó.

### 13.8 Kiểm tra ngược (BE-42)
Làm hỏng code mỗi lần một chỗ (31 lần, sau review thêm 6); lần chạy mốc khi chưa sửa gì thì xanh. Lần chạy đầu có **một lỗi sống sót**: đổi `COALESCE` để ảnh **cũ** của người tham gia thắng ảnh mới mà không test nào đỏ. Test "đổi tên" bắt đầu với một người chưa có ảnh, nên "ảnh mới thắng" và "ảnh cũ thắng" cho cùng kết quả. Đã sửa test để người đó có ảnh từ trước; lỗi đó giờ bị bắt.

| Lỗi cố ý | Test bắt được |
|---|---|
| Tiêu đề luôn bị thay, hoặc tiêu đề mới thắng tiêu đề đã lưu | tiêu đề đã lưu được giữ |
| Ảnh conversation luôn bị thay, hoặc ảnh cũ thắng | conversation giữ ảnh tới khi có ảnh mới |
| Giữ loại cũ; bản tối thiểu đè lên bản đầy đủ | bản đầy đủ thay bản tối thiểu; bản tối thiểu không đè |
| Lấy `lastActivityAt` trước thư; thiếu giờ thì lấy giờ hiện tại; thư đầu hoặc thư cuối của batch thắng | thời điểm thư mới nhất (cả hai thứ tự); conversation không có thư |
| Tên luôn bị thay, tên cũ thắng; ảnh cũ thắng (sống sót lần đầu); quên "đã từng là mình" | người tham gia giữ những gì trang sau bỏ trống; đổi tên và ảnh |
| Không thêm người gửi ngoài danh sách | người gửi được thêm vào |
| Thay đổi ở chữ, metadata, người gửi hay giờ gửi không được nhận ra (bỏ khỏi `WHERE`) | thư đổi từng trường |
| Trạng thái, thư được trả lời, loại, chiều không được ghi (bỏ khỏi `SET`) | thư đổi từng trường |
| Đảo "mới" và "đã cập nhật"; thư không đổi bị đếm là cập nhật; đổi tệp không được đếm | lưu một trang; lưu hai lần; tệp |
| Xóa nhầm tệp còn giữ; thư hết tệp vẫn giữ tệp cũ; tên tệp mới không được ghi | các test tệp |
| Không lưu trạng thái đọc của thư mới | lưu một trang |
| Tự mở transaction thay vì bắt buộc có sẵn | chỉ lưu trong transaction của bên gọi |
| Sau review: bỏ khóa theo account; một khóa chung cho mọi account | các lượt của một account lần lượt, account khác không chờ |
| Sau review: không bỏ NUL (cả trang, hoặc riêng metadata) | ký tự NUL bị bỏ |
| Sau review: loại `UNKNOWN` đè loại đã biết; loại không bao giờ đổi | conversation không rõ loại giữ loại cũ |

---

## 14. Hộp thư hiện gì: tổng hợp, đã đọc, lưu trữ, cần trả lời (BE-43)

Mỗi dòng của Hộp thư là một conversation với vài con số: thư mới nhất lúc nào, đoạn xem trước, ai gửi, bao nhiêu thư chưa đọc, có tệp không, có cần trả lời không. BE-43 tính chúng ở bước 5 của `store`, và thêm quy tắc đã đọc (D-67), bỏ lưu trữ (D-67), cần trả lời (D-68, D-74).

```text
store(accountId, trang)
  1-4. conversation, người tham gia, thư, tệp          (BE-42)
       + thư: quy tắc đã đọc                           (D-67)
       + conversation: tiêu đề chỉ đổi khi có thư mới hơn
  5.   tổng hợp lại mọi conversation trang chạm tới, TỪ BẢNG message
  6.   bỏ lưu trữ nếu có thư đến mới chèn, mới hơn thư mới nhất trước đó
```

### 14.1 Tính lại từ bảng `message`, không cộng trừ (câu gợi ý của task)
Câu hỏi: vì sao tính lại từ bảng `message` mà không cộng trừ `unread_count` theo từng thư?
- **Cộng trừ** nghĩa là: thư mới chưa đọc thì `+1`, thư vừa được đọc thì `-1`. Muốn đúng, mọi đường sửa thư đều phải cộng trừ đúng: lưu trang, `PATCH` của BE-44, sau này là xóa thư. Chỉ cần một đường quên, hoặc một trang được lưu lại hai lần, là con số lệch, và lệch **mãi mãi**, vì không có gì kéo nó về đúng.
- **Tính lại** nghĩa là: `unread_count = số thư của conversation có is_read = false`, đếm trực tiếp. Cùng dữ liệu thì luôn ra cùng kết quả, nên lưu lại một trang bao nhiêu lần cũng đúng. Nếu một lần nào đó con số sai, lần tính sau tự sửa, miễn là conversation đó được chạm lại.
- **Đúng cả với trang chỉ có một thư cũ:** trang theo dõi thay đổi có khi chỉ chứa thư cũ nhất vừa được đọc. Tính lại từ toàn bộ thư đã lưu, nên số chưa đọc giảm đúng 1, còn thư mới nhất, đoạn xem trước và tiêu đề giữ nguyên (test `aPageWithOnlyAnOldMessageNowReadLeavesTheRestAsItWas`, đúng scenario trong spec).
- **Cái giá:** mỗi trang thêm một câu SQL đọc lại **mọi** thư của các conversation nó chạm tới, không chỉ thư của trang. Index `message(conversation_id, sent_at DESC)` giúp tìm thư mới nhất nhanh, nhưng đếm chưa đọc vẫn đi qua mọi thư của conversation. Với Gmail, một thread hiếm khi quá vài trăm thư, nên ổn. Một nhóm chat hàng chục nghìn thư (connector sau này) sẽ cần xem lại, ví dụ một index chỉ gồm thư chưa đọc.

### 14.2 Một câu `UPDATE` cho cả trang
- **`WITH summary AS (...)`** (CTE): một bảng tạm có tên, tính tổng hợp cho từng conversation, rồi `UPDATE conversation ... FROM summary` ghi vào.
- **`LEFT JOIN LATERAL (... ORDER BY m.sent_at DESC, m.id DESC LIMIT 1)`:** với **từng** conversation, lấy thư mới nhất của nó. `LATERAL` cho phép câu con nhìn thấy dòng `c` đang xét; `LEFT` giữ cả conversation chưa có thư. Hai thư cùng giờ thì `id` (UUIDv7, tăng dần) quyết thư nào mới hơn.
- **Conversation chưa có thư:** `COALESCE(latest.sent_at, c.last_message_at)` giữ giờ đang lưu. Không có `COALESCE` thì giá trị là `NULL`, cột `NOT NULL` từ chối, và cả trang bị rollback (review BE-42 đã nhắc trước).
- **Không ghi khi không đổi:** `WHERE (c.last_message_at, ...) IS DISTINCT FROM (s.last_message_at, ...)`, giống mục 13.3. Lưu lại cùng một trang thì không dòng conversation nào bị ghi lại.

### 14.3 Đoạn xem trước, người gửi, người bên kia
- **Đoạn xem trước:** chữ của thư mới nhất.
  - Gộp mọi khoảng trắng (cả xuống dòng, tab, và khoảng trắng không ngắt NBSP mà thư HTML hay có) thành một dấu cách.
  - Bỏ khoảng trắng hai đầu, lấy 200 ký tự đầu, bỏ dấu cách nếu chỗ cắt rơi đúng vào nó.
  - Còn lại chuỗi rỗng thì là `NULL`.
- **Bẫy NBSP:** lớp ký tự `[[:space:]]` của PostgreSQL không chắc gồm NBSP (U+00A0), nên câu SQL thêm hẳn `chr(160)` vào lớp ký tự.
- **`last_message_from`:** người gửi thư mới nhất, tên nếu có, không thì ID (với Gmail là email). Thư không có người gửi (thông báo hệ thống) thì `NULL`.
- **`counterpart` (người bên kia, làm tiêu đề dòng của email):** người gửi của thư **đến** mới nhất **có người gửi** (thư hệ thống không có người gửi thì bỏ qua). Chưa có thư đến nào như vậy thì lấy người tham gia đầu tiên không phải chính account.
- **Giới hạn chưa kiểm:** các khoảng trắng Unicode khác (khoảng trắng rộng U+3000...) có được `[[:space:]]` gộp không còn tùy locale của database. Database của Sino dùng locale UTF-8 của image `postgres:18`, nhưng chưa có test cho các ký tự đó.

### 14.4 Đã đọc: thay đổi mới nhất thắng (D-67)
Mỗi thư có hai cột:
- `is_read`: cái Sino hiện;
- `provider_read`: cái provider nói lần trước.

```text
lần lưu sau, provider nói R:
  R khác provider_read   -> provider vừa đổi ý  -> is_read = R, provider_read = R
  R giống provider_read  -> provider không đổi  -> giữ is_read (lựa chọn trong Sino)
```

- **Vì sao cần cột thứ hai:** chỉ có `is_read` thì Sino không phân biệt được hai trường hợp:
  - "provider vừa đổi sang đã đọc": phải theo;
  - "provider vẫn nói chưa đọc như mọi lần, còn người dùng đã bấm đọc trong Sino": phải giữ.

  `provider_read` nhớ provider nói gì lần trước, nên Sino biết ai đổi sau cùng.
- **Ví dụ trong spec:** bạn đọc một thư trong Sino, rồi Gmail gửi lại thư đó vì một nhãn mới (vẫn chưa đọc). Gmail không đổi ý về trạng thái đọc, nên thư vẫn là đã đọc.
- **Bẫy khi test:** lần lưu lại mà không đổi gì thì dòng không bị ghi (mục 13.3), nên lựa chọn trong Sino tự nhiên còn đó. Test như vậy không phân biệt được "giữ `is_read`" với "luôn ghi đè". Test của BE-43 lưu lại **kèm một thay đổi khác** để dòng thật sự được ghi. Lỗi này tôi tự thấy khi soạn danh sách lỗi cố ý.
- Thao tác "đánh dấu đọc trong Sino" là `PATCH` của BE-44. Test hiện giả lập nó bằng một câu `UPDATE` trực tiếp.

### 14.5 Bỏ lưu trữ khi có thư đến mới; tiêu đề chỉ theo thư mới hơn
- **Bỏ lưu trữ:** một conversation đã lưu trữ quay lại Hộp thư khi trang có một thư **đến** **mới chèn** và **mới hơn** thư mới nhất trước đó.
  - Thư đi (chính bạn trả lời) không kéo nó về.
  - Thư cũ được nhập bù không kéo nó về.
  - Thư đã có được lưu lại cũng không kéo nó về.

  "Thư mới nhất trước đó" là `last_message_at` đọc ở bước 1, trước khi bước 5 tính lại. "Mới hơn" là mới hơn hẳn: thư đến có cùng đúng thời điểm với thư mới nhất không kéo conversation về. Với Gmail (tính tới mili giây) gần như không xảy ra; với provider chỉ tính tới giây thì có thể.
- **Tiêu đề:** trang theo dõi thay đổi chỉ chứa thư cũ thì mang tiêu đề cũ. Vì vậy tiêu đề chỉ theo trang khi trang có thư mới hơn thư mới nhất đã lưu, hoặc khi conversation chưa có tiêu đề. Trang mới hơn mà không có tiêu đề thì giữ tiêu đề cũ.
- **Bẫy tham số `NULL`:** `:newest` có thể là `NULL` (trang không có thư của conversation đó). Viết `cast(:newest AS timestamptz)` để PostgreSQL biết kiểu của tham số kể cả khi nó rỗng.

### 14.6 Cần trả lời (D-68, D-74)
- `needs_reply` khi thư mới nhất là thư **đến** và metadata `bulk` khác `"true"`. Thư cũ hơn là bản tin không ảnh hưởng.
- D-74 (bạn chốt): thư qua nhóm, có `List-Unsubscribe`, vẫn là hàng loạt.
- Conversation đã lưu trữ vẫn giữ `needs_reply` của nó. Việc ẩn chúng khỏi danh sách "Cần trả lời" là việc của truy vấn ở BE-44.

### 14.7 Test đỏ trước, lần này làm ngược
- Lần này tôi viết code trước rồi mới viết test, sai thứ tự TDD.
- Để vẫn có bằng chứng đỏ thật, tôi chạy test mới trên code BE-42 đã commit (lấy lại bằng `git show HEAD:...`): 14/21 test đỏ.
- 7 test còn xanh trên code cũ là các quy tắc kiểu "không làm gì": thư đi không bỏ lưu trữ, thư không có chữ thì không có đoạn xem trước. Code cũ không làm gì nên tình cờ đúng. Các quy tắc này được kiểm bằng kiểm tra ngược (mục 14.8).
- Bài học: một test chỉ có giá trị khi đã thấy nó đỏ với một code sai.

### 14.8 Sau review: test phải có hai conversation trong một trang
- Mỗi test trước đó chỉ có một conversation, nên câu đếm chưa đọc **quên lọc theo conversation** (đếm cả trang) vẫn cho đúng số. Reviewer chỉ ra lỗ này. Test `eachConversationOfAPageHasItsOwnSummary` có hai thread với số chưa đọc, tệp, người bên kia khác nhau.
- Thêm hai test: thư mất tệp cuối cùng thì conversation không còn "có tệp"; Gmail chuyển một thư từ đã đọc sang chưa đọc thì Sino theo.
- Khóa `bulk` trong SQL giờ được truyền bằng hằng số `NormalizedMessage.BULK` (mục 11.3), không gõ lại chuỗi.

### 14.9 `PATCH` của BE-44 phải lấy cùng khóa
- Bước 5 là một câu `UPDATE` tính tổng hợp từ **ảnh chụp dữ liệu lúc nó bắt đầu**.
- Giả sử giữa chừng, `PATCH` "đánh dấu đã đọc" commit với `unread_count = 0`. Câu `UPDATE` vẫn ghi con số tính từ ảnh chụp cũ (3) đè lên: Hộp thư báo 3 thư chưa đọc, sai cho tới khi thread được chạm lại.
- Vì vậy `PATCH` bắt buộc lấy cùng khóa theo account với `store` (mục 13.2b) rồi tính lại tổng hợp bằng cùng một đoạn SQL. Hai thao tác khi đó chạy lần lượt, không chen nhau.

### 14.10 Kiểm tra ngược (BE-43)
Làm hỏng code mỗi lần một chỗ (28 lần, sau review thêm 6); lần chạy mốc khi chưa sửa gì thì xanh; lần nào cũng có test đỏ. Lỗi "luôn theo provider" chỉ bị bắt sau khi test "đã đọc trong Sino" được siết lại (mục 14.4).

| Lỗi cố ý | Test bắt được |
|---|---|
| `is_read` luôn theo provider; không bao giờ theo; không nhớ `provider_read`; không nhận ra provider đổi ý | các test đã đọc; trang chỉ có thư cũ vừa đọc |
| Tiêu đề không bao giờ theo trang mới; trang mới không có tiêu đề xóa tiêu đề; tiêu đề theo thư cũ | tiêu đề theo thư mới hơn; trang chỉ có thư cũ |
| Lấy thư cũ nhất làm thư mới nhất | trang chỉ có thư cũ; bản tin cũ hơn; thư không có người gửi |
| Đoạn xem trước: không gộp khoảng trắng, quên NBSP, không bỏ khoảng trắng đầu, giữ dấu cách cuối, cắt 201, chuỗi rỗng không thành `NULL` | các test đoạn xem trước |
| Người gửi: ID trước tên | trang chỉ có thư cũ (người gửi có tên) |
| Người bên kia: thư của mọi chiều, có thể là chính account, thư đến cũ nhất | các test người bên kia |
| Đếm thư đã đọc thay vì chưa đọc; không thấy tệp | tổng hợp từ thư đã lưu; các test đã đọc |
| Bản tin hay thư đi vẫn "cần trả lời" | cần trả lời |
| Conversation không có thư mất giờ (`NULL`); tổng hợp luôn ghi lại; không chạy bước tổng hợp | conversation không có thư; lưu hai lần không ghi lại |
| Thư của account, thư cũ, hoặc không thư nào bỏ lưu trữ | các test lưu trữ |
| Sau review: đếm chưa đọc, tìm tệp, tìm người bên kia trên cả trang thay vì từng conversation | mỗi conversation có tổng hợp riêng |
| Sau review: luôn "có tệp"; chỉ theo provider khi nó chuyển sang đã đọc; gõ sai tên khóa `bulk` | thư mất tệp cuối; Gmail chuyển sang chưa đọc; cần trả lời |

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
41. Vì sao ghi `historyId` lúc **bắt đầu** lần đọc đầu chứ không phải lúc kết thúc? Cái giá của lựa chọn đó là gì?
42. Gmail trả `404` cho `history.list` và cho `messages.get`: hai trường hợp được xử lý khác nhau thế nào, vì sao?
43. Vì sao cursor lạ phải bị từ chối trước khi gọi Google?
44. Gmail trả `403`: làm sao Sino biết đó là vượt hạn mức hay không có quyền, mà không đưa body của Google vào thông báo lỗi?
45. Bạn nhập 30 ngày rồi đánh dấu đã đọc hàng nghìn thư cũ trên Gmail: vì sao Sino không được nhập các thư đó, và connector làm gì để chặn?
46. Kết nối đứt giữa lúc đọc một thư: vì sao coi đó là "thư hỏng" lại làm mất thư vĩnh viễn?
47. Vì sao test với Gmail thật không được chạy trong `./mvnw verify` của CI?
48. Chưa kết nối Gmail thì test bị "bỏ qua" chứ không "đỏ": khác nhau thế nào, và vì sao chọn bỏ qua?
49. Vì sao `-Dgroups=real-gmail` một mình không chạy được test có tag đó trong dự án này?
50. Vì sao `estimateMessages` có cài đặt mặc định trong interface, còn `fetchUpdates` thì không?
51. Vì sao `OptionalLong` tốt hơn việc trả `-1` khi connector không ước lượng được?
52. Vì sao "thư hàng loạt" là một khóa metadata chứ không phải một trường mới của `NormalizedMessage`?
53. Số thư đã nhập vượt số ước lượng: vì sao đó không phải lỗi, và vì sao vòng nhập không được dừng khi đạt số ước lượng?
54. Một thư của nhóm thảo luận có `List-Unsubscribe`: Sino xếp nó thế nào, và cái giá của quy tắc đó là gì?
55. Vì sao module `conversation` không được tự `JOIN` bảng `connected_account`, dù làm vậy chỉ cần một câu SQL?
56. Vì sao `AccountDirectory` trả `AccountSummary` chứ không trả entity `ConnectedAccount`?
57. Vì sao `accountsOf` trả cả account `DISABLED` và `AUTH_EXPIRED`, để bên gọi tự lọc?
58. Hai account tạo liền nhau có thể cùng `created_at`: test thứ tự "cũ trước mới" phải làm gì để không xanh nhờ may mắn?
59. Hai lượt đồng bộ cùng lưu một thư: chuyện gì xảy ra với cách "tìm rồi lưu" của JPA, và `ON CONFLICT` tránh được điều đó thế nào?
60. Vì sao điều kiện "có đổi gì không" dùng `IS DISTINCT FROM` chứ không dùng `<>`?
61. `RETURNING id, xmax = 0` cho biết điều gì, và khi nào câu lệnh không trả dòng nào?
62. Vì sao `store` dùng `Propagation.MANDATORY` thay vì tự mở transaction?
63. Trong một test, `updated_at` không đổi sau lần lưu thứ hai: điều đó có chứng minh dòng không bị ghi lại không? Vì sao test dùng `ctid`?
64. Thư nhắc tới một conversation mà trang thư không mô tả: Sino làm gì, và vì sao bản tối thiểu không được đè lên bản đã có?
65. Hai lượt lưu nhận cùng hai conversation theo thứ tự ngược nhau: vì sao có thể deadlock, và khóa theo account tránh điều đó thế nào?
66. Vì sao việc bỏ ký tự NUL đặt ở `store` chứ không chỉ ở connector Gmail?
67. Vì sao `unread_count` được tính lại từ bảng `message` thay vì cộng trừ theo từng thư? Cái giá là gì?
68. `LEFT JOIN LATERAL` làm được gì mà một `JOIN` thường không làm được?
69. Vì sao mỗi thư cần cả `is_read` lẫn `provider_read`? Chỉ có một cột thì sai ở trường hợp nào?
70. Bạn trả lời một conversation đã lưu trữ: nó có quay lại Hộp thư không? Còn khi người kia trả lời?
71. Một trang theo dõi thay đổi chỉ có thư cũ nhất của một thread: tiêu đề, đoạn xem trước và số chưa đọc thay đổi thế nào?
72. Vì sao một test chỉ có giá trị khi đã thấy nó đỏ? Với BE-43, làm sao có lần đỏ đó khi code đã viết xong?
73. Vì sao mọi test chỉ có một conversation thì không bắt được lỗi "đếm chưa đọc trên cả trang"?
74. `PATCH` đánh dấu đã đọc commit đúng lúc `store` đang tổng hợp: nếu `PATCH` không lấy khóa theo account thì số chưa đọc sai thế nào?
