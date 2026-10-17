## ADDED Requirements

### Requirement: Chỉ sino-api gọi được sino-zalo
Mọi endpoint của `sino-zalo` trừ `GET /health` MUST đòi `Authorization: Bearer <SINO_ZALO_SECRET>` và MUST so khóa bằng phép so thời gian hằng. Thiếu hoặc sai khóa MUST trả `401` mà không làm gì khác. Service MUST dừng ngay lúc khởi động nếu thiếu `SINO_ZALO_SECRET` hoặc khóa ngắn hơn 32 byte. `GET /health` MUST chỉ trả trạng thái và số phiên đang sống / đã chết.

#### Scenario: Sai khóa
- **WHEN** một request tới `GET /accounts/a1/messages` mang khóa sai
- **THEN** response là `401` và không có lời gọi nào tới Zalo

#### Scenario: Thiếu khóa khi khởi động
- **WHEN** `sino-zalo` khởi động mà không có `SINO_ZALO_SECRET`
- **THEN** tiến trình dừng với mã lỗi khác 0 và log nói thiếu biến nào

### Requirement: Không lưu đĩa, không ghi nội dung tin vào log
`sino-zalo` MUST NOT ghi phiên Zalo, tin nhắn hay bộ đệm xuống đĩa. Log MUST NOT chứa nội dung tin, cookie hay imei; log MAY chứa ID, loại tin, giờ và độ dài.

#### Scenario: Log khi nhận tin
- **WHEN** listener nhận tin "Mai họp lúc 9 giờ"
- **THEN** dòng log có `msgId`, `threadId`, loại tin và độ dài 17, không có chuỗi "Mai họp"

### Requirement: Đăng nhập bằng mã QR
`POST /logins` MUST bắt đầu một lần đăng nhập QR và trả `201` với `loginId`, ảnh QR (PNG base64) và `expiresAt`. `GET /logins/{loginId}` MUST trả `state` là một trong `WAITING`, `SCANNED`, `DONE`, `EXPIRED`, `DECLINED`, `FAILED`; `SCANNED` MUST kèm `displayName`. Response `DONE` đầu tiên MUST kèm `profile` (`ownId`, `displayName`, `avatarUrl`) và `session` (`cookie`, `imei`, `userAgent`); sau đó lần đăng nhập MUST bị quên và mọi lần hỏi lại MUST trả `404`. `DELETE /logins/{loginId}` MUST hủy lần đăng nhập.

#### Scenario: Quét xong
- **WHEN** người dùng quét mã và xác nhận trên điện thoại, rồi `sino-api` gọi `GET /logins/{loginId}`
- **THEN** response là `200` với `state` = `DONE`, `profile.ownId` và `session`

#### Scenario: Phiên chỉ trả một lần
- **WHEN** `sino-api` gọi lại `GET /logins/{loginId}` sau response `DONE`
- **THEN** response là `404`

#### Scenario: Mã hết hạn
- **WHEN** 100 giây trôi qua mà không ai quét
- **THEN** `state` = `EXPIRED`

### Requirement: Vòng đời phiên và listener
`sino-zalo` MUST giữ cho mỗi account dấu vân tay SHA-256 của phiên nhận qua `PUT` (chỉ trong bộ nhớ, không ra log). `PUT /accounts/{accountId}/session` với `session` MUST đăng nhập bằng cookie và bật đúng một listener cho account đó. Gọi lại với phiên cùng dấu vân tay khi phiên đang sống MUST NOT làm gì và MUST trả `204`. Gọi với phiên cùng dấu vân tay với phiên đã `ENDED` MUST trả `410 SESSION_ENDED` mà MUST NOT gọi Zalo. Gọi với phiên khác dấu vân tay MUST đăng nhập bằng phiên mới, dừng listener cũ nếu có, rồi thay phiên. Cookie bị từ chối MUST dừng listener cũ nếu có, đánh dấu phiên mới `ENDED` và trả `410 SESSION_ENDED`. Listener đóng với mã `3000` hoặc `3003` MUST đánh dấu phiên `ENDED`, dừng listener, gọi webhook ngay, và từ đó mọi request cho account đó MUST trả `410 SESSION_ENDED` cho tới `PUT session` mới. Các mã đóng khác MUST được nối lại với độ trễ tăng dần. `DELETE /accounts/{accountId}/session` MUST dừng listener, xóa phiên và bộ đệm của account khỏi bộ nhớ.

#### Scenario: Bị đá vì mở Zalo Web
- **WHEN** listener của account `a1` đóng với mã `3003`
- **THEN** webhook được gọi với `ownId` của `a1`, và `GET /accounts/a1/messages` trả `410 SESSION_ENDED`

#### Scenario: Gọi bật phiên hai lần
- **WHEN** `PUT /accounts/a1/session` được gọi khi listener của `a1` đang chạy
- **THEN** response là `204`, vẫn chỉ có một listener và không có đăng nhập mới

#### Scenario: Gửi lại phiên đã bị đá
- **WHEN** phiên của `a1` đã `ENDED` vì mã `3003` và `sino-api` gọi `PUT /accounts/a1/session` với đúng phiên đó
- **THEN** response là `410 SESSION_ENDED` và không có lời gọi nào tới Zalo

#### Scenario: Phiên mới sau khi quét lại
- **WHEN** phiên của `a1` đã `ENDED` và `sino-api` gọi `PUT /accounts/a1/session` với một phiên khác mà Zalo nhận
- **THEN** response là `204`, `a1` có đúng một listener chạy bằng phiên mới, và `GET /accounts/a1/messages` trả `200`

#### Scenario: Phiên mới khi phiên cũ còn sống
- **WHEN** listener của `a1` đang chạy và `sino-api` gọi `PUT /accounts/a1/session` với một phiên khác mà Zalo nhận
- **THEN** listener cũ dừng, chỉ còn một listener chạy bằng phiên mới, và response là `204`

#### Scenario: Account không có trong bộ nhớ
- **WHEN** `sino-zalo` vừa khởi động lại và nhận `GET /accounts/a1/messages`
- **THEN** response là `404 UNKNOWN_ACCOUNT`

### Requirement: Bộ đệm tin và cursor
Mỗi account MUST có một bộ đệm trong bộ nhớ chứa tối đa 1.000 tin và không tin nào cũ hơn 24 giờ, sắp theo `msgId` (so sánh số nguyên lớn). `GET /accounts/{accountId}/messages?after=X&limit=N` MUST trả tối đa N tin có `msgId` > X (không có `after` thì từ tin đầu bộ đệm), các cuộc trò chuyện của những tin đó, `nextCursor` = `msgId` lớn nhất đã trả (hoặc X nếu không có tin; `null` nếu không có cả `after` lẫn tin), và `hasMore`. Bộ đệm MUST giữ cả tin `isSelf`.

#### Scenario: Kéo tiếp từ cursor
- **WHEN** bộ đệm có tin `100`, `101`, `102` và `sino-api` gọi `after=100&limit=1`
- **THEN** response có đúng tin `101`, `nextCursor` = `101`, `hasMore` = true

#### Scenario: So sánh theo số, không theo chuỗi
- **WHEN** bộ đệm có tin `999` và `1000` và `sino-api` gọi `after=999`
- **THEN** response có tin `1000`

### Requirement: Bù tin lỡ ở lần kéo
Khi `GET /accounts/{accountId}/messages?after=X` tới mà phiên chưa bù từ một mốc ≤ X kể từ lúc bật, và X nhỏ hơn `msgId` nhỏ nhất trong bộ đệm hoặc bộ đệm rỗng, `sino-zalo` MUST gọi `requestOldMessages` cho tin 1-1 và cho tin nhóm, bắt đầu với `lastId` = X, rồi gọi tiếp với `lastId` = `msgId` lớn nhất của trang vừa nhận, cho tới khi gặp trang rỗng hoặc trang có tin đã nằm trong bộ đệm. Mỗi loại MUST NOT vượt 10 trang, và cả lần bù MUST NOT chờ quá 5 giây. Kết quả MUST được đưa vào bộ đệm trước khi trả lời. Dừng vì giới hạn trang hoặc thời gian mà chưa nối liền MUST ghi một log WARN có ID account, số trang và số tin, không có nội dung tin. Mỗi phiên MUST NOT bù lại từ cùng một mốc hai lần.

#### Scenario: sino-zalo khởi động lại trong lúc có tin mới
- **WHEN** phiên vừa bật lại, bộ đệm rỗng, và `sino-api` gọi `after=500`, trong khi Zalo còn giữ tin `501`, `502`
- **THEN** response có tin `501` và `502`

#### Scenario: Tin lỡ dài hơn một trang
- **WHEN** bộ đệm có tin `900` trở đi, `sino-api` gọi `after=500`, và mỗi trang `requestOldMessages` trả 2 tin: `501`–`502`, `503`–`504`, …, rồi một trang có `900`
- **THEN** `sino-zalo` đọc từng trang với `lastId` = `502`, `504`, … cho tới trang có `900`, và response có mọi tin từ `501`

#### Scenario: Bù tin chưa hết
- **WHEN** Zalo vẫn còn trang sau trang thứ 10 của một loại
- **THEN** `sino-zalo` dừng ở trang 10, trả những tin đã có, và ghi một log WARN không có nội dung tin

#### Scenario: Không bù khi bộ đệm đã đủ
- **WHEN** bộ đệm có tin từ `400` tới `600` và `sino-api` gọi `after=500`
- **THEN** `requestOldMessages` không được gọi

### Requirement: Báo có tin mới
Khi có tin mới vào bộ đệm, `sino-zalo` MUST gọi `POST <SINO_API>/api/webhooks/zalo` với `{ "ownId": ... }` và khóa bí mật, gom các tin của cùng account trong 0,5 giây thành một lần gọi. Webhook lỗi MUST NOT làm mất tin trong bộ đệm.

#### Scenario: Ba tin liền nhau
- **WHEN** account nhận ba tin trong 0,3 giây
- **THEN** webhook được gọi đúng một lần cho account đó

### Requirement: Gửi tin chữ, không gửi trùng, có giới hạn tốc độ
`POST /accounts/{accountId}/messages` với `threadId`, `threadType`, `text`, `clientMessageId` MUST gửi tin chữ qua zca-js và trả `201 { msgId, sentAt }`. `sino-zalo` MUST ghi `msgId` theo `clientMessageId` ngay khi zca-js trả, trước khi trả `201`, kể cả khi đã trả `504` vì hết giờ. Cùng `clientMessageId` trong 24 giờ MUST trả `200` với kết quả cũ, kể cả khi phiên đã `ENDED`, và MUST NOT gửi lại; khi lần gửi trước chưa rõ kết quả (đang chờ Zalo hoặc hỏng giữa chừng), MUST trả `504 OUTCOME_UNKNOWN` và MUST NOT gửi lại. Mỗi account MUST gửi tối đa 1 tin mỗi giây; vượt MUST trả `429 RATE_LIMITED` mà không gửi. Zalo từ chối MUST trả `422 REJECTED`, và `clientMessageId` đó MAY được gửi lại vì chưa có gì đi; không rõ kết quả (hết giờ) MUST trả `504 OUTCOME_UNKNOWN`.

#### Scenario: Gửi lại cùng clientMessageId
- **WHEN** `sino-api` gửi hai request cùng `clientMessageId` và request đầu đã gửi xong
- **THEN** request thứ hai nhận `200` với cùng `msgId` và zca-js chỉ gửi một lần

#### Scenario: Gửi quá nhanh
- **WHEN** hai tin của cùng account được gửi cách nhau 0,2 giây
- **THEN** tin thứ hai nhận `429 RATE_LIMITED`

#### Scenario: Gửi lại một lần gửi chưa rõ kết quả
- **WHEN** lần gửi đầu đã nhận `504 OUTCOME_UNKNOWN` vì Zalo chưa trả lời, và `sino-api` gửi lại cùng `clientMessageId`
- **THEN** response là `504 OUTCOME_UNKNOWN` và zca-js không gửi lần hai

### Requirement: Tra tin đã gửi
`POST /accounts/{accountId}/sent/lookup` với `threadId`, `clientMessageId`, `text`, `after` MUST trả `msgIds`: trước hết `msgId` đã nhớ của `clientMessageId`, sau đó các tin `isSelf` trong bộ đệm của thread đó có `sentAt` sau `after` và cùng `text`. Khi phiên được bật sau `after`, khi `after` cũ hơn 24 giờ, hoặc khi lần gửi của `clientMessageId` chưa rõ kết quả, mà không tìm thấy gì, MUST trả `409 CANNOT_TELL` thay vì danh sách rỗng. Account không có trong bộ nhớ MUST trả `404 UNKNOWN_ACCOUNT`; phiên `ENDED` MUST trả `410 SESSION_ENDED`.

#### Scenario: Tin đã đi nhưng sino-api hết giờ chờ
- **WHEN** zca-js gửi xong nhưng `sino-api` không nhận được trả lời, rồi `sino-api` tra với cùng `clientMessageId`
- **THEN** response có `msgId` của tin đó

#### Scenario: Không thể biết
- **WHEN** `sino-zalo` khởi động lại sau `after` và không có gì khớp
- **THEN** response là `409 CANNOT_TELL`
