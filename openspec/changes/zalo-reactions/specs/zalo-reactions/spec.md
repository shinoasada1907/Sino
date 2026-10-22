## ADDED Requirements

### Requirement: Biểu cảm của Zalo vào hàng chờ của tài khoản
`sino-zalo` MUST đưa mỗi sự kiện biểu cảm mà phiên của một tài khoản nhận được (người khác thả, hay chính tài khoản thả từ thiết bị khác) vào cùng hàng chờ với tin nhắn của tài khoản đó, thành một mục có `zaloType` là `reaction`, `msgId` của sự kiện, người thả (`fromId`, `fromName`, `isSelf`), lúc thả, mã biểu tượng (rỗng khi gỡ) và danh sách tin đích (`msgId`, `cliMsgId`). Mục biểu cảm MUST được đọc qua `GET /accounts/:accountId/messages?after=` và báo qua webhook như tin nhắn. Khi phiên nối lại, phần đọc bù MUST lấy cả biểu cảm bị lỡ. Log MUST NOT chứa mã biểu tượng hay tên người thả.

#### Scenario: Người khác thả tim
- **WHEN** bạn chat thả ❤️ lên một tin trong chat đôi trong lúc phiên đang chạy
- **THEN** `GET /accounts/:accountId/messages?after=<msgId trước đó>` trả một mục `zaloType` `reaction` với `icon` `/-heart`, `isSelf` false và đích là `msgId` của tin đó

#### Scenario: Gỡ biểu cảm
- **WHEN** người thả gỡ biểu cảm của mình
- **THEN** hàng chờ có một mục `reaction` mới cho cùng tin đích với `icon` rỗng

#### Scenario: Biểu cảm bị lỡ khi mất kết nối
- **WHEN** một biểu cảm được thả trong lúc phiên mất kết nối, rồi phiên nối lại
- **THEN** sau phần đọc bù, hàng chờ có mục biểu cảm đó

### Requirement: Tin mang `cliMsgId`
Mọi tin `sino-zalo` đưa vào hàng chờ MUST mang `cliMsgId` khi Zalo cho giá trị đó.

#### Scenario: Tin chữ nhận về
- **WHEN** một tin chữ tới
- **THEN** mục của nó trong hàng chờ có `cliMsgId` khác rỗng

### Requirement: Thả, đổi, gỡ biểu cảm qua Zalo
`POST /accounts/:accountId/reactions` với `threadId`, `threadType`, `msgId`, `cliMsgId` và `icon` MUST thả (hoặc đổi sang) biểu cảm `icon` lên tin đó qua Zalo, và `icon` rỗng MUST gỡ biểu cảm của tài khoản. `icon` không thuộc bộ mã của Zalo MUST bị từ chối với `400` mà không gọi Zalo. Route MUST dùng chung giới hạn nhịp của tài khoản với việc gửi tin và MUST trả các mã lỗi như route gửi tin (`410` khi phiên đã hết, `422` khi Zalo từ chối, `429` khi quá nhịp).

#### Scenario: Thả tim lên một tin
- **WHEN** `sino-api` gọi route với `icon` `/-heart` cho một tin của chat đôi
- **THEN** Zalo nhận biểu cảm, điện thoại của người kia thấy ❤️ trên tin đó, và route trả thành công

#### Scenario: Mã lạ
- **WHEN** `sino-api` gọi route với `icon` `:not-a-zalo-code`
- **THEN** route trả `400` và Zalo không nhận yêu cầu nào

#### Scenario: Phiên đã hết
- **WHEN** tài khoản không còn phiên
- **THEN** route trả `410`
