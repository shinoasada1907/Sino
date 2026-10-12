## ADDED Requirements

### Requirement: Trạng thái trả lời của một cuộc trò chuyện
`GET /api/conversations/{id}` MUST có `reply` gồm `state` và `to`. `state` MUST là `READY` khi account gửi được (capability `SEND_MESSAGES`, trạng thái dùng được), `NEEDS_PERMISSION` khi provider gửi được nhưng account chưa cấp quyền gửi, `ACCOUNT_UNAVAILABLE` khi account `AUTH_EXPIRED` hoặc `DISABLED`, và `NOT_SUPPORTED` khi provider không gửi được. Tạm dừng đồng bộ MUST NOT chặn việc gửi.

#### Scenario: Account cũ chưa cấp quyền gửi
- **WHEN** account Gmail chỉ có quyền đọc
- **THEN** `reply.state` = `NEEDS_PERMISSION`

#### Scenario: Account hết quyền
- **WHEN** account ở trạng thái `AUTH_EXPIRED`
- **THEN** `reply.state` = `ACCOUNT_UNAVAILABLE`

### Requirement: Người nhận của thư trả lời
`reply.to` MUST là `Reply-To`, không có thì người gửi, của thư đến mới nhất trong cuộc trò chuyện; cuộc trò chuyện chỉ có thư đi thì MUST là người nhận `To` của thư đi mới nhất. Khi gửi, server MUST tính người nhận theo cùng quy tắc và MUST NOT nhận người nhận từ request.

#### Scenario: Thư đến có Reply-To
- **WHEN** thư đến mới nhất có `From: An <an@example.com>` và `Reply-To: hotro@example.com`
- **THEN** `reply.to` là `hotro@example.com`

#### Scenario: Thư cuối là thư của mình
- **WHEN** thư mới nhất là thư đi, thư đến mới nhất là của `an@example.com`
- **THEN** `reply.to` là `an@example.com`

### Requirement: Gửi thư trả lời
`POST /api/conversations/{id}/messages` với `text` (1…100 000 ký tự, không chỉ có khoảng trắng) và `clientMessageId` (UUID) MUST gửi một thư chữ thuần qua provider tới `reply.to`. Thư MUST nằm trong đúng thread của provider: với Gmail là `threadId`, `In-Reply-To` và `References` theo thư mới nhất, `Subject` = `Re: ` + chủ đề (không lặp `Re:`). Gửi xong MUST trả `201` với thư đã lưu, `status` = `SENT`. `reply.state` khác `READY` MUST trả `409 REPLY_NOT_ALLOWED` mà không gọi provider. Sau khi lưu kết quả, server MUST phát `conversations.changed` với `source` = `user`.

#### Scenario: Trả lời một thư Gmail
- **WHEN** người dùng gửi "Em nhận được rồi" trong một cuộc trò chuyện Gmail có quyền gửi
- **THEN** Gmail nhận `messages.send` có `threadId` của cuộc trò chuyện, `In-Reply-To` là `Message-ID` của thư mới nhất, và response là `201` với `status` = `SENT`

#### Scenario: Chưa có quyền gửi
- **WHEN** `reply.state` = `NEEDS_PERMISSION` và web gọi `POST`
- **THEN** response là `409 REPLY_NOT_ALLOWED` với `state` = `NEEDS_PERMISSION` và không có lời gọi nào ra provider

### Requirement: Không gửi trùng
Server MUST ghi thư đi `PENDING` cùng `clientMessageId` trước khi gọi provider, và `clientMessageId` MUST là duy nhất trong một cuộc trò chuyện. Gọi lại với `clientMessageId` của thư đã `SENT` MUST trả `200` với thư đó và MUST NOT gửi lại; của thư đang `PENDING` MUST trả `409 SEND_IN_PROGRESS`; của thư `FAILED` MUST gửi lại; của thư `UNKNOWN` MUST trả `409 SEND_OUTCOME_UNKNOWN`. Khi đồng bộ nhập lại thư Sino đã gửi, MUST NOT có hai dòng cho cùng một thư.

#### Scenario: Bấm gửi hai lần do mạng chập chờn
- **WHEN** web gửi hai request cùng `clientMessageId` và request đầu đã gửi xong
- **THEN** request sau nhận `200` với cùng thư và provider chỉ được gọi một lần

#### Scenario: Đồng bộ thấy thư vừa gửi
- **WHEN** lượt đồng bộ nhập thư mà Sino vừa gửi
- **THEN** cuộc trò chuyện vẫn chỉ có một dòng cho thư đó

### Requirement: Gửi lỗi và kết quả không rõ
Provider từ chối (4xx), giới hạn tần suất, hoặc không kết nối được MUST làm thư thành `FAILED` và trả `502 SEND_FAILED` kèm `messageId`. Hết 15 giây, mất kết nối sau khi request đã đi, hoặc provider lỗi 5xx MUST làm thư thành `UNKNOWN` và trả `504 SEND_OUTCOME_UNKNOWN` kèm `messageId`; server MUST NOT tự gửi lại thư `UNKNOWN`. Lượt đồng bộ của account, và một nhịp riêng mỗi phút không phụ thuộc đồng bộ (account tạm dừng đồng bộ cũng vậy), MUST đối chiếu các thư `UNKNOWN` với provider (Gmail: trong thread của cuộc trò chuyện, thư đã gửi tới cùng người nhận, cùng phần chữ, Gmail nhận từ 1 phút trước tới 5 phút sau lúc bắt đầu gửi; Gmail không giữ `Message-ID` do Sino đặt): thấy thì `SENT`, không thấy sau 10 phút thì `FAILED`; connector không tìm được thì thư MUST giữ `UNKNOWN`. Một thư của provider đã thuộc một thư khác Sino gửi MUST NOT được nhận cho thư đang đối chiếu. Thư `PENDING` quá 5 phút MUST được đối chiếu như vậy. Provider báo hết quyền lúc gửi MUST làm thư `FAILED`, account `AUTH_EXPIRED`, và trả `409 REPLY_NOT_ALLOWED`. Thư Sino gửi mà chưa `SENT` MUST NOT đổi tóm tắt của cuộc trò chuyện (thư mới nhất, "Cần trả lời"). `reply.to` rỗng MUST trả `422 REPLY_NO_RECIPIENT`, không ghi thư và không gọi provider.

#### Scenario: Gmail không trả lời kịp
- **WHEN** lời gọi gửi hết 15 giây
- **THEN** response là `504 SEND_OUTCOME_UNKNOWN`, thư là `UNKNOWN`, và gọi lại cùng `clientMessageId` trả `409 SEND_OUTCOME_UNKNOWN`

#### Scenario: Đối chiếu thấy thư đã đi
- **WHEN** lượt đối chiếu tìm thấy trong thread trên Gmail một thư đã gửi tới cùng người nhận với cùng phần chữ, Gmail nhận ngay sau lúc Sino bắt đầu gửi thư `UNKNOWN`
- **THEN** thư thành `SENT` với ID của Gmail

#### Scenario: Cùng chữ gửi hai lần
- **WHEN** thư `UNKNOWN` A và thư B cùng chữ, B đã `SENT`, và trên Gmail chỉ có thư của B khớp
- **THEN** A vẫn `UNKNOWN` và B giữ `clientMessageId` của nó

#### Scenario: Gửi lại sau khi lỗi
- **WHEN** thư `FAILED` và web gọi lại cùng `clientMessageId`
- **THEN** server gửi lại và response là `201`

#### Scenario: Account tạm dừng đồng bộ
- **WHEN** account của một thư `UNKNOWN` đang tạm dừng đồng bộ và provider có thư đó
- **THEN** trong vòng một phút thư thành `SENT`, không cần lượt đồng bộ nào

#### Scenario: Thư trả lời bị từ chối
- **WHEN** cuộc trò chuyện đang "Cần trả lời" và thư trả lời từ Sino thành `FAILED`
- **THEN** cuộc trò chuyện vẫn "Cần trả lời" và dòng xem trước vẫn là thư đến

### Requirement: Bỏ thư gửi lỗi
`DELETE /api/conversations/{id}/messages/{messageId}` MUST xóa thư `FAILED` do Sino gửi và trả `204`; thư khác MUST trả `409 MESSAGE_NOT_DELETABLE`; không có MUST trả `404 MESSAGE_NOT_FOUND`.

#### Scenario: Bỏ một thư đã gửi
- **WHEN** web gọi `DELETE` cho thư `SENT`
- **THEN** response là `409 MESSAGE_NOT_DELETABLE`

### Requirement: Danh sách thư có `clientMessageId`
Mỗi thư của `GET /api/conversations/{id}/messages` MUST có `clientMessageId`, `null` với thư không do Sino gửi.

#### Scenario: Thư gửi từ Sino sau khi tải lại trang
- **WHEN** web đọc lại danh sách thư có một thư `FAILED` do Sino gửi
- **THEN** thư đó có `clientMessageId` để "Gửi lại" dùng đúng ID cũ
