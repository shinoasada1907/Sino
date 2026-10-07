# Phase 2 · F04a — Kết nối Gmail (OAuth2) · Implementation Plan

> **HYBRID mode:** backend và frontend AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận ("để tôi làm BE-xx") thì chạy TRAINING: người dùng code theo **Hướng làm** (Level 2) và **Hints** (Level 1), Claude review/test.
> Thiết kế được người dùng duyệt từng phần 2026-10-07 (D-15 = A', C5, D-37…D-41). **Chờ người dùng duyệt hồ sơ** rồi mới bắt đầu BE-30.
> Backend làm song song với web của Phase 1 (D-41); FE-30 chờ Phase 1 change 2 (trang Accounts). Phiên khác đang làm web của Phase 1: task của change này không sửa `apps/sino-web/**` cho tới FE-30.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, một commit trên `dev` (không push), cập nhật `docs/knowledge/phase-2-one-provider.md` + `.docx`. Backend: `./mvnw -B -ntp verify` xanh trước khi commit.

## 1. Backend — kết nối Gmail

- [ ] 1.1 **BE-30 — SPI `oauth2()`, khung connector Gmail, cấu hình Google, WireMock**
  - **Goal / Why:** connector khai báo được cách kết nối OAuth2 mà contract vẫn không chứa kiểu riêng của provider; Gmail có mặt khi có cấu hình và vắng mặt khi chưa có Google project (D-38, D-39).
  - **Depends on:** — (F02, F03 đã xong).
  - **Files:** `provider/spi/OAuth2Connection` (mới), `provider/spi/MessageProvider` (`default Optional<OAuth2Connection> oauth2()`), `provider/infrastructure/gmail/{GmailProvider,GmailProperties,GmailConfiguration}` (mới), `application.yaml`, `application-test.yaml`, `.env.example`, `pom.xml` (test `org.wiremock:wiremock-standalone`), test.
  - **Hướng làm:** `OAuth2Connection` là record kiểu Sino (registration id, scope, tham số riêng, `revocationUri` tùy chọn), tự kiểm dữ liệu và chép tập hợp thành bất biến. `GmailProvider`: type `gmail`, tên `Gmail`, capability `{}`, `oauth2()` theo design, `getAccountProfile` gọi userinfo bằng access token trong `ProviderContext` (`sub` → `externalAccountId`, email → tên), `fetchUpdates` ném `CAPABILITY_NOT_SUPPORTED`. `GmailConfiguration` chỉ đăng ký connector và `ClientRegistration` `google` (dựng từ `CommonOAuth2Provider.GOOGLE`, ghi đè redirect URI, scope, các URI) khi có đủ client id và secret; kiểm cấu hình bằng tay, thông báo chỉ nêu tên biến. Không đặt `spring.security.oauth2.client.registration.*`.
  - **Test:** record `OAuth2Connection` (từ chối dữ liệu thiếu, bất biến); connector giả cũ có `oauth2()` rỗng; `GmailProvider.oauth2()` đúng scope/tham số; `getAccountProfile` với WireMock (thành công → `sub`, email; `401` → lỗi provider phân loại đúng; quá thời gian → lỗi, không treo); `ApplicationContextRunner`: thiếu cả hai biến → không có bean Gmail và có log; thiếu một → dừng, thông báo nêu tên biến, không có giá trị; đủ → `GET /api/providers` có `gmail`; contract test kit của F03 cho `GmailProvider`; kiểm tra kiến trúc của contract và `ModularityTests` xanh. Kiểm xem Spring Boot có tự bật thành phần OAuth2 client nào không.
  - **Acceptance criteria:** requirement *Connector khai báo cách kết nối OAuth2* (delta `provider-contract`), *Định danh Gmail bất biến*, *Cấu hình OAuth client của Gmail* (spec `account-connect`).
  - **Hints:** Level 1 — "vì sao client secret không được nằm trong `OAuth2Connection`?"; `CommonOAuth2Provider`, `ClientRegistration.withClientRegistration`, `@ConditionalOnProperty` so với kiểm tay, `WireMockExtension`.

- [ ] 1.2 **BE-31 — Bắt đầu kết nối: `POST /api/accounts/connect/{provider}`**
  - **Goal / Why:** web nhận được `authorizationUrl` an toàn (state + PKCE) để chuyển người dùng sang Google.
  - **Depends on:** BE-30.
  - **Files:** `account/api/ConnectController` (mới) + DTO, `account/application/ConnectService` (mới), `account/application/AccountErrorCode` (`CONNECT_NOT_SUPPORTED`), `account/infrastructure/oauth/*` (tìm `ClientRegistration` theo id), kho `PendingConnect` trong session, design (catalog), README (bảng endpoint), test.
  - **Hướng làm:** controller lấy owner hiện tại, gọi `start`; service tìm connector qua registry, lấy `oauth2()`, dựng `OAuth2AuthorizationRequest` (state 32 byte, `withPkce()`, scope, tham số riêng, `login_hint` khi kết nối lại); controller cất `PendingConnect` vào session (map theo state, tối đa 5, hạn 10 phút theo `Clock`) và trả URL. Kết nối lại: account phải thuộc owner, chưa xóa, cùng provider.
  - **Test:** full-context: URL có `state`, `code_challenge`, `S256`, đúng scope, `access_type=offline`, `prompt=consent`, `redirect_uri` từ `SINO_PUBLIC_BASE_URL`; hai lần gọi → hai state; kết nối lại → có `login_hint`; `404 UNKNOWN_PROVIDER`; connector không có `oauth2()` → `422 CONNECT_NOT_SUPPORTED`; `accountId` đã xóa / của provider khác → `404 ACCOUNT_NOT_FOUND`; thiếu CSRF → `403`; chưa đăng nhập → `401`. Unit cho kho `PendingConnect`: lấy ra là mất, quá 10 phút là mất, mục thứ 6 đẩy mục cũ nhất.
  - **Acceptance criteria:** requirement *Bắt đầu kết nối bằng OAuth2*, phần bắt đầu của *Kết nối lại một account*, phần lưu trữ của *State dùng một lần và có hạn* (spec `account-connect`).
  - **Hints:** Level 1 — "nếu `state` cất trong database thay vì session thì kẻ xấu lợi dụng được gì?"; `OAuth2AuthorizationRequest.authorizationCode()`, `OAuth2AuthorizationRequestCustomizers.withPkce()`, `HttpSession`.

- [ ] 1.3 **BE-32 — Callback: đổi code, kiểm scope, đăng ký, redirect**
  - **Goal / Why:** hoàn tất kết nối: account Gmail thật có credential mã hóa; mọi lỗi về lại web bằng mã rõ ràng.
  - **Depends on:** BE-31.
  - **Files:** `ConnectController` (callback), `ConnectService.complete`, `account/application/ConnectErrorCode` (mới), `account/infrastructure/oauth/*` (client đổi token có timeout, client thu hồi), `common/security/SecurityConfig` (callback công khai), design, README, test.
  - **Hướng làm:** controller lấy và xóa `PendingConnect` theo `state` trước tiên (thiếu/hết hạn/sai provider → `CONNECT_STATE_INVALID`); `error=access_denied` → `CONNECT_CANCELLED`; service đổi code bằng token client của Spring (`OAuth2AuthorizationCodeGrantRequest`, verifier tự gửi), kiểm scope thật được cấp và refresh token, gọi `getAccountProfile`, kiểm `sub` khi kết nối lại, gọi `register` với `OAuth2Credentials` + refresh token; scope thiếu / sai tài khoản → thu hồi token vừa nhận rồi báo lỗi; còn lại → `CONNECT_FAILED` (log loại lỗi, mã HTTP). Mọi lời gọi Google ngoài transaction.
  - **Test:** server thật + `HttpClient` (như `AuthApiTests`), WireMock đóng vai Google: luồng thành công (account trong `GET /api/accounts`, refresh token lưu mã hóa trong DB, token request có `code_verifier` và đúng `redirect_uri`); kết nối lại đúng tài khoản (cùng ID, `CONNECTED`); sai tài khoản → không đổi gì + có lệnh thu hồi; thiếu `gmail.readonly` → `CONNECT_SCOPE_DENIED` + thu hồi; hủy; dùng lại state; state hết hạn (Clock); không session → `302`, không `401`; token endpoint `500` / quá thời gian / thiếu refresh token → `CONNECT_FAILED`; log không chứa `code`, token, secret. `ModularityTests` xanh.
  - **Acceptance criteria:** requirement *Hoàn tất kết nối ở callback*, *Kết nối lại một account*, *State dùng một lần và có hạn*, *Kiểm scope thật được cấp*, *Không lộ bí mật của luồng kết nối* (spec `account-connect`); delta `api-conventions` (callback công khai).
  - **Hints:** Level 1 — "vì sao phải xóa `PendingConnect` *trước* khi gọi Google, kể cả khi sau đó lỗi?"; `RestClientAuthorizationCodeTokenResponseClient`, `OAuth2AuthorizationExchange`, `OAuth2AccessTokenResponse.getAccessToken().getScopes()`.

- [ ] 1.4 **BE-33 — Thu hồi token khi xóa account**
  - **Goal / Why:** xóa account trong Sino thì Google cũng thu quyền lại (02A §11; F02 để việc này cho F04).
  - **Depends on:** BE-32 (client thu hồi).
  - **Files:** `account/application/AccountManagementService` (luồng xóa), `account/infrastructure/oauth/*`, spec delta `connected-accounts`, test.
  - **Hướng làm:** đọc refresh token trước, xóa trong transaction như cũ, thu hồi **sau khi commit** và ngoài transaction; lỗi chỉ ghi `WARN` (account id, provider, mã HTTP); không đưa token vào event.
  - **Test:** xóa account Gmail → WireMock nhận lệnh thu hồi đúng token, sau khi DB đã xóa; Google `500` / quá thời gian → vẫn `204`, account vẫn bị xóa, log không chứa token; transaction xóa rollback → không gửi lệnh thu hồi; account không có `revocationUri` → không gọi gì; bảng `event_publication` không chứa token.
  - **Acceptance criteria:** requirement *Xóa account* (delta `connected-accounts`).
  - **Hints:** Level 1 — "nếu thu hồi *trước* khi commit mà sau đó transaction rollback thì chuyện gì xảy ra?"; `TransactionSynchronization.afterCommit` so với tách method có và không có `@Transactional`.

- [ ] 1.5 **BE-34 — README Google project và thử với Google thật**
  - **Goal / Why:** người dùng tự dựng được Google project; backend được kiểm với Google thật trước khi có web (D-40, D-41).
  - **Depends on:** BE-32, BE-33.
  - **Files:** `apps/sino-api/README.md` (các bước dựng Google project, biến env, xử lý sự cố), `.env.example`, design (kết quả kiểm ngoại lệ personal use), file này, `PROJECT_STATE.md`.
  - **Hướng làm:** README: bật Gmail API, consent screen External + Testing + test user, OAuth client Web application với hai redirect URI (`:5173` và `:8080`), đặt biến vào `.env`; xử lý sự cố `redirect_uri_mismatch`, màn "unverified app", token hết hạn 7 ngày ở Testing, thu hồi tay ở trang quyền của tài khoản Google. Thử thật: backend riêng với `SINO_PUBLIC_BASE_URL=http://localhost:8080`, đăng nhập bằng curl, `POST connect`, mở URL trên trình duyệt, xem account bằng curl, xóa và kiểm quyền biến mất. Người dùng đặt giá trị secret; agent không đọc `.env`.
  - **Test:** chạy thật theo các bước trên; ghi bằng chứng (lệnh, response đã che token). Chưa có Google project → ghi NOT VERIFIED và để task mở.
  - **Acceptance criteria:** kết nối, kết nối lại, xóa chạy với Gmail thật; README đủ để làm lại từ đầu.
  - **Hints:** Level 1 — "vì sao Google từ chối nếu redirect URI lệch một dấu `/`?".

## 2. Frontend — nút kết nối (sau Phase 1 change 2)

- [ ] 2.1 **FE-30 — "Thêm Gmail", "Kết nối lại", thông báo kết quả**
  - **Goal / Why:** người dùng kết nối Gmail từ web, không cần curl.
  - **Depends on:** BE-32; trang Accounts của Phase 1 change 2. (Số FE-30 theo khối của F04a, không theo thứ tự FE của Phase 1.)
  - **Files:** trang Accounts trong `apps/sino-web/src/features/accounts/*` (theo cấu trúc của Phase 1), test.
  - **Hướng làm:** nút "Thêm Gmail" chỉ hiện khi `/api/providers` có `gmail`; mutation `POST connect` rồi `window.location.assign`; nút "Kết nối lại" cho account `AUTH_EXPIRED`; khi quay về đọc `connected` / `connectError`, hiện thông báo theo catalog, xóa tham số bằng `history.replaceState`, invalidate danh sách account.
  - **Test (Testing Library + MSW):** không có `gmail` → không có nút; bấm "Thêm Gmail" → gọi đúng API và chuyển tới URL trả về; "Kết nối lại" gửi `accountId`; mỗi `connectError` → đúng thông báo; tham số bị xóa sau khi hiện.
  - **Acceptance criteria:** phần web của design (mục Frontend design).
  - **Hints:** Level 1 — "vì sao phải xóa `connectError` khỏi URL sau khi hiện thông báo?"; `useSearchParams`, `useMutation`.

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Nghiệm thu F04a và archive**
  - **Goal / Why:** đóng F04a với bằng chứng thật.
  - **Depends on:** BE-30…BE-34, FE-30; `fe-f01-web-foundation` đã archive.
  - **Files:** design (DoD), file này, `PROJECT_STATE.md`, `docs/knowledge/phase-2-one-provider.{md,docx}`.
  - **Test:** trên trình duyệt với Gmail thật: thêm, hủy ở Google, bỏ tick quyền đọc, kết nối lại đúng và sai tài khoản, xóa (kiểm trang quyền của tài khoản Google). Chụp màn hình từng bước.
  - **Acceptance criteria:** checklist *Definition of Done — F04a* trong `design.md`; sau đó `openspec archive f04a-gmail-connect -y`.
  - **Hints:** Level 1 — "khi refresh token của Gmail chết, F04b sẽ đưa người dùng về luồng nào của change này?".
