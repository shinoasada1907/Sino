## Why

Phase 0 dựng xong contract provider (F03) và quản lý account (F02), nhưng chưa có cách nào để một tài khoản thật vào Sino: use case `register` của F02 chờ "luồng connect của F04". F04 là feature lớn nhất của roadmap (luồng OAuth2 + connector Gmail đọc thư), nên được tách làm hai change (D-37). Change này (**F04a**) làm phần **lấy được quyền**: người dùng bấm "Thêm Gmail", đồng ý ở Google, và account Gmail thật hiện trên trang Accounts với credential được lưu mã hóa. Phần **dùng quyền** (refresh token, đọc thư) là F04b.

## What Changes

- **Luồng kết nối OAuth2 authorization code** (D-15/C5 chốt, xem design): `POST /api/accounts/connect/{provider}` trả `authorizationUrl` (có `state` và PKCE lưu trong session); `GET /api/accounts/connect/{provider}/callback` đổi code lấy token, kiểm scope, lấy hồ sơ, gọi `register` của F02, rồi luôn `302` về `/accounts?connected=…` hoặc `/accounts?connectError=…`.
- **Kết nối lại** account `AUTH_EXPIRED` bằng cùng luồng (`accountId` + `login_hint`); chọn nhầm tài khoản Google khác thì báo lỗi, không tự thêm account.
- **Thu hồi token ở Google** khi xóa account (sau khi commit, best-effort), và ngay khi người dùng không cấp đủ quyền hoặc chọn nhầm tài khoản.
- **SPI:** `MessageProvider` thêm `default Optional<OAuth2Connection> oauth2()` (registration id, scope, tham số riêng, địa chỉ thu hồi) — kiểu của Sino, không có SDK.
- **Connector Gmail (khung):** `provider/infrastructure/gmail/GmailProvider`, type `gmail`, tên `Gmail`, capability `{}` ở change này (F04b thêm `READ_MESSAGES`), `getAccountProfile` qua userinfo của Google (`externalAccountId` = `sub`).
- **Cấu hình:** `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET`, `SINO_PUBLIC_BASE_URL`. Thiếu cả hai biến Google thì Gmail tắt (app vẫn chạy); thiếu một trong hai thì dừng khởi động.
- **Mã lỗi mới:** `CONNECT_NOT_SUPPORTED` (422) và các mã redirect `CONNECT_CANCELLED`, `CONNECT_STATE_INVALID`, `CONNECT_SCOPE_DENIED`, `CONNECT_WRONG_ACCOUNT`, `CONNECT_FAILED`.
- **Web:** nút "Thêm Gmail" / "Kết nối lại" và thông báo kết quả trên trang Accounts (sau khi Phase 1 có trang Accounts).
- **Test:** thêm test dependency **WireMock** (D-39) để giả lập Google.
- **Tài liệu:** README hướng dẫn dựng Google Cloud project; `.env.example`; file kiến thức Phase 2.

## Capabilities

### New Capabilities
- `account-connect`: kết nối và kết nối lại account bằng OAuth2 (bắt đầu, callback, `state`/PKCE, kiểm scope, định danh, mã lỗi redirect), thu hồi token khi kết nối không dùng được, cấu hình OAuth client của provider.

### Modified Capabilities
- `provider-contract`: connector MAY khai báo cách kết nối OAuth2 (`oauth2()`); connector không tự đổi code hay refresh token.
- `connected-accounts`: xóa account thu hồi token ở provider sau khi commit, lỗi thu hồi không chặn việc xóa.
- `api-conventions`: callback kết nối được gọi mà không cần phiên đăng nhập ở tầng security (người dùng xác định bằng `state` trong session).

## Impact

- Code backend: `dev/sino/account/{api,application,infrastructure}` (connect flow, thu hồi khi xóa), `dev/sino/provider/spi` (`OAuth2Connection`, method `oauth2()`), `dev/sino/provider/infrastructure/gmail/**` (mới), `dev/sino/common/security/SecurityConfig` (callback công khai).
- Code frontend: trang Accounts của Phase 1 (nút, thông báo) — sau Phase 1 change 2.
- Cấu hình: `application.yaml`, `application-test.yaml`, `.env.example`; **người dùng tạo Google Cloud project** (consent screen, test user, OAuth client, redirect URI) và đặt giá trị vào `.env` của mình.
- Dependency: test `org.wiremock:wiremock-standalone`. Không thêm dependency runtime (`spring-boot-starter-security-oauth2-client` đã có).
- Thứ tự archive: `fe-f01-web-foundation` archive trước change này (cùng sửa requirement `/api/**` yêu cầu xác thực của `api-conventions`).

## Non-goals

- Refresh token, `fetchUpdates`, phân tích thread/MIME, capability `READ_MESSAGES`, contract test đọc thư: **F04b** (D-15 = A' đã chốt cách làm).
- Nhập thư ban đầu và Unified Inbox (F05), sync nền (F07).
- Quyền gửi thư `gmail.send` / `gmail.modify` (F10): xin thêm khi tới F10, người dùng phải đồng ý lại.
- Thẩm định app với Google, nhiều người dùng: ngoài MVP (D-40: dùng cá nhân dưới 100 người dùng).
- Provider khác (Zalo, Messenger, Telegram): F09+, cần spike khả thi trước (xem design, Open Questions).
- Webhook / Gmail push (Pub/Sub): ngoài phạm vi; F07 quyết định.
