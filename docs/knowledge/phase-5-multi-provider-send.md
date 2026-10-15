# Kiến thức Phase 5 — Nhiều provider và gửi tin

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F10, `openspec/changes/f10-reply` (trả lời một thư ngay trong Sino), được kéo lên làm ngay sau F06 vì bạn ưu tiên "kết nối và nhắn tin" (2026-10-09). Đã xong: BE-58, BE-59, BE-60 (chạy thật với Gmail; đối chiếu thư "chưa rõ" theo thread vì Gmail thay `Message-ID`), BE-62 (thư Sino gửi mang tên người gửi). F09 (provider thứ hai: Zalo cá nhân, `openspec/changes/zalo-personal`) mở 2026-10-14, bạn tự code ZL-01 (khung service `sino-zalo`, mục 5); từ ZL-02 (đăng nhập QR, mục 6) bạn chuyển change này sang AUTO.
> **Cập nhật:** 2026-10-15. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`; đường dẫn của `sino-zalo` tính từ `apps/sino-zalo/`.

---

## 0. Bức tranh: trả lời một thư từ Sino

```text
 (BE-58) Sino biết account gửi được không, và thư sẽ tới ai
          GET /api/conversations/{id} -> reply: { state, to }
                         |
 (BE-59) người dùng bấm Gửi
          POST .../messages -> ghi PENDING -> Gmail messages.send -> SENT / FAILED / UNKNOWN
                         |
 (BE-60) chạy thật: Gmail thay Message-ID của Sino -> đối chiếu trong thread theo người nhận, chữ, thời điểm
```

| Quyết định | Nội dung |
|---|---|
| D-130 | Xin `gmail.send` khi kết nối nhưng không bắt buộc; tài khoản cũ cấp thêm bằng "Kết nối lại" |
| D-131 | Gửi ngay trong request; chống gửi trùng bằng `clientMessageId` |
| D-132 | Kết quả không rõ thì không gửi lại mù, đối chiếu với Gmail; ~~theo `Message-ID`~~ theo thread, người nhận, chữ và thời điểm (BE-60, bạn chốt) |
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
> **Đã thay ở BE-60 (mục 3):** chạy thật cho thấy Gmail không giữ `Message-ID` của Sino. Phần dưới tả cách của BE-59; phần "ai gọi đối chiếu" và "hai ngưỡng thời gian" vẫn đúng.

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
> Từ BE-60 thư không còn dòng `Message-ID` (Gmail tự đặt, mục 3). Mọi thứ khác trong mục này vẫn đúng.

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
- **Chưa kiểm (NOT VERIFIED):** gửi thật qua Gmail; Gmail có giữ `Message-ID` Sino đặt không; truy vấn `rfc822msgid:` có tìm thấy thư không. Làm ở BE-60, chỉ gửi khi bạn cho phép. **Đã kiểm ở BE-60:** gửi được; Gmail **không** giữ `Message-ID`, nên `rfc822msgid:` không tìm ra (mục 3).

---

## 3. Chạy thật với Gmail, và đối chiếu lại từ đầu (BE-60)

**Ở đâu:** test `provider/infrastructure/gmail/RealGmailReplyTests.java` (thư mục `src/test/java/dev/sino/`), `provider/spi/MessageProvider.java` (`findSentMessages`), `provider/infrastructure/gmail/{GmailProvider,GmailApi,GmailMessageNormalizer,GmailReply}.java`, `conversation/application/ReplyService.java`.

### 3.1 Test chạy thật mà không gửi bừa
Một test gửi thư thật thì không được chạy nhầm. `RealGmailReplyTests` có ba lớp chặn:
- gắn tag `real-gmail`, nên `./mvnw test` thường và CI bỏ qua;
- tự bỏ qua nếu không được chỉ rõ cuộc trò chuyện và **một** người nhận (`-Dsino.real-gmail.reply.conversation=…`, `-Dsino.real-gmail.reply.to=…`), và chỉ gửi khi `reply.to` của cuộc trò chuyện đúng bằng địa chỉ đó;
- chạy lại thì dùng lại `clientMessageId` của thư đã gửi trong cuộc trò chuyện, nên lần sau chỉ nhận `200`, không gửi thêm (chính cơ chế chống trùng của BE-59).

Lần chạy thật dùng thư trả lời bạn đã gửi từ web lúc 08:45:18, nên không có thư mới nào phải gửi.

### 3.2 Điều chạy thật tìm ra: Gmail thay `Message-ID`
| Header | Sino viết | Gmail lưu |
|---|---|---|
| `Message-ID` | `<sino.f55f1b37-…@gmail.com>` | `<CACwnYVC…@mail.gmail.com>`, của Gmail |
| `In-Reply-To`, `References` | ID thư gốc | giữ nguyên |

Cả cơ chế đối chiếu của BE-59 dựa trên một giả định: Gmail giữ `Message-ID` do Sino đặt. Test với WireMock không thể bắt được giả định sai này, vì WireMock trả đúng những gì test bảo nó trả. Design đã ghi giả định đó là rủi ro "phải kiểm trên Gmail thật", và lần chạy thật là chỗ duy nhất kiểm được. Bài học: hành vi của một hệ thống bên ngoài thì chỉ hệ thống đó trả lời được; test giả chỉ kiểm code của mình làm đúng với giả định.

Nếu không sửa: thư "chưa rõ" không bao giờ được tìm thấy, sau 10 phút thành `FAILED`, người dùng bấm "Gửi lại", và thư có thể đi hai lần. Đó đúng là điều D-131 hứa không xảy ra.

### 3.3 Cách đối chiếu mới (bạn chốt: "Theo thread + chữ + thời điểm")
Sino biết thư được gửi vào thread nào (`threadId`), tới ai, với chữ gì, và lúc nào bắt đầu gửi. Gmail đọc cả thread (`threads.get`, `format=full`) rồi giữ những thư thỏa cả bốn điều:

```text
  thread của cuộc trò chuyện
    |
    +-- nhãn SENT?                      (thư đến, thư nháp: loại)
    +-- Gmail nhận trong khoảng
    |     [bắt đầu gửi - 1 phút, bắt đầu gửi + 5 phút]
    |     1 phút: đồng hồ Google và database có thể lệch
    |     5 phút: ProviderAccess có thể chạy lại lần gửi sau khi làm mới token
    +-- To giống hệt người nhận của Sino (không phân biệt hoa thường)
    +-- chữ giống hệt, đọc như đồng bộ đọc (CRLF -> LF, bỏ khoảng trắng cuối)
    |
  -> mọi thư khớp, sớm nhất trước
```

"Lúc bắt đầu gửi" là `sent_at` của dòng, ghi bằng `now()` ở transaction 1, trước khi gọi Gmail; gửi lại sau `FAILED` thì ghi lại. Một thư có thân hỏng (base64 sai) không làm cả lượt đối chiếu dừng: nó chỉ "không khớp".

Trên Gmail thật, thread "xin chào" là ca thử tốt: có hai thư đi cùng chữ "xin chào", một bạn gửi từ Gmail lúc 08:40:52, một Sino gửi lúc 08:45:19. Tìm từ lúc Sino bắt đầu gửi (08:45:18) chỉ ra thư của Sino; thư 08:40:52 nằm ngoài khoảng.

### 3.4 Review tìm ra: cùng chữ gửi hai lần
Bản đầu trả về **một** thư (sớm nhất). Review chỉ ra kịch bản: thư A "chưa rõ", bạn gõ lại đúng chữ đó thành thư B, B gửi được. Đối chiếu A thấy thư của B (cùng chữ, cùng người nhận, trong khoảng), xóa dòng A và ghi đè `clientMessageId` của B. Nếu sau đó web gửi lại B, Sino không còn biết B đã đi, và gửi lần hai.

Sửa có hai lớp:
- contract trả **mọi** ứng viên (`List<String> findSentMessages(...)`). `ReplyService`, khi đang giữ khóa của account, lấy ứng viên đầu tiên chưa thuộc một thư khác của Sino (`heldByAnother`);
- `confirm` chỉ chép `clientMessageId` sang dòng đã nhập khi dòng đó chưa thuộc ai (`WHERE ... AND (client_message_id IS NULL OR client_message_id = :client)`); không được thì ném lỗi, và transaction hoàn tác cả lệnh xóa trước đó.

Hai lớp này che cho nhau, như hai hàng rào chống gửi lại ở mục 2.2: lớp đầu làm cho lớp sau không bao giờ bị chạm tới, nên kiểm tra ngược bỏ lớp sau thì test vẫn xanh.

**Bẫy đã gặp:** lần sửa đầu đổi thứ tự thành "chép `clientMessageId` sang dòng đã nhập, rồi mới xóa dòng của Sino". Unique index của V17 (`conversation_id, client_message_id`) lập tức báo trùng, vì trong khoảnh khắc đó hai dòng cùng mang một ID. Phải xóa trước rồi mới chép; muốn chặn thì kiểm số dòng được cập nhật và để transaction hoàn tác.

### 3.5 Contract đổi: vì sao truyền lại cả lệnh gửi
`findSentMessages(context, command, startedAt)` nhận lại đúng `SendMessageCommand` đã gửi (dựng lại từ dòng trong database) và lúc bắt đầu gửi. Mỗi connector tự chọn cách tìm: Gmail dùng thread, người nhận, chữ, thời điểm; một provider khác có thể có ID riêng cho mỗi lần gửi và chỉ cần `clientMessageId` trong lệnh. `conversation` không phải biết gì về email. Kiểu trả về là danh sách vì cách tìm theo chữ không cho kết quả duy nhất; bên biết thư nào đã thuộc về ai (database) là bên chọn.

### 3.6 Kiểm chứng (BE-60)
- **Chạy thật:** thư thật duy nhất là thư bạn gửi từ web lúc 08:45:18. Ba lượt test sau đó dùng lại `clientMessageId` của nó, nên không có thư nào khác đi.
  - Lượt 1, code BE-59: mọi thứ đúng trừ việc tìm lại; `rfc822msgid:` không ra gì sau 2 phút. Một test dò tạm đọc header và thấy Gmail đã thay `Message-ID` (mục 3.2).
  - Lượt 3, code cuối: trong thread chỉ một thư khớp, thư của Sino; thư "xin chào" 08:40:52 nằm ngoài khoảng thời gian; đồng bộ xong vẫn một dòng.
- **Đỏ trước:** `GmailSendTests` 3 test sai trên khung chưa làm gì, `ConversationSendApiTests` 1. Hai test "không thấy" xanh ngay trên khung vì khung luôn trả rỗng; chúng chỉ có nghĩa sau khi có code thật.
- **Chỗ lệch TDD:** phần sửa lỗi HIGH của review (mục 3.4) được viết trước test của nó. Bằng chứng test bắt được lỗi là kiểm tra ngược: bỏ lớp lọc `heldByAnother` thì test mới đỏ.
- **Kiểm tra ngược:** trên code cuối, 23 lỗi gài, 20 bị bắt. Hai lỗi sống sót chỉ ra code thừa, và code đó đã được bỏ: `MailHeaders` vốn đã viết thường địa chỉ, và dòng đang đối chiếu không bao giờ giữ ID Gmail nào. Lỗi còn lại là hai hàng rào che cho nhau (mục 3.4).
- **Review** (agent `senior-reviewer`): HIGH cùng chữ gửi hai lần (mục 3.4); MEDIUM provider giả còn tìm theo cách cũ, tài liệu còn tả `Message-ID`; LOW đã sửa: thread không có thư bị coi là "không có", chưa có cận trên, chưa so người nhận, mép khoảng thời gian chưa có test. Các giới hạn còn lại ghi ở design D-132.
- **Toàn bộ:** `./mvnw -B -ntp verify` trên `dev` mới nhất: 1427 test, 0 sai, 0 lỗi, 4 bỏ qua.
- **Chưa kiểm (NOT VERIFIED):** một lần gửi "không rõ" thật trên Gmail (không ép được mà không gửi thêm thư); bỏ tick quyền gửi trên màn đồng ý; thread quá 100 thư; thư rất dài; thư trả lời khi thư gốc đã bị xóa.

---

## 4. Thư Sino gửi mang tên người gửi (BE-62)

**Ở đâu:** `provider/spi/SendMessageCommand.java` (`senderName`), `conversation/application/ReplyService.java` (câu truy vấn tên), `provider/infrastructure/gmail/{GmailProvider,GmailReply}.java` (`From`).

### 4.1 Lỗi bạn thấy
Thư Sino gửi chỉ có `From: tienct07@gmail.com`. Gmail của người nhận vì thế hiện địa chỉ trần với avatar chữ cái, còn thư gửi từ Gmail web hiện "Nguyễn Tiến". Account nhận thư trong Sino (`bonzed2001`) cũng không có tên người gửi, nên dòng trong Hộp thư chỉ ghi địa chỉ.

### 4.2 Hướng đầu tiên sai, và kiểm trước khi kết luận
Hướng đầu: hỏi Gmail tên gửi của địa chỉ (`users.settings.sendAs`), đọc được bằng quyền `gmail.readonly` có sẵn. Test với WireMock xanh. Nhưng trước khi coi là xong, một test chỉ đọc trên Gmail thật cho thấy `displayName` **rỗng** ở cả hai account. Tên Gmail web ghi là tên tài khoản Google, một nguồn khác hẳn, chỉ đọc được khi xin thêm quyền `profile`.

Đây là cùng bài học với mục 3.2: test giả chỉ trả lời "code có làm đúng với giả định không", còn giả định về hệ thống bên ngoài thì phải hỏi chính hệ thống đó.

### 4.3 Nguồn tên bạn chọn: thư account tự gửi
Sino đã lưu sẵn người gửi của mọi thư nhập về. Thư account tự gửi bằng Gmail web có `From: Nguyễn Tiến <tienct07@gmail.com>`, nên người gửi của các thư đó có đúng cái tên Gmail web dùng. Câu truy vấn trong `ReplyService` lấy tên đó:

```text
  mọi cuộc trò chuyện của account
    -> thư đi (OUTBOUND)
    -> không phải thư Sino gửi (client_message_id IS NULL): thư Sino gửi không có tên của riêng nó
    -> người gửi có tên (bỏ tên rỗng)
    -> thư gần nhất trước (bạn đổi tên thì lấy tên mới)
```

Trên dữ liệu thật: "Nguyễn Tiến" cho `tienct07`, "Sinon sama" cho `bonzed2001`, khớp Gmail web. Account chưa từng gửi thư bằng ứng dụng khác thì không có tên, và thư đi chỉ có địa chỉ như trước.

Tên đi qua contract trong `SendMessageCommand.senderName`, nên connector không phải biết database. Gmail ghi `From` bằng đúng hàm đã ghi `To` (`GmailReply.mailbox`): chữ có dấu thành RFC 2047, tên có dấu phẩy hay ngoặc kép được bọc ngoặc kép, xuống dòng bị bỏ. Record tự chuẩn hóa: tên trống hoặc chỉ có khoảng trắng thành `null`, có khoảng trắng đầu cuối thì bỏ đi.

### 4.4 Kiểm tra ngược chỉ ra hai điều kiện trùng nhau
Bản đầu lọc cả `m.direction = 'OUTBOUND'` lẫn `p.is_self`. Thư đi thì người gửi luôn là chính account, nên bỏ một trong hai điều kiện thì kết quả không đổi, và hai lỗi gài cùng sống sót. Bỏ `p.is_self`, giữ điều kiện nói đúng ý "thư account tự gửi". Sau đó, bỏ điều kiện hướng thư thì test lấy nhầm tên "Alice" của thư đến và đỏ. Lỗi gài thứ ba (đảo thứ tự, lấy thư cũ nhất) sống sót vì chưa có test nào có hai tên khác nhau; thêm test "bạn đổi tên".

### 4.5 Kiểm chứng (BE-62)
- **Đỏ trước:** 5 test đỏ trên khung (chuẩn hóa tên, tên từ thư account tự gửi, `From` mang tên). Test "thư Sino gửi không tính làm nguồn tên" xanh ngay trên khung vì khung luôn trả `null`; bằng chứng nó bắt được lỗi là lỗi gài bỏ điều kiện `client_message_id IS NULL`.
- **Kiểm tra ngược:** 8 lỗi gài, 5 bị bắt; ba lỗi sống sót dẫn tới bỏ một điều kiện trùng và thêm test "bạn đổi tên" (mục 4.4); chạy lại 7/7 bị bắt.
- **Bẫy khi chạy:** một lượt kiểm tra ngược có JVM sập vì máy thiếu bộ nhớ (file `hs_err_pid*.log`). Script đếm "test thất bại" là "lỗi bị bắt", nên một lần sập có thể làm một lỗi gài sống sót trông như bị bắt. Thấy log sập thì chạy lại cả đợt.
- **Dữ liệu thật:** câu truy vấn cho "Nguyễn Tiến" và "Sinon sama", khớp Gmail web. Chưa gửi thư thật nào mang tên: bạn sẽ thấy ở lần trả lời tới từ web, sau khi chạy backend mới.
- **Toàn bộ:** `./mvnw -B -ntp verify` trên `dev` mới nhất: 1434 test, 0 sai, 0 lỗi, 4 bỏ qua.

---

## 5. Zalo cá nhân: khung service `sino-zalo` (ZL-01)

**Ở đâu:** `apps/sino-zalo/` (mới): `package.json`, `tsconfig.json`, `.oxlintrc.json`, `vitest.config.ts`, `.env.example`, `README.md`, `src/{server,app,config,auth}.ts`, `test/{config,auth,health}.test.ts`. Bạn tự gõ phần cấu hình và `src/`; ba file test do Claude viết theo lời bạn nhờ.

### 5.1 Vì sao một service Node riêng (D-273)
Zalo cá nhân không có API chính thức. Cách duy nhất chạy được là thư viện không chính thức zca-js, giả làm Zalo Web, và nó chỉ chạy trên Node. `sino-api` là Java nên không gọi thẳng được. Vì vậy Sino có thêm một service nhỏ đứng giữa:

```text
 sino-web  -->  sino-api (Java, cổng 8080)  -- HTTP nội bộ + khóa bí mật -->  sino-zalo (Node, cổng 8090)  -->  Zalo
                       ^                                                              |
                       +--------------- "có tin mới" (webhook) -----------------------+
```

`sino-zalo` không có database và không ghi gì xuống đĩa. Phiên Zalo được lưu mã hóa ở `sino-api` (D-274), và mọi dữ liệu nghiệp vụ vẫn nằm ở `sino-api` cùng PostgreSQL. **Phương án đã bỏ:** viết lại giao thức Zalo bằng Java (phải tự chép mã hóa, websocket, định dạng gói tin, và tự dò lại mỗi lần Zalo đổi); cho Node ghi thẳng vào PostgreSQL (đi vòng qua `conversation` và `sync`, mất chống trùng và checkpoint).

### 5.2 Một project Node + TypeScript, đọc theo kiểu Java
| `sino-zalo` | Bên `sino-api` | Ghi chú |
|---|---|---|
| `package.json` | `pom.xml` | tên, thư viện (`dependencies` lúc chạy, `devDependencies` lúc phát triển), lệnh (`scripts`) |
| `pnpm install` | `./mvnw` tải thư viện | `pnpm-lock.yaml` ghi đúng bản đã cài, có commit |
| Fastify | Spring MVC | web framework: route, hook |
| Vitest, `app.inject` | JUnit, `MockMvc` | test gửi request giả, không mở cổng |
| `pnpm typecheck` (`tsc`) | `javac` | kiểm kiểu |
| `pnpm lint` (oxlint) | inspection của IntelliJ | bắt chỗ cẩu thả |

**Node chạy thẳng file `.ts`**: nó chỉ xóa phần kiểu rồi chạy, không có bước build. Hai hệ quả:
- **Node không kiểm kiểu.** Code sai kiểu vẫn chạy, rồi sập giữa chừng (`Cannot read properties of undefined`). Với service này, `pnpm typecheck` đóng vai `javac`; bỏ qua nó thì lỗi kiểu chỉ lộ ra lúc chạy thật.
- **Chỉ dùng cú pháp Node xóa được.** `tsconfig.json` bật `erasableSyntaxOnly`, nên `enum`, `namespace`, `constructor(private x)` bị `tsc` báo lỗi ngay, thay vì Node hỏng lúc chạy. `allowImportingTsExtensions` cho phép import kèm đuôi file (`./config.ts`), vì đó là file thật Node sẽ mở.

**Bẫy:** tạo file bằng cách copy tên dễ dính dấu cách cuối tên. Windows không cho tên file kết thúc bằng dấu cách, VS Code báo "is not valid as a file or folder name" mà không chỉ ra dấu cách. Gõ tay tên file, và tắt bộ gõ tiếng Việt khi gõ tên file và code.

### 5.3 Ba lớp kiểm tra
| Lệnh | Hỏi | Ví dụ lỗi nó bắt |
|---|---|---|
| `pnpm typecheck` | đúng kiểu chưa? | dùng `process.env.X.length` khi `X` có thể `undefined` |
| `pnpm lint` | có chỗ cẩu thả không? | biến không dùng, `debugger` quên xóa, `it.only` làm mọi test khác bị bỏ qua trong im lặng |
| `pnpm test` | chạy ra đúng kết quả không? | so khóa sai, trả sai mã HTTP |

Hai lệnh đầu không chạy chương trình nên không bắt được lỗi logic; mục 5.7 có hai lỗi mà cả ba lớp đều không bắt, chỉ review và chạy thật mới thấy.

### 5.4 Cấu hình: dừng ngay khi sai (`src/config.ts`)
**Là gì:** `loadConfig(env)` đọc `SINO_ZALO_SECRET`, `SINO_ZALO_HOST` (mặc định `127.0.0.1`), `SINO_ZALO_PORT` (mặc định `8090`) **một lần** lúc khởi động, và ném lỗi nêu tên biến khi thiếu khóa, khóa ngắn hơn 32 byte, hoặc cổng không phải số nguyên từ 1 tới 65535. `server.ts` bắt lỗi đó, in một dòng và thoát với mã 1.

**Vì sao:** khóa rỗng nghĩa là ai cũng gọi được service, tức là ai cũng đọc được tin Zalo. Dừng ngay lúc khởi động (*fail fast*) an toàn hơn chạy với cấu hình hỏng.

**Vì sao nhận `env` làm tham số:** test chỉ cần truyền một object, không phải sửa biến môi trường thật của máy. Cùng ý với constructor injection bên Spring.

**Bẫy:**
- Spec ghi 32 **byte**: `secret.length` đếm ký tự, chữ có dấu tốn 2–3 byte mỗi chữ. Dùng `Buffer.byteLength`.
- `process.env.X` có kiểu `string | undefined`; chính kiểu này buộc kiểm "thiếu khóa" trước khi dùng.
- `Number('')` là `0` và `Number('abc')` là `NaN`; `Number.isInteger` cùng điều kiện `< 1` chặn cả hai.

### 5.5 Người gác cổng (`src/auth.ts`)
**Là gì:** một hook `onRequest` gắn cho cả app: mọi request đi qua nó trước khi tới route. Thiếu hoặc sai `Authorization: Bearer <khóa>` thì trả `401 { code: "UNAUTHORIZED", message: "Missing or wrong secret" }` và route không chạy. Chỉ `/health` được miễn.

```text
 request --> onRequest: route khớp là /health ? --có--> route /health
                          | không (kể cả đường chưa có route)
                          v
               SHA-256("Bearer <khóa>") == SHA-256(header) ?  (so bằng timingSafeEqual)
                  | đúng                      | sai
                  v                           v
               route (hoặc 404)            401
```

**Chặn mặc định:** đường không có route nào khớp vẫn bị đòi khóa. Khóa đúng mới tới 404. Route thêm ở ZL-02…ZL-05 tự được bảo vệ, không thể quên. **Phương án đã bỏ:** kiểm khóa trong từng route (thêm route mà quên là thủng); gói `@fastify/bearer-auth` (một phụ thuộc cho khoảng 20 dòng, và không thấy cơ chế).

**`request.routeOptions.url`** là mẫu route Fastify khớp được (`/health`), không phải URL thô (`/health?probe=1`). So bằng URL thô thì `/health` có query string bị chặn nhầm; test `?probe=1` giữ chỗ này.

**Vì sao không so bằng `===`:** `===` dừng ở ký tự sai đầu tiên, nên khóa sai ở ký tự 1 trả lời nhanh hơn khóa sai ở ký tự 20. Đo thời gian thật nhiều lần có thể đoán khóa từng ký tự (*timing attack*). `timingSafeEqual` luôn so hết mọi byte. Bên Java là `MessageDigest.isEqual`, thứ `sino-api` sẽ dùng ở chiều ngược lại (D-282).

**Vì sao băm SHA-256 trước khi so:** `timingSafeEqual` ném lỗi khi hai bên dài khác nhau, kẻ gửi khóa ngắn sẽ nhận `500` thay vì `401`. Băm xong thì hai bên đều 32 byte; độ dài thật của khóa cũng không lộ. Băm cả chuỗi `Bearer <khóa>` nên header `Basic <khóa>` tự bị chặn mà không cần `if` riêng.

**Closure:** `requireSecret(secret)` trả về hàm `checkSecret`, hàm này nhớ biến `expected` của hàm ngoài, nên khóa được băm một lần lúc dựng app. Bên Java giống một lớp có field gán trong constructor.

### 5.6 `app.ts` tách khỏi `server.ts`
- **`buildApp(config)`** dựng Fastify, gắn hook và route, nhưng **không mở cổng**. Test gọi nó rồi dùng `app.inject`. Bên Spring, framework làm việc này thay bạn (`@SpringBootTest` + `MockMvc`); ở Node bạn tự tách.
- **`server.ts`** là điểm khởi động (như `SinoApiApplication.main`): đọc cấu hình, `buildApp(config, true)` bật log, `listen`. Log của Fastify là JSON, có method, URL, mã trả về, thời gian, **không có header**, nên khóa không vào log.
- **Tắt gọn:** `process.once('SIGINT' | 'SIGTERM', …)` gọi `app.close()`, trả lời nốt request đang dở rồi thoát. Từ ZL-03 đây cũng là chỗ đóng kết nối Zalo. `once` chỉ bắt lần Ctrl+C đầu; lần hai rơi về mặc định của Node và tắt ngay, nên `close()` có treo thì vẫn thoát được.

### 5.7 Review trước khi chạy test tìm ra
Bạn nhờ review bốn file `src/` trước khi chạy test. Bốn chỗ, bạn sửa cả bốn:

| Chỗ | Vì sao sai | Ai bắt được |
|---|---|---|
| `auth.ts` trả `400` | `400` là "request viết sai", `401` là "thiếu hoặc sai xác thực"; D-281 bên `sino-api` dựa vào `401` để nhận ra sai khóa | test (4 test mong `401`) |
| chữ `Missing or Wrong secret` | chuỗi lỗi là contract; test so từng ký tự | test |
| `` `${error as Error}.message` `` | chỉ phần trong `${ }` được tính; `.message` in ra nguyên chữ: `Error: SINO_ZALO_SECRET is missing.message` | chỉ review và chạy thật (`server.ts` không có test) |
| `process.on` thay vì `once` | Ctrl+C lần hai không thoát được nếu `close()` treo | chỉ review |

Bạn sửa chỗ thứ ba bằng `${error as Error}` (bỏ `.message`): chạy đúng, in `Error: …` vì JavaScript gọi `toString()` của object lỗi. Ở dạng này `as Error` không còn tác dụng, `${error}` cho cùng kết quả; muốn bỏ chữ `Error:` thì dùng `${(error as Error).message}`.

### 5.8 Kiểm chứng (ZL-01)
- **Đỏ trước:** ba file test đỏ với `Cannot find module '../src/config.ts'` / `'../src/app.ts'` khi `src/` chưa có.
- **Xanh:** `pnpm test` 13/13 (3 file), `pnpm lint` 0 cảnh báo 0 lỗi, `pnpm typecheck` 0 lỗi.
- **Chạy thật** (code của bạn, Claude chạy ở cổng 8099): `/health` không khóa trả `200 UP`; `/accounts/a1/messages` không khóa trả `401`, có khóa trả `404`; tìm khóa trong log: 0 lần; thiếu khóa hoặc khóa 10 byte: một dòng nêu tên biến, thoát mã 1. Bạn chạy `pnpm dev` ở cổng 8090 và báo "ok".

---

## 6. Đăng nhập Zalo bằng mã QR trong `sino-zalo` (ZL-02)

**Ở đâu:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `src/logins/{LoginStore,routes}.ts` (mới), `src/app.ts` (`buildApp` nhận thêm `gateway`), `src/server.ts` (dùng `ZcaGateway`), `tsconfig.json` (`paths` cho zca-js), `test/logins.test.ts` (mới), `test/{auth,health}.test.ts` (truyền bản giả). Task chia thành 12 phase nhỏ. Phase 1–2 (cài zca-js, `paths`, `ZaloGateway.ts`) Claude làm theo lời bạn nhờ, rồi bạn chuyển change sang AUTO và Claude làm phần còn lại.

### 6.1 Ba route và luồng
```text
 sino-api                    sino-zalo                                     Zalo (qua zca-js)
 POST /logins  ----------->  LoginStore.start() --> ZaloGateway.startQrLogin --> tạo mã QR
               <-- 201 { loginId, qrImage, expiresAt } <-- qrReady(image) <--------+
 GET /logins/{id}, 2 giây một lần --> trạng thái    <-- scanned / done / expired / declined / failed
 DELETE /logins/{id} --> hủy, cả bên Zalo
```

`POST` chỉ trả lời khi Zalo đã đưa mã QR, vì web cần hiện ảnh ngay. Zalo báo lỗi trước khi có mã, hoặc im lặng quá 15 giây, thì trả `502 QR_UNAVAILABLE` thay vì treo.

### 6.2 Interface làm ranh giới với thư viện ngoài (`ZaloGateway`)
**Là gì:** một interface chứa mọi điều `sino-zalo` cần ở Zalo. Hiện chỉ có `startQrLogin(events): handle`; ZL-03…ZL-05 thêm đăng nhập bằng cookie, nghe tin, gửi tin. Chỉ `ZcaGateway.ts` import zca-js.

**Để làm gì:**
- zca-js không chính thức, có thể hỏng hoặc phải thay. Thay thư viện thì chỉ viết lại `ZcaGateway`.
- Test dùng `FakeZaloGateway`, nên không bao giờ chạm Zalo thật. Bên Java giống viết interface rồi mock trong test, ở đây bản giả viết tay.

**Kiểu "sự kiện" (callback):** đăng nhập QR kéo dài tới 100 giây và Zalo báo từng bước. Bên gọi đưa một object có 6 hàm (`qrReady`, `scanned`, `done`, `expired`, `declined`, `failed`), bên Zalo gọi lại đúng hàm khi bước đó xảy ra, giống một listener bên Java. Trong test, chính test gọi các hàm đó (`gateway.latest().events.scanned(...)`), tức là test đóng vai Zalo, nên kiểm được mọi trạng thái mà không cần điện thoại.

**Bẫy:** bản giả gọi `qrReady` **sau** khi `startQrLogin` trả về (`queueMicrotask`), không gọi ngay bên trong, vì Zalo thật cũng trả lời sau. Gọi ngay bên trong có thể che một lỗi thứ tự mà Zalo thật sẽ lộ ra.

### 6.3 Biến callback thành trạng thái (`LoginStore`)
```text
 WAITING --scanned--> SCANNED --done--> DONE   (đọc đúng 1 lần rồi bị quên)
    |                    |
    +---- expired -------+--> EXPIRED   (mã sống 100 giây)
    +---- declined ------+--> DECLINED  (bấm "Từ chối" trên điện thoại)
    +---- failed --------+--> FAILED
 Đã tới một trạng thái cuối thì mọi sự kiện đến sau đều bị bỏ qua.
```

- **Một chỗ đổi trạng thái** (`move`): chỉ đổi khi đang `WAITING` hoặc `SCANNED`. Tình huống có thật: mã hết hạn ở giây 100 nhưng điện thoại xác nhận ở giây 100,2. Không chặn thì một phiên "từ trên trời rơi xuống" sau khi web đã báo hết hạn. Test "ignores what Zalo says after the login has ended" giữ điều này; khi chỉ có các hàm xử lý mà chưa có lệnh chặn, đúng test đó đỏ (`expected DONE … to equal EXPIRED`).
- **Phiên rời đi đúng một lần:** `GET` đầu tiên thấy `DONE` trả hồ sơ + phiên rồi xóa lần đăng nhập; lần sau `404`. Phiên Zalo là chìa khóa của cả nick: nếu `GET` trả phiên mỗi lần hỏi, ai biết `loginId` cũng lấy được phiên bất cứ lúc nào. `loginId` là UUID ngẫu nhiên (`randomUUID`), không đoán được.
- **`LoginView` là union có nhãn** (`state` quyết định có những trường nào): `SCANNED` mới có `displayName`, `DONE` mới có `profile` và `session`. TypeScript biết điều đó: sau `if (view.state === "DONE")` mới đọc được `view.session`.

### 6.4 Map có hạn và đồng hồ giả
- **Quên sau 5 phút:** mỗi lần `start` và `get`, `forgetOld()` xóa (và hủy bên Zalo) mọi lần đăng nhập bắt đầu quá 5 phút, đọc rồi hay chưa. Một lần đăng nhập bỏ dở (`sino-api` sập giữa chừng) không nằm mãi trong bộ nhớ, và không có phiên nào nằm chờ vô hạn.
- **Đồng hồ giả:** `LoginStore` nhận `now: () => number` (mặc định `Date.now`). Test truyền một hàm trả biến `now` do test đặt, nên kiểm "sau 5 phút" mà không phải chờ 5 phút. Bên Java là truyền `Clock` vào constructor thay vì gọi `Instant.now()`.
- **Hết giờ chờ QR:** một `setTimeout` (`qrWaitMs`, mặc định 15 giây) từ chối promise nếu chưa có mã; có mã thì `clearTimeout`. Test truyền 20 ms. Trước khi có hẹn giờ, test này treo đúng 5 giây rồi Vitest báo `Test timed out in 5000ms`: đó chính là lỗi nó sửa.

### 6.5 Đọc zca-js trước khi tin nó
`ZcaGateway` dựa trên mã nguồn `loginQR` của zca-js 2.2.0, không phải README:
- **Sau `QRCodeExpired` và `QRCodeDeclined`, zca-js chờ mãi** nếu không ai gọi `abort()` hoặc `retry()`. Vì vậy `ZcaGateway` gọi `abort()` ngay rồi báo `expired` / `declined`. Sinh mã mới là việc của web ("Tạo mã mới" gọi lại `POST`), không tự `retry`.
- **100 giây** là hẹn giờ trong `loginQR` (`setTimeout(..., 100000)`), nên `QR_LIFETIME_MS = 100_000` và `expiresAt` = lúc có mã + 100 giây.
- **Phiên lấy sau khi đăng nhập xong:** `loginQR` trả về đối tượng `API` sau khi tự đăng nhập bằng cookie; `api.getContext()` cho cookie, imei, userAgent, `api.getOwnId()` cho `ownId`, giống cách spike lưu phiên dùng lại được. Tên và ảnh lấy từ sự kiện `QRCodeScanned`.
- **Hủy trước khi có mã:** khi đó chưa có `abort`; `ZcaGateway` nhớ là đã hủy và `abort()` ngay lúc mã tới, không báo `qrReady`.
- **Lỗi chỉ ghi tên và dòng đầu:** zca-js đặt cả JSON trả về của Zalo sau dòng đầu thông báo lỗi, nên `reasonOf` chỉ giữ `error.name: dòng đầu` để log không có gì nhạy cảm (D-282).

**Bẫy kiểu dữ liệu:** file kiểu `index.d.ts` của zca-js chỉ có `export * from "./dist"`, import một **thư mục**. `"module": "nodenext"` theo đúng luật của Node, không cho import thư mục, nên TypeScript thấy zca-js rỗng: `Module '"zca-js"' has no exported member 'Zalo'`. Lúc chạy Node vẫn đọc `dist/index.js` bình thường. Sửa bằng `paths` trong `tsconfig.json` trỏ `zca-js` tới `dist/index.d.ts`. **Phương án đã bỏ:** đổi cả project sang `"moduleResolution": "bundler"`: hết lỗi, nhưng TypeScript thôi bắt lỗi quên đuôi `.ts` trong import của chính mình, mà Node thì cần đuôi đó.

### 6.6 Kiểm chứng (ZL-02)
- **Đỏ trước:** sau khi thêm test, 3 file đỏ với `Cannot find module '../src/gateway/FakeZaloGateway.ts'`, chỉ `config.test.ts` (6 test) xanh.
- **Xanh:** `pnpm test` 27/27 (4 file), `pnpm lint` 0 cảnh báo 0 lỗi, `pnpm typecheck` 0 lỗi.
- **Chạy thật** với `ZcaGateway` (cổng 8097): `/health` `200`; `POST /logins` không khóa `401`; `GET /logins/nope` có khóa `404 UNKNOWN_LOGIN`; `DELETE /logins/nope` `204`; khóa không có trong log.
- **Chưa kiểm:** `POST /logins` có khóa gọi Zalo thật để lấy mã QR; theo kế hoạch Zalo thật chỉ chạy ở ZL-13 bằng nick phụ, nên đường đi thật qua zca-js (mã QR, quét, phiên, hết hạn sau 100 giây) chưa chạy lần nào trong `sino-zalo`.
