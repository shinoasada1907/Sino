# Phase 2 · F04b — Đọc thư Gmail · Technical Design

> Mode: **HYBRID** — backend AUTO (agent làm từng task, kiểm chứng, báo lại rồi dừng); quyết định kiến trúc do người dùng chốt. Thiết kế được người dùng duyệt từng phần trong buổi brainstorm 2026-10-09 (phạm vi, cách kiểm thật, khoảng nhập, cursor hết hạn, HTML, cách lấy token; rồi 5 phần thiết kế).
> Convention chung ở `openspec/specs/` (`provider-contract`, `account-credentials`, `connected-accounts`) và design của F02/F03/F04a.

## Context

- Hiện trạng (2026-10-09): F04a xong BE-30…BE-34 và FE-30; kết nối, kết nối lại, xóa đã chạy với Gmail thật (BE-34). Account Gmail có credential mã hóa gồm access token (sống khoảng 1 giờ), refresh token, hạn, scope. Scope Google ghi lại khi kết nối: `gmail.readonly`, `https://www.googleapis.com/auth/userinfo.email`, `openid`.
- Connector Gmail (`provider/infrastructure/gmail/GmailProvider`) có `getAccountProfile` (userinfo, `sub`), capability `{}`, `fetchUpdates` báo `CAPABILITY_NOT_SUPPORTED`.
- Contract F03: `fetchUpdates(context, cursor)` trả `SyncBatch` (conversation, message, item bị bỏ qua, `nextCursor`, `hasMore`); kiểu chuẩn hóa `NormalizedConversation`, `NormalizedMessage`, `NormalizedParticipant`, `NormalizedAttachment` tự kiểm dữ liệu; `ProviderException` với mã có cờ retryable.
- D-15 = A' (F04a): module `account` giữ token và tự refresh; module khác xin access token còn hạn từ `account`; SPI không có `refresh`.
- `OAuth2Clients` (F04a) đã dựng token client của Spring (`RestClientAuthorizationCodeTokenResponseClient`) trên `RestClient` có timeout 5 s/10 s; `ClientRegistration` `google` có sẵn khi Gmail bật.
- Module `account` chỉ cho module khác dùng gói gốc `dev.sino.account` (event, `AccountStatus`); domain có `markAuthExpired()` (`CONNECTED`/`DEGRADED`/`ERROR` → `AUTH_EXPIRED`).
- Web: màn Hộp thư (`fe-ui-inbox`) cần `subject`, `snippet`, chữ thuần (D-53), số chưa đọc, chiều đi/đến, `hasAttachments`; luồng kết nối (`fe-ui-connect`, D-49) đề xuất bước "Đồng bộ": khoảng 30 / 90 (mặc định) / toàn bộ, ước tính, `startInitialSync`.

## Goals / Non-Goals

**Goals:**
- Connector Gmail đọc được thư thật qua contract F03 (lần đầu theo mốc thời gian, sau đó theo dõi thay đổi), chuẩn hóa đủ cho Hộp thư (F05).
- Module khác gọi connector mà không bao giờ thấy token; token được refresh ở một chỗ; account hết quyền chuyển `AUTH_EXPIRED`.
- Không token, nội dung thư hay body lỗi của Google nào lọt ra log, event, thông báo lỗi.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-57 — Phạm vi F04b: connector + token · **Accepted: A** (người dùng, 2026-10-09)
F04b gồm refresh token (D-15) và connector Gmail đọc thư + chuẩn hóa; khoảng nhập 30/90/toàn bộ của canvas trở thành tham số của lần đọc đầu (D-59). API `startInitialSync` / `syncEstimate`, lưu thư và tiến độ: **F05**; bước Đồng bộ của web giữ dữ liệu mẫu tới F05. **Phương án bị loại:** B. thêm `syncEstimate` + `startInitialSync` lưu lựa chọn vào account ngay (thêm migration + API khi chưa có nơi dùng); C. gộp với phần nhập thư của F05 (ngược D-37).

### D-58 — Kiểm Gmail thật bằng test có tag · **Accepted: A** (người dùng, 2026-10-09)
Một test JUnit `@Tag("real-gmail")`, không chạy trong `./mvnw verify` (Surefire loại tag này), người dùng chạy tay với profile `local` và một account Gmail đã kết nối: đọc trang đầu qua `ProviderAccess`, kiểm chuẩn hóa, **chỉ in số đếm**. Code sản phẩm không thêm gì. **LÝ DO:** bài học D-51 (WireMock chỉ đúng tới mức hiểu biết của người viết; Google thật trả `userinfo.email`). **Phương án bị loại:** B. endpoint chỉ cho dev (code bỏ đi ở F05); C. để tới F05 (phần thật của F04b NOT VERIFIED).

### D-59 — Cursor đầu mang mốc thời gian · **Accepted: A** (người dùng, 2026-10-09)
`SyncCursor` có thêm `since` (`Instant`, tùy chọn): `SyncCursor.initial(Instant since)`; `initial()` = `initial(null)` = toàn bộ. `since` chỉ có ở cursor khởi tạo; cursor tiếp theo là chuỗi riêng của connector. Bên gọi (F05) đổi lựa chọn 30/90/toàn bộ thành mốc ngày; contract không biết con số 30 hay 90. **Phương án bị loại:** B. method SPI riêng cho lần đầu (hai đường vào, connector nào cũng phải làm cả hai); C. cố định 90 ngày trong connector (lựa chọn của canvas vô dụng).

### D-60 — Mã lỗi `CURSOR_EXPIRED` · **Accepted: A** (người dùng, 2026-10-09)
`ProviderErrorCode.CURSOR_EXPIRED`, không retryable: cursor không còn dùng được (Gmail: `historyId` quá cũ); bên gọi đọc lại bằng `SyncCursor.initial(since)` với mốc nó chọn. **Phương án bị loại:** B. connector tự đọc lại từ đầu (không biết mốc, có thể kéo cả hộp thư; bên gọi không biết để báo người dùng); C. dùng `REQUEST_REJECTED` (không phân biệt được).

### D-61 — jsoup lấy chữ từ thư chỉ có HTML · **Accepted: A** (người dùng, 2026-10-09)
Dependency runtime `org.jsoup:jsoup`; chỉ dùng để lấy chữ (bỏ `script`/`style`, giải mã entity, giữ xuống dòng hợp lý); không lưu HTML (F06). **Phương án bị loại:** B. tự bỏ thẻ bằng regex (dễ sai với HTML thật); C. để `textContent` trống tới F06 (Hộp thư mất đoạn trích của thư quảng cáo/thông báo).

### D-62 — `ProviderAccess`: gọi connector qua `account` · **Accepted: B** (người dùng, 2026-10-09)

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `contextFor(accountId)` trả `ProviderContext` còn hạn | Đơn giản | Token còn hạn mà Google vẫn trả 401 (thu hồi, đổi mật khẩu) thì bên gọi phải tự refresh và thử lại; F05/F07 lặp lại logic |
| **B. `call(accountId, (connector, context) -> …)`** (chọn) | Mọi chuyện token ở một chỗ; module khác không thấy token; đúng D-15 A' | Hàm nhận lambda, khó đọc hơn một chút với người mới |
| C. Mỗi module tự refresh bằng `TokenRefresher` chung | Linh hoạt | Token ra khỏi `account`, trái D-15 A' |

### Chốt kỹ thuật (agent, trong phạm vi trên)
- Trang 50 thư mỗi lần `fetchUpdates`; gọi Gmail lần lượt (chưa song song; tối ưu sau nếu chậm).
- Chữ cắt ở 100 000 ký tự.
- Bỏ thư nháp (`DRAFT`), Spam, Trash; thư đã lưu trữ (không có `INBOX`) vẫn lấy vì thuộc thread.
- `replyToExternalMessageId` = `null` (thứ tự trong thread đủ cho Hộp thư).
- Không khóa riêng theo account khi refresh (YAGNI); xung đột phiên bản khi lưu thì nạp lại credential.
- `ProviderAccess` không chặn account `DISABLED`; F07 quyết đồng bộ hay không.
- Tiêu đề conversation bỏ tiền tố `Re:`, `RE:`, `Fwd:`, `FW:`, `TL:` (tiếng Việt), lặp nhiều lần.

## Backend design

### 1. Contract
- `SyncCursor(String value, Instant since)`: `value == null` là cursor khởi tạo; `since` chỉ được có khi `value == null`; `initial()` = `initial(null)`; `isInitial()` giữ nguyên.
- `ProviderErrorCode.CURSOR_EXPIRED(false)`.
- Contract test kit (F03): thêm kiểm "cursor khởi tạo có `since` thì không trả item cũ hơn `since`"; `FakeMessageProvider` tôn trọng `since` theo `sentAt`/`lastActivityAt`.
- Gmail: capability `READ_MESSAGES`, `THREADS`, `ATTACHMENTS` (nghĩa theo bảng của F03). Kit chạy đủ phần sync cho Gmail.

### 2. `ProviderAccess` (module `account`)

```java
package dev.sino.account;
public interface ProviderAccess {
    <T> T call(UUID accountId, ProviderCall<T> call);
}
@FunctionalInterface
public interface ProviderCall<T> {
    T apply(MessageProvider connector, ProviderContext context);
}
```

```text
account đã xóa / không có        -> SinoException ACCOUNT_NOT_FOUND
connector không còn              -> SinoException UNKNOWN_PROVIDER
account AUTH_EXPIRED             -> ProviderException(AUTH_EXPIRED), không gọi provider
nạp credential + refresh token (giải mã)
OAuth2, còn < 60 giây            -> refresh trước
gọi connector với ProviderContext(accountId, externalAccountId, credential)
connector ném AUTH_EXPIRED       -> refresh MỘT lần rồi gọi lại
  lần hai vẫn AUTH_EXPIRED       -> hết quyền (dưới)
```

- **Refresh** (`OAuth2Clients.refresh`): `RestClientRefreshTokenTokenResponseClient` của Spring, cùng `ClientRegistration` và cách dựng `RestClient` có timeout như `exchange`. Lời gọi Google ngoài transaction; lưu credential mới trong transaction (`CredentialStore.save`). Google không gửi refresh token mới → giữ cũ; không gửi `scope` → giữ scope cũ; thiếu `expires_in` → Spring đặt hạn 1 giây (đã biết từ BE-32), lần sau sẽ refresh.
- **Hết quyền:** Google trả `invalid_grant`, hoặc connector vẫn báo `AUTH_EXPIRED` sau khi refresh, hoặc credential không thể refresh (không phải OAuth2 / không có refresh token): trong transaction `markAuthExpired()` + `AccountStatusChanged`; rồi ném `ProviderException(AUTH_EXPIRED)`.
- **Lỗi tạm thời khi refresh** (mạng, quá thời gian, `5xx`): `ProviderException(PROVIDER_UNAVAILABLE)`, trạng thái account không đổi.
- **Xung đột khi lưu** (`@Version` của credential, hai lời gọi cùng refresh): nạp lại credential vừa được lưu và dùng tiếp.
- Log: account id, provider, loại lỗi; không token. Event không mang token.
- Cài đặt ở `account/application`, bean duy nhất cài `ProviderAccess`.

### 3. Gmail đọc thư

```text
Lần đầu  SyncCursor.initial(since)
  users.getProfile                 -> emailAddress (nhận "mình"), historyId lúc bắt đầu
  messages.list q=after:<since giây>, maxResults=50, pageToken
  messages.get format=full từng thư -> chuẩn hóa
  cursor: v1|list|<historyId lúc bắt đầu>|<since giây hoặc ->|<pageToken>
  hết trang -> cursor v1|history|<historyId lúc bắt đầu>   hasMore=false

Theo dõi thay đổi  cursor v1|history|<historyId>
  users.getProfile                 -> emailAddress
  history.list startHistoryId, historyTypes=messageAdded,labelAdded,labelRemoved, pageToken
  messages.get format=full cho các thư có thay đổi (mỗi id một lần)
  cursor: v1|history|<historyId>|<pageToken> khi còn trang; hết trang -> v1|history|<historyId mới>
  404 -> CURSOR_EXPIRED
```

- `messages.list` không lấy Spam/Trash theo mặc định; thư có nhãn `DRAFT`, `SPAM`, `TRASH` (từ `history.list`) bị bỏ, không coi là lỗi.
- `messages.get` trả 404 (thư bị xóa giữa chừng): bỏ thư đó, không coi là lỗi.
- Thư bị xóa ở Gmail: contract chưa có khái niệm xóa — F07.
- Một thư có thể bị trả lại nhiều lần (ví dụ thư đến trong lúc đang nhập lần đầu); bên lưu (F05) upsert theo external ID.

### Chuẩn hóa

| Kiểu Sino | Từ Gmail |
|---|---|
| `NormalizedConversation` | `threadId`; `THREAD`; tiêu đề = Subject của thư mới nhất trong batch đã bỏ tiền tố trả lời/chuyển tiếp; người tham gia = các địa chỉ From/To/Cc (email viết thường làm ID, tên hiển thị từ header, `self` khi trùng `emailAddress`); `lastActivityAt` = `internalDate` lớn nhất trong batch |
| `NormalizedMessage` | `id`; `threadId`; người gửi = địa chỉ From; chiều = `SENT` → đi, còn lại → đến; trạng thái = `SENT` với thư đi, `UNKNOWN` với thư đến; đã đọc = không có `UNREAD`; `sentAt` = `internalDate`; loại = `TEXT`, có tệp → `MIXED` |
| Nội dung chữ | duyệt cây MIME (cả `multipart/*` lồng nhau); phần `text/plain` đầu tiên không phải tệp đính kèm; không có thì `text/html` đầu tiên qua jsoup; giải mã base64url rồi theo `charset` (không rõ → UTF-8); cắt 100 000 ký tự |
| `NormalizedAttachment` | phần có tên tệp và `body.attachmentId`: `attachmentId`, tên, `mimeType`, `size` |
| Metadata | `subject` (Subject gốc), `rfcMessageId` (header `Message-ID`, cho F10 trả lời đúng chuỗi) |

- Header mã hóa RFC 2047 (`=?UTF-8?B?…?=`): nếu Gmail trả dạng chưa giải mã thì connector giải mã; test Gmail thật (D-58) kiểm điều này.
- Thư thiếu From hoặc thiếu `internalDate` → vào danh sách bỏ qua (`SkippedItem`, external ID + lý do), các thư khác đi tiếp.

### 4. Lỗi

| Gmail trả | Mã Sino |
|---|---|
| `401` | `AUTH_EXPIRED` (`ProviderAccess` refresh một lần) |
| `429`; `403` với lý do `rateLimitExceeded` / `userRateLimitExceeded` | `RATE_LIMITED` (kèm `Retry-After` nếu có) |
| `403` khác | `REQUEST_REJECTED` |
| `404` ở `history.list` | `CURSOR_EXPIRED` |
| `404` ở `messages.get` | bỏ thư, không lỗi |
| `5xx`, quá thời gian, không kết nối được | `PROVIDER_UNAVAILABLE` |
| JSON hỏng ở mức trang | `PAYLOAD_NORMALIZATION_FAILED` |
| một thư chuẩn hóa hỏng | `SkippedItem` |

- Lý do của `403` đọc từ body lỗi JSON (`error.errors[].reason` hoặc `error.status`); body chỉ dùng để phân loại, không vào thông báo lỗi hay log.
- Lỗi giữa trang (mạng, `5xx`, hạn mức): cả lần `fetchUpdates` thất bại, không trả nửa batch; bên gọi thử lại với cùng cursor.

## Testing

- **Contract:** `SyncCursor` (`initial()` = `initial(null)`; `since` chỉ ở cursor khởi tạo); `CURSOR_EXPIRED` không retryable; kit: cursor khởi tạo có `since` không trả item cũ hơn.
- **Chuẩn hóa MIME (đơn vị):** JSON tự dựng theo dạng Gmail API (không dùng thư thật): `multipart/alternative`, chỉ HTML (không còn script/style, entity giải mã), multipart lồng + tệp + ảnh nhúng, charset khác UTF-8, base64url, Subject có tiền tố, RFC 2047, `self`, nhãn → chiều và đã đọc, cắt 100 000 ký tự, thiếu From → bỏ qua.
- **`fetchUpdates` (WireMock):** lần đầu đúng `q=after:`, phân trang, chuyển sang theo dõi thay đổi; thay đổi (thư mới, nhãn); `404` history → `CURSOR_EXPIRED`; thư biến mất → bỏ qua; `403` hạn mức → `RATE_LIMITED`; `429` + `Retry-After`; lỗi giữa trang không trả nửa batch; không có nháp/Spam/Trash; kit F03 chạy phần sync.
- **`ProviderAccess` (DB thật + WireMock token endpoint):** còn hạn → không refresh; sắp hết hạn → refresh, lưu, giữ refresh token cũ; `401` → refresh + gọi lại một lần; `401` lần hai → `AUTH_EXPIRED`; `invalid_grant` → `AUTH_EXPIRED` + event không token; refresh `5xx` → `PROVIDER_UNAVAILABLE`, trạng thái giữ; account đã xóa → `ACCOUNT_NOT_FOUND`; account `AUTH_EXPIRED` → không gọi provider; xung đột khi lưu; log không token.
- **Gmail thật (D-58):** `@Tag("real-gmail")`, chạy tay: `./mvnw test -Dgroups=real-gmail -Dspring.profiles.active=local` (lệnh chốt ở BE-39), đọc trang đầu 7 ngày gần nhất; kiểm không lỗi, phần lớn thư có chữ, Subject không còn `=?`, đếm bỏ qua; in số đếm.
- `ModularityTests`: module khác chỉ dùng `ProviderAccess` ở gói gốc của `account`.
- Mỗi task: test đỏ trước, kiểm tra ngược bằng script, `./mvnw -B -ntp verify`, quét log tìm token.

## Risks / Trade-offs

- [Header Gmail có thể chưa giải mã RFC 2047] → connector giải mã nếu cần; test thật kiểm.
- [Thư lớn, MIME lạ (S/MIME, TNEF, calendar)] → không chuẩn hóa được thì vào danh sách bỏ qua, không làm hỏng batch; chữ cắt 100 000 ký tự.
- [Hạn mức Gmail API: khoảng 250 đơn vị/giây/người dùng; `messages.get` 5 đơn vị] → trang 50 thư gọi lần lượt nằm dưới hạn mức; vượt thì `RATE_LIMITED`.
- [Testing mode: refresh token sống 7 ngày] → `invalid_grant` → `AUTH_EXPIRED` → người dùng kết nối lại (luồng F04a).
- [Thứ tự archive] → `f04a-gmail-connect` archive trước; delta `provider-contract` ở đây viết trên bản của F04a. Nếu thứ tự đổi, sửa delta trước khi archive.
- [Gọi lần lượt có thể chậm (khoảng 50 lời gọi mỗi trang)] → chấp nhận ở F04b; F07 cân nhắc song song (virtual thread) hoặc batch API của Gmail.

## Migration Plan

- Không migration database.
- Người dùng kết nối lại một Gmail trên máy local để chạy test thật (BE-39).

## Open Questions

- Dùng `snippet` do Gmail tạo sẵn hay tự cắt từ `textContent` cho Hộp thư: F05 chốt (F04b có đủ `textContent`).
- Cách F05 kích hoạt lần nhập đầu và lưu lựa chọn khoảng nhập (`startInitialSync`): F05.

## Definition of Done — F04b

- [ ] Các scenario của `provider-access`, `gmail-reading` và delta `provider-contract` có test và xanh.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` xanh; kiểm tra ngược từng task.
- [ ] Test Gmail thật (D-58) chạy với account thật, có số đếm; hoặc ghi rõ NOT VERIFIED và lý do.
- [ ] README (chạy test Gmail thật), file kiến thức Phase 2 (`.md` + `.docx`).
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; change archive (sau `f04a-gmail-connect`).
