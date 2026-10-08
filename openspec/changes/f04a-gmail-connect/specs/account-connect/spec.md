## ADDED Requirements

### Requirement: Bắt đầu kết nối bằng OAuth2
`POST /api/accounts/connect/{provider}` (đã đăng nhập, có CSRF) MUST trả `200` với `authorizationUrl` dẫn tới trang đồng ý của provider. URL MUST mang một `state` ngẫu nhiên, mới cho mỗi lần gọi, và `code_challenge` PKCE kiểu `S256`; với Gmail MUST xin đúng các scope `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` và mang `access_type=offline`, `prompt=consent`. Yêu cầu đang chờ (state, PKCE verifier, provider, owner, account đích nếu có) MUST được lưu trong session của người dùng, không ở nơi nào khác. Provider không có connector MUST trả `404` `UNKNOWN_PROVIDER`; provider không khai báo cách kết nối OAuth2 MUST trả `422` `CONNECT_NOT_SUPPORTED`.

#### Scenario: Bắt đầu kết nối Gmail
- **WHEN** owner đã đăng nhập gọi `POST /api/accounts/connect/gmail` với CSRF token hợp lệ
- **THEN** response là `200` với `authorizationUrl` có `state`, `code_challenge`, `code_challenge_method=S256`, đúng ba scope, `access_type=offline` và `prompt=consent`

#### Scenario: Hai lần bắt đầu cho hai state khác nhau
- **WHEN** owner gọi bắt đầu kết nối hai lần liên tiếp
- **THEN** hai `authorizationUrl` mang hai `state` khác nhau và cả hai đều dùng được cho tới khi hết hạn

#### Scenario: Provider không tồn tại
- **WHEN** owner gọi `POST /api/accounts/connect/nope`
- **THEN** response là `404` với `code` = `UNKNOWN_PROVIDER`

#### Scenario: Provider không hỗ trợ OAuth2
- **WHEN** owner gọi bắt đầu kết nối cho một provider có connector nhưng không khai báo cách kết nối OAuth2
- **THEN** response là `422` với `code` = `CONNECT_NOT_SUPPORTED`

### Requirement: Kết nối lại một account
Body `{"accountId": ...}` MUST biến lệnh bắt đầu thành kết nối lại account đó: `authorizationUrl` MUST mang thêm `login_hint` là định danh của account ở provider (`externalAccountId`; với Google là `sub`, giá trị Google nhận cho `login_hint`). `accountId` không tồn tại, đã xóa, thuộc owner khác hoặc thuộc provider khác MUST trả `404` `ACCOUNT_NOT_FOUND`. Ở callback, nếu định danh của tài khoản vừa đồng ý khác `externalAccountId` của account đích thì MUST NOT tạo hay sửa account nào và MUST redirect với `CONNECT_WRONG_ACCOUNT`.

#### Scenario: Kết nối lại đúng tài khoản
- **WHEN** owner kết nối lại một account `AUTH_EXPIRED` và chọn đúng tài khoản ở provider
- **THEN** `authorizationUrl` có `login_hint` = `externalAccountId` của account, và sau khi provider gọi về, account đó (cùng ID) có credential mới, `status` = `CONNECTED`, callback redirect tới `/accounts?connected={accountId}`

#### Scenario: Kết nối lại nhưng chọn tài khoản khác
- **WHEN** owner kết nối lại account A nhưng ở provider chọn tài khoản B
- **THEN** không account nào được tạo hay sửa, token vừa nhận bị thu hồi, và callback redirect tới `/accounts?connectError=CONNECT_WRONG_ACCOUNT`

#### Scenario: Kết nối lại nhưng chọn một account khác đang kết nối
- **WHEN** owner có account A và B, kết nối lại A nhưng ở provider chọn B
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_WRONG_ACCOUNT` và provider không nhận lệnh thu hồi nào, nên quyền của B vẫn còn

#### Scenario: Account đích bị xóa trong lúc kết nối lại
- **WHEN** owner bắt đầu kết nối lại account A, xóa A, rồi đồng ý ở provider
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_FAILED`, A vẫn đã xóa, và token vừa nhận bị thu hồi

#### Scenario: Account đích không hợp lệ
- **WHEN** owner gọi bắt đầu kết nối với `accountId` của một account đã xóa
- **THEN** response là `404` với `code` = `ACCOUNT_NOT_FOUND`

### Requirement: Hoàn tất kết nối ở callback
`GET /api/accounts/connect/{provider}/callback` MUST lấy và xóa yêu cầu đang chờ theo `state` trước mọi việc khác, rồi đổi `code` lấy token có gửi PKCE verifier, kiểm scope thật được cấp, lấy hồ sơ account từ connector và gọi use case đăng ký kết nối của F02 với credential và refresh token. Thành công MUST trả `302` tới `/accounts?connected={accountId}`. Mọi lỗi MUST trả `302` tới `/accounts?connectError={CODE}`; callback MUST NOT trả body JSON. `Location` MUST là đường dẫn cố định, không lấy từ tham số của request. Khi đã nhận token mà kết nối không thành, hệ thống MUST hỏi hồ sơ account trước, MUST thu hồi token vừa nhận nếu tài khoản đó không phải account còn sống của owner (hoặc không biết là ai), và MUST NOT thu hồi nếu nó là account còn sống của owner, vì thu hồi rút cả quyền tài khoản đó đã cấp cho Sino (D-54). Kết nối lại mà account đích đã bị xóa trong lúc chờ MUST redirect với `CONNECT_FAILED` và MUST NOT làm account đó sống lại.

#### Scenario: Kết nối Gmail mới
- **WHEN** provider gọi callback với `code` hợp lệ và `state` đang chờ trong session của owner
- **THEN** một account Gmail mới có `status` = `CONNECTED` xuất hiện trong `GET /api/accounts`, refresh token được lưu mã hóa, request đổi token có `code_verifier`, và response là `302` tới `/accounts?connected={accountId}`

#### Scenario: Người dùng hủy ở provider
- **WHEN** provider gọi callback với `error=access_denied` và `state` hợp lệ
- **THEN** không có gì được ghi và response là `302` tới `/accounts?connectError=CONNECT_CANCELLED`

#### Scenario: Provider hoặc token endpoint lỗi
- **WHEN** provider trả lỗi khác, việc đổi code thất bại, token response thiếu refresh token, hoặc lấy hồ sơ account lỗi
- **THEN** không có account nào được tạo và response là `302` tới `/accounts?connectError=CONNECT_FAILED`

### Requirement: State dùng một lần và có hạn
Mỗi yêu cầu đang chờ MUST dùng được đúng một lần và MUST hết hạn sau 10 phút kể từ lúc bắt đầu. Session MUST giữ tối đa 5 yêu cầu đang chờ; vượt thì bỏ yêu cầu cũ nhất. Callback với `state` thiếu, không có trong session, đã dùng, đã hết hạn, hoặc với `{provider}` khác provider của yêu cầu MUST redirect với `CONNECT_STATE_INVALID` và MUST NOT gọi tới provider.

#### Scenario: Dùng lại một state
- **WHEN** callback được gọi lần thứ hai với cùng `state`
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_STATE_INVALID` và không có request nào tới token endpoint

#### Scenario: State đã hết hạn
- **WHEN** callback tới 10 phút sau lúc bắt đầu
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_STATE_INVALID`

#### Scenario: Không có session
- **WHEN** callback được gọi với `state` hợp lệ nhưng không kèm cookie session đã bắt đầu kết nối
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_STATE_INVALID`

### Requirement: Kiểm scope thật được cấp
Callback MUST đọc scope trong token response và so với scope bắt buộc của connector (`requiredScopes`, D-51; với Gmail: `https://www.googleapis.com/auth/gmail.readonly`), không so với mọi scope đã xin. Thiếu scope bắt buộc MUST NOT tạo account, MUST thu hồi token vừa nhận và MUST redirect với `CONNECT_SCOPE_DENIED`. Token response không ghi `scope` MUST được hiểu là được cấp đúng phần đã xin (RFC 6749 §5.1).

#### Scenario: Người dùng bỏ tick quyền đọc Gmail
- **WHEN** token response không có `gmail.readonly`
- **THEN** không account nào được tạo, provider nhận lệnh thu hồi token, và response là `302` tới `/accounts?connectError=CONNECT_SCOPE_DENIED`

#### Scenario: Thêm lại một account đang kết nối mà bỏ tick quyền đọc
- **WHEN** owner đã có account Gmail B, bấm "Thêm Gmail", chọn B và bỏ tick `gmail.readonly`
- **THEN** response là `302` tới `/accounts?connectError=CONNECT_SCOPE_DENIED`, B không đổi, và provider không nhận lệnh thu hồi nào

#### Scenario: Provider đổi tên scope đăng nhập
- **WHEN** Gmail xin `email` và token response ghi `https://www.googleapis.com/auth/userinfo.email` cùng `gmail.readonly`
- **THEN** kết nối thành công, vì `email` không phải scope bắt buộc

### Requirement: Định danh Gmail bất biến
Hồ sơ account của Gmail MUST dùng `sub` của Google làm `externalAccountId` và email làm tên hiển thị mặc định; MUST NOT dùng email làm định danh.

#### Scenario: Cùng tài khoản Google kết nối hai lần
- **WHEN** cùng một tài khoản Google (cùng `sub`) được kết nối lần thứ hai bằng "Thêm Gmail"
- **THEN** không có account thứ hai; account cũ được kết nối lại

### Requirement: Không lộ bí mật của luồng kết nối
Access token, refresh token, `code` và client secret MUST NOT xuất hiện trong log, URL redirect, event, response hay thông báo lỗi. Log của `CONNECT_FAILED` MAY ghi loại lỗi và mã HTTP.

#### Scenario: Kiểm log sau một lần kết nối
- **WHEN** một lần kết nối thành công và một lần thất bại đã chạy
- **THEN** log không chứa giá trị `code`, access token, refresh token hay client secret đã dùng

### Requirement: Cấu hình OAuth client của Gmail
Connector Gmail MUST chỉ được đăng ký khi có đủ `SINO_GOOGLE_CLIENT_ID` và `SINO_GOOGLE_CLIENT_SECRET`. Thiếu cả hai: app MUST khởi động, Gmail MUST NOT có trong `GET /api/providers`, và log lúc khởi động MUST nói Gmail đang tắt. Có một mà thiếu một, hoặc Gmail bật mà thiếu `SINO_PUBLIC_BASE_URL`: app MUST dừng khởi động với thông báo chỉ nêu tên biến, không nêu giá trị. Redirect URI MUST là `SINO_PUBLIC_BASE_URL` + `/api/accounts/connect/gmail/callback`, không suy ra từ request. Mọi lời gọi tới Google MUST có timeout.

#### Scenario: Chưa có Google project
- **WHEN** app khởi động không có `SINO_GOOGLE_CLIENT_ID` và `SINO_GOOGLE_CLIENT_SECRET`
- **THEN** app chạy, `GET /api/providers` không có `gmail`, và `POST /api/accounts/connect/gmail` trả `404` `UNKNOWN_PROVIDER`

#### Scenario: Thiếu client secret
- **WHEN** app khởi động có `SINO_GOOGLE_CLIENT_ID` nhưng không có `SINO_GOOGLE_CLIENT_SECRET`
- **THEN** app dừng với thông báo nêu `SINO_GOOGLE_CLIENT_SECRET` và không chứa giá trị client id
