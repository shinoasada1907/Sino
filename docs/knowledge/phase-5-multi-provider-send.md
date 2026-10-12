# Kiến thức Phase 5 — Nhiều provider và gửi tin

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F10, `openspec/changes/f10-reply` (trả lời một thư ngay trong Sino), được kéo lên làm ngay sau F06 vì bạn ưu tiên "kết nối và nhắn tin" (2026-10-09). Đã xong: BE-58, BE-59. Còn BE-60 (gửi thật một lần, khi bạn cho phép). F09 (provider thứ hai) chưa mở.
> **Cập nhật:** 2026-10-12. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

---

## 0. Bức tranh: trả lời một thư từ Sino

```text
 (BE-58) Sino biết account gửi được không, và thư sẽ tới ai
          GET /api/conversations/{id} -> reply: { state, to }
                         |
 (BE-59) người dùng bấm Gửi
          POST .../messages -> ghi PENDING -> Gmail messages.send -> SENT / FAILED / UNKNOWN
                         |
 (BE-60) chạy thật một lần, chỉ khi bạn cho phép
```

| Quyết định | Nội dung |
|---|---|
| D-130 | Xin `gmail.send` khi kết nối nhưng không bắt buộc; tài khoản cũ cấp thêm bằng "Kết nối lại" |
| D-131 | Gửi ngay trong request; chống gửi trùng bằng `clientMessageId` |
| D-132 | Kết quả không rõ thì không gửi lại mù, đối chiếu với Gmail theo `Message-ID` |
| D-133 | Trả lời người gửi thư mới nhất; chữ thuần; người nhận do server tính |
| D-134 | Web: thư hiện ngay, thư lỗi ở lại với "Gửi lại" và "Bỏ" |

---

## 1. Quyền gửi, capability theo account, trạng thái trả lời (BE-58)

**Ở đâu:** `provider/spi/OAuth2Connection.java` (`sendScopes`), `provider/infrastructure/gmail/GmailProvider.java`, `account/application/AccountCapabilities.java` (mới), `account/AccountDirectory.java` (`capabilitiesOf`), `account/application/AccountDirectoryService.java`, `account/api/AccountsController.java`, `account/infrastructure/CredentialStore.java` (`grantedScopes`), `conversation/application/{Replies,Reply,ReplyState,StoredRecipients}.java` (mới), `conversation/application/{InboxService,InboxDetail,MessageHistory}.java`, `conversation/api/ConversationDetailResponse.java`.

### 1.1 Ba loại scope của một connector
Trước BE-58, `OAuth2Connection` có hai tập scope: `scopes` (xin gì) và `requiredScopes` (bắt buộc phải được cấp, D-51). BE-58 thêm tập thứ ba:

| Tập | Gmail | Nghĩa |
|---|---|---|
| `scopes` | `openid`, `email`, `gmail.readonly`, `gmail.send` | những gì màn đồng ý của Google hỏi |
| `requiredScopes` | `gmail.readonly` | thiếu thì kết nối thất bại (`CONNECT_SCOPE_DENIED`) |
| `sendScopes` | `gmail.send` | thiếu thì account vẫn đọc được, chỉ không gửi được |

`gmail.send` nằm trong `scopes` nhưng **không** nằm trong `requiredScopes`: người dùng bỏ tick quyền gửi trên màn của Google vẫn kết nối được để đọc (D-130). Hai tập con đều phải nằm trong `scopes`; record kiểm điều đó ngay khi tạo, nên connector không thể khai báo một scope gửi mà nó không hề xin.

Phương án bị loại: `gmail.modify` hay `https://mail.google.com/` cũng gửi được, nhưng cho Sino quyền sửa và xóa thư. Xin quyền hẹp nhất đủ dùng là nguyên tắc *least privilege*.

**`include_granted_scopes=true`.** Tài khoản bạn kết nối trước BE-58 chỉ có quyền đọc. Muốn gửi, bạn bấm "Kết nối lại". Tham số này bảo Google gộp quyền cũ vào lần cấp mới (Google gọi là *incremental authorization*), nên token trả về mang đủ cả quyền đọc lẫn quyền gửi.

### 1.2 Thêm thành phần cho record: không có giá trị mặc định
Thêm `sendScopes` vào record làm đổi constructor chính (*canonical*), nên mọi chỗ đang `new OAuth2Connection(...)` với 5 tham số đều hỏng. Java cho record có thêm constructor khác, miễn là nó gọi `this(...)` tới constructor chính. Bản đầu của BE-58 làm đúng như vậy: thêm một constructor 5 tham số, mặc định `sendScopes` rỗng.

Review chỉ ra đó là một cái bẫy. `sendScopes` rỗng nghĩa là "gửi không cần scope riêng", nên `AccountCapabilities` không kiểm gì và cho mọi account gửi. Một connector OAuth2 sau này khai báo `SEND_MESSAGES` mà dùng nhầm constructor ngắn thì mọi account đều `READY`, kể cả account chưa cấp quyền. Lúc gửi, provider trả `403`, và theo spec, lỗi hết quyền làm account thành `AUTH_EXPIRED` dù nó vẫn đọc thư bình thường. Nên constructor ngắn bị bỏ. Mọi connector phải tự viết `sendScopes`, kể cả khi đó là `Set.of()`.

Bài học: một giá trị mặc định chỉ nên có khi quên điền nó là vô hại. Ở đây quên điền là cấp thêm quyền.

### 1.3 Capability theo account: ai biết tên scope?
Trước BE-58, `GET /api/accounts` trả capability của **provider**: mọi account Gmail giống nhau. Giờ hai account Gmail có thể khác nhau: một cái đã cấp `gmail.send`, một cái chưa.

```text
capability của account = capability của connector
                         − SEND_MESSAGES  nếu scope đã cấp không chứa đủ sendScopes của connector
```

Module `account` giữ scope đã cấp (cột `account_credential.scopes`), còn **tên** scope gửi của Google là chuyện của connector Gmail. Nếu `account` tự viết `"https://www.googleapis.com/auth/gmail.send"`, mỗi provider mới lại phải sửa `account`: phụ thuộc chạy ngược chiều. Connector khai báo `sendScopes`, `account` chỉ so tập với tập (`containsAll`). Đây là cùng ý với D-51 cho `requiredScopes`.

`AccountCapabilities.of(accountId, provider)` làm phép tính đó, và được dùng ở hai chỗ:
- `AccountsController`: trường `capabilities` của mỗi account.
- `AccountDirectory.capabilitiesOf(AccountSummary)`: cho module khác (ở đây là `conversation`) hỏi mà không đụng vào bảng của `account`.

Vì sao `capabilitiesOf` nhận một `AccountSummary` mà không gắn capability vào chính `AccountSummary`? Danh sách Hộp thư đọc summary của mọi account ở mỗi request. Gắn capability vào đó thì mỗi request thêm một query credential cho từng account, chỉ để không ai dùng tới. Bản đầu nhận `accountId` và đọc lại account; review chỉ ra `Replies` vừa đọc chính account đó xong. Nhận summary đã đọc thì bỏ được lần đọc thừa.

`CredentialStore.grantedScopes` đọc cột `scopes`, cột này không mã hóa, nên không phải giải mã token chỉ để biết quyền.

### 1.4 Vì sao Gmail chưa khai báo `SEND_MESSAGES`
Hợp đồng của `MessageProvider` (FR-06) nói connector chỉ khai báo capability nó **thật sự** làm được. `GmailProvider.sendMessage` tới BE-59 mới có. Nếu khai báo `SEND_MESSAGES` ngay bây giờ, web sẽ hiện ô trả lời, người dùng bấm gửi và nhận lỗi. Nên ở BE-58, Gmail đã xin `gmail.send` và khai báo `sendScopes`, nhưng `reply.state` của mọi cuộc trò chuyện Gmail vẫn là `NOT_SUPPORTED`, đúng như trước. BE-59 thêm `SEND_MESSAGES` cùng lúc với `sendMessage`. Test của BE-58 dùng connector giả gửi được (mục 1.7).

### 1.5 `reply`: thứ tự các câu hỏi
`GET /api/conversations/{id}` giờ có `reply: { state, to }`. `state` trả lời câu "bấm gửi được không, và nếu không thì làm gì":

```text
provider có gửi được không?  --không-->  NOT_SUPPORTED       (kết nối lại cũng vô ích)
        | có
account AUTH_EXPIRED / DISABLED? --có-->  ACCOUNT_UNAVAILABLE (phải kết nối lại / bật lên)
        | không
account có SEND_MESSAGES?    --không-->  NEEDS_PERMISSION    (kết nối lại để cấp quyền gửi)
        | có
      READY
```

Thứ tự này có lý do. Một provider không bao giờ gửi được thì mọi lời khuyên khác đều sai, nên câu hỏi đó đứng đầu. Account hết hạn mà cũng thiếu quyền gửi thì "Kết nối lại" sửa được cả hai, nên `ACCOUNT_UNAVAILABLE` đứng trước `NEEDS_PERMISSION`. Tạm dừng đồng bộ (`syncEnabled = false`) không chặn việc gửi: đồng bộ và gửi là hai việc khác nhau.

### 1.6 Người nhận: quy tắc D-133
| Cuộc trò chuyện | `reply.to` |
|---|---|
| Thư đến mới nhất có `Reply-To` | các địa chỉ `Reply-To` (danh sách gửi thư thường đặt `Reply-To` về địa chỉ hỗ trợ) |
| Thư đến mới nhất không có `Reply-To`, hoặc lưu trước BE-54 (chưa biết người nhận) | người gửi thư đó |
| Thư mới nhất là thư của bạn | vẫn theo thư **đến** mới nhất, không phải người bạn vừa gửi tới |
| Chỉ có thư đi | `To` của thư đi mới nhất |
| Không tính được (không có thư, thư đến không rõ người gửi) | `[]` |

Server tính danh sách này, và BE-59 tính lại đúng như vậy lúc gửi, không nhận người nhận từ trình duyệt. Gửi thư là hành động đi ra ngoài; nếu server tin danh sách người nhận do trình duyệt gửi lên, ai sửa được request là gửi thư thay bạn tới bất kỳ đâu.

**Tách `StoredRecipients`.** Cột `message.recipients` (JSON `{to, cc, replyTo}`) trước chỉ có `MessageHistory` đọc, bằng một record lồng bên trong. Giờ `Replies` cũng cần đọc nó, nên phần đọc được tách thành record riêng `StoredRecipients` trong cùng package, thay vì chép thêm một bản.

### 1.7 Test: một cấu hình cho hai lớp test
`SendingProviders` (thư mục test, package `dev.sino.provider`) khai báo ba connector giả: `fake-mail` gửi qua OAuth2 khi có `mail.send`, `fake-read` không bao giờ gửi, `fake-chat` gửi mà không qua OAuth2. Hai lớp test (`AccountCapabilitiesApiTests`, `ConversationReplyApiTests`) cùng `@Import` nó với cùng `properties`.

- **Spring cache context theo cấu hình.** Hai lớp test có cấu hình giống hệt nhau thì dùng chung một application context, nên Spring chỉ khởi động một lần. Mỗi lớp tự khai báo `@TestConfiguration` lồng bên trong thì lại thành hai context khác nhau.
- **`fake-mail` cần một OAuth client có thật trong cấu hình.** `OAuth2Clients` không cho ứng dụng khởi động nếu một connector OAuth2 trỏ tới client không có. Nên test bật client Google giả (`sino.google.client-id`, `client-secret`), và `fake-mail` dùng chung client `google`.
- **Bẫy đã gặp:** bản đầu khai báo các property là một hằng `String[]` rồi viết `properties = SendingProviders.GOOGLE_CLIENT`. Không biên dịch được: giá trị của annotation phải là *hằng lúc biên dịch* (compile-time constant), mà một mảng `static final` không phải hằng. Hai hằng `String` riêng thì được: `properties = { SendingProviders.CLIENT_ID, SendingProviders.CLIENT_SECRET }`.

`AccountDirectoryServiceTests` là test lát cắt JPA (`@DataJpaTest`), chỉ nạp `AccountDirectoryService`. Giờ service này cần `AccountCapabilities`, nên test dùng `@MockitoBean` cho nó: test này kiểm *account nào* hiện ra, còn *account làm được gì* đã có `AccountCapabilitiesApiTests` kiểm trên dữ liệu thật.

### 1.8 Kiểm chứng (BE-58)
- **Đỏ trước:** `OAuth2ConnectionTests` 2 sai (chưa chép, chưa kiểm `sendScopes`), `GmailProviderTests` 1, `ConnectApiTests` 1, `AccountCapabilitiesApiTests` 3/5 (account chưa cấp quyền vẫn có `SEND_MESSAGES`), `ConversationReplyApiTests` 10/10 (chưa có `reply`). Lượt đỏ đầu tiên hỏng vì lý do khác: Docker Desktop đã tắt, Testcontainers không có database. Đọc đúng lỗi (`Could not find a valid Docker environment`) trước khi sửa gì, mở lại Docker rồi chạy lại.
- **Xanh:** các lớp trên, cùng `AccountsApiTests`, `ConversationsApiTests`, `ConversationMessagesApiTests`, `OAuth2ClientsTests`, `AccountDirectoryServiceTests`, `ModularityTests`.
- **Kiểm tra ngược:** 16 lỗi gài, 14 bị bắt. Hai lỗi sống sót là tương đương: bỏ một trong hai lối tắt đầu `AccountCapabilities.of` (`sendScopes.isEmpty()`, `!supports(SEND_MESSAGES)`) cho cùng kết quả, chỉ tốn thêm một query. Chúng chỉ để khỏi đọc scope khi chắc chắn không cần.
- **Review** (agent `senior-reviewer`): không có lỗi nặng.
  - MEDIUM: không test nào bắt được nếu đổi chỗ kiểm `ACCOUNT_UNAVAILABLE` và `NEEDS_PERMISSION`, vì test hết hạn dùng account đã có quyền gửi. Thêm test account hết hạn chỉ có quyền đọc; gài lỗi đổi chỗ thì đúng test đó đỏ.
  - LOW đã sửa: đọc account hai lần (mục 1.3), constructor mặc định (mục 1.2), JSON thiếu key thành `NullPointerException`, thư đi không rõ người nhận.
  - LOW ghi lại cho BE-59/BE-60 trong design: `READY` mà `to` rỗng, N+1 của danh sách account khi Gmail gửi được, kiểm scope thật khi bỏ tick trên Google.
- **Toàn bộ:** `./mvnw -B -ntp verify` trước khi sửa theo review: 1208 test, 0 lỗi, 4 bỏ qua. Sau khi sửa: 7 lớp liên quan xanh; lượt `verify` của agent bị dừng vì máy thiếu bộ nhớ, bạn chạy lại ở cây chính: 1190 test (cộng từ các file báo cáo, cách đếm khác với tổng Surefire in ra màn hình), 0 sai, 0 lỗi, 4 bỏ qua.

---

## 2. Gửi thư trả lời qua Gmail, không bao giờ gửi trùng (BE-59)

**Ở đâu:** `provider/spi/{SendMessageCommand,MessageProvider,ProviderErrorCode}.java`, `provider/infrastructure/gmail/{GmailReply (mới),GmailApi,GmailProvider}.java`, `db/migration/V17__conversation_add_message_client_message_id.sql`, `conversation/SentMessages.java` (mới), `conversation/application/{ReplyService (mới),ConversationErrorCode,MessageHistory,InboxMessage}.java`, `conversation/infrastructure/ConversationSummaries.java`, `conversation/api/{ConversationMessagesController,MessageResponse}.java`, `common/error/ErrorCategory.java`, `common/web/GlobalExceptionHandler.java`, `sync/application/{ImportRunner,LiveSyncSchedule}.java`.

### 2.1 Vì sao gửi thư khó hơn đọc thư
Đọc một thư hai lần thì vô hại. Gửi một thư hai lần thì người nhận nhận hai thư. Mọi thiết kế của BE-59 xoay quanh một câu hỏi: **khi có gì đó hỏng, Sino có chắc thư đã đi hay chưa?**

```text
                 bấm Gửi (clientMessageId = X)
                          |
   transaction 1:  ghi dòng PENDING (X)       <- trước khi Gmail nghe thấy gì
                          |
   ngoài transaction: Gmail messages.send     (tối đa 15 giây)
          |                  |                        |
       200 + id        từ chối (4xx, 429,       không có câu trả lời
          |            không kết nối được)      (hết giờ, 5xx, đứt kết nối)
          v                  v                        v
   transaction 2:   SENT               FAILED                 UNKNOWN
                   201                 502 SEND_FAILED        504 SEND_OUTCOME_UNKNOWN
                                       (gửi lại được)         (không được gửi lại mù)
                                                                  |
                                    sau mỗi lượt đồng bộ, và mỗi phút: hỏi Gmail
                                    "có thư Message-ID <sino.X@...> không?"
                                          có -> SENT;  không, quá 10 phút -> FAILED
```

### 2.2 Câu gợi ý của task: vì sao ghi `PENDING` trước khi gọi Gmail?
Giả sử làm ngược lại: gọi Gmail trước, xong mới ghi vào database. Gmail gửi xong, rồi backend sập (hay database lỗi) trước khi kịp ghi. Không có dòng nào nói thư đã đi. Web không nhận được câu trả lời, người dùng bấm "Gửi lại", và thư đi lần hai.

Ghi `PENDING` trước thì mọi lần gọi lại với cùng `clientMessageId` đều thấy dòng đó:

| Dòng đã có với `clientMessageId` này | Request mới |
|---|---|
| `SENT` | `200` với chính thư đó, không gửi |
| `PENDING` | `409 SEND_IN_PROGRESS`, không gửi |
| `UNKNOWN` | `409 SEND_OUTCOME_UNKNOWN`, không gửi |
| `FAILED` | chắc chắn chưa đi: gửi lại, cùng dòng đó |

Đây là kỹ thuật **idempotency key**: phía gọi (web) tạo một ID cho mỗi hành động và gửi lại đúng ID đó khi thử lại; phía nhận nhớ ID và biến các lần gọi lặp thành một. V17 thêm cột `client_message_id` với một **unique index có điều kiện** (`WHERE client_message_id IS NOT NULL`): thư không do Sino gửi đều là `NULL`, và chỉ các giá trị khác `NULL` mới phải duy nhất trong một cuộc trò chuyện.

Còn một chỗ hai request có thể chen nhau: hai request cùng ID tới cùng lúc, cả hai đều thấy "chưa có dòng nào". Transaction 1 lấy `pg_advisory_xact_lock` của account (khóa mà việc lưu thư của đồng bộ cũng lấy), nên request sau chờ request trước commit, rồi thấy `PENDING`. Ngoài ra, `resend` cập nhật `WHERE status = 'FAILED'` và kiểm số dòng: không cập nhật được dòng nào nghĩa là có request khác đã nhận gửi thư đó, nên request này dừng với `409` chứ không gửi theo (review BE-59). Test `twoSendsOfTheSameMessageAtOnceSendItOnce` giữ lần gửi đầu đứng chờ bên trong provider giả bằng `CountDownLatch`, gửi request thứ hai, và kiểm provider chỉ được gọi một lần.

### 2.3 "Không rõ" khác "thất bại" (D-135)
Hết hạn chờ có hai nghĩa rất khác nhau:

| Hỏng ở đâu | Thư đã đi chưa | Mã |
|---|---|---|
| Không mở được kết nối (`ConnectException`, `HttpConnectTimeoutException`, `UnknownHostException`) | chắc chắn chưa | `PROVIDER_UNAVAILABLE`, thư `FAILED` |
| Gmail trả 4xx, 429 | chắc chắn chưa (Gmail đã từ chối) | `REQUEST_REJECTED`, `RATE_LIMITED`, thư `FAILED` |
| Request đã đi, không có câu trả lời trong 15 giây | không biết | `OUTCOME_UNKNOWN`, thư `UNKNOWN` |
| Gmail trả 5xx cho lệnh gửi | không biết (Gmail có thể đã gửi rồi mới lỗi) | `OUTCOME_UNKNOWN` |
| Kết nối đứt giữa lúc đọc câu trả lời | không biết | `OUTCOME_UNKNOWN` |

`GmailApi.sendFailure` lần theo chuỗi `getCause()` của exception: thấy một trong ba lỗi kết nối thì chắc chắn chưa gửi; còn lại thì coi là không biết. Mặc định là "không biết" vì đó là phía an toàn: một thư `UNKNOWN` có thể chờ đối chiếu, còn một thư `FAILED` thì mời người dùng gửi lại.

Việc gửi có `RestClient` riêng với hạn chờ 15 giây (các lời gọi Gmail khác 10 giây). Test dùng hạn đọc 5 giây và hạn gửi 1 giây, rồi cho WireMock trả lời chậm 2,5 giây: nếu code lỡ gửi bằng client đọc, test sẽ nhận được câu trả lời thay vì hết giờ (review BE-59).

### 2.4 Đối chiếu: hỏi lại Gmail theo dấu Sino để lại (D-132, D-138)
Mỗi thư Sino gửi mang `Message-ID: <sino.<clientMessageId>@gmail.com>`, một header chuẩn của email (RFC 5322) mà mỗi thư có một giá trị duy nhất. Sau này Sino tìm lại bằng truy vấn tìm kiếm của Gmail `rfc822msgid:<...>`. Thấy thì thư `SENT` với ID của Gmail; quá 10 phút vẫn không thấy thì `FAILED`.

Ai gọi đối chiếu:
- **Sau mỗi lượt đồng bộ thành công** (`ImportRunner`): lượt đồng bộ vừa nhập thư mới, nên đây là lúc gộp nhanh nhất.
- **Mỗi phút, trên luồng riêng** (`LiveSyncSchedule.checkSentMessages`). Bản đầu chỉ có cách trên, và review chỉ ra: account đang tạm dừng đồng bộ, đang import, hay đồng bộ lỗi liên tục sẽ không bao giờ có lượt đồng bộ thành công, nên thư `UNKNOWN` của nó kẹt mãi. Luồng riêng (`Executors.newSingleThreadExecutor` cùng một `AtomicBoolean`) giữ cho luồng lập lịch duy nhất không bao giờ phải chờ Gmail, và mỗi lúc chỉ một lượt đối chiếu chạy.

Hai ngưỡng thời gian:
- `PENDING` quá **5 phút** cũng được hỏi: lần gửi đã chết giữa chừng (backend sập giữa transaction 1 và 2). Không lấy 1 phút, vì một lần gửi gặp token hết hạn được `ProviderAccess` làm lại từ đầu (đọc profile, đọc thư gốc, gửi) có thể quá một phút.
- Connector không có cách tìm (`findSentMessage` ném `CAPABILITY_NOT_SUPPORTED`) thì thư ở `UNKNOWN` mãi, không bao giờ `FAILED`: "không biết" không được hiểu thành "không có" (review BE-59).

### 2.5 Đồng bộ nhập thư trước khi Sino kịp ghi `SENT`
Gmail trả `id` cho lệnh gửi. Trong khoảnh khắc trước transaction 2, lượt đồng bộ có thể đã nhập chính thư đó với cùng `id`, thành một dòng thứ hai. Transaction 2 (và cả đối chiếu) kiểm: có dòng nào khác mang `external_message_id` này không? Có thì giữ dòng của đồng bộ, chép `client_message_id` sang, xóa dòng `PENDING`. Một thư luôn chỉ là một dòng. Khóa của account bảo đảm hai bên không ghi chen nhau.

Thư Sino gửi mà chưa `SENT` không được tính vào tóm tắt của cuộc trò chuyện (`ConversationSummaries`): một thư trả lời bị Gmail từ chối không làm cuộc trò chuyện rời khỏi "Cần trả lời" (review BE-59).

### 2.6 Dựng thư MIME bằng tay (`GmailReply`)
Gmail nhận thư dưới dạng thô RFC 5322, mã base64url, trong trường `raw`.

```text
From: me@gmail.com
To: =?UTF-8?B?QW4gTmd1eeG7hW4=?= <an@example.com>
Subject: =?UTF-8?B?UmU6IELDoW8gY8OhbyB0aMOhbmcgOQ==?=
Message-ID: <sino.6f1c...@gmail.com>
In-Reply-To: <orig@mail.example.com>
References: <first@mail.example.com>
 <orig@mail.example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: base64

RW0gbmjhuq1uIMSRxrDhu6NjIHLhu5NpLg==
```

- **RFC 2047 encoded word** `=?UTF-8?B?...?=`: header email vốn chỉ cho ASCII, nên chữ có dấu được mã base64 trong một "từ mã hóa". Mỗi từ tối đa 75 ký tự; `GmailReply` cắt chữ thành từng khúc 39 byte, không bao giờ cắt giữa một ký tự nhiều byte.
- **Gập dòng** (folding): một dòng header nên dưới 78 ký tự; dòng sau bắt đầu bằng khoảng trắng là phần tiếp của dòng trước. Nhiều người nhận, nhiều ID trong `References`, mỗi cái một dòng.
- **Không cho chèn header** (header injection): tên người, chủ đề, `Message-ID` đều đến từ thư người khác gửi. Một tên chứa `\r\nBcc: ai@do.com` sẽ thêm một người nhận ẩn nếu được ghi nguyên văn. `GmailReply` thay mọi xuống dòng bằng khoảng trắng, và chỉ nhận các `Message-ID` đúng dạng `<...>`.
- **Giữ thread**: `threadId` của Gmail cùng `In-Reply-To`/`References` theo thư mới nhất và `Subject` bắt đầu bằng `Re:` (không lặp khi đã có). Ứng dụng thư của người nhận cũng nhờ hai header này xếp thư vào đúng cuộc trò chuyện.

### 2.7 Một mã lỗi, hai mã HTTP
Contract với web hứa `504 SEND_OUTCOME_UNKNOWN` cho lần gửi không có câu trả lời, và `409 SEND_OUTCOME_UNKNOWN` khi gọi lại một thư đang `UNKNOWN`. Trong Sino, mỗi `ErrorCode` có một `ErrorCategory`, và mỗi category có một mã HTTP. Nên có hai hằng số: `SEND_OUTCOME_UNKNOWN` (category mới `PROVIDER_OUTCOME_UNKNOWN`, `504`) và `SEND_OUTCOME_STILL_UNKNOWN` (`CONFLICT`, `409`). Hằng số thứ hai ghi đè `code()` để trả cùng chuỗi `SEND_OUTCOME_UNKNOWN`. Web phân biệt bằng mã HTTP.

### 2.8 Kiểm chứng (BE-59)
- **Đỏ trước:** contract đỏ đúng 5 chỗ (`SendMessageTests` 3, `MessageProviderTests` 1, `ProviderErrorCodeTests` 1: chưa có `OUTCOME_UNKNOWN`). `ConversationSendApiTests` chạy trên khung rỗng: 20 test, 16 sai vì chưa có `POST` (`405`), 3 lỗi vì chưa có cột và endpoint. Các test đối chiếu: 4 test đỏ trên một `reconcile` rỗng. Sau review: 3 test mới đỏ trên bản trước khi sửa.
- **Chỗ lệch TDD:** `GmailReplyTests` và `GmailSendTests` chạy lần đầu cùng lúc với code, không có lượt đỏ. Lượt đầu `GmailSendTests` có 1 test sai, và lỗi nằm ở chính test: `References` dài đã được gập thành hai dòng (mục 2.6), test phải nối lại trước khi so. Vì không có lượt đỏ, bằng chứng hai lớp này bắt được lỗi là kiểm tra ngược bên dưới.
- **Kiểm tra ngược:** 35 lỗi gài, chạy hai đợt vì đợt đầu bị dừng sau 25 lỗi do máy thiếu bộ nhớ. 32 bị bắt.
  - Hai lỗi sống sót ở đợt đầu chỉ ra hai test còn lỏng. Bỏ hàm xóa xuống dòng mà `aLineBreakInStoredTextCannotAddAHeader` vẫn xanh, vì test chỉ kiểm "không có header `Bcc`", và việc đó đã có lớp khác lo: `isAscii` coi `\r\n` là ký tự lạ, nên chủ đề bị mã hóa RFC 2047 và không còn xuống dòng thật. Test giờ kiểm thêm chủ đề người nhận đọc được chỉ có một dòng. Đổi điều kiện "thư của account này" thành "thư của mọi account" mà test cũ vẫn xanh, vì test chỉ có một account. Giờ test có account thứ hai mang một thư `UNKNOWN`, và thư đó phải đứng yên. Chạy lại: cả hai đều bị bắt.
  - Ba lỗi còn sống là tương đương, tức code đổi mà hành vi nhìn từ ngoài không đổi. `pending-sent-again` và `resend-unguarded` là hai hàng rào chống gửi lại: bỏ một cái thì cái kia vẫn trả `409` (mục 2.2). `sweep-every-account` bỏ bộ lọc account `DISABLED`/`AUTH_EXPIRED` trong `reconcileAll`, nhưng `ProviderAccess` vẫn từ chối các account đó trước khi gọi Gmail. Bộ lọc chỉ để khỏi ghi một dòng log cảnh báo mỗi phút cho account đang chờ kết nối lại.
- **Review** (agent `senior-reviewer`):
  - HIGH: account tạm dừng đồng bộ thì thư `UNKNOWN` kẹt mãi. Sửa bằng nhịp đối chiếu riêng (mục 2.4).
  - MEDIUM: thư gửi lỗi làm cuộc trò chuyện rời "Cần trả lời" (mục 2.5); `findSentMessage` mặc định trả "không thấy" khiến thư thành `FAILED` dù connector không biết (mục 2.4); hai request cùng ID cùng lúc (mục 2.2).
  - LOW đã sửa: test dùng hạn gửi khác hạn đọc (mục 2.3), ngưỡng `PENDING` từ 1 lên 5 phút, số quyết định D-135…D-138 ghi vào design.
- **Toàn bộ:** `./mvnw -B -ntp verify` lần đầu: 1269 test, 1 sai (`GmailWiringTests` còn chờ danh sách capability cũ, chưa có `SEND_MESSAGES`), sửa test. Lần hai: 1277 test, 0 lỗi, 4 bỏ qua. Phiên planner commit module mới lên `dev` trong lúc làm, nên chạy lại trên nền mới nhất `9faf0c6`: 1322 test, 0 sai, 0 lỗi, 4 bỏ qua.
- **Chưa kiểm (NOT VERIFIED):** gửi thật qua Gmail; Gmail có giữ `Message-ID` Sino đặt không; truy vấn `rfc822msgid:` có tìm thấy thư không. Làm ở BE-60, chỉ gửi khi bạn cho phép.
