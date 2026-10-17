# Kiến thức Phase 2 — Một provider thật: Gmail

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F04a, `openspec/changes/f04a-gmail-connect` (kết nối Gmail bằng OAuth2): xong BE-30…BE-34 và FE-30, còn nghiệm thu. F04b, `openspec/changes/f04b-gmail-read` (đọc thư Gmail): xong BE-35…BE-39 và nghiệm thu; còn archive (sau F04a). F05, `openspec/changes/f05-unified-inbox` (lưu thư, lần nhập đầu, Hộp thư): xong BE-40…BE-47 và nghiệm thu (BE-46: nhập thật với Gmail); BE-61 (đếm đúng số thư cho khoảng ngày) xong; còn archive (sau F04b). F06, `openspec/changes/f06-message-history` (đọc cả cuộc trò chuyện): xong BE-54…BE-57 (BE-57: chạy thật với Gmail, chưa kiểm được phần tải tệp vì hộp thư chưa có thư kèm tệp); còn phần web chạy thật và archive. F05b, `openspec/changes/f05b-merged-threads` (một chuỗi ở nhiều tài khoản là một dòng): xong BE-80 (nhóm), BE-81 (Hộp thư theo nhóm, trả lời từ bản chính), BE-82 (thư của nhóm, mỗi thư một lần); còn BE-83.
> **Cập nhật:** 2026-10-10. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

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
- **Vì sao toàn bộ hộp thư dùng `messagesTotal`** mà không dùng `resultSizeEstimate` của một danh sách không có `q`: D-65 chọn như vậy. `messagesTotal` là số đếm chính xác (chỉ dư phần nháp, spam, thùng rác), còn `resultSizeEstimate` vốn thô với hộp thư lớn. Cách nào sát hơn là câu hỏi đo đạc: BE-46 so cả hai với số thư nhập thật. Kết quả: `messagesTotal` khớp đúng (212/212); chỗ lệch nằm ở ước lượng theo khoảng ngày (mục 18.5).
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

## 15. API Hộp thư (BE-44)

Web (FE-50) đã dựng màn Hộp thư theo design mục 4, chạy trên dữ liệu giả. BE-44 làm API thật cho nó.

```text
GET   /api/conversations?view=&provider=&accountId=&cursor=&limit=   -> { items, nextCursor }
GET   /api/conversations/counts                                      -> { unread, byProvider, needsReply, ... }
GET   /api/conversations/{id}                                        -> item + participants
PATCH /api/conversations/{id}   { read?, archived? }                 -> item
```

### 15.1 Ba lớp trong module `conversation`
- **`api`:** `ConversationsController` và các DTO. `ConversationResponse.from(...)` quyết cách hiện một dòng: thread email thì `kind = EMAIL`, tiêu đề dòng là người bên kia, `subject` là tiêu đề thread; chat thì tiêu đề là tên nhóm, và nhóm có thêm `memberCount`, `snippetFrom`.
- **`application`:** `InboxService` lo phạm vi account, các câu SQL đọc và `PATCH`. Hộp thư là phía *đọc*: không có quy tắc nghiệp vụ nào cần một lớp domain, nên câu SQL nằm ngay trong service, đọc thẳng các cột tổng hợp mà BE-43 đã tính sẵn.
- **`infrastructure`:** `ConversationSummaries` (khóa theo account và `summarize`) được tách ra khỏi `store` để `PATCH` dùng chung, đúng như review BE-43 yêu cầu (mục 14.9).

### 15.2 Phạm vi: account nào được hiện
- `InboxService` hỏi `AccountDirectory` (mục 12) danh sách account của owner. Danh sách đó đã bỏ account đã xóa (D-66); service bỏ thêm account `DISABLED`.
- Mọi câu đọc Hộp thư (danh sách, số đếm, tìm một conversation) đều có `account_id` thuộc danh sách đó. Câu lấy người tham gia và các câu `UPDATE` của `PATCH` chỉ lọc theo ID, nhưng chỉ chạy **sau** khi đã tìm thấy conversation trong phạm vi. Conversation của owner khác, của account đã xóa hay đã tắt đều trả `404 CONVERSATION_NOT_FOUND`, giống hệt conversation không tồn tại: không lộ việc "có nhưng không phải của bạn".
- Account `AUTH_EXPIRED` (cần kết nối lại) **vẫn hiện**: thư đã lưu của nó vẫn đọc được, chỉ không có thư mới. Chỉ `DISABLED` (người dùng tự tắt) bị ẩn.
- `provider` và `accountId` lọc trên danh sách account trong Java. Một account không thuộc Hộp thư thì cho kết quả rỗng, không lỗi. `provider` không phân biệt hoa thường (`Gmail` như `gmail`), và để trống thì coi như không lọc.

### 15.3 Phân trang keyset (câu gợi ý của task)
Câu hỏi: vì sao phân trang keyset phải sắp theo cả `id` chứ không chỉ `last_message_at`?
- **Keyset** nghĩa là: trang sau bắt đầu **ngay sau dòng cuối của trang trước**, theo đúng thứ tự sắp xếp. Cursor `"<lastMessageAt>|<id>"` được mã hóa base64url, nên web chỉ việc gửi lại nó.
- **Vì sao cần `id`:** nhiều conversation có thể cùng `last_message_at` (thư nhập hàng loạt, provider tính theo giây). Chỉ sắp theo giờ thì thứ tự giữa chúng không xác định, và điều kiện `last_message_at < :after` bỏ mất những dòng cùng giờ còn lại; còn `<=` thì lặp lại chúng. Thêm `id` (duy nhất) làm cho thứ tự là **toàn phần**: `(last_message_at, id) < (:after, :afterId)` chỉ ra đúng một chỗ để tiếp tục. Test `pagesThroughConversationsOfTheSameTimeEachOnce` có 5 conversation cùng giờ, lật trang 2 dòng một.
- **Vì sao không dùng `OFFSET`:** thư mới đến giữa hai lần lật trang đẩy mọi dòng xuống, nên `OFFSET 30` lặp lại dòng đã thấy. `OFFSET 50 000` cũng bắt database đọc rồi bỏ 50 000 dòng.

### 15.4 Đo bằng `EXPLAIN ANALYZE`: lỗ mà review BE-42 đoán trước
- Review BE-42 lo rằng index Hộp thư `(last_message_at DESC, id DESC)` không có `account_id`. Tôi đo trên PostgreSQL 18.6 (locale `en_US.utf8`) với dữ liệu tự sinh. Đây là một test tạm, đo xong thì xóa.
- **Câu đầu tiên** viết `WHERE account_id IN (...) ORDER BY last_message_at DESC, id DESC LIMIT 31`:

```text
trường hợp                                                      thời gian
owner nhỏ (2 account x 50 conversation), có owner khác 200 000   0,17 ms
owner lớn (200 000 conversation mới nhất), trang đầu             0,13 ms
owner lớn, trang sau 50 000 dòng                                  0,19 ms
owner LỚN NHƯNG CŨ HƠN (100 000), owner khác 200 000 mới hơn     122 ms   <- đi qua 172 960 dòng của người khác
```

- Trường hợp cuối: PostgreSQL chọn đi theo index Hộp thư từ thư mới nhất, rồi bỏ từng dòng không phải của owner này. Ngoài thực tế, đó là một người dùng có hộp thư lớn nhưng ít hoạt động gần đây.
- **Cách sửa:** lấy trang mới nhất **của từng account riêng**, rồi chọn những dòng mới nhất trong số đó.

```text
SELECT c.* FROM unnest(ARRAY[account...]) AS a(id)
CROSS JOIN LATERAL (SELECT ... FROM conversation c WHERE c.account_id = a.id ...
                    ORDER BY c.last_message_at DESC, c.id DESC LIMIT 31) c
ORDER BY c.last_message_at DESC, c.id DESC LIMIT 31
```

  Mỗi account đi theo index của riêng nó, đọc vài chục dòng đầu. Sắp lại nhiều nhất "số account x 31" dòng.
- **Lần đo đầu, với index sẵn có:** trường hợp xấu còn 0,24 ms, trang sau 40 000 dòng 0,69 ms. Lúc đó tôi kết luận "không cần index mới".
- **Review chỉ ra kết luận đó vội:** trong câu `LATERAL`, PostgreSQL chưa biết account nào sẽ được hỏi, nên ước lượng theo số account **trung bình**. Lần đo đầu có 6 account. Tôi đo lại với đúng tình huống của MVP: **một** người dùng, hai Gmail, "cá nhân" có 100 000 conversation mới, "công việc" có 1 000 conversation cũ hơn.

```text
lọc accountId = công việc                                        thời gian
index sẵn có                                                      9 ms     <- đi theo index Hộp thư, bỏ 100 000 dòng
thêm (account_id, last_message_at DESC, id DESC) WHERE NOT archived   0,1 ms
và bỏ index Hộp thư cũ (last_message_at DESC, id DESC)            0,07 ms
```

  Thời gian của trường hợp xấu tăng theo số dòng bị bỏ qua: 1 triệu conversation thì khoảng 90 ms. Vì vậy V6 giờ có index `conversation_account_inbox_idx (account_id, last_message_at DESC, id DESC) WHERE NOT archived`, khớp đúng thứ tự của một trang, thay cho index Hộp thư cũ. (Sửa thẳng V6 vì nó chưa từng chạy trên database lâu dài nào và commit BE-42 chưa push; đã ghi lý do trong `tasks.md`.)
- **Không phải mọi view đều chỉ đọc vài chục dòng:** view `unread`, `reply`, `attachments`, `archived` lọc trên các dòng của account. Một hộp thư 100 000 conversation đã đọc hết mà hỏi `view=unread` sẽ phải đi qua cả 100 000 dòng: khoảng 12 ms, như view "đã lưu trữ" khi không có gì được lưu trữ.
- **Số đếm:** một câu đếm theo account, đọc mọi conversation chưa lưu trữ của owner: 20 ms với 100 000. Chấp nhận được cho MVP; muốn nhanh hơn thì phải lưu sẵn số đếm (để sau).
- **Chi tiết nhỏ:** điều kiện thừa `last_message_at <= :after` giúp index nhảy thẳng tới chỗ cursor. Số thành viên chỉ được đếm cho chat nhóm, không đếm cho mọi dòng.
- **Bài học:** đừng đoán. Một câu SQL nhanh với dữ liệu thử nhỏ có thể chậm gấp 500 lần với một kiểu dữ liệu khác. `EXPLAIN ANALYZE` cho thấy database thật sự làm gì: đi theo index nào, đọc bao nhiêu dòng, bỏ bao nhiêu. Và phải đo đúng kiểu dữ liệu của người dùng thật: lần đo đầu có nhiều account nên đã bỏ sót trường hợp ít account.

### 15.5 Lỗi `400` mà không cần viết code bắt lỗi
- **`view`:** `@Pattern(regexp = "all|unread|...")` trên tham số, và **`limit`:** `@Min(1) @Max(100)`. Spring MVC (6.1+) tự kiểm các ràng buộc này trên tham số của controller và ném `HandlerMethodValidationException`. Handler chung đã đổi nó thành `400 VALIDATION_FAILED`.
- **`accountId`, `id`:** kiểu `UUID`; chuỗi sai thì Spring báo lỗi kiểu, ra `400 MALFORMED_REQUEST`.
- **`cursor`:** kiểu `InboxCursor` có hàm tĩnh `valueOf(String)`. Spring tự dùng hàm này để đổi tham số chuỗi thành đối tượng. Hàm ném lỗi thì Spring coi là lỗi kiểu, nên cũng ra `400 MALFORMED_REQUEST`.
- **Vì sao không ném `SinoException`:** loại `INVALID` của nó ra `422` (yêu cầu đúng dạng nhưng sai quy tắc nghiệp vụ). Spec muốn `400`: tham số sai dạng.
- **Cursor có năm quá lớn** (`+10000-01-01...`): Java đọc được, nhưng PostgreSQL không lưu được, nên lỗi rơi xuống tận database thành `500`. `InboxCursor.valueOf` chặn trước các năm ngoài 1–9999 (review BE-44).
- **`PATCH {}`** (hoặc gõ sai tên trường): một `@AssertTrue` trên request đòi có ít nhất `read` hoặc `archived`, ra `400 VALIDATION_FAILED`, thay vì lấy khóa và tính lại tổng hợp mà không đổi gì.

### 15.6 `PATCH`: chỉ trong Sino, dưới cùng một khóa
- `read: true` đánh dấu mọi thư đã đọc; `read: false` chỉ đánh dấu thư **mới nhất** chưa đọc (giống "đánh dấu chưa đọc" của Gmail); `archived` bật tắt lưu trữ. Trường không gửi thì giữ nguyên.
- **Chỉ trong Sino (D-67):** chỉ đổi `is_read`, không đụng `provider_read`, và không gọi Gmail. Lần đồng bộ sau, Gmail nói lại điều cũ thì lựa chọn trong Sino vẫn giữ (mục 14.4).
- **Khóa:** `PATCH` lấy khóa theo account trước khi ghi, rồi tính lại tổng hợp bằng cùng `summarize` với `store` (mục 14.9). Test `aChangeWaitsForAStoreOfTheSameAccount` giữ một lượt `store` mở trong một luồng khác: `PATCH` phải chờ, và chạy xong ngay khi lượt kia commit.

### 15.7 Kiểm tra ngược (BE-44)
Làm hỏng code mỗi lần một chỗ (33 lần, sau review thêm 6); lần chạy mốc khi chưa sửa gì thì xanh. Lần đầu có **hai lỗi sống sót**, cả hai do test chưa dựng đúng tình huống:
- **Bỏ điều kiện phạm vi khi tìm một conversation:** trong test "ngoài tầm với", owner không còn account nào hoạt động, nên service trả "không tìm thấy" ngay mà không chạy câu SQL. Test giờ cho owner một account hoạt động.
- **Bỏ bước đặt sẵn số 0 cho từng provider:** account telegram trong test có một conversation đã đọc, nên số 0 vẫn tự có. Test giờ có thêm một account không có conversation nào.

Sau khi sửa test, cả hai bị bắt.

| Lỗi cố ý | Test bắt được |
|---|---|
| Sắp cũ trước; hai dòng cùng giờ theo `id` tăng dần; bỏ `ORDER BY` bên ngoài | lật trang cùng giờ; lật trang nhiều account; các view |
| Bỏ cursor; cursor gồm cả dòng cuối (`<=`); không lấy dư một dòng; cursor từ dòng sai | hai test lật trang |
| Hiện account `DISABLED`; bỏ lọc provider; bỏ lọc account | danh sách; lọc; số đếm; ngoài tầm với |
| Mỗi view (unread, reply, attachments) gồm cả đã lưu trữ; `all` gồm đã lưu trữ; `archived` gồm tất cả; `scheduled` có dữ liệu | mỗi view |
| Số đếm gồm đã lưu trữ; "chưa đọc" đếm nhầm "cần trả lời"; bỏ số 0 của provider (sống sót lần đầu) | số đếm |
| Tìm conversation không theo phạm vi (sống sót lần đầu) | ngoài tầm với |
| "Chưa đọc" đánh dấu thư cũ nhất; "đã đọc" không làm gì; lưu trữ không làm gì; không tính lại tổng hợp; không lấy khóa | các test `PATCH`; `PATCH` chờ `store` |
| Chat hiện như email; tiêu đề email là tiêu đề thread; số thành viên cho mọi chat; nhóm không có người gửi; `linked` là `null` | các test nội dung dòng |
| Cursor bỏ kiểm tra dấu phân cách; `limit` tới 1000; `limit` từ 0 | test cursor; tham số sai |
| Sau review: chỉ hiện account `CONNECTED` (ẩn cả `AUTH_EXPIRED`); `provider` phân biệt hoa thường; `provider` rỗng vẫn lọc; cursor không giới hạn năm; `PATCH {}` được nhận; không kiểm request | danh sách; số đếm; lọc; cursor; `PATCH` phải nói đổi gì |

Hai thay đổi chỉ ảnh hưởng tốc độ (bỏ `LIMIT` trong từng account, bỏ điều kiện thừa `last_message_at <= :after`) sẽ không làm test nào đỏ, vì kết quả vẫn đúng. Chúng được kiểm bằng `EXPLAIN ANALYZE` (mục 15.4), không bằng test.

---

## 16. Lần nhập đầu chạy nền: module `sync` (BE-45)

Sau khi kết nối Gmail, bước "Đồng bộ" của canvas cho chọn khoảng (30 ngày, 90 ngày, toàn bộ), cho thấy ước lượng, rồi nhập thư **ở nền**: người dùng làm việc khác trong lúc chờ, và tắt máy chủ giữa chừng cũng không mất tiến độ (D-64, D-69).

```text
GET  /api/accounts/{id}/initial-sync/estimate?range=DAYS_90   -> { messages, minMinutes, maxMinutes }
POST /api/accounts/{id}/initial-sync  { "range": "DAYS_90" }  -> 202 + trạng thái
GET  /api/accounts/{id}/initial-sync                          -> { status, imported, skipped, estimated,
                                                                   remainingMinutes, storedMessages, ... }

NOT_STARTED --POST--> RUNNING --trang cuối--> DONE
                         |                      |
                         +--lỗi--> FAILED       +--POST--> RUNNING (nhập lại từ đầu)
                                     |
                                     +--POST cùng khoảng--> RUNNING (nhập TIẾP từ cursor)
                                     +--POST khoảng khác--> RUNNING (nhập lại từ đầu)
```

### 16.1 Cursor cùng transaction với thư, gọi provider ngoài transaction (câu gợi ý của task)
Câu hỏi: vì sao ghi cursor cùng transaction với việc lưu thư, còn gọi provider thì ngoài transaction?

```text
vòng nhập:
  batch = ProviderAccess.call(fetchUpdates(cursor))      <- ngoài transaction: gọi mạng, có thể chờ vài phút
  transaction {
    ConversationStore.store(batch)                        <- thư của trang
    sync_checkpoint: cursor = batch.nextCursor, đếm       <- tiến độ
  }                                                       <- commit cả hai, hoặc không cái nào
```

- **Cursor và thư phải cùng còn hoặc cùng mất.** Nếu chúng ở hai transaction riêng, máy chủ có thể tắt **giữa** hai bước:
  - thư đã lưu mà cursor chưa tiến: lần sau đọc lại trang đó. Vô hại, vì lưu là upsert (mục 13.2);
  - cursor đã tiến mà thư chưa lưu: trang đó **mất vĩnh viễn**, vì lần sau đi tiếp từ trang sau.

  Một transaction loại trường hợp thứ hai. Test `aFailedStoreLeavesTheCursorBeforeThatPage` cho lưu thất bại ở trang 2: cursor vẫn đứng sau trang 1.
- **Gọi provider thì không được nằm trong transaction:** một transaction giữ một kết nối database, và ở đây còn giữ khóa theo account (mục 13.2b), suốt thời gian chờ mạng: vài giây, có khi vài phút khi Google bắt chờ. Trong lúc đó, một `PATCH` "đánh dấu đã đọc" của chính account đó phải đứng chờ khóa, và vài lượt nhập cùng lúc có thể giữ hết kết nối của pool. `ProviderAccess` tự từ chối khi được gọi trong transaction (mục 7.3).

### 16.2 Mỗi account một lượt nhập
- **Bắt đầu** là **một** câu SQL: `INSERT ... ON CONFLICT (account_id) DO UPDATE SET import_status = 'RUNNING', ... WHERE s.import_status <> 'RUNNING' RETURNING account_id`.
  - Có dòng trả về: lượt này vừa được bắt đầu, giao việc cho luồng nền.
  - Không có dòng nào: một lượt đang chạy; trả trạng thái của nó, không bắt đầu lượt thứ hai.

  Hai yêu cầu đến cùng lúc thì PostgreSQL xếp hàng chúng trên cùng một dòng, nên chỉ một cái thắng.
- **Việc chỉ được giao sau khi commit:** `TransactionTemplate.execute(...)` trả về thì dòng `RUNNING` đã commit; lúc đó mới giao cho luồng nền, nên luồng nền luôn đọc thấy dòng đó.
- **Chặn thêm trong bộ nhớ:** `ImportRunner` nhớ các account đang có vòng nhập trong tiến trình này. `ImportResumer` (mục 16.3) mà được gọi đúng lúc một lượt đang chạy cũng không mở vòng thứ hai (test `startingTwiceRunsOnce`).

### 16.3 Luồng nền: virtual thread, tắt máy, chạy tiếp
- **Virtual thread** (Java 21+): luồng rất nhẹ do JVM quản lý. Một lượt nhập phần lớn thời gian chỉ chờ Gmail trả lời; khi chờ, virtual thread nhả luồng hệ điều hành cho việc khác. Executor `Executors.newThreadPerTaskExecutor(Thread.ofVirtual()...)`: mỗi lượt nhập một virtual thread.
- **Tắt ứng dụng:** Spring gọi `shutdownNow()` trên executor, tức là ngắt (interrupt) các luồng đang chạy. Vòng nhập gặp `InterruptedException` thì dừng và **giữ** dòng ở `RUNNING`.
- **Khởi động lại:** `ImportResumer` nghe `ApplicationReadyEvent` (ứng dụng đã sẵn sàng phục vụ), tìm các dòng `RUNNING`, rồi giao lại cho executor. Mỗi vòng đi tiếp từ cursor đã lưu.
- **Vì sao không dùng event bất đồng bộ của Spring Modulith:** D-69 đã loại phương án đó. Một lượt nhập chạy hàng phút, và vẫn cần bảng tiến độ; dùng hai cơ chế cho một việc là thừa.
- Giả định một tiến trình backend (MVP). Nhiều tiến trình thì cần "thuê" từng account (lease), để F07.

### 16.4 Bảng xử lý lỗi
```text
lỗi từ connector       làm gì                                                   rồi
RATE_LIMITED           chờ Retry-After (không có: 30 s; tối đa 5 phút), thử lại  quá 5 lần liền -> FAILED
PROVIDER_UNAVAILABLE   chờ 10 s, 30 s, 60 s, thử lại                             lần thứ 4 -> FAILED
CURSOR_EXPIRED         đọc lại từ đầu khoảng đã chọn, một lần (D-60)             lần thứ 2 -> FAILED
AUTH_EXPIRED, khác     FAILED ngay, lưu mã lỗi
account bị xóa         FAILED, ACCOUNT_NOT_FOUND
lỗi khác (lập trình)   FAILED, INTERNAL, log ERROR có account id
```

- Một trang đi qua được thì bộ đếm thử lại về 0: "5 lần liền" nghĩa là liền thật (test `theRetriesCountAgainAfterAPageGoesThrough`).
- Thời gian chờ là cấu hình `sino.sync.*`. Test đặt chúng còn vài mili giây, nên chạy nhanh mà vẫn đi qua đúng đường code thật.
- Log chỉ có account id, mã lỗi, số thư; không bao giờ có chữ của thư hay token (test `theLogsNameTheAccountButNeverTheMailOrTheToken` đọc toàn bộ log của lượt nhập).

### 16.5 Nhập tiếp hay nhập lại
- **Cùng khoảng sau `FAILED`:** nhập **tiếp** từ cursor đã lưu, giữ số đã nhập và ước lượng (test: lần hai chỉ hỏi Gmail hai trang còn lại).
- **Khoảng khác, hoặc sau `DONE`:** nhập **lại** từ đầu khoảng mới. Thư đã có không bị trùng (upsert). `imported` đếm thư mới cộng thư đã cập nhật, nên nhập lại một hộp thư không đổi gì cho `imported = 0`.
- Cả hai đường nằm trong cùng câu `INSERT ... ON CONFLICT` ở mục 16.2: mỗi cột chọn giá trị cũ hay mới bằng một `CASE`.

### 16.6 Ước lượng và số phút còn lại
- **Ước lượng** (`GET .../estimate`): hỏi connector (mục 11.2). Số phút tính theo tốc độ giả định 200–400 thư/phút (cấu hình); BE-46 đo được khoảng 100 và đổi thành 60–120 (mục 18.5). Connector không biết hoặc lỗi thì `messages` và số phút đều `null`, không lỗi API.
- **Trong lúc nhập:** ước lượng được hỏi **ở đầu lượt nền**, không trong `POST`, nên `POST` trả về ngay.
- **Số phút còn lại** = (ước lượng - đã nhập) chia tốc độ **của vòng nhập đang chạy**: `run_imported_count` và `run_started_at` được đặt lại mỗi khi một vòng bắt đầu, kể cả khi chạy tiếp sau khởi động lại, vì vòng đó mang theo số của vòng trước, còn thời gian máy tắt thì không được tính. Chưa chạy đủ 5 giây, chưa nhập được thư nào, hay đã xong thì `null`. Nhập vượt ước lượng thì là 0.
- **Giới hạn:** `imported` đếm thư mới và thư đã cập nhật, nên nhập lại một hộp thư không đổi thì `imported` đứng gần 0 trong khi ước lượng là cả khoảng. Web không nên dựa vào `imported/estimated` cho lần nhập lại.

### 16.7 Test một việc chạy nền
- **Chờ thay vì ngủ cố định:** test hỏi trạng thái mỗi 25 ms cho tới khi hết `RUNNING` (tối đa 15 s). Đọc thẳng database, vì với account vừa bị xóa thì API trả `404`.
- **Connector theo kịch bản:** `ScriptedProvider` là một bean mà mỗi test tự đặt câu trả lời, ghi lại các cursor được hỏi, và có thể **giữ** lời gọi thứ N tới khi test cho đi. Nhờ vậy test dựng được "xóa account đúng lúc đang nhập" hay "bấm bắt đầu lần hai đúng lúc lần một đang chạy".
- **Bẫy spy trong proxy:** `@MockitoSpyBean ConversationStore` cho ra một spy nằm **bên trong** proxy transaction (`MANDATORY`). Gọi `when(store).store(...)` để dựng kịch bản cũng đi qua proxy, nên nổ "không có transaction". Phải dựng kịch bản trên chính spy, lấy bằng `AopTestUtils.getUltimateTargetObject(store)`.
- **Transaction manager thật:** đây là `@SpringBootTest`, nên `store` chạy dưới `JpaTransactionManager` của ứng dụng (ghi chú review BE-42).

### 16.8 Sau review: account đã tắt, dòng kẹt, tắt máy, lỗi database
Review tìm ra một lỗi HIGH và ba MEDIUM; tất cả đã sửa, có test.

- **Account `DISABLED` vẫn bị nhập (HIGH).** D-12 nói account người dùng tắt thì "không đồng bộ", nhưng code chưa đọc trạng thái này ở đâu cả.
  - Chặn ở **`ProviderAccess`**, cửa duy nhất để gọi provider: account đã tắt thì ném `ACCOUNT_DISABLED`, không gọi connector. Mọi tính năng sau này (F07 đồng bộ, F10 gửi thư) được che luôn.
  - API ước lượng và bắt đầu trả **`409 ACCOUNT_DISABLED`** (chọn của agent: account vẫn hiện ở màn Tài khoản, nên `404` sẽ khó hiểu). Xem trạng thái vẫn được.
  - Account bị tắt giữa lúc nhập thì lượt nhập `FAILED` với `ACCOUNT_DISABLED`.
- **Dòng `RUNNING` không còn ai chạy.** Hai đường dẫn tới đó: ghi `FAILED` lỗi khi database chập chờn; hoặc một `POST` đến đúng lúc lượt cũ vừa xong nhưng chưa rời danh sách "đang chạy", nên yêu cầu mới bị bỏ.
  - `ImportRunner` đếm **số yêu cầu** theo account thay vì chỉ nhớ "đang chạy". Yêu cầu đầu tiên mở một luồng; yêu cầu đến trong lúc luồng đó chạy làm nó **xem lại** dòng khi xong. Không yêu cầu nào bị mất, và một account không bao giờ có hai vòng.
  - `POST` lên một dòng đang `RUNNING` cũng giao việc lại: vô hại nếu đang có luồng, và cứu một dòng không còn ai chạy (test `aRunningImportWithoutWorkerIsTakenUpAgainByStart`).
  - Ghi `FAILED` mà lỗi thì chỉ ghi log ERROR; lần bắt đầu sau sẽ nhận lại dòng đó.
- **Tắt máy đúng lúc lần thử lại cuối cùng thất bại** từng bị ghi thành `FAILED`, trong khi design nói dòng phải vẫn `RUNNING`. Giờ `fail()` kiểm luồng có đang bị ngắt không. Hai test ngắt luồng thật (giả lập `shutdownNow()`) rồi cho chạy tiếp tới `DONE`.
- **Lỗi database chép nội dung thư vào log.** Khi PostgreSQL từ chối một dòng, nó kèm "Failing row contains (...)", tức toàn bộ giá trị của dòng, có thể gồm chữ của thư. Cấu hình `logServerErrorDetail=false` của driver PgJDBC (trong `spring.datasource.hikari.data-source-properties`) bỏ phần đó. Test `DatabaseErrorsTests` chứng minh cả hai chiều: có cấu hình thì sạch, bỏ đi thì lộ.
- **Executor không còn là bean:** một bean kiểu `ExecutorService` làm Spring Boot không tạo executor mặc định của nó (`applicationTaskExecutor`). Executor giờ nằm trong `ImportRunner`, đóng lại khi ứng dụng tắt.
- **Thêm:** connector trả lại đúng cursor cũ mà vẫn nói "còn nữa" thì `FAILED` với `CURSOR_STUCK`, thay vì hỏi mãi và đốt hạn mức. ID của item bị bỏ qua (không phải nội dung) được ghi log WARN.

### 16.9 Kiểm tra ngược (BE-45)
Làm hỏng code mỗi lần một chỗ (28 lần); lần chạy mốc khi chưa sửa gì thì xanh. Lần đầu có **một lỗi sống sót**: bỏ điều kiện `WHERE import_status <> 'RUNNING'` khỏi câu bắt đầu. Trong test, lần bấm thứ hai đến lúc lượt đầu còn ở trang đầu tiên, nên "đặt lại dòng" không khác gì trạng thái đang có. Test giờ giữ lượt đầu ở trang **thứ hai** và bấm lần hai với một khoảng **khác**: lượt đang chạy phải giữ nguyên khoảng và số đếm. Lỗi đó giờ bị bắt.

| Lỗi cố ý | Test bắt được |
|---|---|
| Bị giới hạn tần suất thì `FAILED` ngay; provider không tới được thì thử ít hơn một lần, hoặc `FAILED` ngay | thử lại khi bị giới hạn; provider không tới được |
| Cursor hết hạn thì `FAILED` ngay; đọc lại từ đầu mãi; không đặt lại cursor | cursor hết hạn một lần; hết hạn lần hai |
| Bộ đếm thử lại không về 0 sau một trang thành công | thử lại được đếm lại |
| Không đếm thư đã cập nhật; không đếm item bỏ qua; không hỏi ước lượng | nhập lại sau `DONE`; nhập hết các trang |
| Account bị xóa ghi là `INTERNAL`; lỗi lưu không ghi là `INTERNAL` | account bị xóa giữa chừng; lưu thất bại |
| Hai vòng nhập cho một account; bắt đầu lại khi đang chạy (sống sót lần đầu) | bấm bắt đầu hai lần |
| Nhập tiếp cả sau `DONE`; không bao giờ nhập tiếp; nhập tiếp cả với khoảng khác | các test nhập tiếp, nhập lại |
| Không tìm thấy dòng `RUNNING` khi ứng dụng sẵn sàng | chạy tiếp khi ứng dụng sẵn sàng |
| Đảo số phút ít và nhiều; ước lượng lỗi làm hỏng API; không giao việc cho luồng nền | ước lượng; các test nhập |
| `FAILED` không có thời điểm kết thúc; bỏ kiểm tra account | provider không tới được; account ngoài tầm với |
| Số phút không làm tròn lên; có số phút cả khi đã xong; có số phút khi mới chạy | `InitialSyncServiceTests` |
| `POST` trả 200 thay vì 202; không bắt buộc `range` | nhập hết các trang; thiếu `range` |
| Sau review: `ProviderAccess` gọi account đã tắt; bắt đầu nhập account đã tắt; `POST` không nhận lại dòng kẹt; không đặt lại tốc độ của vòng; hỏi mãi cursor không tiến; ghi `FAILED` khi đang tắt máy; không log ID item bỏ qua; bật lại chi tiết lỗi của PostgreSQL | các test account đã tắt; dòng không còn ai chạy; tốc độ của vòng; cursor không tiến; tắt máy ở lần thử cuối; log; `DatabaseErrorsTests` |

## 17. Địa chỉ của account: trường `address` (BE-47)

Trên màn thật, mục "Tài khoản" của Hộp thư hiện `115758365451560723981` thay cho địa chỉ Gmail. Web đang hiện `externalAccountId` ở mọi chỗ canvas ghi địa chỉ, vì trong dữ liệu mẫu trường đó là email. Với Gmail thật, `externalAccountId` là `sub`: mã Google gán cho tài khoản, không phải thứ để người dùng đọc. Người dùng chốt **D-75**: thêm trường `address` vào API account.

```text
Google userinfo { sub, email }
  -> GmailProvider.getAccountProfile        AccountProfile(sub, email, null, email)
                                                           |      |           |
                                          externalAccountId  displayName  address
  -> ConnectService (callback F04a)         RegisterAccountCommand
  -> AccountRegistrationService.register    mới: ConnectedAccount.register(..., address)
                                            có rồi: account.reconnect(..., address)
  -> connected_account.address (V11, cho phép NULL)
  -> AccountResponse -> GET /api/accounts   { ..., "displayName", "address", ... }
  -> web hiện  address ?? displayName
```

### 17.1 Vì sao không dùng luôn email làm `externalAccountId` (câu gợi ý của task)
- **Định danh phải không đổi.** `externalAccountId` nằm trong khóa duy nhất `(user_id, provider, external_account_id)`; nhờ khóa đó mà kết nối lại cùng một tài khoản Google thì dùng lại đúng dòng cũ, không sinh account thứ hai. Email thì đổi được: tài khoản Google Workspace đổi tên miền, người dùng đổi địa chỉ chính. Nếu định danh là email, lần kết nối sau khi đổi địa chỉ sẽ tạo account mới, và thư đã nhập nằm ở account cũ.
- **Mỗi trường một việc.** `externalAccountId` để máy nhận ra tài khoản; `displayName` để người dùng đặt tên (đổi được qua `PATCH`); `address` để hiện cho người đọc biết đây là hộp thư nào. Dồn hai việc vào một trường thì sửa việc này làm hỏng việc kia.
- **Vì sao không chỉ dùng `displayName`?** Lúc kết nối, tên mặc định của Gmail đúng là email. Nhưng người dùng đổi tên thành "Công việc" thì email biến mất khỏi giao diện. `address` thì người dùng không sửa được.

### 17.2 Thêm một thành phần vào `record`
`AccountProfile` là `record`. Thêm `address` vào danh sách thành phần làm đổi **constructor chuẩn** (canonical constructor): mọi chỗ đang viết `new AccountProfile(a, b, c)` thành lỗi biên dịch. Đó là điều tốt: trình biên dịch liệt kê đủ mọi chỗ cần nghĩ lại, không sót chỗ nào.

- Có thể thêm một constructor phụ 3 đối số để code cũ khỏi sửa. Task này **không** làm vậy: với constructor phụ, một connector mới quên địa chỉ vẫn biên dịch được và lặng lẽ có `address = null`. Viết rõ `null` ở mỗi chỗ thì người đọc thấy ngay "chỗ này cố ý không có địa chỉ".
- `ConnectedAccount.register` và `reconnect` cũng thêm tham số `address`. 35 chỗ gọi trong test được sửa bằng script đếm đối số, rồi trình biên dịch xác nhận không còn chỗ nào sót.

### 17.3 Dữ liệu lạ từ provider: chuẩn hóa, không từ chối
Tên và địa chỉ đến từ provider, Sino không kiểm soát. Quy tắc của module `account` là **một giá trị lạ không được chặn việc kết nối**:

| Giá trị từ provider | `displayName` | `address` |
|---|---|---|
| Có khoảng trắng hai đầu | bỏ khoảng trắng | bỏ khoảng trắng |
| Rỗng hoặc chỉ khoảng trắng | từ chối (bắt buộc có tên) | lưu là `null` |
| Dài hơn giới hạn | cắt còn 100 ký tự | giữ nguyên (cột `text`) |

Cắt ngắn một địa chỉ sẽ cho ra địa chỉ sai, nên cột `address` là `text`, không giới hạn độ dài như `display_name`. Kết nối lại luôn **thay** địa chỉ bằng giá trị mới, kể cả khi provider không đưa: địa chỉ cũ không còn đúng thì hiện `displayName` còn hơn hiện sai.

### 17.4 Migration thêm cột cho phép NULL
```sql
ALTER TABLE connected_account ADD COLUMN address text;
```
- PostgreSQL thêm cột cho phép `NULL`, không có giá trị mặc định, chỉ bằng cách sửa mô tả bảng: không ghi lại dòng nào, chạy tức thì dù bảng lớn.
- **Không điền ngược** cho account cũ (D-75). Đoán từ `display_name` sẽ sai nếu người dùng đã đổi tên; account cũ có địa chỉ ở lần kết nối lại, trong lúc chờ web hiện `displayName`.
- `spring.jpa.hibernate.ddl-auto: validate`: nếu entity có `@Column(name = "address")` mà database chưa có cột, ứng dụng không khởi động. Một lỗi cố ý đổi tên cột trong entity làm mọi test chạy cả ứng dụng đỏ ngay.

### 17.5 `PATCH` không đổi được `address`
`UpdateAccountRequest` không có trường `address`. Jackson của Spring Boot mặc định **bỏ qua** trường JSON lạ (`FAIL_ON_UNKNOWN_PROPERTIES = false`), nên body `{"displayName": "Công việc", "address": "other@example.com"}` đổi tên và để nguyên địa chỉ. Test `aPatchCannotChangeTheAddress` chứng minh điều đó: nếu một ngày ai đó thêm `address` vào request, test sẽ đỏ.

### 17.6 Kiểm chứng (BE-47)
- **Đỏ trước:** thêm chữ ký mới nhưng chưa có logic (`address()` trả `null`, chưa có cột) rồi chạy 5 lớp test: 4 test sai (địa chỉ `null`) và 2 test lỗi (cột `address` chưa có). Sau khi cài: 102 test xanh.
- **Kiểm tra ngược:** 10 lỗi cố ý, tất cả bị bắt; lần chạy mốc không sửa gì thì xanh.

| Lỗi cố ý | Test bắt được |
|---|---|
| Không bỏ khoảng trắng hai đầu của địa chỉ | `aNewAccountIsConnectedAndSyncs` |
| Giữ chuỗi chỉ có khoảng trắng | `aBlankAddressFromTheProviderIsNoAddress`, `reconnectWithoutAnAddressDropsTheOldOne` |
| Đăng ký mới bỏ mất địa chỉ | `aNewAccountIsConnectedAndSyncs`, `keepsTheAddressFromTheProviderAndTakesTheNewOneOnReconnect` |
| Kết nối lại giữ địa chỉ cũ khi provider không đưa | `reconnectWithoutAnAddressDropsTheOldOne` |
| `address()` luôn trả `null` | test của service và của API |
| Đổi tên cột trong entity | mọi test chạy cả ứng dụng (`ddl-auto: validate`) |
| Service không chuyển địa chỉ khi đăng ký, hoặc khi kết nối lại | `keepsTheAddressFromTheProviderAndTakesTheNewOneOnReconnect` |
| Gmail không đưa địa chỉ | `theProfileIsTheGoogleSubjectAndTheEmail` |
| API không trả địa chỉ | `showsTheAddressOfAnAccountInTheListAndAlone`, `aPatchCannotChangeTheAddress` |

- **Toàn bộ:** `./mvnw -B -ntp verify` → 835 test, 0 lỗi, 3 bỏ qua.
- **Sau review:** không có lỗi nặng. Ba điểm nhỏ đã sửa:
  - Test đi hết luồng kết nối (callback) chưa kiểm `address`, nên nếu `ConnectService` sau này dựng lại hồ sơ mà quên địa chỉ thì chỉ test của service đỏ. Giờ test callback kiểm cả hai đường: kết nối mới có email; account cũ đang `null` nhận email khi kết nối lại. Hai lỗi cố ý tương ứng giờ bị test callback bắt.
  - README từng ghi `PATCH` "bỏ qua" `address`. Đúng khi có trường khác đi kèm; còn body chỉ có `address` thì như `{}`: không có trường hợp lệ nào, nên `400 VALIDATION_FAILED`.
  - Delta `account-connect` của F05 sửa một requirement do F04a thêm: phải archive F04a trước, và sửa câu chữ ở F04a thì phải chép lại sang F05.
- **Câu hỏi còn mở (chờ người dùng):** kết nối lại vẫn thay tên người dùng tự đặt bằng email (từ F02). Nay email đã có `address` riêng, nên có thể giữ tên người dùng đặt; xem Open Questions trong design của F05.

## 18. Nhập thật với Gmail và nghiệm thu F05 (BE-46)

**Ở đâu:** test `src/test/java/dev/sino/sync/RealGmailImportTests.java` (mới), `src/test/java/dev/sino/provider/infrastructure/gmail/RealGmailTests.java` (thêm phép đo ước lượng), `sync/application/InitialSyncProperties.java` (tốc độ giả định), `apps/sino-api/README.md`.

### 18.1 Test làm gì
- Nhập lại account Gmail đang kết nối, với đúng khoảng account đang có (account của bạn: 90 ngày), qua chính API `POST /api/accounts/{id}/initial-sync`, rồi chờ `DONE`.
- Đếm số thư được đưa vào `ConversationStore.store` (một spy) để biết đã đọc bao nhiêu thư, chia cho thời gian để ra tốc độ.
- So database với API: số thư đã lưu, số conversation (lật từng trang như web cuộn), số chưa đọc, cần trả lời, có tệp. Tóm tắt của mỗi conversation (số chưa đọc, giờ thư mới nhất, có tệp) được tính lại từ chính các thư của nó bằng một câu SQL riêng, không dùng code của BE-43.
- Chỉ in số đếm và thời gian, không in nội dung, tiêu đề hay địa chỉ.

Kế hoạch ghi nhập 30 ngày; test dùng khoảng account đang có, vì nhập lại với khoảng khác sẽ đổi lựa chọn của người dùng (dòng `sync_checkpoint` giữ khoảng của lượt nhập gần nhất).

### 18.2 Vì sao nhập vào database local trong test thật thì được, còn trong CI thì không (câu gợi ý của task)
- Test cần token thật của một tài khoản Gmail thật. Token nằm (đã mã hóa) trong database local, khóa giải mã nằm trong `.env`. Máy CI không có, và không được có, những thứ đó: đưa token Gmail lên CI là trao quyền đọc thư cho một máy khác.
- Kết quả phụ thuộc hộp thư thật, đổi mỗi ngày, nên không lặp lại được và không thể làm cổng chặn build. Nó là bằng chứng một lần, có ghi ngày.
- Nhập lại không tạo thư trùng (lưu kiểu upsert, mục 13), nên chạy trên dữ liệu của chính bạn không hỏng gì; chỉ tốn một ít hạn mức Gmail API.

### 18.3 Hai tiến trình trên một database
Bản đầu của test được viết để chạy cùng backend trong IntelliJ: JVM test tắt lịch đồng bộ của nó (`sino.sync.live.scheduled=false`) và thay `ImportResumer` bằng mock, để nó không nhận làm tiếp lượt nhập của backend kia. Review chỉ ra cách đó chỉ chặn **một chiều**:

```text
Backend trong IntelliJ (8080)              JVM của test
  thông báo Gmail -> submit(account) --+
  "Đồng bộ ngay"  -> submit(account) --+--> sync_checkpoint = RUNNING
  lịch mỗi phút   -> submit(account) --+          ^
                                                  |
                              lượt nhập do test bắt đầu
```

`ImportRunner.run` gặp dòng `RUNNING` là nhập tiếp, bất kể ai gọi `submit`. Khóa "mỗi account chỉ một người đọc" nằm trong bộ nhớ của từng JVM (mục 16.2), nên hai JVM có thể cùng nhập một account. Thư không mất, vì lưu là idempotent và khóa theo account trong database xếp hàng các lượt ghi. Nhưng số bỏ qua bị cộng hai lần, tốc độ đo sai, và cursor có thể bị ghi đè. Thiết kế F05 đã giả định **một backend cho một database**; test phải tôn trọng giả định đó chứ không lách qua nó.

Cách sửa: test tự bỏ qua khi có thứ gì trả lời ở cổng 8080 (`assumeFalse` sau khi thử mở một kết nối TCP), nên bạn tắt app trong IntelliJ khoảng một phút khi chạy test này. `RealGmailTests` chỉ đọc Gmail, không đụng `sync_checkpoint`, nên vẫn chạy được khi backend bật; nó vẫn giữ hai thiết lập kia để không có lịch đồng bộ thứ hai.

Hai lần đo trước khi có chốt chặn vẫn dùng được: ở cả hai lần, spy đếm đúng 53 thư, bằng số thư Gmail liệt kê, tức JVM test tự đọc mọi trang.

### 18.4 Gài spy xuyên qua proxy transaction
Lần chạy đầu lỗi ngay ở dòng gài spy: `IllegalTransactionState: No existing transaction found for transaction marked with propagation 'mandatory'`. `store` có `@Transactional(propagation = MANDATORY)` (mục 13), nên Spring bọc nó bằng một proxy, và `@MockitoSpyBean` đặt spy **bên trong** proxy đó. `when(store).store(...)` là một lời gọi qua proxy, và proxy đòi transaction trước khi tới spy. Cách sửa, giống `InitialSyncApiTests`: `AopTestUtils.getUltimateTargetObject(store)` lấy spy bên trong rồi gài lên chính nó.

### 18.5 Kết quả đo (2026-10-10)
Ước lượng ở bước "Đồng bộ" so với số thư một lượt nhập thật sự liệt kê:

| Khoảng | Ước lượng hiện cho người dùng | Thư thật trong danh sách |
|---|---|---|
| 30 ngày | 201 (`resultSizeEstimate`) | 29 |
| 90 ngày | 201 (`resultSizeEstimate`) | 53 |
| Toàn bộ hộp thư | 212 (`messagesTotal`) | 212 |

`resultSizeEstimate` của danh sách không có `q` là 201. Câu hỏi BE-40 để lại (mục 11.2) là `messagesTotal` có lệch không: không, khớp đúng. Chỗ lệch nằm ở khoảng ngày: Gmail trả 201 cho cả 30 lẫn 90 ngày, gần bằng cả hộp thư, như thể bỏ qua `q=after:`. Màn "Đồng bộ" sẽ báo "khoảng 201 thư" cho 29 thư thật. Đổi cách ước lượng là đổi D-65, nên được ghi thành **Decision Needed** trong design của F05 để người dùng chốt.

Lượt nhập lại:

| Khoảng | Đọc | Mới hoặc đổi | Bỏ qua | Thời gian | Tốc độ |
|---|---|---|---|---|---|
| 90 ngày | 53 | 0 | 0 | 33 giây | khoảng 97 thư/phút |

- Database và API khớp: 53/53 conversation, chưa đọc 0/0/0, cần trả lời 20/20, có tệp 0/0; không conversation nào có tóm tắt lệch với thư của nó.
- Tốc độ: thiết kế đoán 200–400 thư/phút, thật chỉ khoảng 100 (hai lần: 33 giây và 28 giây cho 53 thư, tức 97 và 115 thư/phút), vì mỗi thư là một lời gọi `messages.get` tuần tự, khoảng 0,6 giây mỗi thư từ máy này. Mặc định đổi thành 60–120 thư/phút; với 1.180 thư, màn "Đồng bộ" giờ báo 10–20 phút thay vì 3–6 phút. Hai lần đo, cùng là đọc lại (không có thư mới phải ghi), còn ít; nhưng lệch 2–4 lần thì đáng sửa ngay. Đo thêm ở một lần nhập đầu thật với hộp thư lớn hơn.
- "Mới hoặc đổi" là 0 vì mọi thư đã có sẵn: số `imported` của trạng thái đếm thư mới hoặc đổi, không đếm thư đã đọc. Hệ quả cho web ở mục 18.7.

### 18.6 Kiểm chứng (BE-46)
- Test thật: 4 test `real-gmail` xanh (`RealGmailTests` 3, `RealGmailImportTests` 1). Lần chạy đầu của `RealGmailImportTests` lỗi ở chỗ gài spy (mục 18.4); sửa rồi xanh.
- Test có bắt được lỗi không: gài lỗi vào `InboxService.counts` (đảo điều kiện "cần trả lời"), chạy lại test thật: đỏ, database 20 mà API 33. Trả code về như cũ.
- Tốc độ mới: sửa kỳ vọng của `estimatesFromTheConnector` trước (10–20 phút), chạy thì đỏ (`expected:<10> but was:<3>`); đổi mặc định thì `InitialSyncApiTests` 33/33 xanh.
- Toàn bộ: `./mvnw -B -ntp verify` → 1000 test, 0 lỗi, 4 bỏ qua; `ModularityTests` xanh.
- Chốt chặn cổng 8080: chạy khi backend đang bật thì test được báo bỏ qua (`Skipped: 1`), không nhập gì. Lần chạy cuối với backend đã tắt: ghi ở `tasks.md`.
- Mọi lệnh Maven chạy trong một git worktree riêng, vì backend đang chạy trong IntelliJ (DevTools khởi động lại app khi `target/classes` đổi). Worktree không có `.env`; test đọc `.env` của cây chính qua biến `SPRING_CONFIG_IMPORT=file:<đường dẫn>/.env[.properties]`, không chép file bí mật sang chỗ khác. Lưu ý: JVM test chạy Flyway trên database dùng chung, nên chỉ chạy test thật từ một worktree có đúng các migration của nhánh đang chạy; một migration chưa gộp sẽ vào database của bạn.

### 18.7 Sau review
Không có lỗi nặng. Hai điểm vừa, bảy điểm nhỏ:
- **Cô lập một chiều** (vừa): mục 18.3; sửa bằng chốt chặn cổng 8080. Chốt chặn này cũng đóng ba điểm nhỏ: số đếm có thể lệch nếu backend kia lưu thư mới giữa hai lần đọc; một hội thoại bị đẩy lên đầu giữa lúc lật trang; backend kia bắt đầu nhập đúng lúc giữa lần kiểm tra và `POST`.
- **`imported` chỉ đếm thư mới hoặc đổi** (vừa, chưa sửa): khi nhập lại cùng khoảng, tiến độ đứng ở 0 và "còn bao nhiêu phút" để trống suốt lượt; khi đổi 30 sang 90 ngày, tốc độ chỉ tính trên thư mới nên báo "còn 1 phút" lúc sắp xong. Sửa cần thêm cột đếm thư đã đọc (migration) và đổi nghĩa trong trạng thái, nên để thành việc riêng; ghi ở Open Questions của design F05.
- **Kiểm tra lặp lại chính code đang kiểm** (nhỏ): "cần trả lời" giờ được tính lại từ thư (thư mới nhất là thư đến và không phải hàng loạt), và view `reply`, `attachments` được lật trang, so với số đếm.
- **Test đổi trạng thái nhiều hơn chữ "nhập lại"** (nhỏ): Javadoc và README ghi rõ số đếm về 0, lần đồng bộ gần nhất bị xóa tới lượt sau, watch được đăng ký lại; account chưa từng nhập thì bỏ qua thay vì tự chọn 30 ngày.
- **Tốc độ dựa trên một lần đo** (nhỏ): giờ là hai lần, ghi rõ trong design; đo thêm ở lần nhập đầu thật.
- Javadoc của tốc độ chuyển lên mức record; thay đổi định dạng của IntelliJ ở `RealtimeProperties.java` là của bạn, không nằm trong commit này.

## 19. Danh sách thư của một cuộc trò chuyện, người nhận (BE-54, F06)

**Ở đâu:** `db/migration/V14__conversation_add_message_recipients.sql` (mới), `provider/spi/NormalizedRecipients.java` (mới), `provider/spi/NormalizedMessage.java`, `provider/infrastructure/gmail/GmailMessageNormalizer.java`, `conversation/infrastructure/{JdbcConversationStore,WithoutNul}.java`, `conversation/application/{KeysetCursor,MessageCursor,MessageHistory,InboxMessage,MessagePage}.java`, `conversation/api/{ConversationMessagesController,MessageResponse}.java`.

Trước F06, mở một cuộc trò chuyện chỉ thấy đoạn đầu của thư mới nhất. BE-54 cho web đọc mọi thư, kèm người gửi, người nhận, tiêu đề, phần chữ và tệp. Hai phần của thư còn để lại cho task sau: HTML (BE-55) và tải tệp (BE-56).

### 19.1 Contract: `null` khác danh sách rỗng
`NormalizedMessage` có thêm thành phần thứ 13, `recipients`, kiểu `NormalizedRecipients(to, cc, replyTo)`; mỗi phần tử là `Address(name, address)`.
- `recipients` = `null`: connector **không biết** người nhận (chat không có khái niệm To/Cc).
- `to` = `[]`: thư **không có** header `To`.

API giữ đúng sự phân biệt đó: `to: null` là "Sino không biết", `to: []` là "không gửi cho ai trong To". Gộp hai nghĩa vào một thì web không biết nên ghi "không rõ" hay không ghi gì.

Thêm một thành phần vào `record` thì mọi chỗ gọi constructor phải thêm một đối số: 20 chỗ, phần lớn trong test. Như BE-47, không thêm constructor phụ (mục 17.2); một script thêm `, null` vào từng lời gọi. `subject` trước là khóa riêng của Gmail, nay thành khóa dùng chung `NormalizedMessage.SUBJECT` (như `BULK`), vì module `conversation` cần đọc tiêu đề của từng thư.

### 19.2 Gmail: dùng lại bộ đọc địa chỉ
`To`, `Cc`, `Reply-To` đi qua đúng hàm đã đọc người tham gia, `MailHeaders.mailboxes` (mục 8.4, 8.5): tên trong ngoặc kép có dấu phẩy (`"Trần, Bình" <binh@…>`), tên mã hóa RFC 2047 (`=?UTF-8?Q?Ph=C3=B2ng…?=` thành "Phòng kế toán"), địa chỉ viết thường. Không viết bộ tách địa chỉ thứ hai.

### 19.3 Lưu người nhận vào cột riêng và giữ chúng khi lưu lại
Migration V14 thêm cột `message.recipients jsonb`, cho phép `NULL`: `NULL` là "Sino không biết" (thư lưu trước F06, hoặc chat), còn lại là `{"to": [...], "cc": [...], "replyTo": [...]}`.

Khó nằm ở lần lưu lại. Một connector không biết người nhận (hoặc một bản cập nhật chỉ đổi trạng thái đọc) gửi thư với `recipients` = `null`. Nếu ghi đè như các cột khác, người nhận đã lưu biến mất. Câu SQL giữ chúng:

```text
INSERT INTO message AS m (..., recipients, ...) VALUES (..., cast(:recipients AS jsonb), ...)
ON CONFLICT (conversation_id, external_message_id) DO UPDATE
SET ...,
    recipients = coalesce(EXCLUDED.recipients, m.recipients)
WHERE (..., m.recipients, ...)
      IS DISTINCT FROM
      (..., coalesce(EXCLUDED.recipients, m.recipients), ...)
```

`coalesce(a, b)` lấy giá trị đầu tiên khác `NULL`: có người nhận mới thì lấy mới, không có thì giữ cũ. Biểu thức phải có ở **cả hai** chỗ: trong `SET` (giá trị mới) và trong `WHERE ... IS DISTINCT FROM` (mục 13.3: chỉ ghi khi có gì đổi). Thiếu ở `WHERE` thì lần lưu lại không người nhận luôn bị coi là "đổi": dòng bị ghi lại, `updatedMessages` tăng, và một sự kiện `MailStored` bay tới web dù không có gì mới.

**Vì sao cột riêng, không nhét vào `metadata`.** Design ban đầu để người nhận trong `metadata`, và bản đầu của task làm đúng như vậy với một khóa `recipients`. Review hỏi: sao không dùng cột riêng? So sánh:

| | Khóa trong `metadata` | Cột riêng |
|---|---|---|
| Giữ bản cũ khi lưu lại | một `CASE` ghép hai giá trị jsonb (`jsonb_build_object`), ở cả `SET` lẫn `WHERE` | `coalesce(...)` |
| Khóa trùng tên do connector đặt | phải bỏ đi khi lưu, kẻo giả được người nhận | không có chuyện đó |
| Kích thước | `metadata` là "vài giá trị nhỏ"; một thư gửi 2 000 người nặng cỡ trăm KB | cột của riêng nó |
| Cái giá | không cần migration | một migration thêm cột |

Đổi trước khi commit, nên không có dữ liệu nào phải chuyển. Trên đường đi còn gặp hai bẫy của jsonb đáng nhớ: toán tử `?` ("có khóa này không") trùng với dấu `?` mà JDBC dùng cho tham số; và `jsonb_strip_nulls` xóa **mọi** giá trị `null`, kể cả `"name": null` nằm sâu bên trong.

### 19.4 API: cursor có "loại", hai câu truy vấn
- **Cursor** (mục 15.3): base64url của `<loại><thời điểm>|<id>`, dùng chung lớp `KeysetCursor`. Hộp thư có loại rỗng, nên chữ của cursor y như trước (cursor web đang giữ vẫn dùng được). Danh sách thư có loại `message|`. Đưa cursor của danh sách này sang danh sách kia thì `400`: không có loại, một cursor Hộp thư sẽ được nhận như vị trí trong danh sách thư, trả về một trang sai mà không ai biết.
- **Phạm vi:** `MessageHistory` hỏi `InboxService.requireInInbox` trước, nên mọi trường hợp `404` giống hệt `GET /api/conversations/{id}` (account đã xóa, đã tắt, của người khác). Hội thoại đã lưu trữ hay account hết hạn Google vẫn đọc được.
- **Hai câu truy vấn, không N+1:** một câu lấy trang thư (kèm người gửi bằng `LEFT JOIN`), một câu lấy tệp của mọi thư trong trang (`message_id IN (...)`). Một câu cho mỗi thư thì 20 thư là 21 câu.
- **Thứ tự:** `sent_at` giảm dần rồi `id` giảm dần; điều kiện `(m.sent_at, m.id) < (:before, :beforeId)` kèm `m.sent_at <= :before` để PostgreSQL dùng được chỉ mục `message_conversation_sent_idx`.

### 19.5 Kiểm chứng (BE-54)
- **Đỏ trước:** test API 12/13 đỏ (`404`, chưa có endpoint); test "chưa đăng nhập thì `401`" xanh từ đầu vì lớp bảo mật đã có. Test lưu 15 đỏ (chưa lưu người nhận), test Gmail 2 đỏ (người nhận còn `null`). Test của `NormalizedRecipients` xanh từ đầu: record được viết trước test, nên lần đỏ của nó đến từ kiểm tra ngược bên dưới.
- **Xanh:** 194 test của các lớp liên quan (sau khi đổi sang cột riêng).
- **Kiểm tra ngược:** 29 lỗi gài, cả 29 bị bắt. Lần đầu có một lỗi sống sót: bỏ phép kiểm tiền tố `message|` mà mọi giá trị lạ trong test đều tình cờ hỏng ở bước đọc thời điểm. Một chuỗi có tiền tố khác dài đúng 8 ký tự (`notours|`) rồi tới thời điểm hợp lệ lọt qua được, nên thêm đúng ca đó.

| Lỗi gài | Test bắt được |
|---|---|
| Cũ trước mới; cursor gồm cả thư cuối trang; cursor chỉ theo giờ; không lấy dư một dòng; cursor từ thư đầu trang | `twentyFiveMessages…`, `messagesSentAtTheSameMoment…` |
| Cc lấy từ To; không gắn tệp; `self` luôn sai; tên người gửi là địa chỉ; bỏ qua người nhận; người gửi không bao giờ `null`; `bodyFormat` = `HTML` | `aMessageShowsWhoSentIt…`, `addresseesAreUnknown…` |
| Bỏ kiểm phạm vi; mặc định 30 thư; bỏ trần 100 | `theMessagesOfAConversationOutsideTheInbox…`, `twentyFiveMessages…`, `aBadParameterIsABadRequest` |
| Cursor thư không có loại; cursor Hộp thư có thêm một loại; bỏ kiểm tiền tố | `aCursorOfTheInboxIsNot…`, `MessageCursorTests`, `writesTheSameTextAsBefore…` |
| Lưu lại thì ghi đè người nhận; `WHERE` bỏ qua người nhận; `WHERE` so không qua `coalesce`; không ghi người nhận | `anUpdateThatCannotTell…`, `aMessageWhoseFieldChangedIsUpdated[recipients]`, `aMessageShowsWhoSentIt…` |
| Không lọc NUL trong người nhận; giữ tên toàn NUL; giữ địa chỉ toàn NUL | `nulCharactersAreLeftOut` |
| Giữ tiêu đề rỗng; Cc đọc từ To; bỏ Reply-To; bỏ tên | `aBlankSubjectIsNoSubject`, `keepsWhoTheMailWentTo…` |

- **Toàn bộ:** `./mvnw -B -ntp verify` → 1035 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS; `ModularityTests` xanh.
- **Sau review** (agent `senior-reviewer`, không có lỗi nặng):
  - Vừa: spec `message-history` nói `sender` luôn có, trong khi code trả `null` cho thư không rõ người gửi. Đã sửa spec và thêm scenario; phiên web đã chịu được `sender: null`.
  - Câu hỏi cuối: vì sao không dùng cột riêng. Làm theo, mục 19.3.
  - Nhỏ, đã sửa: tiêu đề rỗng thành không có tiêu đề; tên hoặc địa chỉ chỉ toàn NUL; Javadoc của `NormalizedRecipients` nói đúng cả trường hợp nhóm không thành viên (`undisclosed-recipients:;`); đọc giờ gửi bằng `OffsetDateTime` như phần còn lại của code; bản đọc người nhận bỏ qua khóa lạ; test chốt chuỗi của cursor Hộp thư, `MessageCursorTests`, thứ tự theo `id` của thư cùng giờ.
  - Không làm: test Gmail bằng WireMock mà task ghi. **LÝ DO:** đường gọi `messages.get` không đổi; phần mới chỉ là đọc ba header, đã có test bộ chuẩn hóa trên mẫu JSON.

## 20. Thư HTML: lưu nguyên bản, làm sạch khi trả, lấy bù thư cũ (BE-55, F06)

**Ở đâu:** `db/migration/V15__conversation_add_message_html.sql` (mới), `provider/spi/{MessageContent (mới),MessageProvider,NormalizedMessage}.java`, `provider/infrastructure/gmail/{GmailMessageNormalizer,GmailProvider}.java`, `conversation/application/{MailHtml,MessageBodies,BodyFormat,MessageBody}.java` (mới), `conversation/infrastructure/JdbcConversationStore.java`, `conversation/api/ConversationMessagesController.java`, `common/error/ErrorCategory.java`.

Bản tin, biên lai, thông báo của ngân hàng phần lớn là HTML: bảng, màu, nút, ảnh. Chỉ có chữ (BE-37 rút chữ từ HTML) thì mất hết bố cục. BE-55 giữ HTML, nhưng HTML từ người lạ là chỗ dễ bị tấn công nhất của một ứng dụng đọc thư: một thẻ `<script>` lọt qua là chạy trên trang của Sino, với cookie đăng nhập của bạn.

### 20.1 Ba trạng thái của nội dung một thư
Migration V15 thêm hai cột vào `message`:

| `body_format` | Nghĩa | `html_content` |
|---|---|---|
| `TEXT` | thư không có HTML, hoặc HTML dài quá 1 000 000 ký tự | `NULL` |
| `HTML` | đã giữ HTML như lúc nhận | có |
| `UNCHECKED` | thư lưu trước F06: chưa biết có HTML hay không | `NULL` |

Mọi dòng có sẵn nhận `UNCHECKED` nhờ `DEFAULT`. Một ràng buộc `CHECK ((body_format = 'HTML') = (html_content IS NOT NULL))` so sánh hai giá trị đúng/sai: có HTML khi và chỉ khi trạng thái là `HTML`. Code nào lỡ ghi lệch hai cột này thì PostgreSQL từ chối ngay, thay vì để dữ liệu sai nằm im.

`DEFAULT 'UNCHECKED'` chỉ dùng để đánh dấu các dòng có sẵn, rồi bị bỏ ngay trong cùng migration: một câu `INSERT` sau này mà quên cột này sẽ lỗi `NOT NULL` ngay, thay vì âm thầm tạo một thư `UNCHECKED`.

HTML của một thư không bao giờ đổi. Lưu lại một thư thì giữ HTML đã lưu (`coalesce(m.html_content, EXCLUDED.html_content)`): giá trị ghi lại chính là giá trị cũ, nên PostgreSQL không phải chép lại cả trăm KB HTML (nằm trong bảng phụ TOAST) mỗi lần thư chỉ đổi trạng thái đã đọc. Phép so "có gì đổi không" ở `WHERE` (mục 13.3) so `body_format` chứ không so HTML. Một thư `UNCHECKED` được đồng bộ chạm vào thì được "chốt": có HTML thành `HTML`, không có thành `TEXT`.

### 20.2 Vì sao giữ HTML gốc và làm sạch mỗi lần trả (câu gợi ý của task)
Hai cách:

```text
Cách A (bỏ): nhận thư --làm sạch--> lưu bản sạch --> trả
Cách B (D-120): nhận thư --> lưu bản gốc --> mỗi lần trả: làm sạch --> trả
```

Bộ lọc nào cũng có ngày bị phát hiện một lỗ. Với cách A, mọi thư đã lưu bằng bộ lọc cũ vẫn mang lỗ đó, cho tới khi có ai viết một việc nền chạy lại bộ lọc trên từng dòng. Với cách B, sửa bộ lọc là có tác dụng ngay với mọi thư, kể cả thư nhập từ năm ngoái. Cái giá là làm sạch lại mỗi lần mở thư (vài mili giây với jsoup) và lưu bản gốc. Test `htmlComesOutCleanedAndTellsOfPicturesFromTheWeb` kiểm cả hai vế: API trả bản sạch, còn database vẫn giữ bản gốc.

### 20.3 Bộ lọc: chỉ cho phép những gì cần
`MailHtml` dùng `Cleaner` của jsoup với một **danh sách cho phép** (`Safelist`): bắt đầu từ `Safelist.relaxed()` rồi thêm những gì thư cần cho bố cục (`style`, `class`, thuộc tính của bảng, `font`, `center`). Thẻ hay thuộc tính nào không có trong danh sách đều bị bỏ, kể cả những thứ trình duyệt sau này mới bày ra. Danh sách cấm thì ngược lại: chỉ chặn được những gì người viết đã nghĩ tới.

```text
HTML gốc
  -> Jsoup.parse: dựng cây DOM, giải mã thực thể (&#106; thành j)
  -> dời các thẻ <style> của <head> vào <body> (Cleaner chỉ giữ body)
  -> Cleaner(Safelist): giữ thẻ và thuộc tính được phép, kiểm giao thức của href/src
  -> ảnh: cid: thành đường dẫn của Sino hoặc bỏ; data: chỉ png/jpeg/gif/webp; không còn src thì bỏ
  -> remoteImages: có ảnh http(s), thuộc tính background, hay url(...) từ xa trong CSS không?
  -> body().html()
```

- **Giao thức:** liên kết chỉ `http`, `https`, `mailto`, `tel`; ảnh chỉ `http`, `https`, `cid`, `data`. `&#106;avascript:` không lọt, vì jsoup giải mã thực thể lúc dựng cây, trước khi kiểm giao thức. Đường dẫn tương đối (`/api/accounts`) cũng bị bỏ: một ảnh `src="/api/..."` sẽ gọi API của Sino kèm cookie của bạn.
- **Liên kết:** mọi `<a>` bị ép `target="_blank" rel="noopener noreferrer"`: mở tab mới, và trang đó không với ngược lại được cửa sổ của Sino.
- **CSS giữ nguyên:** làm sạch CSS rất khó và dễ sai. CSS ở trình duyệt hiện đại không chạy được script; rủi ro còn lại là CSS tải ảnh từ xa để báo "đã mở thư", và lớp thứ hai bên dưới chặn việc đó.
- **Các `<style>` của `<head>`** dời vào body **giữ đúng thứ tự** (trong CSS, luật viết sau thắng luật viết trước), và giữ thuộc tính `media` (`<style media="(max-width: 600px)">` chỉ áp cho màn nhỏ). Bản đầu dời từng thẻ lên đầu body nên đảo thứ tự; review bắt được.
- **Hai lớp gia cố "phòng hờ":** sau khi làm sạch, mỗi `<style>` chỉ còn CSS thuần, có `</style` bên trong thì bỏ hẳn; địa chỉ `http` phải có đủ `//`. Review nghi một kiểu mXSS (HTML đột biến khi trình duyệt đọc lại): trong `<svg>`/`<math>`, nội dung `<style>` được đọc thành thẻ thật. Thử trực tiếp với jsoup 1.23.2 thì không lọt: jsoup mã hóa `<` trong giá trị thuộc tính và trong chữ, nên trình duyệt chỉ thấy chữ vô hại; `https:/api/...` jsoup cũng đã tự bỏ. Hai lớp này vẫn giữ, phòng khi một bản jsoup sau đổi cách làm; test của chúng vẫn xanh với bộ lọc cũ, nên lỗi gài bỏ chúng đi "sống sót" là điều đã biết.

### 20.4 Hai bức tường
```text
Gmail --HTML gốc--> Sino lưu nguyên --> MailHtml (bức tường 1, server)
   --> HTML sạch --> web: <iframe sandbox srcdoc> + CSP (bức tường 2, trình duyệt)
```

Bức tường 2 là của web (FE-58): iframe `sandbox` không có `allow-scripts` thì không script nào chạy, kể cả khi bộ lọc bỏ sót; CSP `default-src 'none'` chặn mọi tải từ xa, ảnh chỉ hiện khi bạn bấm "Hiện ảnh" (D-121). Hai bức tường độc lập: một bên hỏng, bên kia vẫn đứng.

### 20.5 Lấy bù thư cũ
Cả hộp thư đã nhập trước F06 nên mọi thư cũ là `UNCHECKED`. Lần đầu web hỏi nội dung một thư như vậy, `MessageBodies` gọi hàm tùy chọn mới của contract `fetchMessageContent` (Gmail: `messages.get`), lưu HTML và người nhận, rồi trả. Lần sau đọc từ database, không gọi Gmail nữa.

- **Gọi provider ngoài transaction** (mục 16.1): chờ Gmail nửa giây trong một transaction là giữ một kết nối database và các khóa suốt thời gian đó. `MessageBodies` không có `@Transactional`; chỉ bước ghi chạy trong một `TransactionTemplate` ngắn.
- **Hai request cùng lúc:** cả hai gọi Gmail, nhưng câu `UPDATE ... WHERE id = :id AND body_format = 'UNCHECKED'` chỉ đổi được một lần; request sau không đổi gì, rồi cả hai đọc lại từ database và trả cùng một kết quả.
- **Gmail lỗi hoặc account không dùng được:** `502 MESSAGE_CONTENT_UNAVAILABLE`, thư giữ `UNCHECKED` để lần sau thử lại; web hiện phần chữ kèm "Thử lại". Gmail không còn thư đó (đã xóa hẳn): thư thành `TEXT`, không hỏi nữa.
- **Sau khi lấy bù:** thư giờ có người nhận và định dạng mới, nên `MessageBodies` phát `ConversationChanged` ngay trong transaction ghi; luồng realtime (F08) báo các tab của bạn đọc lại danh sách thư. Chỉ phát khi thật sự đổi: request thứ hai không đổi gì thì không phát.
- **Mã `502`:** loại lỗi mới `PROVIDER_FAILED`. `503` (`DEPENDENCY_UNAVAILABLE`) nói "Sino tạm không dùng được một thứ nó cần"; `502` (Bad Gateway) nói "Sino đã hỏi bên kia, và bên kia không trả được". F10 sẽ dùng thêm `502` và `504` cho việc gửi thư.

### 20.6 Kiểm chứng (BE-55)
- **Đỏ trước:** `MailHtmlTests` 43/52 đỏ trên một `MailHtml` tạm trả nguyên HTML gốc; 9 cái xanh vì kiểm những gì HTML để nguyên cũng đúng (thư trả lời của Gmail giữ phần trích dẫn). Các test khác (lưu, API, Gmail) viết sau code; việc chúng bắt được lỗi được chứng minh bằng kiểm tra ngược bên dưới.
- **Xanh:** 409 test của các lớp liên quan.
- **Kiểm tra ngược:** hai lượt, 53 lỗi gài. Lượt đầu (37): 33 bị bắt; 4 sống sót dẫn tới 3 test mới (`background` lạ, HTML giữ nguyên khi thư đổi trạng thái đọc, phần HTML toàn khoảng trắng) và một chỗ bỏ hẳn khỏi code (phép so HTML ở `WHERE`, tương đương với phép so `body_format`). Lượt hai (16, phần sửa sau review): 10 bị bắt, 6 sống sót có chủ đích:

| Lỗi gài sống sót | Vì sao không có test đỏ |
|---|---|
| Bỏ danh sách giao thức của `background`; bỏ phép kiểm `//` của `background` | hai lớp kiểm cùng một thứ, bỏ một lớp thì lớp kia vẫn chặn |
| Bỏ bước chỉ giữ CSS trong `<style>`; bỏ phép kiểm `//` của liên kết | jsoup 1.23.2 đã tự làm (thử trực tiếp: mã hóa `<`, bỏ `https:/...`); giữ phòng bản jsoup sau |
| Lưu lại ưu tiên HTML mới thay vì HTML đã lưu | HTML của một thư không đổi; khác nhau chỉ ở việc PostgreSQL có chép lại dữ liệu hay không |
| Phát sự kiện cả khi lần ghi không đổi gì | chỉ khác khi hai request lấy bù đúng cùng lúc |

- **Toàn bộ:** `./mvnw -B -ntp verify` → 1129 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS; `ModularityTests` xanh. Sau khi xuống dòng hai chỗ (chú thích, annotation): `MailHtmlTests` + `JdbcConversationStoreTests` 107/107.
- **Sau review** (agent `senior-reviewer`, không có lỗi nặng đã xác minh):
  - Vừa: thứ tự các `<style>` của `<head>` bị đảo, `media` bị bỏ: đã sửa, có test. Thiếu ca mXSS qua `<svg>`/`<math>` + `<style>`: đã thêm ba ca; thử trực tiếp thì jsoup 1.23.2 không lọt; vẫn thêm lớp gia cố (mục 20.3).
  - Nhỏ, đã sửa: `DEFAULT` của `body_format` bị bỏ sau khi đánh dấu dòng cũ; Javadoc nói quá (CSP, "thư bị bỏ qua", `TEXT`); lấy bù xong phát `ConversationChanged`; dò ảnh từ xa bắt cả `image-set(...)`; HTML không bị chép lại mỗi lần thư đổi trạng thái đọc; Gmail không lấy HTML của thư chuyển tiếp đính kèm; `https:/api/...` không được coi là địa chỉ web.
  - Câu hỏi cuối "vì sao gộp connector không đọc lại được với thư không có HTML": thư `UNCHECKED` chỉ có từ trước F06 và đều là Gmail, mà Gmail có cài hàm này; ghi lý do ở design F06.


## 21. Tệp đính kèm và ảnh nhúng: đi qua Sino, không lưu (BE-56, F06)

**Ở đâu:** `db/migration/V16__conversation_add_attachment_content_id.sql` (mới), `provider/spi/{NormalizedAttachment,AttachmentContent (mới),MessageContent,MessageProvider}.java`, `provider/infrastructure/gmail/{GmailMessageNormalizer,GmailApi,GmailProvider}.java`, `conversation/application/{MessageFiles,MessageFile}.java` (mới), `conversation/application/MessageBodies.java`, `conversation/infrastructure/JdbcConversationStore.java`, `conversation/api/ConversationMessagesController.java`.

### 21.1 Hai loại phần của một thư
| | Tệp | Ảnh nhúng |
|---|---|---|
| Là gì | phần có tên mà Gmail giữ riêng (`attachmentId`), và mọi ảnh nhúng không hiện được | ảnh PNG, JPEG, GIF hay WebP có `Content-ID` mà HTML hiện bằng `<img src="cid:...">` (logo trong chữ ký) |
| Trong danh sách tệp của thư | có | không |
| Làm cuộc trò chuyện "có tệp" | có | không |
| Cách hiện | tải xuống | trong khung thư, qua `?inline=true` |

Cả hai nằm chung bảng `attachment` (Sino chỉ lưu thông tin, không lưu nội dung). Một cột `content_id` phân biệt chúng: có giá trị là ảnh nhúng. Design ban đầu có thêm cờ `inline`, nhưng cờ đó luôn suy được từ `content_id`; hai cột chỉ thêm cơ hội lệch nhau. Kiểu thư `MIXED` giờ chỉ khi có **tệp** thật: một thư chỉ có logo trong chữ ký vẫn là thư chữ.

Một ảnh có `Content-ID` chưa chắc là ảnh nhúng. Thư chỉ có chữ gửi kèm ảnh chụp từ điện thoại, hay một bản vẽ SVG, cũng có `Content-ID`. Nếu Sino coi chúng là ảnh nhúng thì chúng không hiện trong thư (HTML không gọi tới, hoặc trình duyệt không được phép hiện) mà cũng không có trong danh sách tệp: người dùng mất chúng. Review của BE-56 bắt được điều này. Quy tắc bây giờ: ảnh nhúng chỉ khi **cả ba** đúng: có `Content-ID` khác rỗng, là một trong bốn kiểu ảnh, và HTML của thư có `<img src="cid:...">` tới nó. Còn lại là tệp, kể cả khi không có tên (web hiện "Tệp không tên"). Thêm hai trường hợp cùng một ý "không gì bị mất":
- Hai phần cùng một `Content-ID` (ví dụ một phần nằm trong thư chuyển tiếp đính kèm): một id chỉ trỏ được tới một ảnh, nên phần đầu là ảnh nhúng, phần sau là tệp.
- Thư có HTML dài hơn 1 000 000 ký tự thì Sino không lưu HTML (mục 20), thư hiện bằng chữ. Không HTML nào hiện ảnh của nó, nên lúc lưu, `JdbcConversationStore` đổi ảnh nhúng của thư đó thành tệp.

Để biết HTML có gọi tới ảnh không, connector Gmail đọc HTML bằng jsoup, đúng như bộ làm sạch sẽ đọc (mục 20.3): chỉ `<img src>`, `cid:` viết hoa hay thường đều được, so cả id như viết lẫn id đã giải mã các mã `%` (như `%40` thành `@`). Việc đọc này chỉ chạy khi thư có ảnh có `Content-ID`, nên thư thường không tốn thêm gì. Bốn kiểu ảnh nằm một chỗ, `NormalizedAttachment.PICTURE_TYPES` trong contract, dùng chung cho connector (ảnh nào là ảnh nhúng) và cho endpoint (ảnh nào được hiện `inline`): hai nơi không thể lệch nhau.

### 21.2 Không lưu nội dung tệp: đọc từ Gmail mỗi lần tải
```text
Trình duyệt --GET .../attachments/{id}--> Sino --messages.get---------> Gmail: tìm phần theo partId
                                               --attachments.get-----> Gmail: chỉ khi Gmail giữ phần đó riêng
            <--bytes + header an toàn-------
```

Sino nhận diện một phần bằng `partId` chứ không bằng `attachmentId` của Gmail, vì Gmail đổi `attachmentId` sau mỗi lần đọc thư (BE-39, mục 10). Nên tải một tệp là hai lời gọi: đọc thư để biết `attachmentId` lúc này, rồi lấy nội dung. Phần nhỏ (Gmail để sẵn `data` trong thư) chỉ cần một lời gọi.

Lời gọi Gmail nằm ngoài transaction, như ở mục 20.5. Gmail lỗi hay không còn tệp: `502 ATTACHMENT_UNAVAILABLE`.

**Bộ nhớ.** Gmail trả cả tệp một lần, base64 trong JSON. Lúc đọc một tệp 25 MB, backend giữ chuỗi base64 (khoảng 33 MB), JSON quanh nó và bytes đã giải mã (25 MB) cùng lúc: gấp mấy lần cỡ tệp. Vài lần tải lớn cùng lúc là đủ làm backend hết bộ nhớ, và khi đó mọi người dùng cùng hỏng. Review của BE-56 xếp điều này HIGH, nên có hai giới hạn, đều xét **trước** khi hỏi Gmail:

| Giới hạn | Vượt thì |
|---|---|
| Tệp lớn hơn 25 MB (theo kích thước đã lưu) | `422 ATTACHMENT_TOO_LARGE`; web mời mở thư ở Gmail |
| Tổng các tệp tải xuống đang đọc từ Gmail cùng lúc tối đa 50 MB, tức hai tệp lớn nhất | `503 ATTACHMENT_BUSY` ngay; thử lại sau |
| Ảnh hiện trong thư (`inline`) có phần riêng 25 MB | như trên; nhờ phần riêng, hai tệp lớn đang tải không làm vỡ ảnh của thư đang mở |

Giới hạn thứ hai dùng `java.util.concurrent.Semaphore`, một bộ đếm "giấy phép" an toàn khi nhiều luồng cùng gọi:

```java
private final Semaphore carrying = new Semaphore((int) (2 * LARGEST_FILE_BYTES));

int bytes = (int) (file.sizeBytes() == null ? LARGEST_FILE_BYTES : Math.max(1, file.sizeBytes()));
if (!carrying.tryAcquire(bytes)) {      // còn đủ thì lấy, không thì trả false ngay
    throw ConversationErrorCode.attachmentBusy();
}
try {
    content = access.call(...);         // hỏi Gmail
} finally {
    carrying.release(bytes);            // trả lại, kể cả khi Gmail lỗi
}
```

- Mỗi **byte** là một giấy phép, không phải mỗi request: hai tệp 25 MB lấy hết, còn hàng trăm logo vài KB vẫn lọt cùng lúc. Đếm theo request thì một thư có mười logo sẽ phải xếp hàng sau một tệp phim.
- Tệp không rõ kích thước tính như tệp lớn nhất: không biết thì giả định trường hợp xấu.
- `tryAcquire` không chờ. Một request chờ thì giữ một luồng của Tomcat trong lúc chờ; trả `503` ngay rõ ràng hơn cho web.
- `release` nằm trong `finally`: thiếu nó, mỗi lần Gmail lỗi "rò" mất một ít giấy phép, tới lúc không ai tải được gì nữa.
- Giấy phép trả lại ngay khi Gmail trả lời. Từ lúc đó trong bộ nhớ chỉ còn một bản nội dung tệp, đang được ghi ra cho trình duyệt; giới hạn không phủ phần này (review lần hai bắt Javadoc nói quá điều đó). Đọc theo luồng (stream) từ Gmail thẳng ra trình duyệt, không giữ cả tệp, để F12.

**Hạn chờ Gmail.** Mọi lời gọi Gmail có hạn 10 s (mục 10). Đọc mã của Spring 7.0.9 (`JdkClientHttpRequest.TimeoutHandler`, xem bằng `javap`) thì thấy hạn đó là hạn **tổng**, tính từ lúc gửi tới lúc đọc xong thân response: hết giờ là Spring đóng luồng đang đọc. Một tệp 25 MB là khoảng 33 MB base64; trong 10 s cần mạng nhanh hơn khoảng 3,3 MB/s, chậm hơn thì luôn hỏng. Nên `GmailApi` có hai `RestClient` dùng chung một `HttpClient`: một với hạn 10 s cho mọi lời gọi, một với hạn 60 s chỉ cho `attachments.get`. Test dùng WireMock trả thân response nhỏ giọt trong 3 s, quá hạn 2 s của các lời gọi khác trong test.

### 21.3 Header làm một tệp thành vô hại
Một tệp đính kèm là thứ người lạ gửi tới. Nếu Sino trả một tệp `.html` (hay `.svg`) với kiểu đó và trình duyệt hiện nó, script trong tệp chạy trên origin của Sino, với cookie đăng nhập của bạn. Ba header chặn việc đó:

| Header | Chặn điều gì |
|---|---|
| `Content-Disposition: attachment; filename*=UTF-8''...` | trình duyệt tải xuống chứ không hiện; tên tiếng Việt mã hóa theo RFC 6266, dấu nháy hay xuống dòng trong tên không phá được header |
| `X-Content-Type-Options: nosniff` | trình duyệt không tự đoán kiểu khác với kiểu Sino nói |
| `Content-Security-Policy: sandbox; default-src 'none'` | dù ai đó mở nó như một trang, trang đó không có origin, không chạy script, không tải gì |

`?inline=true` (hiện trong khung thư) chỉ dành cho ảnh PNG, JPEG, GIF, WebP. SVG cũng là ảnh nhưng có thể chứa script, nên không bao giờ được `inline`: `422 ATTACHMENT_NOT_INLINE`, và Gmail không bị hỏi.

Kiểu của response: kiểu đã lưu; không có thì kiểu Gmail cho; kiểu không cụ thể như `image/*` hay `*/*` thì `application/octet-stream`, vì một kiểu như thế bắt trình duyệt phải đoán.

**Bộ nhớ đệm của trình duyệt.** Mặc định Spring Security gắn `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` vào mọi response: không trang nào có dữ liệu riêng bị giữ lại. Với tệp tải xuống thì đúng như vậy. Nhưng ảnh trong thư thì mỗi lần mở thư trình duyệt lại hỏi Sino, Sino lại hỏi Gmail hai lần. Ảnh của một thư không bao giờ đổi, nên ảnh `inline` có `Cache-Control: max-age=86400, private`: trình duyệt giữ một ngày, `private` để không proxy nào ở giữa giữ. Spring Security chỉ gắn header mặc định khi response chưa có `Cache-Control`, nên controller đặt được; test kiểm cả hai phía (ảnh có `max-age`, tệp tải xuống có `no-store`).

### 21.4 Đổi `cid:` thành đường dẫn của Sino
Lúc làm sạch HTML (mục 20.3), `src="cid:logo@shop"` được tra trong các ảnh nhúng đã lưu của **chính thư đó**:
- Tra đúng `Content-ID` như viết trước, vì một id có thể chứa dấu `%` của chính nó (`a%41b`); rồi giải mã các mã `%` (như `%40` thành `@`), vì RFC 2392 cho phép địa chỉ `cid:` mã hóa ký tự như một URL (`logo%40shop`); cuối cùng không phân biệt hoa thường.
- Thấy thì đổi thành đường dẫn **tương đối** `/api/conversations/{id}/messages/{id}/attachments/{id}?inline=true`: cùng origin với web, đúng chỗ CSP của khung thư cho phép tải ảnh.
- Không thấy thì bỏ ảnh.

Thư cũ (`UNCHECKED`) có ảnh nhúng sau lần lấy bù: `fetchMessageContent` trả thêm các tệp và ảnh nhúng như lúc nhập bây giờ (`MessageContent.attachments`), và Sino thêm chúng bên cạnh các tệp đã lưu từ trước. Ban đầu nó chỉ trả ảnh nhúng; review lần hai chỉ ra rằng ảnh mà quy tắc mới coi là tệp (ảnh chụp trong thư chỉ có chữ) chưa từng được nhập với thư cũ, nên lấy bù phải mang cả tệp. Thư nhập giữa BE-55 và BE-56 thì đã là `HTML`, không được lấy bù: ảnh nhúng của chúng chưa có dòng nào và `cid:` bị bỏ, cho tới khi thư được nhập lại. Chỉ ảnh hưởng dữ liệu trên máy dev.

### 21.5 Kiểm chứng (BE-56)
- **Đỏ trước:** 133 test trên code tạm: 15 sai, 5 lỗi. Sau review, 7 test mới đỏ trên bản trước review (giới hạn 25 MB, tải cùng lúc, `Cache-Control`, `cid:` có `%` của chính nó, kiểu do provider cho, ảnh mà HTML không gọi tới, SVG/TIFF nhúng). Sau review lần hai, 4 test đỏ: ảnh của thư có HTML quá dài (lúc nhập và lúc lấy bù), ảnh trong thư lúc hai tệp lớn đang tải, và Gmail giả trả thân response nhỏ giọt trong 3 s bị cắt ở hạn 2 s ("The connection to Google broke off while reading its answer"), đúng điều mục 21.2 nói về hạn tổng.
- **Xanh:** 405 test các lớp liên quan lúc đầu; 244 sau hai vòng sửa.
- **Kiểm tra ngược:** ba lượt.

| Lượt | Lỗi gài | Bị bắt | Sống sót và xử lý |
|---|---|---|---|
| Trước review (dừng khi có review) | 13 | 10 | coi mọi phần nhúng là ảnh: đổi quy tắc và thêm test; bỏ qua khi `content_id` của một phần đổi: thêm test (lượt sau bắt được); lấy `data` trước `attachmentId`: tương đương, Gmail không bao giờ cho cả hai |
| Sau review | 47 | 44 | bỏ điều kiện đúng thư, bỏ điều kiện đúng cuộc trò chuyện: thiếu test, đã thêm (lượt sau bắt được); bỏ `nosniff` ở controller: tương đương, Spring Security cũng gắn header đó |
| Sau review lần hai | 14 | 14 | không |

Lỗi gài "bỏ điều kiện đúng cuộc trò chuyện" đáng nhớ nhất: `requireInInbox` chỉ kiểm cuộc trò chuyện trong đường dẫn có thuộc hộp thư của bạn không. Nếu câu SQL tìm tệp không ràng buộc thư vào **chính** cuộc trò chuyện đó, ai có một cuộc trò chuyện hợp lệ cũng mở được tệp của thư bất kỳ. Test cũ không bắt được vì nó dùng một id cuộc trò chuyện ngẫu nhiên, nên đã dừng ở bước kiểm hộp thư; test mới dùng cuộc trò chuyện hợp lệ ghép với thư nằm chỗ khác.

`nosniff` vẫn đặt ở controller dù Spring Security đã gắn: endpoint này không nên an toàn chỉ nhờ cấu hình chung. Test kiểm header đó chỉ có **một** giá trị, để hai nơi cùng gắn không thành hai dòng.

- **Toàn bộ:** `./mvnw -B -ntp verify` → 1184 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS.
- **Review** (agent `senior-reviewer`, hai lượt):
  - Lượt một: HIGH bộ nhớ khi tải (mục 21.2); MEDIUM ảnh nhúng không hiện được thì mất (mục 21.1) và ảnh bị tải lại mỗi lần mở thư (mục 21.3); nhỏ: thứ tự tra `cid:`, kiểu do provider cho, kiểu không cụ thể, Javadoc.
  - Lượt hai: không có lỗi nặng; MEDIUM ảnh của thư có HTML quá dài bị mất, Javadoc hứa giới hạn bộ nhớ rộng hơn code làm; nhỏ: `Content-ID` trùng, thư cũ lấy bù thiếu tệp mới, ảnh trong thư bị chặn khi tải tệp lớn, hạn chờ Gmail. Đã sửa hết; còn ghi lại: độ dài thật của tệp không rõ kích thước không được kiểm sau khi đọc (Gmail luôn cho kích thước; connector của F09 phải xét lại).
- **Chưa làm:** chạy với Gmail thật (BE-57): tải tệp thật, ảnh chữ ký thật, `partId` có đứng yên giữa các lần đọc không.

## 22. Chạy thật F06 với Gmail (BE-57)

**Ở đâu:** test `src/test/java/dev/sino/conversation/RealGmailMessagesTests.java` (mới), `src/test/java/dev/sino/provider/infrastructure/gmail/RealGmailTests.java` (thêm phép đếm `partId`), `apps/sino-api/README.md` (mục *Read conversations of a real mailbox*).

### 22.1 Test làm gì
Hai test, cùng tag `real-gmail` như mục 18, chạy tay bằng `./mvnw test -Preal-gmail`, không bao giờ chạy trong CI (lý do ở mục 18.2). Mỗi test đồng bộ account trước, như nút "Đồng bộ ngay", rồi chờ lượt đồng bộ xong, để thư vừa gửi tới cũng có mặt.

```text
readsEveryConversationAndOpensOlderMail
  1. mọi cuộc trò chuyện: GET .../messages, 20 thư một trang, lật tới hết
       -> mỗi thư xuất hiện một lần; số thư qua API = số dòng trong database
  2. 10 thư cũ nhất còn UNCHECKED: GET .../body hai lần
       -> lần 1 hỏi lại Gmail rồi lưu (HTML hoặc chữ, người nhận, tệp); lần 2 lấy từ database
  3. tối đa 30 thư đã có HTML: GET .../body
       -> HTML đã làm sạch không còn script, thuộc tính on...=, liên kết javascript:

downloadsFilesAndShowsEmbeddedPictures
  tối đa 5 tệp và 5 ảnh nhúng: GET .../attachments/{id}
       -> 200, header an toàn (mục 21.3), đúng số byte Gmail báo lúc nhập
       -> tệp quá 25 MB bị từ chối 422 trước khi hỏi Gmail
```

Chốt chặn cổng 8080 giữ nguyên như mục 18.3: lượt đồng bộ ghi vào `sync_checkpoint`, nên chỉ một backend được đọc account lúc đó.

### 22.2 Vì sao chỉ mở 10 thư cũ
Mở một thư `UNCHECKED` không chỉ là đọc: nó đổi dữ liệu. Sino hỏi lại Gmail rồi lưu kết quả, nên thư đó thành `HTML` hoặc `TEXT` vĩnh viễn (D-122, mục 20). Nếu test mở hết 43 thư cũ, sẽ không còn thư `UNCHECKED` nào cho lượt kiểm trên web thật (FE-60) thử đúng đường "mở thư cũ lần đầu". Nên test chỉ mở 10 thư cũ nhất, và README ghi rõ một lượt chạy đổi tối đa 10 thư.

Hai lần mở cùng một thư kiểm tra hai điều. Lần 2 phải trả **cùng định dạng** với lần 1, tức kết quả đã được lưu. Lần 2 phải **nhanh hơn nhiều**, tức không hỏi lại Gmail.

### 22.3 Kết quả đo (2026-10-12)
Account 53 thư (90 ngày), mỗi cuộc trò chuyện một thư:

| Phép đo | Kết quả |
|---|---|
| Đồng bộ trước test | 2 giây, 0 thư mới, không lỗi |
| Cuộc trò chuyện / thư qua API | 53 / 53, bằng database |
| Trang chậm nhất | 142 ms |
| Thư chưa biết người nhận (lưu trước BE-54) | 43 |
| 10 thư cũ mở lần đầu | cả 10 thành `HTML`; trung vị 637 ms, chậm nhất 1,4 giây |
| Mở lại lần hai | trung vị 35 ms, chậm nhất 49 ms |
| Người nhận sau khi lấy bù | biết đủ cả 10 |
| Thư cũ còn để web mở | 33 |
| Thư có HTML được mở và kiểm | 20, không thư nào còn thứ chạy được; cả 20 có ảnh từ web (chỉ hiện khi người dùng bấm "Hiện ảnh") |
| Tệp và ảnh nhúng | 0: hộp thư chưa có thư nào kèm tệp, test tải tệp bị bỏ qua |

- **Trung vị** (median) chứ không phải trung bình: một lần Gmail chậm 1,4 giây kéo trung bình lên, còn trung vị cho biết lần mở "bình thường" mất bao lâu. In thêm số chậm nhất để thấy trường hợp xấu.
- Lần mở đầu khoảng 0,6 giây khớp với số đo ở BE-46 (mỗi `messages.get` khoảng 0,6 giây từ máy này): web cần khung chờ khi mở thư cũ, đúng như FE-57 đã làm.
- Cả 20 thư HTML đều có ảnh từ web vì hộp thư toàn bản tin. Đó là lý do mặc định chặn ảnh từ xa (D-121): mở một bản tin là báo cho người gửi biết bạn đã đọc, kèm địa chỉ IP.

### 22.4 Kiểm chứng (BE-57)
- `RealGmailMessagesTests`: 2 test, 1 xanh, 1 bỏ qua (chưa có thư kèm tệp). BUILD SUCCESS.
- `RealGmailTests`: 3/3 xanh; 23 thư trong 7 ngày, không thư nào kèm tệp, nên phép đếm "`partId` đứng yên" mới là 0.
- **Chưa kiểm (bạn chọn commit trước):** tải tệp thật, ảnh chữ ký thật, `partId` có đứng yên không. Cần một thư có tệp và ảnh dán trong nội dung gửi tới account, rồi chạy lại `./mvnw test -Preal-gmail`.
- Toàn bộ: `./mvnw -B -ntp verify` → 1184 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS (4 phút 26 giây). Hai test mới có tag `real-gmail` nên không chạy ở đây; `verify` chỉ chứng minh chúng biên dịch được và không làm hỏng gì.
- Mọi lệnh Maven chạy trong git worktree riêng như mục 18.6.

## 23. Đếm đúng số thư cho một khoảng ngày (BE-61, F05)

**Ở đâu:** `provider/infrastructure/gmail/GmailApi.java` (`count`), `provider/infrastructure/gmail/GmailProvider.java` (`estimateMessages`), test `GmailEstimateTests`, `RealGmailTests`.

### 23.1 Vấn đề
Bước "Đồng bộ" của wizard kết nối hỏi "30 ngày hay 90 ngày, khoảng bao nhiêu thư". Trước đây connector hỏi Gmail một danh sách 1 thư và lấy `resultSizeEstimate`, con số Gmail **ước lượng** cho cả truy vấn. BE-46 đo trên hộp thư thật (mục 18.5): Gmail trả 201 cho cả 30 ngày (thật 29) lẫn 90 ngày (thật 53). Bạn chốt phương án B: đếm thật.

### 23.2 Cách đếm
```text
messages.list?q=after:<giây>&maxResults=500&fields=messages/id,nextPageToken
   trang 1: 500 ID + nextPageToken  -> đếm 500
   trang 2: 120 ID, không token     -> đếm 620, dừng
```

```java
long count(String accessToken, Instant since, long atMost) {
    long counted = 0;
    String pageToken = null;
    do {
        MessageList page = list(accessToken, since, pageToken, ID_PAGE_SIZE, ONLY_IDS);
        counted += page.ids().size();
        pageToken = page.nextPageToken();
    } while (pageToken != null && counted < atMost);
    return Math.min(counted, atMost);
}
```

- **`do ... while`** chứ không phải `while`: trang đầu luôn phải hỏi, điều kiện chỉ xét từ trang thứ hai.
- **`maxResults=500`** là mức tối đa của `messages.list`. Lúc nhập thư dùng 50 một trang vì mỗi ID còn phải đọc cả thư; ở đây chỉ đếm.
- **`fields=messages/id,nextPageToken`** là *partial response* của Google API: Gmail chỉ gửi đúng hai trường đó, bỏ `threadId` và `resultSizeEstimate`, nên trang 500 ID nhẹ đi khoảng một nửa. Thiếu `nextPageToken` trong `fields` thì Gmail không gửi token và vòng lặp dừng sau trang đầu; test kiểm đúng chuỗi `fields`.
- **Trần 5 000** (`GmailProvider.COUNTED_AT_MOST`): tối đa 10 lời gọi (mỗi lời gọi tốn 5 đơn vị hạn mức của Gmail) trước khi màn hình có số. Không có trần thì hộp thư 50 000 thư trong 90 ngày bắt bạn chờ 100 lời gọi.
- **`Math.min`**: Gmail có thể trả ít hơn 500 một trang. Với 400 một trang, trang 13 đưa số đếm lên 5 200; vẫn trả 5 000 để mọi kết quả chạm trần giống nhau.
- `resultSizeEstimate` không còn ai dùng nên đã bỏ khỏi record `MessageList`: một trường không ai đọc chỉ làm người sau tưởng nó còn ý nghĩa.

### 23.3 Lỗi giữa chừng: ném lỗi, không trả số dở
Trang 1 xong, trang 2 Gmail trả `503`. Connector có thể trả 500 (số đã đếm), nhưng 500 là con số **sai** mà trông như đúng, và người dùng sẽ chọn khoảng ngày dựa trên nó. Nên connector ném `ProviderException` như mọi lỗi Gmail khác. Bên gọi đã có sẵn cách xử lý: `InitialSyncService` đổi lỗi thành "không có ước lượng" (API trả `null`, web không hiện số), còn `ImportRunner` nhập tiếp mà không có mẫu số. Không biết thì nói không biết, đừng đoán.

### 23.4 Giới hạn còn lại
API chỉ trả một con số. Với số 5 000, web không biết đó là "đúng 5 000" hay "chạm trần", nên ghi "khoảng 5 000 thư". Muốn ghi "hơn 5 000" phải thêm một cờ vào contract `estimateMessages` và vào API. Đổi contract cho một trường hợp hiếm thì để khi có người cần (ghi ở D-65).

### 23.5 Kiểm chứng (BE-61)
- **Đỏ trước:** 6 trong 15 test của `GmailEstimateTests` sai trên code cũ: một trang, nhiều trang, chạm trần với 500 và với 400 thư một trang, lỗi ở trang 2, khoảng không có thư (Gmail vẫn "ước lượng" 201).
- **Xanh:** `GmailEstimateTests` 15/15; `GmailSyncTests` 54, 4 bỏ qua như trước (đổi `list` dùng chung với việc nhập).
- **Kiểm tra ngược:** 9 lỗi gài, cả 9 bị bắt: bỏ `fields`, trang 50, trần `<=`, bỏ `Math.min`, không gửi `pageToken`, gán thay vì cộng dồn, `fields` thiếu `nextPageToken`, đảo nhánh `since`, trần gấp mười. Lỗi gài "gán thay vì cộng dồn" bị test nhiều trang bắt (120 thay vì 620), nhưng ở test trần nó làm vòng lặp không bao giờ dừng (số đếm đứng ở 500, Gmail giả luôn còn trang sau). Vì vậy script chạy test với `-Dsurefire.timeout=120`, để một lỗi gài treo máy cũng kết thúc và được tính là bị bắt.
- **Gmail thật** (`RealGmailTests`): 30 ngày đếm 29, liệt kê 29; 90 ngày đếm 53, liệt kê 53 (trước đây cả hai báo 201); toàn bộ hộp thư 212 và 212. Gmail nhận tham số `fields`. Test giờ **đỏ** khi số đếm lệch số liệt kê, không chỉ in ra.
- **Toàn bộ:** `./mvnw -B -ntp verify` → 1189 test (thêm 5), 0 lỗi, 4 bỏ qua, BUILD SUCCESS.

---

## 24. Một chuỗi ở nhiều tài khoản là một nhóm (BE-80, F05b)

**Ở đâu:** `db/migration/V19__conversation_add_thread_group.sql`, `conversation/infrastructure/{ThreadGroups,GroupingAtStartup,JdbcConversationStore}.java`, `provider/spi/NormalizedMessage.java` (`RFC_MESSAGE_ID`).

### 24.1 Vì sao một chuỗi hiện hai dòng
Bạn kết nối `tienct07` và `bonzed2001`, rồi gửi thư qua lại giữa hai địa chỉ. Mỗi thư nằm trong **cả hai** hộp thư, và Gmail cho mỗi hộp thư một mã thread riêng. Sino lưu cuộc trò chuyện theo từng tài khoản (F05), nên một chuỗi thành hai cuộc trò chuyện. Hộp thư vì thế hiện hai dòng.

Nhưng hai bản của cùng một thư có chung một thứ: header `Message-ID` (RFC 5322), giống hệt nhau ở mọi hộp thư nhận hay gửi thư đó. Sino đã lưu nó từ trước, ở `message.metadata.rfcMessageId`. Đó là chìa khóa để nhận ra hai bản là một (D-180).

### 24.2 Nhóm, và cột do PostgreSQL tự tính
Hai cuộc trò chuyện thuộc một **nhóm** khi cùng chủ, cùng nhà cung cấp, khác tài khoản, và có ít nhất một thư chung `Message-ID`. Nhóm có tính bắc cầu: A chung thư với B, B chung thư với C, thì A, B, C là một nhóm.

```text
  conversation
    id            (UUIDv7)
    grouped_with  NULL khi là nhóm một bản; bản cũ nhất của nhóm khi đã gộp
    thread_group_id = COALESCE(grouped_with, id)   <- PostgreSQL tự tính (GENERATED ... STORED)
```

Design ban đầu định dùng một cột `thread_group_id NOT NULL` và ghi bằng `id` khi tạo dòng. Nhưng giá trị mặc định của một cột trong PostgreSQL không được lấy từ cột khác, nên mọi câu `INSERT` (cả những câu test chèn bằng SQL) sẽ phải biết về nhóm, hoặc phải có trigger. Cột tự tính giải quyết gọn: không câu `INSERT` nào phải đổi, mà `thread_group_id` vẫn không bao giờ rỗng để các truy vấn của Hộp thư (BE-81) đọc. Cột là `STORED` vì PostgreSQL 18 không index được cột tự tính `VIRTUAL`.

### 24.3 Gom khi lưu: union-find
Sau mỗi trang thư, `ThreadGroups.group` tìm bản sao của các thư vừa lưu ở các tài khoản khác của chủ, bằng index trên `metadata ->> 'rfcMessageId'`. Mỗi cặp tìm được là một "cạnh" nối hai nhóm. Nhiều cạnh có thể nối nhiều nhóm thành chuỗi, nên các nhóm được gộp bằng **union-find**: mỗi nhóm trỏ tới một nhóm khác, đi theo con trỏ tới gốc, hai nhóm cùng gốc là một. Rồi mọi cuộc trò chuyện của các nhóm đó lấy `grouped_with` là cuộc trò chuyện cũ nhất (`created_at`, rồi `id`).

Chỉ cần xét thư **của trang vừa lưu**: một bản sao lưu sau sẽ được gộp khi chính bản đó được lưu. Thư Sino gửi chưa có `Message-ID` cho tới lượt đồng bộ sau; lượt đó cập nhật dòng thư, thư nằm trong trang, và được gộp lúc ấy.

Dữ liệu có trước V19 được gom khi Sino khởi động (`GroupingAtStartup` → `groupAll`), cùng một đoạn code, mỗi tài khoản một transaction ngắn. Lỗi ở bước này chỉ ghi log: nhóm chỉ quyết Hộp thư hiện thế nào, Sino vẫn chạy được không có chúng.

### 24.4 Thứ tự khóa: lỗi deadlock review tìm ra
Hai lượt đồng bộ của hai tài khoản chạy song song có thể cùng lưu hai bản của một thư. Nếu mỗi bên tìm bản của bên kia trước khi bên kia commit, cả hai đều không thấy gì và nhóm không bao giờ được gộp. Vì vậy mọi thay đổi nhóm của một chủ phải lần lượt, dưới một khóa của chủ (`pg_advisory_xact_lock`).

Bản đầu lấy khóa chủ ở **cuối** `store`, sau khi đã ghi (và khóa) các dòng `conversation` của trang. Review chỉ ra vòng chờ:

```text
  Tx A (tienct07): khóa tài khoản A -> khóa dòng t-1 -> chờ khóa chủ ...
  Tx B (bonzed):   khóa tài khoản B -> ... -> giữ khóa chủ -> UPDATE dòng t-1 -> chờ A
  => A chờ B, B chờ A: PostgreSQL hủy một bên (deadlock), lượt import đó thành FAILED
```

Sửa: mọi đường lấy khóa theo **cùng một thứ tự**: khóa tài khoản → khóa chủ → mới ghi dòng. `store` gọi `groups.lock(accountId)` ngay sau khóa tài khoản. Chủ chỉ có một tài khoản của nhà cung cấp đó thì không có gì để gộp, và không lấy khóa.

Test cho thứ tự khóa không cần dựng lại deadlock (khó canh giờ). Nó giữ khóa của chủ ở một transaction khác, cho `store` chạy, rồi hỏi bằng `SELECT ... FOR UPDATE NOWAIT` xem dòng của cuộc trò chuyện có đang bị khóa không. Bản cũ khóa dòng rồi mới chờ, nên `NOWAIT` báo lỗi; bản mới chờ trước, nên dòng còn trống.

### 24.5 Bắc cầu qua cùng một tài khoản (bạn chốt)
Spec vừa bắt nhóm bắc cầu, vừa cấm gộp hai thread của cùng một tài khoản. Hai câu này va nhau khi Gmail của `tienct07` tách một chuỗi thành hai thread (thư M1 ở `t-1`, M2 ở `t-2`), còn `bonzed2001` giữ cả hai thư trong một thread. Bạn chọn "Gộp cả ba thành một dòng": một chuỗi là một dòng dù mỗi hộp thư tách khác nhau. Hai thread của một tài khoản vẫn không tự gộp chỉ vì chung thư với nhau.

### 24.6 Kiểm chứng (BE-80)
- **Đỏ trước:** trên một `ThreadGroups` chưa làm gì, 6 trên 10 test gom đỏ; 4 test "không gộp" xanh ngay vì khung không gom gì. 74 test cũ của store vẫn xanh với V19: cột tự tính không làm hỏng câu `INSERT` nào.
- **Review** (agent `senior-reviewer`): HIGH deadlock (mục 24.4); MEDIUM mỗi tài khoản một transaction khi gom lúc khởi động, spec mâu thuẫn (mục 24.5), thiếu test; LOW gom theo thư của trang, hằng `RFC_MESSAGE_ID`, Javadoc nói quá.
- **Chỗ lệch TDD:** test cho các phần sửa theo review được viết sau code sửa. Bằng chứng chúng bắt được lỗi là kiểm tra ngược: đặt lại khóa chủ ở cuối như bản cũ, bỏ `created_at`, chỉ gom thư mới, hay loại tài khoản `DISABLED`, mỗi lỗi đều làm test đỏ.
- **Kiểm tra ngược:** đợt đầu 11 lỗi gài, 10 bị bắt; lỗi còn lại tương đương (điều kiện `IS NOT NULL` chỉ để PostgreSQL dùng được index một phần, vì `NULL = NULL` trong SQL không bao giờ đúng). Đợt hai 14 lỗi gài trên code cuối, 13 bị bắt; lỗi sống sót chỉ ra test lưu tài khoản `DISABLED` sau tài khoản kia, nên không đòi tài khoản `DISABLED` có trong danh sách; đảo thứ tự, chạy lại thì bị bắt.
- **Dữ liệu thật (chỉ đọc):** 17 cặp cuộc trò chuyện giữa `tienct07` và `bonzed2001` có chung `Message-ID`, mỗi cặp một-một, cùng tiêu đề. V19 chưa vào database của bạn: nó vào khi backend chạy code mới, và lúc khởi động Sino sẽ gom 17 cặp đó.
- **Toàn bộ:** `./mvnw -B -ntp verify` trên `dev` mới nhất: 1452 test, 0 sai, 0 lỗi, 4 bỏ qua.

---

## 25. Hộp thư theo nhóm: một dòng, bản chính, mã nhóm (BE-81, F05b)

**Ở đâu:** `conversation/application/{InboxService,InboxItem,Replies,ReplyService}.java`, `conversation/api/ConversationResponse.java`, `conversation/InboxIds.java` (mới), `realtime/application/RealtimeEvents.java`; test `MergedThreadsApiTests` (mới), `RealtimeApiTests`.

### 25.1 Từ "một dòng một cuộc trò chuyện" sang "một dòng một nhóm"
BE-80 mới đánh dấu các bản của một chuỗi là một nhóm (`thread_group_id`). Hộp thư vẫn đọc từng dòng `conversation`, nên chuỗi "xin chào" của bạn vẫn hiện hai lần. BE-81 đổi cách đọc: mỗi **nhóm** là một dòng.

```text
  conversation (bảng)                       Hộp thư (API)
  t-1  tienct07   group G  17:41:02  ----\
                                          >--  một item: id = G, accountIds = [tienct07, bonzed2001]
  b-1  bonzed2001 group G  17:41:00  ----/
```

Mỗi trường của dòng lấy từ đâu (D-182):

| Trường | Lấy từ | Vì sao |
|---|---|---|
| `lastMessageAt` | lớn nhất của các bản | thư mới nhất của cả chuỗi |
| `unreadCount` | lớn nhất của các bản | cộng lại thì một thư bị đếm hai lần |
| `needsReply` | đúng khi **mọi** bản cần trả lời | bản kia mà bạn viết cuối thì bạn đã trả lời rồi |
| `hasAttachments` | đúng khi **một** bản có tệp | |
| `archived` | đúng khi **mọi** bản đã lưu trữ | một bản quay lại Hộp thư thì cả chuỗi quay lại |
| `title`, `subject`, `snippet`, `accountId` | bản chính | xem 25.3 |

### 25.2 SQL: `GROUP BY` rồi lọc, và vì sao điều kiện cũ vẫn dùng được
Câu thứ nhất gom các cuộc trò chuyện trong phạm vi (tài khoản chưa xóa, không tắt) theo `thread_group_id`, tính các trường ở bảng trên bằng hàm gộp (`max`, `bool_and`, `bool_or`), và đặt tên kết quả **giống hệt tên cột** của bảng `conversation`:

```sql
SELECT array_agg(c.id ORDER BY c.created_at, c.id) AS copies,
       (array_agg(c.id ORDER BY c.created_at, c.id))[1] AS id,      -- mã nhóm (D-183)
       max(c.last_message_at) AS last_message_at,
       max(c.unread_count) AS unread_count,
       bool_and(c.needs_reply) AS needs_reply,
       bool_or(c.has_attachments) AS has_attachments,
       bool_and(c.archived) AS archived
FROM conversation c WHERE c.account_id IN (:accounts)
GROUP BY c.thread_group_id
```

Nhờ đặt tên như vậy, điều kiện của từng chế độ xem (`InboxView`, ví dụ `NOT c.archived AND c.unread_count > 0`) áp thẳng lên nhóm mà không phải viết lại. Phân trang keyset vẫn như cũ, chỉ là trên `(giờ của nhóm, mã nhóm)`.

**Đánh đổi:** trước đây mỗi trang dùng index `(account_id, last_message_at, id)` để chỉ đọc đầu danh sách của từng tài khoản (mục 15.4). Giờ giờ của một nhóm là giờ của bản mới nhất, nên không index nào của một bản cho đúng thứ tự: mỗi trang phải gom **mọi** cuộc trò chuyện của bạn. Với một người dùng và vài nghìn cuộc trò chuyện thì nhanh; BE-83 đo trên dữ liệu thật. Nếu sau này chậm, cách sửa là lưu sẵn tóm tắt theo nhóm.

Câu thứ hai chỉ đọc các bản của những nhóm **trong trang**: các trường cần để chọn bản chính, và thư mới nhất của mỗi bản (`Message-ID`, đến hay đi). Danh sách bản của nhóm lấy từ câu thứ nhất (`copies`), không tìm lại theo `thread_group_id`. Lý do: giữa hai câu, một lượt đồng bộ có thể vừa gộp nhóm; tìm lại theo nhóm có thể ra rỗng. Đọc PostgreSQL `uuid[]` qua JDBC: `row.getArray("copies").getArray()` cho ra `UUID[]`.

### 25.3 Bản chính (D-181): vì sao phải so `Message-ID`, không chỉ so giờ
Bản chính là bản giữ thư mới nhất. Nghe như chỉ cần lấy bản có `last_message_at` lớn nhất. Nhưng Gmail ghi giờ của một thư là lúc thư **vào hộp thư đó** (`internalDate`): thư "hello" của `bonzed2001` lúc 17:41:00 (đi), sang hộp thư của `tienct07` là 17:41:02 (đến). Hai bản của cùng một thư có thể lệch vài giây, theo chiều nào cũng được.

Nên cách chọn (bằng Java, trong `primaryOf`) là:

```text
  1. bản có giờ mới nhất -> thư mới nhất của nó có Message-ID là M
  2. "giữ thư mới nhất" = bản cùng giờ đó, hoặc bản có thư mới nhất cũng là M
  3. trong những bản ấy: bản mà thư đó là thư ĐẾN; vẫn ngang thì bản cũ nhất
```

Thư đến được ưu tiên vì trả lời từ địa chỉ vừa nhận thư là điều người gửi chờ (D-181). Test `theCopyItCameInWinsEvenWhenTheOtherMailboxDatesItLater` dựng đúng trường hợp hộp thư "đi" ghi giờ muộn hơn hộp thư "đến".

Chọn bằng Java chứ không bằng SQL (window function) vì quy tắc ba bước này đọc thẳng được, và chỉ chạy cho vài chục nhóm của một trang.

### 25.4 Mã nhóm và mã của bản bất kỳ (D-183)
Mã của nhóm là mã của bản **cũ nhất còn trong phạm vi**, tính khi đọc. Nó không phải `thread_group_id` trong bảng: nếu bản cũ nhất thuộc một tài khoản đã tắt, mã nhóm thành bản cũ kế tiếp (test `aCopyInAnAccountOutOfTheInboxIsLeftOut`).

`GET` và `PATCH /api/conversations/{id}` nhận mã của **bất kỳ** bản nào: câu SQL tìm `thread_group_id` của bản đó (chỉ khi bản đó trong phạm vi), rồi gom cả nhóm. Item trả về luôn mang mã nhóm; web thấy mã khác thì thay đường dẫn (FE-81).

`InboxItem` giờ mang cả ba loại mã: `id` (nhóm), `primaryId` (bản chính) và `copies` (mọi bản, kèm tài khoản). Các chỗ khác chọn đúng loại mình cần: trả lời dùng `primaryId`, tải tệp dùng tài khoản của bản ghi trong đường dẫn (`accountOf`; từ BE-82 là tài khoản của bản giữ thư, mục 26.4).

### 25.5 `PATCH` một nhóm: khóa mọi tài khoản theo một thứ tự
Đánh dấu đã đọc hay lưu trữ phải đổi **mọi** bản (D-185), mà mỗi bản thuộc một tài khoản có khóa riêng (mục 13.2b). `change` lấy khóa của từng tài khoản trong nhóm, **sắp theo mã** (`sorted()`):

```text
  PATCH 1: khóa A -> khóa B          PATCH 2: khóa A (chờ PATCH 1) ...
  Không có cảnh: PATCH 1 giữ A chờ B, PATCH 2 giữ B chờ A
```

Cùng một thứ tự thì không bao giờ có vòng chờ giữa hai `PATCH`. Với lượt đồng bộ cũng không: lượt đồng bộ chỉ giữ một khóa tài khoản, rồi khóa của chủ (mục 24.4), không bao giờ chờ khóa tài khoản thứ hai.

"Chưa đọc lại" (`read: false`) chỉ đánh dấu thư mới nhất của **bản chính**, để số chưa đọc của dòng là 1 chứ không phải 2.

### 25.6 Người tham gia gộp: `array_agg ... FILTER`
Mỗi địa chỉ xuất hiện một lần, mọi tài khoản của bạn là `self`:

```sql
SELECT external_participant_id,
       (array_agg(display_name ORDER BY id) FILTER (WHERE display_name IS NOT NULL))[1],
       bool_or(is_self)
FROM conversation_participant WHERE conversation_id IN (:copies)
GROUP BY external_participant_id
ORDER BY (array_agg(id ORDER BY id))[1]
```

`FILTER (WHERE ...)` cho hàm gộp chỉ nhận các dòng thỏa điều kiện: tên đầu tiên **có giá trị**, không phải dòng đầu tiên (có thể rỗng). `bool_or(is_self)`: trong hộp thư của `tienct07`, `bonzed2001` là người lạ; trong hộp thư của chính nó thì là `self`; gộp lại thì là `self`. Thứ tự "lưu trước hiện trước" dùng mã UUIDv7 nhỏ nhất của mỗi địa chỉ.

### 25.7 Sự kiện realtime mang mã nhóm (D-189): interface ở ranh giới module
Web chỉ biết mã nhóm. Sự kiện `conversations.changed` đến từ ba nơi: lượt đồng bộ (module `sync`, mang mã bản vừa lưu), lượt nhập, và thay đổi của bạn. Thay vì sửa cả ba, module `realtime` đổi mã ở **một** chỗ, qua interface mới `InboxIds` của module `conversation`:

```text
  sync ----MailStored(mã bản)-----\
  conversation --ConversationChanged-> RealtimeEvents --InboxIds.of(chủ, mã)--> mã nhóm --> trình duyệt
```

`InboxIds` nằm ở gói gốc của module `conversation` (như `ConversationStats`), còn cài đặt nằm trong `InboxService`, nơi đã có quy tắc D-183. Module `realtime` không đọc bảng của `conversation` (Spring Modulith kiểm điều này trong `ModularityTests`).

Việc đổi mã chạy **ngay khi sự kiện được phát**, trong transaction của bên phát. Vì vậy nó thấy cả lần gộp vừa xảy ra trong lượt lưu đó, kể cả khi transaction chưa commit.

### 25.8 Trả lời từ bản chính, và gửi lại (D-186, D-131)
Trả lời đi từ tài khoản của bản chính, trong thread của bản chính, và thư được lưu vào bản đó. Phần này vốn của BE-82, nhưng phải làm cùng BE-81: từ BE-81, mã trong đường dẫn là mã nhóm (bản cũ nhất), còn tài khoản của item là tài khoản bản chính. Không đổi cùng lúc thì một chuỗi gộp có thể gửi từ tài khoản này vào thread của tài khoản kia.

Có một bẫy với "không bao giờ gửi hai lần" (D-131): thư gửi lỗi ở bản của `tienct07`, rồi `bonzed2001` có thư mới nên thành bản chính. Web gửi lại cùng `clientMessageId`. Nếu chỉ tìm `clientMessageId` trong bản chính, Sino không thấy thư cũ và tạo thư thứ hai. Vì vậy `begin` tìm trong **mọi** bản; thấy thì đi tiếp từ đúng bản đó (tài khoản, thread của nó). Trước khi tìm, nó khóa mọi tài khoản của nhóm theo cùng thứ tự như `PATCH`.

Lúc tự review mình thấy thêm một lỗ: thư "chưa rõ đã gửi chưa" nằm ở bản của `tienct07`, rồi bạn tắt `tienct07`. Bản đó ra khỏi nhóm (D-66), nên tìm trong "mọi bản của Hộp thư" vẫn không thấy, và Sino gửi lần nữa từ `bonzed2001`. Test viết trước cho đúng cảnh này đỏ (`201`, thư thứ hai). Sửa: tìm theo `thread_group_id` trong **mọi** cuộc trò chuyện của nhóm, kể cả của tài khoản đã ra khỏi Hộp thư; thấy ở đó thì từ chối (`409 REPLY_NOT_ALLOWED`, `ACCOUNT_UNAVAILABLE`), vì gửi từ tài khoản khác có thể thành hai thư.

### 25.9 Nhóm không tách (D-188)
A chung thư với B, B chung thư với C, rồi bạn xóa tài khoản B. Bản của B ra khỏi dòng, còn A và C vẫn là một dòng. Chúng vẫn là một chuỗi; tách ra thì phải gom lại cả nhóm mỗi khi một tài khoản đổi trạng thái, và đường dẫn đang mở có thể đổi mã.

### 25.10 Kiểm chứng (BE-81)
- **Đỏ trước:** 19 test mới của `MergedThreadsApiTests` và một test của `RealtimeApiTests`, viết trước code, đều đỏ đúng lý do: hai dòng thay vì một, thiếu `accountIds`, mã của bản thay vì mã nhóm. Test cho lỗ gửi hai lần (25.8) cũng viết trước, đỏ với `201`.
- **Chỗ lệch TDD:** test "gửi lại ở đúng bản" viết sau code. Bằng chứng nó bắt được lỗi: gài "luôn dùng bản chính" và "chỉ tìm ở bản chính", cả hai làm nó đỏ.
- **Kiểm tra ngược:** 19 lỗi gài trên code cuối (đổi `bool_and` thành `bool_or` và ngược lại, cộng thay vì lấy lớn nhất, bỏ ưu tiên thư đến, bỏ so `Message-ID`, sai thứ tự `accountIds`, đọc hay lưu trữ một bản, `self` sai, mã sự kiện không đổi, mở được bản ngoài phạm vi, mã nhóm là bản mới nhất, trả lời theo bản chính khi gửi lại, bỏ lời từ chối, trả lời từ mã nhóm, một `accountIds`): cả 19 bị bắt. Không gài thứ tự khóa (`sorted()`): bỏ nó không làm test nào đỏ, vì vòng chờ chỉ xảy ra khi hai request chen nhau đúng lúc.
- **Toàn bộ:** `./mvnw -B -ntp verify`: 1517 test, 0 sai, 0 lỗi, 4 bỏ qua.
- **Chưa kiểm:** tốc độ trên dữ liệu thật của bạn (BE-83 đo bằng `EXPLAIN ANALYZE`).

## 26. Thư của một nhóm: mỗi thư một lần, đọc đúng hộp thư (BE-82, F05b)

**Ở đâu:** `conversation/application/{MessageHistory,MessageBodies,MessageFiles,ReplyService,InboxService}.java`, `conversation/infrastructure/ConversationSummaries.java` (`lockAll`); test `MergedThreadsApiTests` (9 test mới), `FakeMessageProvider.lastReadAccount()`.

### 26.1 Ba thư, không phải sáu
Sau BE-81, chuỗi "xin chào" là một dòng, nhưng mở ra thì `GET /api/conversations/{id}/messages` vẫn chỉ đọc thư của **một** bản (bản trong đường dẫn). Mỗi hộp thư lại giữ một bản của cả ba thư. Đọc thư của mọi bản mà không bỏ trùng thì ra sáu thư: mỗi thư hai lần, một "đi", một "đến". D-184 giữ mỗi `Message-ID` một lần:

```text
  bản tienct07 (t-1)             bản bonzed2001 (b-1)            mở nhóm
  Helllo    đến  10:35:02        Helllo    đi   10:35:00   -->   Helllo    (từ b-1: thư đi)
  xin chào  đi   10:37:00        xin chào  đến  10:37:02   -->   xin chào  (từ t-1: thư đi, có clientMessageId)
  hello     đến  10:41:02        hello     đi   10:41:00   -->   hello     (từ b-1: thư đi)
```

Một thư có ở nhiều bản thì lấy theo thứ tự: bản mà nó là thư **đi** (bản đó giữ `clientMessageId` và trạng thái gửi của Sino), rồi bản chính, rồi bản cũ nhất. Thư chưa có `Message-ID` (ví dụ trả lời vừa gửi từ Sino, chưa đồng bộ về) hay có header `Message-ID` để trống thì luôn hiện: không có gì nói hai thư như vậy là một.

### 26.2 `DISTINCT ON`: giữ dòng đầu của mỗi khóa
PostgreSQL có `SELECT DISTINCT ON (biểu thức)`: trong các dòng cùng giá trị biểu thức, chỉ giữ dòng **đầu tiên** theo `ORDER BY`. `ORDER BY` phải bắt đầu bằng đúng biểu thức đó; phần sau của `ORDER BY` quyết dòng nào là "đầu tiên":

```sql
WITH shown AS (
    SELECT DISTINCT ON (COALESCE('rfc:' || NULLIF(m.metadata ->> 'rfcMessageId', ''), 'id:' || m.id))
           m.id, m.sent_at
    FROM unnest(ARRAY[:copies]::uuid[]) WITH ORDINALITY AS copy(id, rank)
    JOIN message m ON m.conversation_id = copy.id
    ORDER BY COALESCE('rfc:' || NULLIF(m.metadata ->> 'rfcMessageId', ''), 'id:' || m.id),
             m.direction = 'OUTBOUND' DESC, copy.rank, m.id
)
```

Từng mảnh:

| Mảnh | Làm gì |
|---|---|
| `'rfc:'` nối với `Message-ID` | khóa của thư có `Message-ID`; nối với `NULL` cho ra `NULL` |
| `NULLIF(..., '')` | header `Message-ID:` để trống được lưu thành chuỗi rỗng; coi nó như không có, nếu không mọi thư như vậy chung khóa `rfc:` và chỉ còn một (review tìm ra) |
| `COALESCE(...)` với `'id:'` nối với `m.id` | thư không có `Message-ID` lấy khóa riêng là mã của nó, nên không bao giờ trùng thư khác; hai tiền tố giữ cho một `Message-ID` không bao giờ bằng mã của một thư |
| `unnest(...) WITH ORDINALITY` | biến danh sách Java `[bản chính, bản cũ nhất, ...]` thành các dòng có số thứ tự `rank`: thứ tự ưu tiên tính ở Java đi thẳng vào SQL |
| `m.direction = 'OUTBOUND' DESC` | `boolean` sắp `false` trước `true`; `DESC` đưa thư đi lên đầu |
| `m.id` ở cuối | mọi thứ khác ngang nhau thì kết quả vẫn luôn như nhau; thiếu nó, `DISTINCT ON` được phép lấy dòng nào cũng được |

Khóa được viết thẳng vào câu SQL (`formatted` với hằng `NormalizedMessage.RFC_MESSAGE_ID`), không truyền bằng tham số. Lý do: hai chỗ `:key` là hai tham số, tức hai biểu thức khác nhau với PostgreSQL, và nó báo lỗi "SELECT DISTINCT ON expressions must match initial ORDER BY expressions". Viết hằng vào SQL không mở đường cho SQL injection vì giá trị là hằng của code, không đến từ người dùng.

### 26.3 Bỏ trùng trước, cắt trang sau
Thứ tự hai việc này quyết đúng sai. Gmail ghi giờ của một thư theo lúc nó vào **từng** hộp thư, nên hai bản của "hello" lệch hai giây. Nếu cắt trang trên thư của cả hai bản rồi mới bỏ trùng, cursor `(sent_at, id)` của một trang có thể rơi vào giữa hai bản, và trang sau mang bản kia về: người dùng thấy "hello" hai lần, ở hai trang. Test `pagesThroughTheMessagesOfAGroupEachOnce` đọc từng trang một thư để bắt đúng cảnh này.

```text
  shown: mọi thư của mọi bản, mỗi thư một dòng, chỉ (id, sent_at)
     -> WHERE (sent_at, id) < cursor  ORDER BY sent_at DESC, id DESC  LIMIT 21
     -> đọc đủ cột (chữ, người gửi, người nhận) cho đúng 21 thư đó
```

**Đánh đổi:** F06 đọc mỗi trang bằng index `(conversation_id, sent_at)`, chỉ chạm 21 dòng. Giờ mỗi trang đọc mã, giờ, `Message-ID`, chiều của **mọi** thư trong nhóm rồi sắp. Vì vậy `shown` chỉ giữ cột hẹp; bản nháp đầu mang cả `text_content` qua phép sắp, với chuỗi email dài là vài MB mỗi trang, có thể tràn ra đĩa (`work_mem` mặc định 4 MB). Chuỗi email vài chục thư thì không đáng kể. Một cuộc chat rất dài (Zalo, Telegram: luôn một bản) cũng bị đọc cả cuộc mỗi trang; BE-83 đo, chậm thì cho nhóm một bản đi đường cũ (ghi ở Risks của design).

### 26.4 Nội dung, tệp, xóa: tìm ở mọi bản, gọi bằng tài khoản của bản giữ thư
Đường dẫn mang mã nhóm (bản cũ nhất của `tienct07`), còn thư có thể thuộc bản của `bonzed2001`. Trước BE-82, `MessageBodies`, `MessageFiles` và `ReplyService.discard` chỉ tìm thư trong bản của đường dẫn, nên trả `404 MESSAGE_NOT_FOUND`. Giờ cả ba tìm trong mọi bản của nhóm (`conversation_id IN (:copies)`) và trả về luôn bản giữ thư (`Stored.copy`).

Điểm dễ sai là tài khoản dùng để gọi Gmail. Mã thư của Gmail chỉ có nghĩa trong **một** hộp thư: hỏi hộp thư của `tienct07` về mã thư của hộp thư `bonzed2001` thì Gmail trả 404, và bạn thấy "không đọc được nội dung". Nên đọc lại thư cũ (`UNCHECKED`) và tải tệp dùng `accountOf(bản giữ thư)`, không dùng `accountOf(bản trong đường dẫn)`. Test không có Gmail thật để trả 404, nên connector giả ghi lại tài khoản của lần đọc cuối (`lastReadAccount()`); test so nó với tài khoản `bonzed2001`.

Xóa thư gửi lỗi cũng vậy: thư nằm ở bản đã ghi nó (bản chính lúc gửi). Sino xóa ở đó, tính lại tóm tắt **của bản đó**, và phát `ConversationChanged` cho bản đó; module `realtime` đổi nó sang mã nhóm (D-189).

### 26.5 `lockAll`: một chỗ cho thứ tự khóa
BE-81 viết `copies().stream().map(Copy::accountId).distinct().sorted().forEach(summaries::lock)` ở hai nơi (`PATCH` và trả lời). Xóa thư gửi lỗi là nơi thứ ba. Thay vì chép lần ba, quy tắc "khóa mọi tài khoản theo một thứ tự" (mục 25.5) chuyển vào `ConversationSummaries.lockAll(accountIds)`, và cả ba nơi gọi nó. Quy tắc chống deadlock nằm ở một chỗ thì không có nơi nào quên `sorted()`.

### 26.6 Còn mở: bản chính đổi giữa hai trang
Review chỉ ra một chỗ mà quy tắc D-184 tự nó gây ra. Thư Alice gửi tới cả hai tài khoản là thư **đến** ở cả hai bản, nên bản được chọn là bản chính. Bản chính lại đổi mỗi khi bản kia có thư mới (D-181), và hai bản ghi giờ của thư đó lệch nhau vài giây:

```text
  trang 1 dừng ở cursor 10:00:02
  thư M: bản A 10:00:00, bản B 10:00:05
  bản chính A: trang 2 lấy M của A (10:00:00 < cursor) -> có M
  bản chính đổi sang B trước khi tải trang 2: lấy M của B (10:00:05 > cursor) -> mất M
```

Ngược lại thì M hiện hai lần, và mã của M cũng đổi giữa hai lần tải. Chỉ xảy ra khi có thư mới đến đúng lúc bạn đang cuộn lên đọc chuỗi, và tải lại thì đúng. Cách bỏ hẳn: chọn "thư đi, rồi bản cũ nhất", không xét bản chính, vì bản cũ nhất chỉ đổi khi một tài khoản ra khỏi Hộp thư. D-184 là quyết định bạn đã duyệt, nên việc này để bạn chốt.

### 26.7 Kiểm chứng (BE-82)
- **Nhận lại từ bản nháp:** phiên sino-api-84 dừng giữa task (2026-10-14), để lại code và test chưa chạy, chưa commit. Bản nháp áp được lên `dev` mà không lệch. Phiên này soát lại, rồi đổi phép sắp sang cột hẹp, thêm `m.id` vào thứ tự, và thêm test cho tài khoản dùng để gọi Gmail.
- **Đỏ trước:** 7 test mới, chạy trên code của `dev`, đỏ đúng lý do: `404 MESSAGE_NOT_FOUND` / `ATTACHMENT_NOT_FOUND` vì thư nằm ở bản kia, danh sách chỉ có thư của một bản. 21 test cũ vẫn xanh. Sau review thêm test `Message-ID` trống, đỏ đúng lý do (hai thư còn một), rồi sửa bằng `NULLIF`.
- **Kiểm tra ngược:** 7 lỗi gài, cả 7 làm test đỏ: bỏ ưu tiên thư đi, xếp bản chính cuối, xếp bản mới trước bản cũ (test ba bản, test này xanh ngay khi viết vì hành vi đã có), cắt trang trước khi bỏ trùng, đọc lại thư bằng tài khoản của bản trong đường dẫn, tải tệp bằng tài khoản đó, xóa thư nhưng báo bản trong đường dẫn.
- **Review (`senior-reviewer`):** không có lỗi CRITICAL hay HIGH. `Message-ID` trống: đã sửa. Thiếu test bậc "bản cũ nhất": đã thêm. Bản chính đổi giữa hai trang (mục 26.6): để bạn chốt. Ngoài BE-82, đã ghi vào `tasks.md`: `ThreadGroups` (BE-80) có thể gộp nhầm hai chuỗi có `Message-ID` trống; thư lấy từ bản của tài khoản `AUTH_EXPIRED` thì không đọc lại được.
- **Toàn bộ:** `./mvnw -B -ntp verify`: 1529 test, 0 sai, 0 lỗi, 4 bỏ qua.
- **Chưa kiểm:** dữ liệu thật của bạn, và `EXPLAIN ANALYZE` của câu đọc thư (BE-83).

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
75. Vì sao phân trang keyset phải sắp theo cả `id`? Điều gì xảy ra với 5 conversation cùng giờ nếu chỉ sắp theo giờ?
76. Vì sao `OFFSET` không hợp với một Hộp thư đang nhận thư mới?
77. Câu `account_id IN (...) ORDER BY ... LIMIT 31` chậm 122 ms trong trường hợp nào, và vì sao lấy top-N theo từng account lại nhanh?
78. `limit=0`, `cursor=abc`, `accountId=xyz`: mỗi lỗi ra mã gì, và phần nào của Spring tạo ra nó?
79. Vì sao conversation của owner khác trả `404` chứ không phải `403`?
80. "Đánh dấu chưa đọc" trong Sino rồi Gmail gửi lại thư đó (vẫn đã đọc trên Gmail): thư hiện thế nào, vì sao?
81. Vì sao lần đo đầu (6 account) không thấy trường hợp chậm mà lần đo với 2 account lại thấy? `LATERAL` làm planner ước lượng thế nào?
82. Cursor và thư ghi ở hai transaction riêng thì trường hợp tắt máy nào làm mất thư vĩnh viễn?
83. Vì sao gọi Gmail bên trong transaction làm một `PATCH` của cùng account phải chờ?
84. Hai lần bấm "Bắt đầu" cùng lúc: điều gì trong câu SQL bảo đảm chỉ một lượt chạy?
85. Tắt máy chủ giữa lúc nhập: dòng `sync_checkpoint` ở trạng thái nào, và ai cho nó chạy tiếp?
86. Vì sao virtual thread hợp với việc nhập thư hơn một luồng hệ điều hành cho mỗi account?
87. Nhập tiếp và nhập lại khác nhau ở những cột nào? Vì sao nhập lại không tạo thư trùng?
88. Vì sao số phút còn lại tính theo tốc độ của lượt này chứ không theo tổng số đã nhập?
89. Vì sao chặn account đã tắt ở `ProviderAccess` chứ không chỉ ở API nhập thư?
90. "Đếm số yêu cầu" khác "nhớ account nào đang chạy" ở điểm nào, và trường hợp nào thì cách thứ hai làm mất một lần bấm "Bắt đầu"?
91. Vì sao một lỗi `CHECK` của PostgreSQL có thể đưa nội dung thư vào log, và `logServerErrorDetail=false` chặn nó thế nào?
92. Vì sao `externalAccountId` của Gmail là `sub` chứ không là email, và vì sao vẫn cần thêm `address`?
93. Thêm một thành phần vào `record` thì các chỗ đang gọi constructor ra sao? Vì sao task này không thêm constructor phụ 3 đối số?
94. Vì sao tên quá dài từ provider bị cắt ngắn, còn địa chỉ thì không?
95. Vì sao migration V11 không chép `display_name` sang `address` cho account cũ, dù với account của bạn hai giá trị đang giống nhau?
96. Client gửi `PATCH` có `"address"`: phần nào của Spring làm trường đó bị bỏ qua, và test nào sẽ đỏ nếu sau này ai đó cho sửa nó?
97. Vì sao test nhập thật chạy trên database local được, mà không bao giờ chạy trong CI?
98. Test tắt lịch đồng bộ và `ImportResumer` của JVM mình mà vẫn chưa đủ khi backend trong IntelliJ đang chạy: chiều nào còn hở, và vì sao khóa "mỗi account một người đọc" không giúp được?
99. `when(store).store(...)` đòi một transaction: proxy và spy nằm thế nào với nhau, và vì sao lấy spy bên trong thì hết lỗi?
100. Ước lượng 201 cho 29 thư: số nào của Gmail sai, số nào đúng, và vì sao sửa nó là một quyết định chứ không phải một bản vá?
101. `to: null` và `to: []` khác nhau thế nào, và vì sao API không được gộp hai trường hợp?
102. Lưu lại một thư mà connector không cho biết người nhận: `coalesce` làm gì, và vì sao nó phải có ở cả `SET` lẫn `WHERE`?
103. Người nhận để trong `metadata` hay một cột riêng: mỗi cách tốn gì, và vì sao task này đổi sang cột riêng trước khi commit?
104. Cursor của Hộp thư và của danh sách thư cùng dạng `<thời điểm>|<id>`: không có "loại" thì chuyện gì xảy ra, và vì sao Hộp thư giữ nguyên định dạng cũ?
105. Vì sao giữ HTML gốc và làm sạch mỗi lần trả, thay vì làm sạch một lần lúc lưu?
106. Vì sao bộ lọc dùng danh sách cho phép chứ không phải danh sách cấm?
107. `<a href="&#106;avascript:alert(1)">` không chứa chữ "javascript": vì sao bộ lọc vẫn bắt được?
108. Bộ lọc giữ nguyên CSS: rủi ro còn lại là gì, và lớp nào chặn nó?
109. Hai request cùng mở một thư `UNCHECKED`: Sino gọi Gmail mấy lần, ghi mấy lần, và vì sao kết quả vẫn đúng?
110. Vì sao lỗi lấy bù là `502` chứ không phải `503` hay `500`?
111. Vì sao ảnh nhúng không phải là "tệp" của thư, và Sino phân biệt hai loại bằng gì?
112. Tải một tệp thì Sino gọi Gmail mấy lần? Vì sao không gọi thẳng `attachments.get` bằng một id đã lưu?
113. Một tệp `.html` đính kèm: ba header nào giữ cho nó không chạy trên origin của Sino, mỗi header chặn điều gì?
114. Vì sao ảnh SVG không bao giờ được hiện `inline`, dù nó là ảnh?
115. Một ảnh PNG có `Content-ID` trong một thư chỉ có chữ: Sino coi nó là ảnh nhúng hay tệp, và vì sao?
116. Khi giới hạn số tệp tải cùng lúc, vì sao Sino đếm theo byte chứ không theo số request, và vì sao `release` phải nằm trong `finally`?
117. Một chuỗi ở hai tài khoản có 1 thư chưa đọc ở mỗi bản: vì sao dòng ghi 1 chứ không phải 2, và vì sao "cần trả lời" phải đúng ở **mọi** bản?
118. Vì sao chọn bản chính chỉ bằng "giờ mới nhất" có thể sai với Gmail, và `Message-ID` giúp gì?
119. Vì sao `PATCH` một nhóm phải khóa các tài khoản theo một thứ tự cố định? Bỏ `sorted()` thì hai request có thể làm gì nhau?
120. Thư gửi lỗi ở bản A, rồi bản B thành bản chính: nếu chỉ tìm `clientMessageId` trong bản chính thì chuyện gì xảy ra khi web gửi lại?
121. Hai bản của một thư lệch nhau hai giây: vì sao phải bỏ trùng trước rồi mới cắt trang, và làm ngược lại thì người dùng thấy gì?
122. `DISTINCT ON` giữ dòng nào trong các dòng cùng khóa? Vì sao cuối `ORDER BY` có `m.id`, dù không test nào cần nó?
123. Vì sao thư không có `Message-ID` luôn hiện, dù hai thư như vậy có thể là một?
124. Mở thư của bản `bonzed2001` qua mã nhóm (bản `tienct07`): nếu gọi Gmail bằng tài khoản của bản trong đường dẫn thì chuyện gì xảy ra, và vì sao test phải nhờ connector giả ghi lại tài khoản mới bắt được?
