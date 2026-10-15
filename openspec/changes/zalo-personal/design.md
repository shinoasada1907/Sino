# Phase 5 · F09 — Zalo cá nhân (zca-js) · Technical Design

> Mode: ~~**HYBRID**, change này **TRAINING**: người dùng code toàn bộ~~ ZL-01 **TRAINING** (người dùng gõ; "Toàn bộ", 2026-10-14; `project-mode.yaml` `zalo-personal`, `new_features: TRAINING`), Claude lên kế hoạch, hướng dẫn theo D-287. **Từ ZL-02: AUTO** (người dùng, 2026-10-15: "chuyển sang mode AUTO tiếp tục phần tích hợp zalo"; `zalo-personal: AUTO`): Claude làm, kiểm chứng, viết tài liệu, commit từng task.
> Thiết kế duyệt trong chat ngày 2026-10-14, theo 5 phần: tổng thể, kết nối QR, nhận tin, trả lời và lỗi, test và thứ tự task. Mỗi phần người dùng trả lời "oke". Quyết định do người dùng chốt ghi **Người dùng chốt**. Chi tiết agent thêm khi viết hồ sơ ghi **Agent chốt khi viết hồ sơ, cần xem lại**.
> Review đối chiếu với code ngày 2026-10-14 (session sino-api-dc) tìm ra một lỗi ở luồng quét lại và vài chỗ hở; người dùng: "làm đi". Phần sửa ghi **Agent chốt theo ủy quyền, cần xem lại**, và chỗ đổi trong quyết định cũ ghi "Đã sửa sau review" kèm **LÝ DO**.
> Số quyết định: D-270…D-290. Mã task: ZL-00…ZL-13 (ZL-00 gộp vào ZL-13 theo người dùng, D-270).
> Nguồn: zca-js 2.2.0 (README, `src/apis/listen.ts`, `loginQR.ts`, `getGroupChatHistory.ts`, `sendMessage.d.ts`), issue zca-js #331 và #344 (mã `3003`), spike `spikes/zalo-zca/` (2026-10-14), contract F03 (`MessageProvider`), F07 (`PushWatches`, `PushNotices`, `LiveSyncSchedule`), F10 (`ReplyService`, D-131…D-138).

## Context

- **zca-js:** thư viện **không chính thức**, chạy trên Node/Bun, giấy phép MIT. Bản v2.2.0 ra ngày 2026-09-09; repo còn được push tới 2026-10-13. Nó giả làm Zalo Web. README ghi: *"Using this API could get your account locked or banned"*. Mỗi tài khoản chỉ có **một** kết nối web; mã đóng `3000` là `DuplicateConnection`, `3003` là `KickConnection`.
- **Contract F03:** `MessageProvider` có `fetchUpdates(context, cursor)` (kéo theo cursor), `registerPush(context)` trả `PushRegistration(address, expiresAt)`, `sendMessage`, `findSentMessages(context, command, startedAt)`, và `oauth2()` là cách kết nối duy nhất hiện có. `ProviderCredentials` là sealed, gồm `OAuth2Credentials` và `TokenCredentials(token)`.
- **F07:**
  - `PushWatches.renewDueWatches` chạy mỗi giờ, lần đầu một phút sau khi khởi động. Nó gọi `registerPush` cho account đã nhập xong mà chưa có watch, watch đang lỗi, hoặc watch hết hạn trong vòng 2 ngày.
  - Webhook phát `ProviderPushReceived(provider, address)`, `PushNotices` tìm account theo address rồi chạy đồng bộ.
  - Có watch thì cứ 5 phút đồng bộ dự phòng một lần.
- **F02:**
  - Use case `register` tạo account hoặc kết nối lại theo `(owner, provider, externalAccountId)`.
  - `ProviderAccessService` đổi `AUTH_EXPIRED` từ provider thành trạng thái account "Cần đăng nhập lại".
  - Khi xóa account, chỉ token OAuth2 được thu hồi (`OAuth2TokenRevoker`).
- **Web:**
  - Hộp thoại kết nối (D-50) có `connectable`, nhưng hiện web tự gán `true` cho mọi provider vì backend chưa trả trường này (`accounts.api.ts`).
  - Zalo đang hiện "Sắp có".
- **Ràng buộc trong `openspec/config.yaml`:** không thêm microservice nếu không có yêu cầu thật. Xem mục Conflict.

### Kết quả spike (2026-10-14, nick Zalo phụ của người dùng)

| Câu hỏi | Kết quả |
|---|---|
| Đăng nhập QR | được: quét lúc 03:08:36, có phiên lúc 03:08:40 (10 cookie) |
| Dùng lại phiên, không quét lại | được, sau 10 giây và sau 3 phút |
| Listener khi người dùng mở chat.zalo.me cùng nick | bị đá sau 45 giây: `3003 KICKOUT_BY_WORKER`, thư viện nối lại rồi bị đóng `1006`, **phiên bị hủy** (đăng nhập bằng cookie bị từ chối) |
| Listener khi chỉ dùng app trên điện thoại | sống đủ 20 phút; nhận 2 tin nhóm (ảnh `chat.photo`, chữ `webchat` 65 ký tự), mỗi tin đến sau khoảng 0,2 giây |
| `requestOldMessages(type, lastId)` | chỉ trả tin **sau** `lastId`; khi `lastId` = null thì trả 2 tin gần đây của buổi trước. Không lấy được lịch sử cũ |
| `getGroupChatHistory` | `404` với zca-js 2.2.0 |
| Tin 1-1, tin tự gửi từ điện thoại, gửi tin, tuổi thọ phiên, Zalo PC | **chưa đo** → ~~ZL-00~~ ZL-13 (D-270) |

## Goals / Non-Goals

**Goals:**
- Tin Zalo cá nhân (1-1 và nhóm) vào Hộp thư chung trong vài giây, và trả lời được bằng chữ.
- Phiên Zalo lưu an toàn như token Gmail.
- Bị đá hay hết phiên thì người dùng thấy ngay và quét lại được.
- Lõi Sino (`sync`, `conversation`) không phải đổi gì.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Conflict

**`openspec/config.yaml` không cho thêm microservice nếu không có yêu cầu thật, nhưng D-273 thêm service `sino-zalo`.**
- Nguồn: `openspec/config.yaml` (context) và Notion 04A.
- Cách giải quyết: yêu cầu thật là zca-js chỉ chạy trên Node; viết lại nó bằng Java bị loại ở D-273.
- Phạm vi giới hạn ở **một** service nhỏ, không có database riêng, không có message broker, chỉ nói chuyện với `sino-api` qua HTTP. Dữ liệu và trạng thái nghiệp vụ vẫn nằm ở `sino-api` và PostgreSQL.

## Decisions

### D-270 — Zalo cá nhân qua zca-js; ~~có cổng đi/không đi ZL-00~~ đo gộp vào nghiệm thu ZL-13 · **Người dùng chốt** (2026-10-14)
Provider thứ hai (F09) là Zalo cá nhân, đi qua thư viện không chính thức zca-js.
~~Trước khi code từ ZL-03 trở đi, ZL-00 đo bằng script spike. Nếu listener bị đá khi người dùng không mở Web/PC, hoặc không bù được tin lỡ, thì **dừng**; khi đó Decision Needed DN-1 do người dùng quyết.~~
**Đã sửa (người dùng, 2026-10-14, sau review):** không có cổng đo trước khi code. Code từ ZL-01 tới ZL-12 liền một mạch. Các phép đo của ZL-00 làm cùng lúc với lần chạy thật ở ZL-13, bằng `sino-zalo` thật (hoặc script spike khi cần). **LÝ DO:** người dùng: "không cần đầu khi nào làm rồi work 1 thể vì login được rồi mà". Spike đã chứng minh đăng nhập QR, dùng lại phiên và nhận tin chạy được. Phần còn chưa đo được thiết kế để vẫn chạy được trước khi đo:
- tên `zaloType` sai thì tin rơi vào hàng "loại khác" của D-279, không mất tin;
- độ dài trang bù tin không cần biết trước, vì bù tin đọc tới khi nối liền (D-278);
- quét lại khi phiên cũ còn sống được D-289 xử lý dù Zalo có đá phiên cũ hay không.

**Rủi ro người dùng chấp nhận:** nếu ZL-13 thấy listener bị đá cả khi chỉ dùng điện thoại, hoặc Zalo giữ tin quá ngắn để bù (DN-1), thì phần đã code có thể phải bỏ hoặc sửa nhiều.

**Phương án bị loại:**
- Zalo Official Account: chỉ dành cho doanh nghiệp, không đọc được hộp thư cá nhân.
- Telegram trước: roadmap để ngỏ, nhưng người dùng muốn Zalo (2026-10-07, 2026-10-14).
- ~~Code ngay, không đo trước: nếu Zalo đá liên tục thì mất công cả change.~~ (Thành phương án được chọn, xem "Đã sửa" ở trên.)
- Giữ ZL-00 làm cổng: thêm 24 giờ đến vài ngày đo trước khi code, trong khi phần quan trọng nhất (đăng nhập, nhận tin) đã chạy được.

### D-271 — Phạm vi bản đầu: đọc + trả lời chữ · **Người dùng chốt**
Gồm tin mới 1-1 và nhóm vào Hộp thư, mở ra đọc, trả lời bằng chữ thuần (ngang Gmail ở F10). Ảnh, sticker, tệp, giọng nói hiện chữ thay thế.
**Phương án bị loại:** chỉ đọc (người dùng muốn trả lời được); đọc + trả lời + ảnh/tệp (nhiều việc hơn khoảng một phần ba, để sau).

### D-272 — Mọi người dùng kết nối được, có cảnh báo và đồng ý; có công tắc tắt · **Người dùng chốt**
- **Cảnh báo:** trước khi hiện QR, web hiện cảnh báo rủi ro (DN-2 chốt chữ). Phải tick "Tôi hiểu rủi ro" thì mới có nút "Hiện mã QR". Server cũng đòi `acceptRisk: true`, để không client nào bỏ qua được.
- **Công tắc** `sino.zalo.enabled` (biến `SINO_ZALO_ENABLED`, mặc định `false`): khi tắt thì Zalo không kết nối được (`connectable: false`) và `sino-api` không gọi `sino-zalo` (D-286).

**Phương án bị loại:** chỉ owner (người dùng chọn mở cho mọi người); không cảnh báo (người dùng không biết nick có thể bị khóa).

### D-273 — Service Node riêng `apps/sino-zalo` · **Người dùng chốt**

```text
 sino-web (React)            sino-api (Java, Spring)                  sino-zalo (Node, TS)           Zalo
 ----------------            -----------------------                  --------------------           ----
 Hộp thoại kết nối  ──────►  Kết nối QR  ──── HTTP nội bộ ──────────► Đăng nhập QR (zca-js) ◄──────► máy chủ
  (cảnh báo + QR)            lưu phiên mã hóa (TokenCredentials)       giữ phiên trong RAM            Zalo
                                                                       listener (websocket) ◄──────── tin mới
 Hộp thư  ◄── SSE ─────────  sync ─► ZaloProvider.fetchUpdates ──────► bộ đệm tin theo account
                             ▲ /api/webhooks/zalo  ◄──── "có tin mới" ─┘
 Ô trả lời ─────────────────► ReplyService ─► ZaloProvider.sendMessage ► sendMessage ──────────────► gửi
```

`sino-zalo` có 5 việc:
1. Đăng nhập QR.
2. Giữ một listener cho mỗi tài khoản Zalo.
3. Gom tin vào bộ đệm theo account.
4. Báo `sino-api` khi có tin mới.
5. Gửi tin chữ.

`sino-api` có `ZaloProvider` cài theo contract F03, luồng kết nối QR, và webhook. Scale: một instance giữ được vài trăm websocket; muốn nhiều hơn thì chia account theo hash cho nhiều instance (ngoài phạm vi, D-40).
**Phương án bị loại:**
- Viết lại giao thức Zalo bằng Java: phải tự chép mã hóa AES, websocket và định dạng gói tin; mỗi lần Zalo đổi là phải tự dò lại, không dùng được bản sửa của cộng đồng.
- Node ghi thẳng vào PostgreSQL: đi vòng qua `conversation` và `sync`, phá ranh giới Modulith, mất chống trùng và checkpoint.

### D-274 — Phiên Zalo lưu mã hóa trong `sino-api`; `sino-zalo` không lưu xuống đĩa · **Người dùng chốt** (phần 2)
- **Lưu ở `sino-api`:** phiên gồm `{ "cookie": [...], "imei": "...", "userAgent": "..." }`, gói thành một chuỗi JSON trong `TokenCredentials(token)`, lưu ở bảng credential với `credential_type` = `TOKEN`. Bảng này đã mã hóa at rest (F02), nên không cần migration. Mã định danh của account (`externalAccountId`) là `ownId` Zalo.
- **Giữ ở `sino-zalo`:** phiên chỉ nằm trong RAM. Service khởi động lại thì `sino-api` đưa lại (D-277).
- **Che phiên:** phiên không bao giờ ra log, response lỗi hay `toString()`.

**Phương án bị loại:** `sino-zalo` tự lưu phiên ra file hay SQLite (thêm một chỗ chứa bí mật, có hai nguồn sự thật).

### D-275 — Kết nối bằng mã QR: SPI `qrLogin()`, API bắt đầu / hỏi trạng thái / hủy · **Người dùng chốt** (phần 2); hình dạng SPI do **agent chốt khi viết hồ sơ, cần xem lại**

**Contract F03 thêm**, tùy chọn như `oauth2()`:

```text
MessageProvider.qrLogin(): Optional<QrLogin>          (mặc định rỗng)
QrLogin.start(): QrChallenge(loginId, qrImagePng, expiresAt)
QrLogin.status(loginId): QrLoginState
    WAITING | SCANNED(displayName) | DONE(AccountProfile, ProviderCredentials) | EXPIRED | DECLINED | FAILED(reason)
QrLogin.cancel(loginId)
```

**`sino-api` (module `account`), dùng chung cho mọi provider có `qrLogin()`:**

| Request | Kết quả |
|---|---|
| `POST /api/accounts/connect/{provider}/qr` `{ "acceptRisk": true, "accountId": null \| "<id kết nối lại>" }` | `201 { loginId, qrImage (PNG base64), expiresAt }`; lần kết nối đang chờ được giữ trong HTTP session, gắn với owner |
| `GET /api/accounts/connect/{provider}/qr/{loginId}` | `200 { state, displayName?, accountId?, reconnected? }`; khi `DONE` thì server gọi `register` (F02) và trả `accountId` |
| `DELETE /api/accounts/connect/{provider}/qr/{loginId}` | `204`, hủy lần kết nối (đóng hộp thoại) |

**Quy tắc:**
- Web hỏi trạng thái mỗi 2 giây. Mã sống 100 giây; hết hạn thì web hiện "Tạo mã mới", tức gọi lại `POST`.
- Kết nối lại phải đúng `ownId` cũ; sai thì `FAILED` với `CONNECT_WRONG_ACCOUNT`, giống Gmail.
- Thiếu `acceptRisk` → `400`. Provider không có `qrLogin()` → `400 CONNECT_METHOD_MISMATCH`. Zalo đang tắt → `409 PROVIDER_DISABLED`. `loginId` của session khác → `404`.

**Phương án bị loại:**
- SSE hay WebSocket cho trạng thái QR: poll 2 giây trong 100 giây là đủ, và ít phần chuyển động hơn.
- Một endpoint riêng cho Zalo: một provider QR khác về sau (Telegram QR) sẽ phải làm lại từ đầu.

### D-276 — Bị đá thì account thành "Cần đăng nhập lại"; rớt mạng thì tự nối lại · **Người dùng chốt** (phần 2)
- **Bị đá:** listener đóng với `3000` hoặc `3003`, hoặc đăng nhập bằng cookie bị từ chối. `sino-zalo` đánh dấu phiên `ENDED` (kèm lý do), dừng listener, gọi webhook ngay (D-277). Lần gọi kế tiếp tới account đó nhận `410 SESSION_ENDED`. ~~`ZaloProvider` ném `AUTH_EXPIRED`~~ `ZaloProvider` gửi lại phiên đang lưu bằng `PUT session` một lần (D-289); đó vẫn là phiên đã bị đá nên `sino-zalo` trả `410` ngay mà không gọi Zalo, và `ZaloProvider` ném `AUTH_EXPIRED`. `ProviderAccessService` sẵn có chuyển account sang `AUTH_EXPIRED`, web hiện "Quét QR lại" (kết nối lại, D-275).
  - **Đã sửa sau review:** **LÝ DO:** nếu `410` thành `AUTH_EXPIRED` ngay thì sau khi người dùng quét lại, phiên mới không bao giờ tới `sino-zalo` và account bị đẩy về "Cần đăng nhập lại" ở lượt đồng bộ kế tiếp (D-289).
- **Rớt mạng thoáng qua** (`1006` và các mã khác): ~~zca-js tự nối lại với độ trễ tăng dần (`retryOnClose`)~~ `SessionManager` tự nối lại sau 1, 2, 4 … tối đa 60 giây, về lại 1 giây khi đã nối được; listener của zca-js chạy với `retryOnClose: false`. Không coi là bị đá.
  - **Đã sửa ở ZL-03** (2026-10-15, **agent chốt, cần xem lại**): **LÝ DO:** log spike (`spikes/zalo-zca/logs/listen.jsonl`) cho thấy khi bị đá, zca-js nối lại cả sau `3003` (mã nối lại do máy chủ Zalo gửi trong `close_and_retry_codes`) rồi báo `closed 1006`; dựa vào `retryOnClose` thì lần bị đá trông như rớt mạng và `sino-zalo` nối lại mãi bằng cookie đã hủy. Thêm nữa, zca-js 2.2.0 không hủy được lần nối lại đã hẹn, và số lần thử của mỗi mã không đặt lại sau khi nối được. Tự nối lại thì mỗi lần đóng đều có mã thật, và test được bằng đồng hồ giả.
  - Cookie bị từ chối lúc `PUT session` không gọi webhook: `sino-api` đang là bên gọi và nhận `410` ngay (spec `zalo-gateway`, Vòng đời phiên và listener).

**Phương án bị loại:** tự đăng nhập lại bằng cookie sau khi bị đá (phiên đã bị Zalo hủy, spike đã thấy; thử mãi dễ bị coi là bot).

### D-277 — Nhận tin: báo rồi kéo, cursor là `msgId`; listener được bảo đảm qua `registerPush` · **Người dùng chốt** (phần 3); dùng `registerPush` để bảo đảm listener do **agent chốt khi viết hồ sơ, cần xem lại**

```text
 Zalo ─websocket─► listener (sino-zalo) ─► bộ đệm của account [msgId tăng dần]
                                   └─(gom 0,5 giây)─► POST /api/webhooks/zalo {ownId}
 sino-api: ProviderPushReceived(ZALO, ownId) ─► PushNotices ─► ImportRunner ─► ZaloProvider.fetchUpdates(cursor)
                                   ◄── GET /accounts/{id}/messages?after=<msgId>&limit=100 ──┘
```

- **Cursor** là `msgId` Zalo của tin cuối Sino đã nhận (`SyncCursor.value`); spike thấy `msgId` tăng theo thời gian. `sino-zalo` so sánh bằng `BigInt`.
- **Bộ đệm** trong RAM, theo account: tối đa 1.000 tin hoặc 24 giờ. Trùng tin không sao, vì `sino-api` chống trùng theo `externalMessageId` (F05).
  - **Chốt ở ZL-04** (2026-10-15, **agent chốt, cần xem lại**): 24 giờ tính từ lúc tin **vào bộ đệm**, không theo giờ gửi. **LÝ DO:** tin bù về sau một đêm `sino-zalo` tắt có giờ gửi cũ hơn 24 giờ; tính theo giờ gửi thì nó bị xóa ngay lúc vào, và lần bù thành vô ích.
- **`registerPush`** gọi `PUT /accounts/{id}/session` (bảo đảm phiên đang chạy, idempotent theo D-289) và trả `PushRegistration(address = ownId, expiresAt = bây giờ + 3 ngày)`. `PushWatches` gia hạn khi hạn còn dưới 2 ngày, tức khoảng một lần mỗi ngày: đây chỉ là lưới an toàn, việc bật lại listener nằm ở bước dưới.
  - **Đã sửa sau review:** ~~`expiresAt` = bây giờ + 1 ngày, nên `PushWatches` gọi lại mỗi giờ; nếu `sino-zalo` khởi động lại thì listener chạy lại chậm nhất sau một giờ~~. **LÝ DO:** hạn 1 ngày luôn nằm trong cửa sổ gia hạn 2 ngày, nên mỗi giờ mỗi account Zalo bị ghi watch lại, phát một `SyncStateChanged` và một dòng log INFO mà không được gì: bước dưới đã bật lại listener ở lượt đồng bộ kế tiếp.
- **`fetchUpdates`, `sendMessage` và `findSentMessages` gặp `404 UNKNOWN_ACCOUNT`** (service vừa khởi động lại) **hoặc `410 SESSION_ENDED`** (D-289): `ZaloProvider` gọi `PUT session` bằng phiên trong `ProviderContext`, rồi thử lại **một lần**. `PUT` trả `410` thì ném `AUTH_EXPIRED` luôn, không thử lại. Có watch thì F07 vẫn đồng bộ dự phòng 5 phút một lần, nên sau khi `sino-zalo` (hay cả hai service) khởi động lại, listener sống lại chậm nhất sau 5 phút. Cả hai lỗi đều có nghĩa là chưa gửi gì, nên thử lại `sendMessage` không gửi trùng.
  - **Đã sửa sau review:** thêm `410` và `findSentMessages`. **LÝ DO:** xem D-289; tra tin đã gửi sau khi `sino-zalo` khởi động lại cũng gặp `404`.
- **Webhook** `POST /api/webhooks/zalo` `{ "ownId": "..." }` với `Authorization: Bearer <SINO_ZALO_SECRET>`. Gọi khi có tin mới (gom trong 0,5 giây) và khi phiên `ENDED`.

**Phương án bị loại:**
- `sino-zalo` đẩy cả tin sang `sino-api`: phải viết đường lưu thứ hai bên cạnh `fetchUpdates`, mất checkpoint và chống trùng của `sync`.
- Bật listener bằng cách nghe event `AccountConnected`: module `provider` nghe event của `account` là vòng phụ thuộc, Modulith sẽ chặn.

### D-278 — Không nhập lịch sử cũ; bù tin lỡ ngay ở lần kéo đầu tiên · **Người dùng chốt** (phần 3); thời điểm bù do **agent chốt khi viết hồ sơ, cần xem lại**
- **Không nhập lịch sử:** account Zalo mới có hộp thư trống, đầy dần theo tin mới. Lần nhập đầu (D-64) của Zalo xong ngay: `fetchUpdates(initial)` trả những gì đang có trong bộ đệm. `estimateMessages` rỗng, và web không hỏi khoảng thời gian (D-288).
- **Bù tin:** khi `GET /messages?after=X` mà phiên chưa bù từ một mốc ≤ X kể từ lúc khởi động, **và** X cũ hơn tin cũ nhất trong bộ đệm (hoặc bộ đệm rỗng), thì `sino-zalo`:
  1. ~~gọi `requestOldMessages(User, X)` và `(Group, X)`;~~ với mỗi loại (`User`, `Group`), gọi `requestOldMessages(loại, X)`, rồi gọi tiếp với `lastId` = `msgId` lớn nhất của trang vừa nhận, cho tới khi gặp trang rỗng hoặc trang có tin đã nằm trong bộ đệm (tức là đã nối liền với listener), tối đa 10 trang mỗi loại;
  2. chờ ~~cả hai trả về~~ (tối đa 5 giây cho cả lần bù);
  3. đổ kết quả vào bộ đệm, rồi mới trả lời;
     - **Thêm ở ZL-04** (agent chốt, cần xem lại): yêu cầu trang đầu chỉ gửi khi listener đã nhận khóa giải mã của Zalo (`cipher_key` của zca-js), và chờ việc đó cũng nằm trong 5 giây. **LÝ DO:** zca-js 2.2.0 gửi `requestOldMessages` thẳng lên websocket: lúc socket còn đang mở thì nó ném lỗi, và trước khi có khóa thì trang trả về không giải mã được. Ngay sau khi `sino-zalo` khởi động lại, lần kéo đầu tiên tới đúng lúc đó.
  4. dừng vì hết 10 trang hoặc hết 5 giây mà chưa nối liền thì ghi log WARN (ID account, số trang, số tin; không có nội dung) và trả những gì đã có: phần còn lại bị mất, và log cho biết điều đó.
  - **Đã sửa sau review:** đọc nhiều trang. **LÝ DO:** mỗi lần gọi `requestOldMessages` chỉ trả một trang. Nếu số tin lỡ dài hơn một trang thì phần giữa mất, và lần kéo sau không bù nữa vì bộ đệm đã có tin nhỏ hơn cursor, nên chỗ mất không ai thấy. Độ dài một trang đo ở ZL-13 (D-270).
- **Giới hạn đã chấp nhận** (agent chốt theo ủy quyền, cần xem lại): trước tin đầu tiên của account, cursor còn rỗng (`nextCursor` rỗng, `ImportRunner` gọi lại bằng cursor đầu). Nếu `sino-zalo` khởi động lại trong khoảng đó thì tin đến lúc nó tắt không được bù, vì không có mốc để bù. Khoảng này chỉ kéo dài từ lúc kết nối tới tin đầu tiên. **Phương án bị loại:** lấy mốc bằng `requestOldMessages(loại, null)` (trả cả tin của buổi trước, trái "không nhập lịch sử", và chưa đo).
- **Đã sửa so với phần 3 lúc trình bày:** ~~`PUT session` gửi kèm cursor để bù tin khi kết nối~~. **LÝ DO:** `registerPush` (D-277) không có cursor; chỉ lần kéo mới biết Sino đang ở đâu, nên bù ở đó là đúng một chỗ.
- Zalo giữ tin bao lâu để bù, và một trang dài bao nhiêu tin, thì đo ở ~~ZL-00~~ ZL-13 (DN-1, D-270).

**Phương án bị loại:** nhập lịch sử bằng `getGroupChatHistory` (trả `404`; với 1-1 thì không có API).

### D-279 — Chuẩn hóa tin Zalo · **Người dùng chốt** (phần 3)
`sino-zalo` trả JSON gần dạng gốc (`ZaloMessage`, D-283). `sino-api` (`ZaloMessageNormalizer`) đổi sang `NormalizedMessage`:

| Zalo | Sino |
|---|---|
| `threadId` + loại | `NormalizedConversation` `DIRECT` (1-1) hoặc `GROUP`, `externalConversationId` = `threadId` |
| tên, ảnh đại diện | `getUserInfo` / `getGroupInfo`, `sino-zalo` cache 1 giờ; chờ tối đa 2 giây, lỗi hay hết giờ thì `title` = tên người gửi (1-1) hoặc `null` (nhóm), không cache, tin vẫn trả về (ZL-04) |
| `uidFrom` | `senderExternalParticipantId` |
| `isSelf` | `OUTBOUND`, `read` = true; tin gửi từ điện thoại cũng hiện (`selfListen: true`) |
| `webchat` | `TEXT`, `textContent` = nội dung |
| `chat.photo` | `IMAGE`, chữ `[Ảnh]` |
| `chat.sticker` | `UNKNOWN`, chữ `[Sticker]` |
| `share.file` | `FILE`, chữ `[Tệp]` |
| `chat.voice` | `AUDIO`, chữ `[Tin nhắn thoại]` |
| loại khác | `UNKNOWN`, chữ `[Tin Zalo chưa hỗ trợ]`, `metadata.zaloType` = loại gốc |
| `ts` | `sentAt` |
| `msgId` | `externalMessageId` |

Spike mới thấy hai loại `webchat` và `chat.photo`. Tên `chat.sticker`, `share.file`, `chat.voice` là **giả định, chưa kiểm**: ~~ZL-00 ghi lại tên thật (gửi thử từng loại) và sửa bảng này trước ZL-08~~ ZL-13 ghi lại tên thật (gửi thử từng loại), rồi sửa bảng này và `ZaloMessageNormalizer` (D-270). Tới lúc đó, tin có tên khác giả định rơi vào hàng "loại khác": hiện `[Tin Zalo chưa hỗ trợ]` và giữ tên gốc trong `metadata.zaloType`, nên không mất tin. Ảnh, tệp và giọng nói không có `NormalizedAttachment` ở bản đầu (D-271). Thu hồi tin, reaction, đã xem: `sino-zalo` ghi log loại sự kiện, không xử lý.

### D-280 — Trả lời chữ, chống gửi trùng, tra tin đã gửi, 1 tin/giây · **Người dùng chốt** (phần 4)
- **Gửi:** `ZaloProvider.sendMessage` gọi `POST /accounts/{id}/messages` `{ threadId, threadType, text, clientMessageId }`, rồi `sino-zalo` gọi `sendMessage(text, threadId, type)` của zca-js. Kết quả là `SendMessageResult(msgId, SENT, sentAt)`. `ReplyService` (F10) không đổi.
- **Chống trùng:** `sino-zalo` nhớ cặp `clientMessageId → msgId` trong 24 giờ. Gọi lại với cùng ID thì trả `msgId` cũ, không gửi lần hai.
- **Tra tin đã gửi:** `findSentMessages` gọi `POST /accounts/{id}/sent/lookup` `{ threadId, clientMessageId, text, after }`. `sino-zalo` tìm theo thứ tự:
  1. bảng `clientMessageId`;
  2. tin `isSelf` trong bộ đệm của thread đó, sau `after`, cùng nội dung.

  Nếu `sino-zalo` khởi động lại sau `after` (không biết gì) thì trả `409 CANNOT_TELL` và `ZaloProvider` ném lỗi, **không trả rỗng** (đúng contract F10). Thư giữ `UNKNOWN` theo D-136/D-138; ZL-09 kiểm hành vi này trên `ReplyService` thật.
- **Không trích dẫn** (`replyToExternalMessageId` bỏ qua): trích dẫn trên Zalo cần cả object tin gốc.
- **Giới hạn tốc độ:** tối đa 1 tin mỗi giây cho mỗi account, vượt thì `429`.
- **Capability của Zalo:** `READ_MESSAGES`, `SEND_MESSAGES`, `PUSH_WEBHOOK`.

### D-281 — Bảng đổi lỗi `sino-zalo` → `ProviderErrorCode` · **Người dùng chốt** (phần 4); hàng gửi hết giờ do **agent chỉnh khi viết hồ sơ, cần xem lại**

| `sino-zalo` trả | Nghĩa | `ZaloProvider` |
|---|---|---|
| không kết nối được, 5xx, hết giờ (đọc) | service sập hoặc chậm | `PROVIDER_UNAVAILABLE` |
| hết giờ, 5xx, `504 OUTCOME_UNKNOWN` (gửi) | có thể đã gửi | `OUTCOME_UNKNOWN` (D-135 của F10) |
| `404 UNKNOWN_ACCOUNT` | service vừa khởi động lại | `PUT session` rồi thử lại một lần (D-277) |
| `410 SESSION_ENDED` | bị đá, cookie bị từ chối, hoặc `sino-zalo` còn giữ phiên cũ trong khi `sino-api` đã có phiên mới | ~~`AUTH_EXPIRED`~~ `PUT session` rồi thử lại một lần (D-289) |
| `410 SESSION_ENDED` cho chính `PUT session` | phiên đang lưu đã bị đá hoặc bị từ chối | `AUTH_EXPIRED` |
| `429 RATE_LIMITED` | vượt 1 tin/giây | `RATE_LIMITED` |
| `422 REJECTED` | Zalo từ chối gửi | `REQUEST_REJECTED` |
| `409 CANNOT_TELL` (tra tin đã gửi) | không biết | `PROVIDER_UNAVAILABLE` |
| `401` | sai khóa bí mật | `PROVIDER_UNAVAILABLE` + log ERROR (lỗi cấu hình) |

**Đã sửa so với phần 4 lúc trình bày:** ~~hết giờ khi gửi → `PROVIDER_UNAVAILABLE`~~ → `OUTCOME_UNKNOWN`. **LÝ DO:** F10 đã có mã này cho "có thể đã gửi" (D-135). `PROVIDER_UNAVAILABLE` sẽ cho phép gửi lại mù.
**Đã sửa sau review:** ~~`410` → `AUTH_EXPIRED`~~ → `PUT session` rồi thử lại; chỉ `410` của chính `PUT` mới là `AUTH_EXPIRED`. **LÝ DO:** D-289.

### D-282 — Bảo mật nội bộ · **Người dùng chốt** (phần 2)
- **Mạng:** `sino-zalo` chỉ nghe ở `127.0.0.1` (máy dev) hoặc trong mạng Docker, không mở ra ngoài.
- **Khóa bí mật:**
  - Mọi request giữa `sino-api` và `sino-zalo`, theo cả hai chiều, có `Authorization: Bearer <SINO_ZALO_SECRET>`, chuỗi ngẫu nhiên ít nhất 32 byte.
  - Hai bên so khóa bằng phép so thời gian hằng (`timingSafeEqual`, `MessageDigest.isEqual`).
  - Thiếu khóa lúc khởi động thì service dừng ngay.
- **Che dữ liệu:**
  - Log chỉ có ID, loại tin, giờ, độ dài; không có nội dung tin, cookie hay imei.
  - Response lỗi không có phiên.
- `/health` không cần khóa và chỉ trả số đếm.

### D-283 — Stack `sino-zalo` · **Người dùng chốt** (phần 1)
- **Nền:** Node 24 LTS (`engines`), TypeScript ở chế độ `strict`, Fastify 5 (route có schema JSON), Vitest, ~~ESLint~~ oxlint, pnpm (như `sino-web`).
  - **Đã sửa ở ZL-01** (2026-10-15): ESLint → oxlint. **LÝ DO:** `sino-web` và `sino-site` lint bằng oxlint; ý của quyết định là "như sino-web". Node chạy thẳng `src/server.ts` (bỏ kiểu khi chạy), không có bước build.
- **zca-js:** ghim đúng `2.2.0`; nâng cấp là một task có test lại.
- **`ZaloGateway`:** interface bọc zca-js, gồm đăng nhập QR, đăng nhập bằng cookie, listener, `requestOldMessages`, `sendMessage`, thông tin người dùng và nhóm. Test dùng bản giả, không bao giờ gọi Zalo thật.
- **Cấu trúc thư mục:** `src/server.ts` (khởi động), `src/app.ts` (dựng Fastify, để test bằng `inject`), `src/config.ts`, `src/auth.ts`, `src/gateway/` (interface + bản thật + bản giả), `src/logins/`, `src/sessions/` (vòng đời phiên, listener, bộ đệm, bù tin), `src/messages/` (đọc, gửi, chống trùng, giới hạn tốc độ), `src/notify.ts` (webhook).

**Phương án bị loại:** Express (không có kiểu và kiểm tra dữ liệu vào sẵn); module `http` thuần (tự viết routing và parse); Bun (zca-js hỗ trợ, nhưng repo dùng Node).

### D-284 — Ngắt phiên khi xóa hoặc tắt account: hook SPI `disconnect(context)` · **Agent chốt khi viết hồ sơ, cần xem lại**
Contract F03 thêm `default void disconnect(ProviderContext context) {}`. Module `account` gọi nó sau khi xóa hoặc tắt account đã commit, theo kiểu cố gắng (lỗi chỉ ghi log), giống cách thu hồi token OAuth2 hiện nay. `ZaloProvider.disconnect` gọi `DELETE /accounts/{id}/session`.
- **Bật lại** account đã tắt: `registerPush` hoặc lần kéo kế tiếp tự bật lại phiên (D-277).
- **Xóa account:** web nhắc người dùng gỡ phiên web của Sino trong app Zalo (Cài đặt → Tài khoản và bảo mật → thiết bị đăng nhập). ZL-10 kiểm zca-js có API đăng xuất không; nếu có thì gọi nó và bỏ lời nhắc.

**Phương án bị loại:** `sino-zalo` tự dừng phiên khi webhook không tìm thấy account (`sino-api` hiện không trả lời như vậy, phải thêm luật ngầm); để phiên chạy tới lần `sino-zalo` khởi động lại (Sino vẫn giữ phiên web sống của người đã xóa account: không chấp nhận được về quyền riêng tư).

### D-285 — `GET /api/providers` thêm `connectMethod` và `connectable` · **Agent chốt khi viết hồ sơ, cần xem lại**
- `connectMethod` có giá trị `OAUTH2`, `QR` hoặc `null` (provider không có luồng kết nối).
- `connectable` là `false` khi không có luồng kết nối hoặc provider đang tắt (D-286).
- Web bỏ việc tự gán `connectable: true` (`accounts.api.ts`), và chọn bước tiếp theo trong hộp thoại theo `connectMethod`.

**Phương án bị loại:** web tự biết "zalo là QR" (tên provider cứng trong web; provider QR thứ hai lại phải sửa web).

### D-286 — Công tắc tắt: `sino-api` không gọi `sino-zalo` · **Người dùng chốt** (phần 4); cách tắt do **agent chỉnh khi viết hồ sơ, cần xem lại**
- `SINO_ZALO_ENABLED=false` thì `ZaloProvider` vẫn có trong registry (account Zalo cũ vẫn hiện và đọc được tin đã lưu), nhưng mọi lời gọi ra `sino-zalo` ném `PROVIDER_UNAVAILABLE` với lời "Zalo đang tạm tắt".
- `qrLogin()` trả rỗng và `connectable: false`.
- Phiên Zalo dừng bằng cách dừng tiến trình `sino-zalo` (README ghi rõ hai bước).

**Đã sửa so với phần 4 lúc trình bày:** ~~`sino-api` gọi `DELETE session` cho mọi account~~. **LÝ DO:** tắt là lúc khẩn cấp; dừng tiến trình chắc chắn hơn và không cần thêm vòng lặp qua mọi account.

### D-287 — Cách hướng dẫn trong change này · **Người dùng chốt** (2026-10-14)
- **Người code:** người dùng code mọi task từ ZL-01, theo thứ tự trong `tasks.md`.
- **Code Claude đưa:**
  - Mỗi bước chỉ đưa **đoạn code mới hoặc đổi**, kèm chỗ chèn chính xác (file, sau hàm nào, trong lớp nào); không in lại cả file.
  - Mỗi đoạn có giải thích: làm gì, vì sao cần, giải quyết vấn đề gì, scale và giới hạn ra sao, phương án bị loại.
  - Code đưa ra đầy đủ và chạy được cho phần đó, không phải khung rỗng.
- **Sau mỗi task:**
  - Claude review code người dùng gõ và chạy test.
  - Người dùng chạy được và giải thích được luồng thì task mới xong (learning gate).
  - Thêm một mục vào `docs/knowledge/phase-5-multi-provider-send.md` + `.docx`, rồi commit lên `dev`.
- `tasks.md` chỉ có gợi ý Level 1–2; code đầy đủ nằm trong chat của từng task.

### D-288 — Web: Zalo bỏ bước chọn khoảng nhập · **Agent chốt khi viết hồ sơ, cần xem lại**
Sau khi kết nối Zalo xong, web gọi `POST /api/accounts/{id}/initial-sync` ngay ~~, không hỏi khoảng thời gian~~ với `{ "range": "ALL" }` mà không hỏi người dùng, rồi đóng hộp thoại với dòng "Sino nhận tin Zalo từ bây giờ". Gmail giữ bước cũ. Kết nối lại (quét QR lại) thì không gọi `initial-sync`: lần nhập đầu đã xong.
- **Đã sửa sau review:** ghi rõ `range`. **LÝ DO:** `InitialSyncController` bắt buộc có `range` (`@NotNull`). `ALL` cho `since` = null, đúng với Zalo: bộ đệm chỉ có tin từ lúc kết nối. Thêm một giá trị "không áp dụng" thì phải sửa F05 cho một trường hợp không cần.

### D-289 — `PUT session` thay phiên khi phiên khác; `410` cũng gửi lại phiên một lần · **Agent chốt theo ủy quyền, cần xem lại** (review 2026-10-14)
**Vấn đề:**
1. Người dùng bị đá; `sino-zalo` giữ phiên `ENDED` và trả `410` cho tới một `PUT session` mới.
2. Người dùng quét lại; `sino-api` lưu credential mới, nhưng không có gì gửi phiên mới sang `sino-zalo`. `registerPush` chỉ chạy khi watch tới hạn.
3. Lượt đồng bộ kế tiếp nhận `410` và ném `AUTH_EXPIRED`. Credential mới là credential hiện hành, nên `ProviderAccessService.expire` đánh dấu account `AUTH_EXPIRED` lại.

Người dùng quét mãi cũng không thoát ra được.

**Quyết định:**
- **Dấu vân tay:** `sino-zalo` giữ cho mỗi account SHA-256 của phiên nhận qua `PUT` (`JSON.stringify(session)`). Dấu vân tay chỉ nằm trong RAM và không ra log.
- **`PUT session`:**

  | Đang giữ | Phiên gửi tới | Kết quả |
  |---|---|---|
  | `LIVE`, cùng dấu vân tay | | `204`, không làm gì |
  | `ENDED`, cùng dấu vân tay | | `410` ngay, **không gọi Zalo**: cookie đó đã bị hủy (D-276) |
  | không có, hoặc dấu vân tay khác | được Zalo nhận | đăng nhập bằng cookie mới, dừng listener cũ nếu có, thay phiên, `LIVE`, `204` |
  | không có, hoặc dấu vân tay khác | bị Zalo từ chối | dừng listener cũ nếu có, `ENDED` với dấu vân tay mới, `410` |

- **`ZaloProvider`:** `404` và `410` của `fetchUpdates`, `sendMessage`, `findSentMessages` cùng một cách xử lý: `PUT session` bằng phiên trong `ProviderContext`, rồi thử lại một lần. `PUT` trả `410` thì ném `AUTH_EXPIRED`.
- **Kết quả:**
  - **Bị đá, chưa quét lại:** thêm một lời gọi nội bộ, không thêm lời gọi nào tới Zalo, account thành `AUTH_EXPIRED` như cũ.
  - **Đã quét lại:** lượt đồng bộ kế tiếp đưa phiên mới vào và đọc tiếp.
  - **Quét lại khi phiên cũ còn sống:** phiên mới vào ở lần `registerPush` kế tiếp; nếu Zalo hủy phiên cũ trước đó thì đi đường `410` ở trên.

**Phương án bị loại:**
- Luồng QR tự gọi `PUT session` ngay sau `register`: chỉ vá một đường, phải thêm lời gọi provider sau commit trong `account`, và vẫn hở khi lần gọi đó lỗi. Dấu vân tay tự sửa ở mọi lần credential của `sino-api` khác phiên ở `sino-zalo`.
- `PUT session` luôn đăng nhập lại: đăng nhập bằng cookie mỗi ngày (và mỗi lần thử lại) mà không cần, dễ bị coi là bot.
- `410` luôn đăng nhập lại bằng cookie đang lưu: lặp lại đăng nhập bằng cookie Zalo đã hủy, trái D-276.

### D-290 — Một nick Zalo chỉ thuộc một owner Sino · **Agent chốt theo ủy quyền, cần xem lại** (review 2026-10-14)
**Vấn đề:** F02 tách account theo `(owner, provider, externalAccountId)`. Hai người dùng Sino kết nối cùng một nick sẽ có hai account và hai phiên web, trong khi Zalo chỉ giữ một kết nối web cho mỗi tài khoản (`3000 DuplicateConnection`). Hai phiên đá nhau, cả hai người phải quét lại liên tục, và kiểu đăng nhập lặp đó dễ bị Zalo coi là bot.

**Quyết định:**
- Khi lần kết nối QR tới `DONE`, trước khi gọi `register`, `QrConnectService` kiểm tra xem có account chưa xóa nào của owner khác cùng `(provider, externalAccountId)` không. Account đang tắt cũng tính, vì bật lại là nó cần phiên.
- Có thì trả `FAILED` với `CONNECT_ACCOUNT_IN_USE`, không tạo hay sửa account nào. Phiên vừa nhận bị bỏ: `sino-zalo` đã quên nó sau `DONE`, và `sino-api` không gửi nó đi đâu.
- Luật này áp cho mọi provider kết nối bằng QR, vì provider QR duy nhất hiện có (Zalo) chỉ có một phiên web. Provider QR nào cho nhiều phiên thì thêm một cờ trong `QrLogin` lúc đó. Gmail (OAuth2) không đổi.
- **Quyền riêng tư:** lời báo cho biết nick đã nối với một tài khoản Sino khác, nhưng chỉ người xác nhận được đăng nhập trên điện thoại của nick đó mới thấy, tức là chính chủ nick.
- **Giới hạn:** không khóa. Hai owner quét cùng một nick tới `DONE` trong cùng một khoảnh khắc thì có thể lọt; ở quy mô D-40 coi như không xảy ra.

**Phương án bị loại:**
- Chấp nhận hai account: hai phiên đá nhau liên tục (xem Vấn đề).
- Một listener dùng chung cho mọi account cùng `ownId`: `sino-zalo` phải tách phiên khỏi account và đổi contract, nhiều việc cho một trường hợp hiếm.
- Kiểm ở `AccountRegistrationService`: luồng OAuth2 cũng dùng nó, và Gmail không cần luật này.

## Contract API của `sino-zalo` (nội bộ)

Mọi request (trừ `/health`) có `Authorization: Bearer <SINO_ZALO_SECRET>`. Lỗi có dạng `{ "code": "...", "message": "..." }`.

| Request | Thành công | Lỗi |
|---|---|---|
| `GET /health` | `200 { status: "UP", sessions: { live, ended } }` | — |
| `POST /logins` | `201 { loginId, qrImage, expiresAt }` | `502` Zalo không trả QR |
| `GET /logins/{loginId}` | `200 { state, displayName?, profile?, session? }`; `profile` (`ownId`, `displayName`, `avatarUrl`) và `session` chỉ có ở response `DONE` **đầu tiên**, sau đó lần đăng nhập bị quên | `404` |
| `DELETE /logins/{loginId}` | `204` | — |
| `PUT /accounts/{accountId}/session` `{ session }` | `204`; cùng dấu vân tay với phiên đang sống thì không làm gì; dấu vân tay khác thì thay phiên (D-289) | `410 SESSION_ENDED` (cookie bị từ chối, hoặc đúng phiên đã `ENDED`: trả ngay, không gọi Zalo); `502 ZALO_UNAVAILABLE` (Zalo không trả lời; phiên đang giữ không đổi; thêm ở ZL-03, D-281 hàng 5xx); `400` (body không có phiên dùng được) |
| `DELETE /accounts/{accountId}/session` | `204` (kể cả khi không có) | — |
| `GET /accounts/{accountId}/messages?after=&limit=` | `200 { conversations, messages, nextCursor, hasMore }`; `after` rỗng = mọi tin trong bộ đệm | `404 UNKNOWN_ACCOUNT`, `410 SESSION_ENDED` |
| `POST /accounts/{accountId}/messages` `{ threadId, threadType, text, clientMessageId }` | `201 { msgId, sentAt }`; trùng `clientMessageId` → `200` cùng kết quả | `404`, `410`, `422 REJECTED`, `429`, `504 OUTCOME_UNKNOWN` |
| `POST /accounts/{accountId}/sent/lookup` `{ threadId, clientMessageId, text, after }` | `200 { msgIds }` | `404`, `409 CANNOT_TELL`, `410` |

`ZaloMessage` (JSON): `{ msgId, threadId, threadType: "USER"|"GROUP", fromId, fromName, isSelf, zaloType, text, sentAt }`. `text` là `null` khi không phải tin chữ. `fromName` (thêm ở ZL-04) là tên người gửi Zalo ghi trong tin (`dName`).
`ZaloConversation`: `{ threadId, threadType, title, avatarUrl, participants: [{ id, name }] }`. `participants` (chốt ở ZL-04) là những người gửi các tin đi kèm trong response, không phải mọi thành viên nhóm; `title` có thể `null` khi Zalo không trả tên.
- **Đã sửa ở ZL-04** (agent chốt, cần xem lại): thêm `fromName`, `participants` lấy từ người gửi. **LÝ DO:** `getGroupInfo` chỉ trả một phần thành viên của nhóm lớn (`hasMoreMember`), nên người gửi có thể không có trong đó; tên trong chính tin thì luôn có, và đó là những người `sino-api` cần đặt tên.

## Testing

- **`sino-zalo`** (Vitest):
  - Route test bằng `app.inject`, zca-js thay bằng `FakeZaloGateway`.
  - Kiểm: khóa bí mật (thiếu, sai, đúng); vòng đời đăng nhập QR (từng trạng thái, phiên chỉ trả một lần); `PUT session` theo bốn hàng của D-289 (cùng phiên đang sống, cùng phiên đã `ENDED` không gọi Zalo, phiên khác thay phiên cũ, phiên khác bị từ chối); bị đá → `410` + webhook; bộ đệm (`after`, `limit`, `hasMore`, giới hạn 1.000 / 24 giờ, so sánh `BigInt`); bù tin (khi nào gọi, nhiều trang tới khi nối liền, dừng ở 10 trang hoặc 5 giây kèm log WARN, không gọi lại); webhook gom 0,5 giây; gửi (chống trùng, 1 tin/giây, lỗi); tra tin đã gửi (`CANNOT_TELL`); log không có nội dung tin.
- **`sino-api`:**
  - `ZaloProvider` chạy bộ test contract F03 (`MessageProviderContractTest`), với `sino-zalo` giả bằng WireMock.
  - `ZaloMessageNormalizerTests` (từng hàng của D-279).
  - `ZaloErrorMappingTests` (từng hàng của D-281, gồm `410` → `PUT` → thử lại, và `PUT` trả `410` → `AUTH_EXPIRED`).
  - API kết nối QR và webhook test bằng MockMvc trên PostgreSQL thật (`QrConnectApiTests`, `ZaloWebhookTests`): bắt đầu, từng trạng thái, `DONE` tạo account, kết nối lại đúng/sai `ownId`, nick đã thuộc owner khác → `CONNECT_ACCOUNT_IN_USE` (D-290), thiếu `acceptRisk`, provider tắt.
  - Quét lại sau khi bị đá (D-289): account `AUTH_EXPIRED`, quét lại, lượt đồng bộ kế tiếp gặp `410` → `PUT` phiên mới → đọc được, account vẫn `CONNECTED`.
  - `ModularityTests` vẫn xanh.
- **`sino-web`:** Vitest + MSW cho bước Zalo: cảnh báo (nút khóa tới khi tick), QR, `SCANNED` hiện tên, `DONE`, `EXPIRED` → "Tạo mã mới", `DECLINED`, đóng hộp thoại → `DELETE`, kết nối lại.
- **Zalo thật:** chỉ ở ZL-13 (nghiệm thu và các phép đo chuyển từ ZL-00, D-270), bằng nick phụ; script spike dùng được khi cần đo riêng một điểm.

## Risks / Trade-offs

- **Bị khóa nick:** cảnh báo và đồng ý (D-272), giới hạn 1 tin/giây (D-280), không tự đăng nhập lại sau khi bị đá (D-276), có công tắc tắt (D-286).
- **Zalo đổi giao thức, zca-js hỏng:** zca-js ghim phiên bản; account thành "Cần đăng nhập lại" hoặc lỗi đồng bộ, nhìn thấy được; nâng zca-js là một task riêng.
- **Người dùng mở Zalo Web bằng cùng nick:** Sino bị đăng xuất. Cảnh báo nói trước; trạng thái account nói sau.
- **Đo sau khi code xong** (D-270): độ bền 24 giờ và cửa sổ bù tin chỉ biết ở ZL-13. Nếu kết quả xấu thì phần đã code có thể phải bỏ hoặc sửa nhiều; người dùng chấp nhận.
- **Mất tin khi `sino-zalo` tắt lâu hơn cửa sổ Zalo giữ tin:** đo ở ~~ZL-00~~ ZL-13 (DN-1). Bù tin dừng ở 10 trang hoặc 5 giây thì phần còn lại mất, có log WARN (D-278); `sino-zalo` khởi động lại trước tin đầu tiên của account thì không bù được (D-278, giới hạn đã chấp nhận).
- **Cùng một nick ở hai owner:** bị chặn lúc kết nối (D-290).
- **Thêm một service phải chạy:** `/health`, README, job CI (ZL-12).

## Decision Needed

- **DN-1 (~~ZL-00~~ ZL-13):** nếu Zalo chỉ giữ tin trong thời gian ngắn, thì khi `sino-zalo` tắt lâu sẽ mất tin. **Phương án:**
  - (a) chấp nhận và ghi rõ trong màn kết nối;
  - (b) `sino-zalo` lưu bộ đệm xuống đĩa;
  - (c) dừng change.

  **Đề xuất:** (a) nếu cửa sổ ≥ 1 ngày, (c) nếu chỉ vài phút. **Câu hỏi cho người dùng:** cửa sổ ngắn nhất bạn chấp nhận?
- **DN-2 (ZL-11):** chữ cảnh báo. **Bản nháp:** "Sino kết nối Zalo bằng cách không chính thức. Zalo có thể khóa tài khoản dùng cách này. Đừng mở Zalo Web hay Zalo PC bằng tài khoản này, vì Sino sẽ bị đăng xuất. Sino lưu phiên đăng nhập đã mã hóa và chỉ nhận tin từ lúc kết nối." **Câu hỏi:** sửa chữ nào? (Câu về Zalo PC giữ nguyên ở ZL-11 cho chắc, rồi sửa theo kết quả đo ở ZL-13.)
- **DN-3 (sau change):** nơi chạy `sino-zalo` khi lên production, theo nơi chạy `sino-api`, chưa chọn.
