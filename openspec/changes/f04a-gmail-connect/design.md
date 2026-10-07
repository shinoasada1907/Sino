# Phase 2 · F04a — Kết nối Gmail (OAuth2) · Technical Design

> Mode: **HYBRID** — backend và frontend AUTO (agent làm từng task, kiểm chứng, báo lại rồi dừng); quyết định kiến trúc do người dùng chốt. Thiết kế được người dùng duyệt từng phần trong buổi brainstorm 2026-10-07 (phần 1 phạm vi và API, phần 2 OAuth và thành phần, phần 3 lỗi và bảo mật, phần 4 web, test, task).
> Convention chung ở `openspec/specs/` (`api-conventions`, `provider-contract`, `connected-accounts`, `account-credentials`) và design của F02/F03 đã archive.

## Context

- Hiện trạng (2026-10-07): Phase 0 đóng; Phase 1 change 1 (`fe-f01-web-foundation`) xong phần backend (đăng nhập bằng session, CSRF, D-22), phần web đang làm ở phiên khác.
- F02 có sẵn use case `AccountRegistrationService.register(RegisterAccountCommand)`: nhận owner, provider, `AccountProfile`, `ProviderCredentials` và `refreshToken` tùy chọn; kết nối lại theo `(owner, provider, externalAccountId)`, kể cả account đã xóa mềm. Credential lưu mã hóa trong `account_credential` (có cột cho refresh token, hạn token, scope).
- F02 design ghi rủi ro: `OAuth2AuthorizedClientService` của Spring lưu token theo `(clientRegistrationId, principalName)` nên một người dùng chỉ giữ được một tài khoản cho mỗi registration. Vì vậy Sino tự lưu credential và chỉ dùng các thành phần cấp thấp của Spring OAuth2 Client.
- F03 để lại cho F04: SPI kết nối/OAuth, D-15 (ai refresh token), công cụ giả lập HTTP. Connector thật đặt ở `provider/infrastructure/<provider>/` (02A).
- `spring-boot-starter-security-oauth2-client` đã có trong `pom.xml`.
- Chính sách Google (kiểm 2026-10-07):
  - App có consent screen kiểu External ở trạng thái **Testing** nhận refresh token **hết hạn sau 7 ngày** (trừ khi chỉ xin tên/email/hồ sơ) — https://developers.google.com/identity/protocols/oauth2.
  - Refresh token cũng chết khi người dùng đổi mật khẩu (với scope Gmail), 6 tháng không dùng, hoặc người dùng thu hồi quyền; tối đa 100 refresh token cho mỗi tài khoản Google trên mỗi OAuth client (cùng trang).
  - App dùng cá nhân (dưới 100 người dùng) được dùng không cần thẩm định, người dùng bấm qua màn "unverified app" — https://support.google.com/cloud/answer/13464323. Trang không nói rõ ngoại lệ có áp dụng cho scope *restricted* (Gmail) hay không: xem Risks.

## Goals / Non-Goals

**Goals:**
- Người dùng kết nối được nhiều Gmail cá nhân vào Sino, mỗi cái thành một connected account có credential mã hóa.
- Kết nối lại được account `AUTH_EXPIRED` mà không sinh account thừa.
- Không token, `code` hay client secret nào lọt ra log, URL, event hay response.
- App, test và CI chạy được khi chưa có Google project.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-15 — Ai refresh/rotate token · **Accepted: A'** (người dùng, 2026-10-07)
Module `account` giữ token và tự refresh: module khác (F04b, F07) xin access token còn hạn từ `account`; token sắp hết hạn thì `account` refresh bằng client refresh token của Spring (dùng chung `ClientRegistration` với luồng kết nối) **ngoài transaction**, lưu token mới **trong transaction**; `invalid_grant` → account `AUTH_EXPIRED`. SPI **không** có method `refresh`. Code làm ở **F04b**. Thay phương án A của F02 design ("provider thực hiện"): với D-38 (luồng Sino + Spring), refresh là việc chung của mọi provider OAuth2, connector không cần tự gọi token endpoint. Phương án bị loại: B (sync tự refresh — vi phạm ranh giới), C (`OAuth2AuthorizedClientManager` — một tài khoản mỗi registration).

### C5 — Đường dẫn endpoint kết nối · **Resolved** (người dùng, 2026-10-07)
Conflict giữa Notion 02 (`POST /api/accounts/connect/{provider}`) và 02A (`POST /api/accounts/{provider}/connect`), hai trang cùng tầng nên không có luật ưu tiên. Chọn **`/api/accounts/connect/{provider}`**. **LÝ DO:** dạng `/api/accounts/{x}/connect` dễ lẫn với `/api/accounts/{id}` (đoạn thứ ba khi là ID, khi là provider). Notion 02A cần cập nhật (người dùng).

### D-37 — Tách F04 làm hai change · **Accepted** (người dùng, 2026-10-07)
**F04a** (change này): lấy được quyền — kết nối, kết nối lại, thu hồi khi xóa, connector Gmail khung. **F04b**: dùng quyền — refresh token (D-15), `fetchUpdates` bằng Gmail API, chuẩn hóa thread/message/MIME, contract test đọc thư; làm ngay trước F05, nơi nó được dùng. **LÝ DO:** F04 là feature lớn nhất của roadmap; mỗi change nhỏ hơn có kết quả kiểm được riêng (F04a: Gmail thật hiện trên trang Accounts). Phương án bị loại: một change như roadmap (rất lớn; phần đọc thư chưa có chỗ hiển thị tới F05).

### D-38 — Luồng OAuth2 của Sino trên linh kiện cấp thấp của Spring · **Accepted: A** (người dùng, 2026-10-07)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Sino viết luồng, Spring lo phần giao thức** (chọn) | Spring lo token endpoint, PKCE, đọc lỗi OAuth; Sino tự lưu credential nên giữ được nhiều Gmail; đúng hướng đã ghi ở F02 design | Contract F03 thêm một method; phải làm quen vài class cấp thấp của Spring |
| B. Tự viết bằng `RestClient` trong connector | Học OAuth "trần" rõ nhất | Nhiều code; dễ sai bảo mật (PKCE, encode, lỗi token endpoint); mỗi provider OAuth lặp lại |
| C. Bộ lọc `oauth2Client()` đầy đủ của Spring | Ít code nhất | Lưu token theo `(registration, principal)`: một Gmail mỗi người dùng; phải bẻ framework |

### D-39 — Giả lập HTTP trong test bằng WireMock · **Accepted** (người dùng, 2026-10-07)
Test dependency `org.wiremock:wiremock-standalone` (bản đóng gói sẵn thư viện bên trong, không đụng Jetty/Jackson của Spring). **LÝ DO:** là HTTP server thật nên giả lập được mọi lời gọi tới Google, kể cả client mà Spring tự tạo bên trong; kiểm được request gửi đi (`code_verifier`, `prompt=consent`); thử được timeout thật; F04b dùng tiếp cho Gmail API. Phương án bị loại: `MockRestServiceServer` (không thêm dependency nhưng phải gắn vào từng `RestClient`, không thử được timeout).

### D-40 — Chế độ consent screen của Google · **Accepted** (người dùng, 2026-10-07)
Sino kết nối Gmail cá nhân của chính người dùng (một người dùng, D-33). Consent screen kiểu **External**; **Testing** khi phát triển (refresh token hết hạn sau 7 ngày, chấp nhận được khi dev), chuyển **In production không thẩm định** (ngoại lệ "personal use", dưới 100 người dùng, có màn "unverified app") khi dùng hằng ngày. Code không phụ thuộc chế độ: lúc nào cũng phải xử lý refresh token chết (`invalid_grant` → `AUTH_EXPIRED` → kết nối lại).

### D-41 — Làm backend F04a song song với web của Phase 1 · **Accepted** (người dùng, 2026-10-07)
BE-30…BE-34 làm ngay, trong khi phần web của Phase 1 đang làm; phần web của F04a (FE-30) làm sau khi Phase 1 có trang Accounts (change 2). **LÝ DO:** người dùng muốn backend tiếp tục trong lúc chờ web; backend của F04a kiểm chứng được với Google thật mà không cần web (redirect URI riêng cho backend, xem Testing). Lệch luật roadmap "từ F04 mỗi feature là vertical slice, không làm hết BE rồi mới làm FE" — F04a vẫn có FE và chỉ đóng khi FE xong.

## Backend design

### Luồng

```text
Web: bấm "Thêm Gmail"  (hoặc "Kết nối lại" -> gửi kèm accountId)
  -> POST /api/accounts/connect/gmail            (đã đăng nhập, CSRF)
     ConnectController: ConnectService.start(owner, gmail, accountId?)
       - tìm connector, lấy oauth2() -> không có: 422 CONNECT_NOT_SUPPORTED
       - dựng OAuth2AuthorizationRequest (state, PKCE S256, scope, tham số)
     controller lưu PendingConnect vào session theo state
     <- 200 { authorizationUrl }
Google: chọn tài khoản, đồng ý quyền
  -> GET /api/accounts/connect/gmail/callback?code&state   (hoặc ?error&state)
     controller lấy và XÓA PendingConnect theo state (dùng một lần)
     ConnectService.complete(pending, code)
       - đổi code lấy token (Spring, gửi code_verifier)
       - kiểm scope đã cấp, có refresh token
       - getAccountProfile -> externalAccountId = sub
       - kết nối lại: sub phải khớp account đích
       - register (F02): tạo mới hoặc kết nối lại
     <- 302 /accounts?connected={accountId}
        302 /accounts?connectError={CODE}   (mọi lỗi)
```

### API

| Method | Path | Quyền | Body / tham số | Thành công | Lỗi |
|---|---|---|---|---|---|
| POST | `/api/accounts/connect/{provider}` | đã đăng nhập, CSRF | `{"accountId": "<uuid>"}` tùy chọn (kết nối lại) | `200 {"authorizationUrl": "..."}` | `404 UNKNOWN_PROVIDER`, `422 CONNECT_NOT_SUPPORTED`, `404 ACCOUNT_NOT_FOUND` (không có, đã xóa, của người khác, hoặc khác provider), `400 VALIDATION_FAILED` |
| GET | `/api/accounts/connect/{provider}/callback` | công khai ở tầng security (người dùng xác định bằng `state` trong session) | `code`, `state` hoặc `error`, `state` | `302` `Location: /accounts?connected={accountId}` | `302` `Location: /accounts?connectError={CODE}` |

- Callback luôn trả `302`, không trả JSON: đây là một lần chuyển trang của trình duyệt. `Location` là đường dẫn tương đối, cố định (`/accounts`), không lấy từ tham số của request (không có open redirect). Trình duyệt hiểu nó theo origin của callback, tức `SINO_PUBLIC_BASE_URL`.
- Cookie session theo về khi Google chuyển trang: điều hướng GET cấp cao nhất nên `SameSite=Lax` vẫn gửi.

### `state`, PKCE và `PendingConnect`
- Mỗi lần bắt đầu tạo một `OAuth2AuthorizationRequest` (Spring): `state` 32 byte ngẫu nhiên (`SecureRandom`, base64url), PKCE S256 qua `OAuth2AuthorizationRequestCustomizers.withPkce()` (verifier nằm trong attributes của request).
- `PendingConnect` = request đó + provider + owner + `accountId` (kết nối lại) + thời điểm tạo. Lưu trong **session**, thành một map theo `state`: tối đa **5** mục (mở nhiều tab vẫn được; vượt thì bỏ mục cũ nhất), hết hạn sau **10 phút** (thời gian lấy từ bean `Clock`), **xóa ngay khi callback lấy ra** (dùng một lần, kể cả khi lỗi).
- Callback với `state` không có trong session, đã hết hạn, hoặc `{provider}` trên đường dẫn khác provider của mục đó → `CONNECT_STATE_INVALID`.
- Controller giữ phần session (HTTP); `ConnectService` không biết HTTP.

### Tham số gửi Google (từ `GmailProvider.oauth2()`)
- Scope: `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` — tối thiểu để đọc thư; quyền gửi (F10) xin thêm sau.
- `access_type=offline` (để có refresh token), `prompt=consent` (Google chỉ cấp refresh token ở lần đồng ý đầu, kết nối lại phải ép hiện lại màn đồng ý).
- `login_hint` = email của account đích, chỉ khi kết nối lại (luồng chung thêm vào, không phải connector).
- Kiểm **scope thật được cấp** trong token response: màn đồng ý của Google cho bỏ tick từng quyền; thiếu `gmail.readonly` → `CONNECT_SCOPE_DENIED`. Thiếu refresh token → `CONNECT_FAILED`.

### Định danh tài khoản
`externalAccountId` = `sub` của Google (lấy từ userinfo bằng access token vừa nhận). Google khuyên không dùng email làm định danh vì email có thể đổi; `sub` thì không. Tên hiển thị mặc định = email. Kết nối lại: `sub` khác `externalAccountId` của account đích → `CONNECT_WRONG_ACCOUNT` (không tự thêm account; muốn thêm thì dùng "Thêm Gmail").

### Thành phần

```text
account/api/ConnectController          2 endpoint; session, redirect
account/application/ConnectService     start / complete; không biết HTTP
account/application/ConnectErrorCode   mã redirect (bảng dưới)
account/infrastructure/oauth/          keo dán Spring: tìm ClientRegistration theo id,
                                       client đổi code lấy token, client thu hồi token,
                                       timeout HTTP
provider/spi/OAuth2Connection          record: registrationId, scopes,
                                       extraParameters, revocationUri (tùy chọn)
provider/spi/MessageProvider           + default Optional<OAuth2Connection> oauth2()
                                         (mặc định empty)
provider/infrastructure/gmail/         GmailProvider (type "gmail", tên "Gmail",
                                       capability {}, getAccountProfile qua userinfo),
                                       GmailProperties, GmailConfiguration
                                       (ClientRegistration "google" từ CommonOAuth2Provider.GOOGLE)
```

- `OAuth2Connection` chỉ chứa kiểu của Sino (luật "Contract không chứa kiểu riêng của provider").
- `account` dùng `ClientRegistration` (kiểu của Spring) mà connector cung cấp dưới dạng bean; `account` không import gì từ `provider.infrastructure`.
- Không định nghĩa bean `ClientRegistrationRepository` và không dùng `spring.security.oauth2.client.registration.*`, để Spring Boot không tự bật các thành phần OAuth2 client và không đòi client id ở mọi môi trường. **Đã kiểm ở BE-30** (`GmailWiringTests`): bật Gmail mà context không có `ClientRegistrationRepository`, `OAuth2AuthorizedClientService`, `OAuth2AuthorizedClientRepository`.
- Capability của Gmail ở F04a là `{}` (spec: chỉ khai báo cái thật sự làm được); `fetchUpdates` ném `CAPABILITY_NOT_SUPPORTED` tới F04b.
- Mọi lời gọi tới Google có timeout: kết nối 5 giây, đọc 10 giây.

### Thu hồi token
- **Khi xóa account:** đọc refresh token (giải mã) → xóa trong transaction (như F02) → **sau khi commit** POST tới `revocationUri`. Lỗi (mạng, Google `4xx`/`5xx`) chỉ ghi `WARN` (account id, provider, mã HTTP), xóa vẫn trả `204`. Provider không có `revocationUri` thì bỏ qua.
- **Ngay trong callback:** với `CONNECT_SCOPE_DENIED` và `CONNECT_WRONG_ACCOUNT`, token vừa nhận được thu hồi luôn (best-effort), để Google không giữ một quyền mà Sino không dùng.
- **Không** đưa token vào event `AccountRemoved`: Event Publication Registry của Modulith lưu event xuống bảng trong database.
- Google: thu hồi refresh token là thu hồi cả quyền đã cấp; địa chỉ `https://oauth2.googleapis.com/revoke`.

### Cấu hình

| Thuộc tính | Biến môi trường | Ghi chú |
|---|---|---|
| `sino.google.client-id` | `SINO_GOOGLE_CLIENT_ID` | |
| `sino.google.client-secret` | `SINO_GOOGLE_CLIENT_SECRET` | secret: che trong `toString`, không vào log; không kiểm bằng Bean Validation (bài học BE-12) |
| `sino.public-base-url` | `SINO_PUBLIC_BASE_URL` | redirect URI = giá trị này + `/api/accounts/connect/{provider}/callback`, do luồng connect của `account` dựng cho từng request (BE-31); dev: `http://localhost:5173` (qua proxy Vite, D-36) |
| `sino.google.authorization-uri`, `token-uri`, `user-info-uri`, `revocation-uri` | — | mặc định là địa chỉ của Google; profile test trỏ sang WireMock |

- Thiếu **cả** client id và secret → connector Gmail không được đăng ký: `/api/providers` không có Gmail, `POST /api/accounts/connect/gmail` → `404 UNKNOWN_PROVIDER`, lúc khởi động log `INFO` nói rõ lý do. Account Gmail đã có vẫn hiện, capability `[]` (đã có từ F03).
- Có một mà thiếu một → dừng khởi động, thông báo chỉ nêu tên biến (BE-30). Có connector OAuth2 mà thiếu `SINO_PUBLIC_BASE_URL` → dừng khởi động (BE-31).
- ~~Gmail tự dựng redirect URI từ `SINO_PUBLIC_BASE_URL`~~ → **làm khi BE-30:** `account` dựng redirect URI cho từng authorization request; `ClientRegistration` giữ mẫu mặc định của Spring (không dùng tới). **LÝ DO:** đường callback là của `account`; để Gmail tự dựng thì connector phải ghi cứng đường dẫn của module khác. Spring gửi redirect URI của chính authorization request khi đổi code, nên hai lần gửi luôn khớp.
- Redirect URI **không** suy ra từ request: header `Host` giả được, và Google đòi redirect URI khớp từng ký tự với URI đã đăng ký và URI dùng lúc đổi code.

### Error code catalog — bổ sung

| Code | Module | Ở đâu | Ý nghĩa | Thông báo trên web (gợi ý) |
|---|---|---|---|---|
| `CONNECT_NOT_SUPPORTED` | `account` | `422` Problem Details | provider không hỗ trợ kết nối OAuth2 | — |
| `CONNECT_CANCELLED` | `account` | redirect | người dùng bấm "Hủy" ở Google (`error=access_denied`) | Bạn đã hủy kết nối. |
| `CONNECT_STATE_INVALID` | `account` | redirect | `state` thiếu, lạ, hết hạn, đã dùng, mất session, hoặc sai provider | Phiên kết nối đã hết hạn. Hãy thử lại. |
| `CONNECT_SCOPE_DENIED` | `account` | redirect | không được cấp `gmail.readonly` | Sino cần quyền đọc Gmail. Hãy thử lại và cho phép đọc thư. |
| `CONNECT_WRONG_ACCOUNT` | `account` | redirect | kết nối lại nhưng chọn tài khoản Google khác | Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản, hoặc dùng "Thêm Gmail". |
| `CONNECT_FAILED` | `account` | redirect | Google trả lỗi khác, đổi code thất bại, thiếu refresh token, lấy hồ sơ lỗi | Không kết nối được với Google. Hãy thử lại sau. |

Log ghi lý do cụ thể của `CONNECT_FAILED` (loại lỗi, mã HTTP), không bao giờ ghi token, `code`, secret.

### Bảo mật
- `state` gắn với session và dùng một lần: chặn CSRF của luồng OAuth (kẻ xấu gài tài khoản Google của *họ* vào Sino của bạn).
- PKCE: lấy trộm được `code` cũng không đổi ra token được.
- Không open redirect; URL chỉ mang mã lỗi.
- Token, `code`, client secret không ở log, URL, event, response. Test kiểm log không chứa `code` và token (như BE-28 kiểm cookie).
- Callback là `GET` có tác dụng phụ (tạo account): chuẩn của OAuth, an toàn nhờ `state` + session + PKCE.
- Kiểm scope thật được cấp.
- **Phát hiện khi làm BE-30:** `ClientRegistration.toString()` của Spring Security 7.1.1 in **client secret ở dạng rõ** (đã kiểm bằng `javap`). Không bao giờ log `ClientRegistration` hay request đổi token chứa nó; test log của BE-32 tìm cả client secret.

## Frontend design (FE-30, sau Phase 1 change 2)

- Trang Accounts: nút **"Thêm Gmail"** chỉ hiện khi `/api/providers` có `gmail`; bấm → `POST /api/accounts/connect/gmail` → `window.location.assign(authorizationUrl)`.
- Account `AUTH_EXPIRED` có nút **"Kết nối lại"** (gửi `accountId`).
- Khi quay về: đọc `connected` / `connectError`, hiện thông báo theo bảng trên, xóa tham số khỏi URL (`history.replaceState`) để tải lại không hiện lại, làm mới danh sách account.
- Test: Testing Library + MSW (bấm nút gọi đúng API và chuyển trang; mỗi mã lỗi một thông báo; tham số bị xóa).

## Testing

- **Unit:** `ConnectService` với connector giả và client token giả: scope thiếu, thiếu refresh token, kết nối lại đúng/sai tài khoản, `login_hint`. `PendingConnect` store: một lần, hết hạn 10 phút (Clock), tối đa 5.
- **Tích hợp** (server thật `RANDOM_PORT` + `HttpClient`, như `AuthApiTests`; WireMock đóng vai Google): đăng nhập → `POST connect` → đọc `state` từ `authorizationUrl` → gọi callback → account Gmail có trong `GET /api/accounts`, refresh token lưu mã hóa; request tới token endpoint có `code_verifier`; mỗi mã lỗi một test; dùng lại `state` → `CONNECT_STATE_INVALID`; log không chứa `code`, token, secret.
- **Thu hồi:** WireMock nhận lệnh thu hồi sau khi xóa; Google lỗi → xóa vẫn `204`.
- **Cấu hình:** `ApplicationContextRunner` — thiếu cả hai biến → không có Gmail; thiếu một → dừng, thông báo chỉ nêu tên biến; giá trị secret không xuất hiện.
- **Contract:** `GmailProvider` qua contract test kit của F03; `ModularityTests`; kiểm tra ngược bằng script như mọi task.
- **Thử với Google thật (BE-34):** đăng ký thêm redirect URI `http://localhost:8080/api/accounts/connect/gmail/callback` (backend chạy riêng, `SINO_PUBLIC_BASE_URL=http://localhost:8080`); đăng nhập bằng curl, `POST connect`, mở `authorizationUrl` trên trình duyệt, Google gọi thẳng về backend, xem account bằng curl. Cần Google project của người dùng; chưa có thì ghi NOT VERIFIED.
- **Nghiệm thu cuối (sau FE-30):** trên trình duyệt, Gmail thật: thêm, hủy ở Google, bỏ tick quyền, kết nối lại đúng và sai tài khoản, xóa (kiểm quyền biến mất ở trang quyền của tài khoản Google).

## Risks / Trade-offs

- [Ngoại lệ "personal use" của Google có thể không áp dụng cho scope restricted khi "In production"] → Kiểm thật ở BE-34. Nếu không được: ở lại Testing và chấp nhận kết nối lại mỗi 7 ngày (luồng kết nối lại đã có), ghi vào README.
- [Hai change cùng sửa requirement `/api/**` yêu cầu xác thực] → `fe-f01-web-foundation` archive trước; delta của change này viết trên bản của fe-f01. Nếu thứ tự đổi, sửa delta trước khi archive.
- [Session mất (khởi động lại, hết hạn) khi đang ở màn Google] → `CONNECT_STATE_INVALID`, người dùng thử lại.
- [Callback công khai ở tầng security] → không có tác dụng gì nếu thiếu `PendingConnect` hợp lệ trong session.
- [Giới hạn 100 refresh token mỗi tài khoản Google trên mỗi client] → kết nối lại nhiều lần làm token cũ nhất mất hiệu lực; Sino luôn dùng token mới nhất nên không ảnh hưởng.
- [Phiên khác đang làm web của Phase 1 trên cùng thư mục làm việc] → change này chỉ sửa file backend và hồ sơ của mình; commit chỉ stage file của mình.

## Migration Plan

- Không có migration database: `account_credential` đã có cột cho refresh token, hạn token, scope (F02, D-14). Kiểm lại ở BE-31/BE-32.
- Người dùng: tạo Google Cloud project, bật Gmail API, consent screen External (Testing, thêm Gmail của mình làm test user), OAuth client loại Web application với redirect URI `http://localhost:5173/...` và `http://localhost:8080/...`; đặt `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET`, `SINO_PUBLIC_BASE_URL` vào `.env`. README ghi từng bước (BE-34).
- Không có dữ liệu cũ cần chuyển.

## Open Questions

- **Zalo và Messenger** (người dùng muốn làm sau Gmail, 2026-10-07): theo hiểu biết hiện tại, cả hai không có API chính thức để đọc tin nhắn của tài khoản **cá nhân** (Messenger Platform dành cho Facebook Page; Zalo có API cho Official Account); thư viện không chính thức vi phạm điều khoản và có thể làm khóa tài khoản. Cần **spike khả thi** trước khi thiết kế (cùng câu hỏi roadmap đã ghi cho Telegram ở F09). Không chặn F04a.
- F04b: cửa sổ nhập thư ban đầu, `historyId` làm cursor — chốt khi mở F04b.

## Definition of Done — F04a

- [ ] Các scenario của `account-connect` và delta `provider-contract`, `connected-accounts`, `api-conventions` có test và xanh.
- [ ] App chạy được khi thiếu cả hai biến Google; dừng khi thiếu một, thông báo không lộ giá trị.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` xanh; kiểm tra ngược từng task.
- [ ] Thử với Google thật (BE-34) và nghiệm thu trên trình duyệt (sau FE-30), có ảnh chụp màn hình; hoặc ghi rõ NOT VERIFIED và lý do.
- [ ] Web: `pnpm lint`, `pnpm test`, `pnpm build` xanh.
- [ ] README (dựng Google project, biến env, xử lý sự cố), `.env.example`, error catalog cập nhật.
- [ ] Kiến thức Phase 2 trong `docs/knowledge/` (`.md` + `.docx`).
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; change archive (sau `fe-f01-web-foundation`).
