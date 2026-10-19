# Kiến thức Phase 5 — Nhiều provider và gửi tin

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F10, `openspec/changes/f10-reply` (trả lời một thư ngay trong Sino), được kéo lên làm ngay sau F06 vì bạn ưu tiên "kết nối và nhắn tin" (2026-10-09). Đã xong: BE-58, BE-59, BE-60 (chạy thật với Gmail; đối chiếu thư "chưa rõ" theo thread vì Gmail thay `Message-ID`), BE-62 (thư Sino gửi mang tên người gửi). F09 (provider thứ hai: Zalo cá nhân, `openspec/changes/zalo-personal`) mở 2026-10-14, bạn tự code ZL-01 (khung service `sino-zalo`, mục 5); từ ZL-02 (đăng nhập QR, mục 6) bạn chuyển change này sang AUTO.
> **Cập nhật:** 2026-10-19. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`; đường dẫn của `sino-zalo` tính từ `apps/sino-zalo/`.

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

## 7. Phiên và listener: bật, tắt, bị đá, nối lại (ZL-03)

**Ở đâu:** `src/sessions/{SessionManager,routes}.ts` và `src/notify.ts` (mới); `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (đăng nhập bằng phiên đã lưu, listener); `src/app.ts` (`buildApp(config, gateway, { logger, notifier })`, `/health` đếm phiên thật); `src/config.ts` (`SINO_API_URL`); `test/{sessions,notify}.test.ts` (mới). Claude làm ở chế độ AUTO.

### 7.1 Việc của task: giữ một websocket sống cho mỗi account
Listener là một **websocket** mở tới Zalo, sống nhiều ngày, qua đó Zalo đẩy tin mới. Đây là tài nguyên dài hạn: phải mở đúng một cái cho mỗi account, dừng khi không cần, mở lại khi rớt mạng, và biết lúc nào **không được** mở lại.

```text
 sino-api                          sino-zalo (SessionManager)                     Zalo
 PUT /accounts/a1/session {session} --> đăng nhập bằng cookie ------------------> chấp nhận / từ chối
                                        listener.start() ------- websocket -----> đẩy sự kiện
                                        đóng 3000/3003 (bị đá) -> ENDED + webhook
 POST /api/webhooks/zalo {ownId}  <---- (sino-api đồng bộ, gặp 410, báo "Quét QR lại")
                                        đóng mã khác (rớt mạng) -> nối lại sau 1, 2, 4 ... 60 giây
 DELETE /accounts/a1/session ---------> dừng listener, quên account
```

### 7.2 `PUT session`: bốn hàng của D-289
`sino-zalo` nhớ cho mỗi account một **dấu vân tay** của phiên: SHA-256 của chuỗi JSON phiên mà `sino-api` gửi. Mỗi `PUT` so dấu vân tay mới với cái đang giữ:

| Đang giữ | Phiên gửi tới | Kết quả |
|---|---|---|
| `LIVE`, cùng dấu vân tay | | `204`, không làm gì (gọi bao nhiêu lần cũng vậy: **idempotent**) |
| `ENDED`, cùng dấu vân tay | | `410` ngay, không gọi Zalo: cookie đó đã bị hủy |
| không có, hoặc khác | Zalo nhận | đăng nhập, dừng listener cũ, chạy listener mới, `204` |
| không có, hoặc khác | Zalo từ chối | dừng listener cũ, ghi `ENDED`, `410` |

**Câu gợi ý của task:** "nếu `PUT` thấy phiên đang sống là bỏ qua, thì người dùng quét lại xong, phiên mới đi vào `sino-zalo` bằng đường nào?". Trả lời: nếu chỉ hỏi "đang sống không" thì **không có đường nào**: phiên mới bị bỏ qua, phiên cũ bị Zalo hủy, và người dùng quét mãi vẫn "Cần đăng nhập lại". So dấu vân tay thì phiên mới luôn khác phiên cũ, nên nó đi vào ngay ở lần `PUT` kế tiếp (lượt đồng bộ, hoặc `registerPush`).

**Vì sao băm mà không giữ cả phiên để so:** dấu vân tay đủ để biết "cùng hay khác", mà không giữ thêm một bản cookie trong bộ nhớ chỉ để so. Nó không bao giờ ra log hay response.

### 7.3 Lỗi tạm thời và lỗi vĩnh viễn
Đây là bài học chính của task. Cùng là "không đăng nhập được", nhưng hai nguyên nhân cần hai cách xử lý ngược nhau:

| Chuyện xảy ra | Loại | `sino-zalo` làm | `sino-api` sẽ làm (ZL-06…) |
|---|---|---|---|
| Zalo trả "Đăng nhập thất bại" cho cookie | vĩnh viễn: cookie đã bị hủy | `ENDED`, `410 SESSION_ENDED` | `AUTH_EXPIRED`, người dùng quét lại |
| Mạng lỗi, Zalo không trả lời | tạm thời | giữ nguyên phiên đang có, `502 ZALO_UNAVAILABLE` | `PROVIDER_UNAVAILABLE`, thử lại ở lượt sau |
| Websocket đóng `3000` / `3003` | vĩnh viễn: bị đá | `ENDED`, gọi webhook | đồng bộ, gặp `410` |
| Websocket đóng mã khác (`1006`…) | tạm thời: rớt mạng | nối lại, chờ lâu dần | không biết gì, không cần biết |

Coi nhầm lỗi tạm thời là vĩnh viễn thì người dùng phải quét QR lại chỉ vì wifi chập chờn. Coi nhầm lỗi vĩnh viễn là tạm thời thì `sino-zalo` đăng nhập lại mãi bằng cookie chết, dễ bị Zalo coi là bot (D-276). Vì vậy `ZcaGateway` đổi lỗi của zca-js thành hai lớp riêng, `SessionRejectedError` và `ZaloUnavailableError`, và chỉ đúng câu "Đăng nhập thất bại" (thứ spike đã thấy khi cookie bị hủy, `spikes/zalo-zca/logs/login.jsonl`) mới là từ chối. Câu đó là chữ tiếng Việt của zca-js, nên đây là một chỗ dễ vỡ khi nâng zca-js; ZL-13 kiểm lại trên Zalo thật.

### 7.4 Đọc log spike trước khi tin `retryOnClose`
Kế hoạch (D-276) định để zca-js tự nối lại (`retryOnClose: true`). Log spike cho thấy điều khác:

```text
 03:09:42  disconnected 3003 KickConnection      <- bị đá vì mở chat.zalo.me
           (zca-js tự nối lại, với cookie đã bị hủy)
 03:09:44  disconnected 1006 AbnormalClosure
 03:09:44  closed       1006 AbnormalClosure     <- mã cuối cùng báo ra là 1006, không phải 3003
```

Đọc mã `listen.js` của zca-js 2.2.0 thì thấy thêm:
- Mã nào được nối lại là do **máy chủ Zalo** gửi trong cấu hình (`close_and_retry_codes`); lúc spike chạy, danh sách đó có cả `3003`, vì thư viện đã nối lại sau `3003`.
- Lần nối lại được hẹn bằng `setTimeout` mà không có cách nào hủy.
- Số lần thử của mỗi mã **không bao giờ đặt lại**, kể cả sau khi đã nối lại được, nên sau đủ nhiều lần rớt mạng trong đời một listener, nó thôi nối lại.

Nếu tin `closed`, `sino-zalo` sẽ coi lần bị đá là rớt mạng. Vì vậy `ZcaGateway` chạy listener với `retryOnClose: false` (mỗi lần đóng đều báo `closed` với mã thật), còn `SessionManager` tự quyết: `3000`/`3003` là `ENDED`; mã khác thì nối lại sau 1, 2, 4, 8, 16, 32, rồi 60 giây mỗi lần, và quay về 1 giây khi đã nối lại được (`connected`). Bên Java, đây là **exponential backoff**, như `ExponentialBackOff` của Spring Retry. Test dùng đồng hồ giả của Vitest (`vi.useFakeTimers()`, `vi.advanceTimersByTime`), nên kiểm cả dãy 1…60 giây mà không phải chờ.

### 7.5 Một account, một hàng đợi
Hai `PUT` cùng phiên tới gần như cùng lúc là chuyện có thật: `registerPush` và lượt đồng bộ của `sino-api` chạy song song. Đăng nhập bằng cookie mất vài trăm mili giây, và trong lúc chờ (`await`), Node xử lý request kia. Nếu không làm gì thì cả hai đều thấy "chưa có phiên" và mở **hai** listener; Zalo chỉ cho một kết nối web, nên chúng đá nhau (`3000`).

Node chạy một luồng, nên không cần `synchronized`; cái cần là **không cho hai việc của cùng một account xen nhau qua `await`**. `serial(accountId, task)` nối mỗi việc vào sau promise của việc trước cùng account:

```text
 queues: a1 -> [PUT phiên X] -> [PUT phiên X] -> [DELETE]     (lần lượt)
         a2 -> [PUT phiên Y]                                  (song song với a1)
```

Bên Java, cách tương tự là một khóa cho mỗi khóa (`ConcurrentHashMap<String, Lock>`) hoặc một hàng đợi một luồng cho mỗi account. Test "logs in once when the same session comes twice at the same time" giữ điều này.

### 7.6 Tiếng "đóng" của listener đã dừng
`listener.stop()` của zca-js đóng websocket với mã `1000`, và sự kiện `closed` tới **sau đó** (bất đồng bộ). Nếu xử lý nó như một lần rớt mạng, `DELETE session` sẽ bị nối lại ngay sau một giây. Cách chặn: mỗi listener mang theo object phiên của nó, và `closed` chỉ được xử lý khi object đó **vẫn là** phiên hiện hành của account (`this.sessions.get(accountId) === session`). Một kiểm tra phủ được bốn trường hợp: đã `DELETE`, đã thay phiên khác, đã bị đá, và đang tắt service. Bản giả `FakeListener.stop()` cũng báo `closed(1000)` sau một microtask y như zca-js, để test "does not reconnect a listener it stopped itself" thấy đúng chuyện này.

**Bẫy:** listener của zca-js là một `EventEmitter`. Phát sự kiện `error` mà không ai nghe thì Node **ném lỗi và tắt cả tiến trình**, kéo theo listener của mọi account khác. `ZcaGateway` luôn gắn một hàm nghe `error` (chỉ ghi log lý do).

### 7.7 Báo `sino-api` (`notify.ts`)
`WebhookNotifier` gọi `POST <SINO_API_URL>/api/webhooks/zalo` `{ "ownId" }` với khóa bí mật, hết giờ sau 5 giây, và **không bao giờ ném lỗi**: lỗi chỉ thành một dòng log WARN. Webhook chỉ là lời nhắc "đồng bộ đi"; nếu nó lỡ thì lượt đồng bộ dự phòng 5 phút một lần của `sino-api` vẫn gặp `410`. `SessionManager` nhận một `Notifier` (interface) qua constructor, nên test truyền bản ghi lại lời gọi; còn chính `WebhookNotifier` được test bằng một Fastify nhỏ đóng vai `sino-api`, chạy thật trên cổng ngẫu nhiên. ZL-04 thêm phần gom tin mới trong 0,5 giây vào đây.

### 7.8 Kiểm chứng (ZL-03)
- **Đỏ trước:** `sessions.test.ts` đỏ với `Cannot find module '../src/sessions/SessionManager.ts'`, `notify.test.ts` với `Cannot find module '../src/notify.ts'`, 3 test mới của `config.test.ts` đỏ vì chưa có `apiUrl`.
- **Xanh:** `pnpm test` 54/54 (6 file), oxlint 0 chẩn đoán trên 19 file, `tsc` 0 lỗi.
- **Chạy thật** với `ZcaGateway` (cổng 8096, không gọi Zalo): `/health` `200 {live 0, ended 0}`; `PUT session` không khóa `401`; thiếu cookie `400`; `DELETE` account lạ `204`; khóa và imei không có trong log; `SINO_API_URL=sino-api:8080` thì dừng với mã 1 và lời báo nêu tên biến.
- **Chưa kiểm:** đăng nhập bằng cookie thật, listener thật, bị đá và rớt mạng thật với Zalo: ZL-13, bằng nick phụ.

## 8. Bộ đệm, cursor, bù tin, báo có tin (ZL-04)

**Ở đâu:** `src/sessions/{MessageBuffer,CatchUp,Conversations}.ts` và `src/messages/readRoutes.ts` (mới); `src/sessions/SessionManager.ts` (`readMessages`, nhận tin, bù tin); `src/notify.ts` (`messagesArrived`, gom 0,5 giây); `src/gateway/*` (`ZaloMessage`, `requestOldMessages`, `threadInfo`, `toZaloMessage`); `test/{buffer,catchup,messages,zca}.test.ts` (mới). Claude làm ở chế độ AUTO.

### 8.1 "Báo rồi kéo"
```text
 Zalo --websocket--> listener --> bộ đệm của account [100, 101, 102 ...]  (sắp theo msgId)
                                     |
                                     +--(gom 0,5 giây)--> POST /api/webhooks/zalo {ownId}   "có tin, kéo đi"
 sino-api: đồng bộ --> GET /accounts/a1/messages?after=<cursor>&limit=100
           <-- { messages, conversations, nextCursor, hasMore }  --> lưu, cursor = nextCursor
```

`sino-zalo` không đẩy nội dung tin sang `sino-api`; nó chỉ báo "có tin", rồi `sino-api` tự kéo bằng đúng đường `fetchUpdates` mà Gmail dùng. Nhờ vậy tin Zalo đi qua **một đường lưu duy nhất** của `sino-api`, với chống trùng và checkpoint sẵn có (D-277).

**Câu gợi ý của task:** "nếu webhook lỗi mà tin vẫn còn trong bộ đệm, thì lúc nào `sino-api` sẽ lấy được nó?". Trả lời: ở lần kéo kế tiếp, tức là lần webhook sau (tin mới khác), hoặc lượt đồng bộ dự phòng 5 phút một lần của `sino-api`. Webhook chỉ làm tin tới **sớm hơn**; nó không phải nơi giữ tin. Vì thế `SessionManager` cho tin vào bộ đệm **trước**, rồi mới báo. Test "loses no message" chạy thật: `sino-api` giả đã tắt, webhook lỗi, mà lần `GET` sau vẫn có tin.

### 8.2 Cursor kiểu keyset, không phải số trang
Phân trang kiểu "trang 3, mỗi trang 100" (`OFFSET`) hỏng khi dữ liệu đổi giữa hai lần hỏi: tin mới chen vào thì trang sau lặp lại hoặc bỏ sót tin. Cursor kiểu **keyset** hỏi "cho tôi các tin có `msgId` lớn hơn X": tin mới chen vào đâu cũng không làm lệch. `nextCursor` là `msgId` lớn nhất vừa trả; không có tin mới thì vẫn là X; lần đầu tiên (không có `after`, bộ đệm rỗng) thì là `null`. `hasMore` = còn tin sau trang này, `sino-api` kéo tiếp ngay. Bên Java, `sino-api` đã dùng đúng ý này cho Gmail (`historyId`).

### 8.3 Vì sao so `msgId` bằng `BigInt`
`msgId` của Zalo là một số nguyên lớn, gửi dạng **chuỗi**. Có hai cái bẫy:
- So chuỗi: `"1000" < "999"` là **đúng**, vì so từng ký tự (`"1"` < `"9"`). Test "after=999 gives 1000" giữ chỗ này.
- Đổi sang `Number`: số nguyên chỉ chính xác tới 2^53 (khoảng 9 triệu tỷ); vượt quá thì hai `msgId` khác nhau có thể thành cùng một số.

`BigInt("1000")` là số nguyên không giới hạn độ dài, so `<` đúng như số. Bên Java tương đương là `BigInteger` (hoặc `long`, nếu chắc chắn số vừa 64 bit). Bộ đệm giữ mảng đã sắp theo `BigInt` và chèn bằng **tìm kiếm nhị phân**, nên tìm vị trí "sau X" chỉ mất khoảng 10 bước với 1.000 tin.

### 8.4 Bộ đệm có hạn
Tối đa 1.000 tin cho mỗi account (đầy thì bỏ tin `msgId` nhỏ nhất), và mỗi tin ở tối đa 24 giờ. **Agent chốt, cần xem lại:** 24 giờ tính từ lúc tin **vào bộ đệm**, không theo giờ gửi. Tin bù về sau một đêm tắt máy có giờ gửi cũ hơn 24 giờ; tính theo giờ gửi thì nó bị xóa ngay khi vừa vào. Test dùng đồng hồ giả (`now`) như `LoginStore` ở mục 6.4.

### 8.5 Bù tin: hỏi một câu, chờ câu trả lời trên một kênh khác
`requestOldMessages(loại, lastId)` của zca-js **không trả về** trang tin. Nó chỉ gửi một gói lên websocket; trang tin về sau đó, dưới dạng sự kiện `old_messages`. `SessionManager` nối hai đầu lại bằng một promise: trước khi gửi, nó cất hàm `resolve` vào `pages` theo loại (`USER`, `GROUP`); khi `old_messages` của loại đó tới, nó gọi hàm đã cất. Bên Java, cách này giống `CompletableFuture` được `complete` từ một luồng nhận tin.

`catchUp` (D-278) đọc hai loại song song (`Promise.all`), mỗi loại theo vòng:

```text
 lastId = cursor
 lặp tối đa 10 trang:
   trang = hỏi Zalo các tin sau lastId           (đua với hẹn giờ 5 giây cho cả lần bù)
   trang rỗng, hoặc có tin đã nằm trong bộ đệm   -> đã nối liền, dừng
   đổ trang vào bộ đệm; lastId = msgId lớn nhất của trang
 chưa nối liền -> log WARN (account, loại, số trang, số tin; không có nội dung)
```

- **Khi nào bù:** có `after`, phiên chưa bù từ một mốc nhỏ hơn hoặc bằng nó, và `after` cũ hơn tin cũ nhất trong bộ đệm (hoặc bộ đệm rỗng). Mốc được ghi **trước** khi bù, nên lần bù hết giờ cũng không lặp lại; và hai `GET` cùng lúc thì lần sau chờ lần trước (`catchingUp`).
- **Chờ listener sẵn sàng** (agent chốt, cần xem lại): sau khi nối, Zalo gửi khóa giải mã (`cipher_key`) rồi mới đọc được tin. Gửi yêu cầu lúc socket còn đang mở thì zca-js ném lỗi; gửi trước khi có khóa thì trang về không giải mã được. Ngay sau khi `sino-zalo` khởi động lại, lần kéo đầu tiên tới đúng lúc đó, nên `requestPage` chờ sự kiện `ready`, và việc chờ cũng tính trong 5 giây.
- **`Promise.race`** là "lấy cái nào xong trước": trang tin hay hẹn giờ. Hẹn giờ thắng thì vòng dừng; promise của trang vẫn còn đó nhưng không ai chờ nữa.

### 8.6 Gom webhook trong 0,5 giây
Tin đầu tiên của một account mở một "cửa sổ" 0,5 giây (`setTimeout`); tin đến trong cửa sổ không làm gì thêm; hết cửa sổ thì gọi webhook một lần. Ba tin trong 0,3 giây thành **một** lần gọi (test chạy giờ thật với 0,5 giây). Đây là cửa sổ **cố định** tính từ tin đầu, không phải debounce trượt (mỗi tin mới đẩy hẹn giờ lùi lại): với debounce trượt, một nhóm chat sôi nổi nhắn liên tục sẽ làm webhook **không bao giờ** được gọi. Cửa sổ cố định thì nhiều nhất 2 lần gọi mỗi giây cho mỗi account. `timer.unref()` báo Node đừng giữ tiến trình sống chỉ vì một webhook đang chờ.

### 8.7 Đặt tên cuộc trò chuyện (`Conversations`)
`title` và ảnh lấy từ `getUserInfo` (1-1) hoặc `getGroupInfo` (nhóm), cache 1 giờ cho mỗi thread (D-279). `participants` là những người gửi các tin đi kèm, lấy từ chính tin (`fromName`), vì nhóm lớn thì `getGroupInfo` chỉ trả một phần thành viên. Tên là thứ **phụ**: Zalo lỗi thì `title` lấy tên người gửi (1-1) hoặc `null` (nhóm), không cache, tin vẫn trả về; Zalo **im lặng** thì sau 2 giây cũng vậy. Thiếu hẹn giờ này, một Zalo treo sẽ giữ cả lần kéo tin lại, và tin không bao giờ tới `sino-api`; review tìm ra điều này, test viết trước đỏ đúng như vậy (`Test timed out in 5000ms`).

**Bẫy `return` trong `try`:** trong hàm `async`, `return somePromise` bên trong `try { } catch { }` **không** bắt được lỗi của `somePromise`: hàm trả promise đó ra ngoài trước khi nó lỗi. Phải viết `return await somePromise`. `ZcaGateway.threadInfo` có đúng chỗ này; không có `await` thì lỗi của zca-js lọt ra ngoài mà không thành `ZaloUnavailableError`.

### 8.8 Kiểm chứng (ZL-04)
- **Đỏ trước:** 3 file `Cannot find module` (`MessageBuffer`, `CatchUp`, `Conversations`), `notifier.messagesArrived is not a function`, `toZaloMessage is not a function`, và `auth.test.ts` (route đọc tin chưa có). Test hẹn giờ tên thread: `Test timed out in 5000ms`.
- **Xanh:** `pnpm test` 94/94 (10 file, chạy 4 lần đều xanh), oxlint 0 chẩn đoán trên 27 file, `tsc` 0 lỗi.
- **Chạy thật** với `ZcaGateway` (cổng 8095, không gọi Zalo): `GET` tin không khóa `401`; account lạ `404 UNKNOWN_ACCOUNT`; `after=abc` `400`; `limit=5000` `400`; khóa không có trong log.
- **Chưa kiểm:** tin thật qua listener, `requestOldMessages` và `old_messages` thật, khóa của `getUserInfo` (`<id>` hay `<id>_0`), độ dài một trang bù tin: ZL-13, bằng nick phụ. `toZaloMessage` đã có test trên đối tượng tin của chính zca-js.

## 9. Gửi tin, chống gửi trùng, giới hạn tốc độ, tra tin đã gửi (ZL-05)

**Ở đâu:** `src/messages/{sendRoutes,SentLog,RateLimiter}.ts` (mới); `src/gateway/*` (`sendText`, `ZaloRejectedError`); `src/sessions/SessionManager.ts` (`sendText`, `ownMessages`, giờ bật phiên `liveSince`); `src/sessions/MessageBuffer.ts` (`filter`); `src/app.ts` (`now`, `sendTimeoutMs`); `test/{send,lookup}.test.ts` (mới). Claude làm ở chế độ AUTO.

### 9.1 Luồng gửi: thứ tự các câu hỏi
Đây là phía `sino-zalo` của việc F10 đã làm cho Gmail ở mục 2. `sino-api` (ZL-09) gọi `POST /accounts/{id}/messages` `{ threadId, threadType, text, clientMessageId }`, và route hỏi lần lượt:

```text
 1. body đủ và đúng kiểu?                      không -> 400
 2. SentLog đã có clientMessageId này?
      SENT                                      -> 200 { msgId, sentAt } cũ, không gửi
      PENDING (đang chờ Zalo) / UNKNOWN         -> 504 OUTCOME_UNKNOWN, không gửi
 3. account có phiên đang sống?                 không -> 404 UNKNOWN_ACCOUNT / 410 SESSION_ENDED
 4. account đã gửi trong 1 giây qua?             có -> 429 RATE_LIMITED, không gửi
 5. ghi PENDING vào SentLog, gửi qua zca-js     (chờ tối đa 10 giây)
      Zalo trả msgId                            -> SentLog: SENT -> 201 { msgId, sentAt }
      Zalo trả mã lỗi                           -> SentLog: quên  -> 422 REJECTED
      hết giờ, mạng đứt, 5xx                    -> SentLog: UNKNOWN (hoặc vẫn PENDING) -> 504 OUTCOME_UNKNOWN
```

Thứ tự là có chủ ý:
- **2 trước 4:** một lần gọi lặp không gửi gì, nên không được tính vào giới hạn tốc độ (test "does not count a repeated clientMessageId against the rate").
- **2 trước 3** (sửa sau review): "tin này đã đi" là sự thật về quá khứ, đúng bất kể phiên bây giờ ra sao. Kiểm phiên trước thì một tin đã đi, gọi lặp sau khi bị đá, sẽ nhận `410`; `sino-api` gửi lại phiên, nhận `410` nữa, rồi có thể ghi tin đó là thất bại, và người dùng bấm gửi lại (test "answers 200 for a message already sent, even once the session has ended").

### 9.2 Idempotency key và câu gợi ý của task
`clientMessageId` là **idempotency key** (mục 2.2): `sino-api` tạo một ID cho mỗi lần trả lời và gửi lại đúng ID đó khi thử lại; `sino-zalo` nhớ ID trong 24 giờ (`SentLog`, một `Map` trong bộ nhớ) và biến các lần gọi lặp thành một.

**Câu gợi ý của task:** "`SentLog` ghi **trước** khi trả `201`". Vì sao? Giả sử ghi sau: Zalo gửi xong, `sino-zalo` trả `201`, nhưng câu trả lời không tới được `sino-api` (hết giờ chờ, mạng chập). `sino-api` không biết tin đã đi, nên hỏi lại bằng tra tin, hoặc gửi lại với cùng ID. Nếu `SentLog` chưa ghi thì cả hai đường đều thấy "chưa có gì", và tin đi lần hai. Vì vậy `SentLog.track` ghi `PENDING` ngay khi bắt đầu gửi, và ghi `msgId` **ngay khi Zalo trả**, trong chính `then` của lần gửi, trước khi route kịp trả lời; kể cả khi route đã trả `504` vì hết giờ mà Zalo trả muộn, `msgId` vẫn được ghi. Test "finds the message once Zalo answers a send that sino-api stopped waiting for" giữ đúng kịch bản trong spec: gửi bị giữ, `504`, Zalo trả muộn, tra tin ra `msgId`.

Hai request cùng ID tới cùng lúc thì sao? Ở `sino-api` cần khóa database (mục 2.2). Ở đây không cần: Node chạy một luồng, và giữa lúc đọc `SentLog` (bước 2) và lúc ghi `PENDING` (bước 5) không có `await` nào, nên không request nào chen vào được. Đây là cùng ý với mục 7.5: chỗ nguy hiểm trong Node là chỗ có `await`. Điều này dễ vỡ (ai đó thêm một `await` vào giữa là xong), nên test "sends once when the same clientMessageId comes twice at the same time" gửi hai request **cùng lúc** (`Promise.all`) và đòi request sau nhận `504`, không phải `429` hay một lần gửi thứ hai.

**Bộ nhớ:** mỗi account gửi tối đa 1 tin mỗi giây, nên `SentLog` có nhiều nhất khoảng 86.400 dòng mỗi account mỗi ngày. Dòng được thêm theo thứ tự thời gian, và `Map` của JavaScript giữ thứ tự thêm, nên dòng hết hạn luôn nằm đầu: `forgetExpired` xóa từ đầu tới dòng đầu tiên còn hạn rồi dừng, không phải duyệt cả `Map`.

### 9.3 Ba kết quả của một lần gửi
Như Gmail (mục 2.3), một lần gửi có ba kết cục, và chỉ hai kết cục là chắc chắn:

| zca-js trả về | Tin đã đi chưa | `sino-zalo` |
|---|---|---|
| `{ message: { msgId } }` | đã đi | ghi `SENT`, `201` |
| `ZaloApiError` có mã lỗi của Zalo (`error_code` khác 0) | chưa: Zalo đã đọc lệnh và từ chối | quên ID (gửi lại được), `422 REJECTED` |
| `ZaloApiError` không có mã ("Request failed with status code 502", "Failed to parse response data"), lỗi mạng, hết 10 giây | không biết: Zalo có thể đã nhận rồi mới lỗi | ghi `UNKNOWN`, `504 OUTCOME_UNKNOWN` |

`sendText` trong `ZcaGateway.ts` là chỗ duy nhất phân loại, và mặc định là "không biết", vì đó là phía an toàn: một tin "không biết" chỉ chờ tra lại, còn một tin bị coi nhầm là "chưa đi" thì sẽ bị gửi lần hai. Đọc mã `sendMessage.js` và `utils.js` của zca-js 2.2.0 mới biết điều này: lỗi trả về từ JSON của Zalo mang `code`, còn lỗi HTTP và lỗi đọc câu trả lời thì không. zca-js cũng **không có hạn chờ** cho lệnh gửi, nên hạn 10 giây là của `sino-zalo`.

### 9.4 Giới hạn tốc độ: token bucket một token
**Token bucket** là cách giới hạn tốc độ phổ biến: một cái xô chứa tối đa N token, mỗi khoảng thời gian thêm một token; mỗi lần gửi lấy một token, xô rỗng thì từ chối. N lớn cho phép **gửi dồn** (N tin liền rồi mới chậm lại). Với Zalo, gửi dồn chính là thứ dễ bị coi là bot, nên `RateLimiter` dùng xô **một token**, thêm lại sau 1 giây; khi đó nó chỉ còn là "nhớ lần gửi cuối của mỗi account, chưa đủ 1 giây thì từ chối". Lần thử bị từ chối không lấy gì, nên không đẩy lùi lượt sau (test "does not count a refused attempt as a turn"). Lần gửi bị Zalo từ chối thì vẫn tính, vì lệnh đã tới Zalo.

**Bẫy đồng hồ:** `Date.now()` là đồng hồ treo tường: máy chỉnh giờ (NTP, người dùng sửa giờ) thì nó có thể lùi. Nếu đồng hồ lùi một tiếng, "đã qua bao lâu từ lần gửi cuối" thành số âm, và account không gửi được trong một tiếng. Vì vậy `RateLimiter` mặc định dùng `performance.now()`, đồng hồ **đơn điệu** (chỉ tăng). Bên Java đây là khác biệt giữa `System.currentTimeMillis()` và `System.nanoTime()`: đo khoảng thời gian thì dùng cái sau. `SentLog` và giờ bật phiên vẫn dùng `Date.now()`, vì chúng cần giờ thật để so với `after` của `sino-api`.

### 9.5 Tra tin đã gửi: "không biết" khác "không có"
`POST /accounts/{id}/sent/lookup` `{ threadId, clientMessageId, text, after }` là thứ `findSentMessages` của `sino-api` gọi khi một lần gửi kết thúc "không biết" (D-280). `sino-zalo` tìm theo thứ tự:
1. `msgId` đã nhớ của `clientMessageId` trong `SentLog`;
2. tin `isSelf` trong bộ đệm của thread đó, cùng chữ, gửi sau `after` (đây là tin vọng lại qua listener, vì `selfListen: true`); một `msgId` có ở cả hai chỉ được kể một lần.

Không tìm thấy gì thì có hai câu trả lời rất khác nhau:

| Điều kiện | Trả | `sino-api` hiểu |
|---|---|---|
| phiên bật **trước** `after`, `SentLog` không có gì về ID này | `200 { msgIds: [] }` | chắc chắn chưa đi |
| phiên bật **sau** `after` (`sino-zalo` khởi động lại, hoặc phiên mới), `after` cũ hơn 24 giờ (`SentLog` đã quên), hoặc lần gửi của ID này còn `PENDING`/`UNKNOWN` | `409 CANNOT_TELL` | không biết, thư giữ `UNKNOWN` |

Đây là bài học "Bạn sẽ học" của task: một danh sách rỗng là một **khẳng định** ("tôi đã nhìn và không có"), chỉ được trả khi `sino-zalo` thật sự đã nhìn suốt khoảng thời gian đó. Mốc "nhìn được từ lúc nào" là cái **muộn hơn** trong hai: lúc phiên bật, và 24 giờ trước (`SentLog.knowsSince()`). Bản đầu quên mốc thứ hai, và review tìm ra: một tin `504` mà `sino-api` không hỏi lại trong hơn 24 giờ (`sino-api` tắt), `sino-zalo` vẫn chạy, thì lần tra sau trả `[]`, `sino-api` ghi tin thất bại, người dùng gửi lại, và người nhận nhận hai lần. Sau khi khởi động lại, `SentLog` và bộ đệm đều trống; trả `[]` lúc đó là nói dối, và `sino-api` sẽ coi tin là chưa đi rồi để người dùng gửi lại. F10 có đúng luật này ở phía Java (mục 2.4: connector không tìm được thì thư ở `UNKNOWN` mãi, không bao giờ `FAILED`).

`after` phải là giờ có múi giờ (schema `format: "date-time"`): `2026-10-16T08:00:00.123456789Z` (cách `Instant.toString()` của Java viết, tới 9 chữ số phần giây) được nhận; `2026-10-16T08:00:00` thì `400`, vì không múi giờ thì không biết là giờ nào.

### 9.6 Hẹn giờ mà không bỏ rơi lần gửi
`within(sending, 10 giây)` đua lần gửi với một hẹn giờ bằng `Promise.race` (mục 8.5). Hẹn giờ thắng thì route trả `504`, nhưng lần gửi **vẫn chạy tiếp** trong zca-js, và `then` của `SentLog.track` vẫn ghi kết quả khi nó tới; route còn ghi thêm một dòng log, "Zalo message sent after the timeout" hoặc "Zalo send failed after the timeout" (kèm `refused`), để ZL-13 thấy chuyện này có xảy ra không, và để lần sau ai hỏi "tin đó cuối cùng ra sao" còn có dấu vết. zca-js gửi bằng `fetch` của Node mà không có hạn chờ riêng, nên một lần gửi treo có thể nằm `PENDING` tới khoảng 300 giây (hạn mặc định của undici) rồi mới thành `UNKNOWN`.

**Bẫy unhandled rejection:** một promise bị reject mà không ai gắn hàm xử lý thì Node coi là lỗi chưa bắt và **tắt cả tiến trình** (giống `error` không ai nghe ở mục 7.6). Ở đây lần gửi luôn có người nghe: `Promise.race` gắn hàm xử lý vào nó ngay khi đua, nên dù hẹn giờ thắng trước, lần gửi lỗi muộn vẫn được "bắt" (rồi bỏ qua). `finally { clearTimeout(timer) }` dọn hẹn giờ khi lần gửi xong trước, để không còn hẹn giờ treo sau mỗi request.

### 9.7 Agent chốt, cần xem lại
Spec và design để ngỏ mấy chỗ dưới; Claude chọn và ghi vào D-280 và spec `zalo-gateway`:
- Lần gọi lặp của một lần gửi còn `PENDING` hoặc `UNKNOWN` trả `504 OUTCOME_UNKNOWN`, không chờ, không gửi.
- Tra tin cũng trả `409 CANNOT_TELL` khi lần gửi của ID đó còn `PENDING`/`UNKNOWN`, hoặc `after` cũ hơn 24 giờ, mà không tìm thấy gì.
- Zalo từ chối thì quên ID: chưa có gì đi, nên gửi lại với cùng ID được; lần bị từ chối vẫn tính vào giới hạn 1 tin/giây.
- Route gửi đọc `SentLog` trước khi kiểm phiên (mục 9.1); route tra tin kiểm phiên (`404`/`410`) trước, như spec ghi. `SentLog` nằm ngoài phiên, theo `(accountId, clientMessageId)`, nên quét lại (phiên mới) không làm quên tin đã gửi.
- Hạn chờ gửi 10 giây. ZL-06 đặt hạn chờ đọc của `sino-api` cho lệnh gửi **dài hơn** 10 giây, để `sino-zalo` luôn trả `504` trước khi `sino-api` tự bỏ.

### 9.8 Review tìm ra
Một reviewer độc lập đọc code trước khi commit:
- **Sửa ở đây:** mốc 24 giờ của tra tin (mục 9.5); thứ tự `SentLog` trước kiểm phiên ở route gửi (mục 9.1); log cho lần gửi lỗi sau khi đã hết giờ (mục 9.6); thêm test gửi đồng thời (cùng ID, khác ID), log của nhánh `422`/`504`, `409` khi hỏng giữa chừng, gửi lại sau khi Zalo từ chối muộn.
- **Để cho ZL-09 (phía `sino-api`):** `ReplyService.reconcile` đi qua các tin "chưa rõ" của account theo thứ tự cũ trước, và gặp lỗi provider nào khác `CAPABILITY_NOT_SUPPORTED` là **dừng cả lượt**. D-281 đổi `409 CANNOT_TELL` thành `PROVIDER_UNAVAILABLE`, mà sau khi `sino-zalo` khởi động lại, tin cũ trả `409` mãi; vậy một tin như thế sẽ chặn việc đối chiếu mọi tin sau nó. ZL-09 phải cho `CANNOT_TELL` đi đường "không biết" (giữ `UNKNOWN`, sang tin kế), có test hai tin. Ghi trong `tasks.md` ZL-09.

### 9.9 Kiểm chứng (ZL-05)
- **Đỏ trước:** `send.test.ts` đỏ với `Cannot find module '../src/messages/RateLimiter.ts'`; `lookup.test.ts` đỏ cả 11 test vì route chưa có (`expected 404 to be 200`). Sau review: 3 test mới đỏ đúng chỗ (`expected 200 to be 409` cho mốc 24 giờ, `expected 410 to be 200` cho tin đã đi sau khi bị đá, không có log lỗi muộn); 4 test còn lại xanh ngay vì chúng giữ hành vi đã có.
- **Xanh:** `pnpm test` 137/137 (12 file, chạy 4 lần đều xanh), oxlint 0 chẩn đoán trên 32 file, `tsc` 0 lỗi.
- **Chạy thật** với `ZcaGateway` (cổng 8094, không gọi Zalo): gửi và tra tin không khóa `401`; account lạ `404 UNKNOWN_ACCOUNT` cho cả hai; `threadType: "PAGE"` `400`; `after` không múi giờ `400`; log 17 dòng, không có khóa bí mật và chữ của tin.
- **Chưa kiểm:** gửi thật qua Zalo (`msgId` trả về, tin vọng lại qua listener có cùng `msgId` không, mã lỗi khi Zalo từ chối): ZL-13, bằng nick phụ.

## 10. Connector `zalo` trong `sino-api`: cấu hình, client HTTP, bảng đổi lỗi (ZL-06)

**Ở đâu:** `apps/sino-api/src/main/java/dev/sino/provider/infrastructure/zalo/{ZaloProperties,ZaloConfiguration,ZaloClient,ZaloProvider}.java` (mới); `application.yaml` (`sino.zalo.*`); `.env.example` (khối Zalo); test `ZaloErrorMappingTests` (WireMock), `ZaloConfigurationTests`, `ZaloProviderTests`, `ZaloProviderContractTest`, `ZaloWiringTests`. Claude làm ở chế độ AUTO. Đây là task Java đầu tiên của F09: từ đây `sino-api` nói chuyện được với `sino-zalo`.

### 10.1 Việc của task: lớp nối hai service
```text
 sino-api (Java)                                               sino-zalo (Node)
 ---------------                                               ----------------
 ImportRunner / ReplyService (ZL-08, ZL-09)
        |
        v
 ZaloProvider  (type zalo, kind CHAT, chưa khai capability nào)
        |
        v
 ZaloClient ---- HTTP, Authorization: Bearer <SINO_ZALO_SECRET> ---->  PUT  /accounts/{id}/session
   |  hạn chờ đọc 10 s, gửi 15 s                                      GET  /accounts/{id}/messages
   |  lỗi HTTP -> ProviderException (bảng D-281)                       POST /accounts/{id}/messages
   |  404/410 -> PUT session -> gọi lại đúng 1 lần (D-289)             POST /accounts/{id}/sent/lookup
   v
 ProviderException(code) cho lõi Sino xử lý như mọi provider khác
```
Lõi Sino (`sync`, `conversation`) không biết `sino-zalo` tồn tại: nó chỉ thấy một `MessageProvider` ném `ProviderException` với các mã quen thuộc. Mọi chi tiết của `sino-zalo` (đường dẫn, mã lỗi riêng như `UNKNOWN_ACCOUNT`, cách gửi lại phiên) nằm gọn trong `ZaloClient`. Đây là **anti-corruption layer**: lớp đứng ở biên, dịch "ngôn ngữ" của hệ thống ngoài sang mô hình của mình, để hệ thống ngoài có đổi thì chỉ sửa một chỗ.

Task này chỉ dựng đường đi. Đọc tin (`fetchUpdates`, ZL-08) và trả lời (`sendMessage`, ZL-09) sẽ gọi các hàm đã có của `ZaloClient`.

### 10.2 Bật tắt bằng cấu hình, và lựa chọn của bạn
Ba biến môi trường, cùng tên với bên `sino-zalo` để một file `.env` dùng chung được:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `SINO_ZALO_ENABLED` | `false` | công tắc Zalo (D-272) |
| `SINO_ZALO_URL` | `http://127.0.0.1:8090` | chỗ `sino-zalo` nghe, trên máy này (D-282) |
| `SINO_ZALO_SECRET` | trống | khóa chung, ít nhất 32 byte, cùng giá trị với `SINO_ZALO_SECRET` của `sino-zalo` |

**Vấn đề trước khi code:** D-286 muốn connector luôn có trong registry, kể cả khi tắt, để account Zalo cũ vẫn đọc được tin đã lưu. Nhưng web hiện tự gán `connectable: true` cho mọi provider API trả về (`accounts.api.ts`), vì tới giờ provider duy nhất là Gmail và nó kết nối bằng OAuth2. Nếu Zalo vào registry ngay, hộp thoại kết nối sẽ hiện Zalo như kết nối được, bấm vào thì nhận lỗi `CONNECT_NOT_SUPPORTED`, và tình trạng này kéo dài tới khi ZL-07 (API trả `connectable`) và ZL-11 (web đọc nó) xong.

**Bạn chọn:** "Chỉ đăng ký khi bật". Tới ZL-07, connector chỉ có trong registry khi `SINO_ZALO_ENABLED=true`; mặc định là tắt, nên web trên `dev` không đổi gì. ZL-07, lúc API đã nói được provider kết nối bằng cách nào, sẽ chuyển về đúng D-286. Đây là một ví dụ của việc **xếp thứ tự task theo cái người dùng nhìn thấy**: mỗi commit trên `dev` phải để app ở trạng thái dùng được, không chỉ "build xanh".

### 10.3 `@ConfigurationProperties` với record, và kiểm lúc khởi động
`ZaloProperties` là một `record` gắn `@ConfigurationProperties("sino.zalo")`: Spring đọc `sino.zalo.enabled`, `sino.zalo.url`, `sino.zalo.secret` rồi gọi constructor của record. Constructor gọn (compact constructor) điền giá trị mặc định (`url` trống thì `http://127.0.0.1:8090`) và coi khóa toàn khoảng trắng là không có. `toString()` viết lại để in `secret=****`: record tự sinh `toString()` in mọi thành phần, nên không viết lại thì khóa sẽ lọt vào log ngay lần đầu ai đó in cấu hình.

`ZaloConfiguration` có hai lớp con, `On` và `Off`, mỗi lớp gắn một `@Conditional` đọc `sino.zalo.enabled`, như cách `GmailConfiguration` tách bật và tắt. `On` gọi `check(properties)` trước khi tạo `ZaloProvider`:
- thiếu khóa, khóa có ký tự ngoài ASCII hay khoảng trắng, hoặc khóa ngắn hơn 32 byte: app **dừng ngay** khi khởi động, lời báo nêu tên biến chứ không nêu giá trị;
- `SINO_ZALO_URL` không phải `http`/`https` hoặc không có host (`localhost:8090` thiếu `http://`, `ftp://...`): dừng, nêu tên biến.

**Fail fast:** sai cấu hình thì hỏng lúc khởi động, không phải lúc lượt đồng bộ đầu tiên chạy ba tiếng sau. Lỗi lúc khởi động người chạy app thấy ngay; lỗi lúc chạy thì chìm trong log.

**Bẫy byte và ký tự, và bẫy header (review tìm ra):** `sino-zalo` đếm khóa bằng `Buffer.byteLength` (byte UTF-8), còn `String.length()` của Java đếm đơn vị UTF-16; chữ "đ" là 1 ký tự nhưng 2 byte. Bản đầu của `check` đếm byte như `sino-zalo` và nhận 16 chữ "đ" là đủ 32 byte. Reviewer chỉ ra cái sai lớn hơn: khóa đi trong header `Authorization`, mà `HttpClient` của JDK **từ chối** header có ký tự ngoài ASCII hay ký tự điều khiển, và ném `IllegalArgumentException("invalid header value: \"Bearer <khóa>\"")`, tức là **in nguyên khóa** vào lời lỗi. Lỗi đó không phải `RestClientException`, nên lọt khỏi `ZaloClient`, và từ ZL-08 sẽ vào log ERROR của mỗi lượt đồng bộ. Một dấu `\r` thừa ở cuối dòng (file `.env` lưu kiểu Windows) cũng gây đúng chuyện này. Sửa hai lớp:
- `check` chỉ nhận ký tự ASCII nhìn thấy được, không khoảng trắng (đúng kiểu base64url mà `.env.example` chỉ cách tạo), rồi mới đếm đủ 32 byte; sai thì app dừng, lời báo không có khóa.
- `ZaloClient.call` bắt `IllegalArgumentException` và ném `ProviderException` với một lời cố định, không kèm lỗi gốc (`cause`), phòng khi ai đó tạo client mà không qua `check`.

Bài học: **hỏi xem giá trị sẽ đi đâu**, không chỉ hỏi nó dài bao nhiêu. Khóa đi qua header thì luật của header là luật của khóa. Và một exception của thư viện có thể mang dữ liệu mình đưa vào nó.

**Công tắc đọc như Spring đọc boolean.** Bản đầu dùng `@ConditionalOnProperty(havingValue = "true")`, so **chuỗi**: `SINO_ZALO_ENABLED=1` hay `yes` không khớp `On`, không khớp cả `Off` (`havingValue = "false"`), nên Zalo tắt mà không có dòng log nào; trong khi `ZaloProperties.enabled` (kiểu `boolean`) lại đọc `yes` là `true`. Giờ cả hai điều kiện dùng `Binder` của Spring Boot, cùng cách đọc với `ZaloProperties`: `true`, `on`, `yes`, `1` (hoa thường gì cũng được) là bật; `false`, `off`, `no`, `0` là tắt; giá trị khác (`maybe`) làm app dừng với lời nêu `sino.zalo.enabled`.

### 10.4 `RestClient` với hai hạn chờ
`ZaloClient` dựng hai `RestClient` dùng chung một `HttpClient` của JDK, giống `GmailApi`:
- **đọc** (`PUT session`, `GET messages`, tra tin): chờ tối đa 10 giây; lần đọc đầu sau khi `sino-zalo` khởi động lại có thể phải chờ nó bù tin, mà nó tự giới hạn ở 5 giây (D-278);
- **gửi**: chờ tối đa 15 giây, **dài hơn** 10 giây `sino-zalo` chờ Zalo (D-280, ZL-05). Nếu `sino-api` chờ ngắn hơn, nó sẽ bỏ trước khi `sino-zalo` kịp trả `504 OUTCOME_UNKNOWN`, và mất câu trả lời rõ ràng đó. Test `aSendWaitsLongerThanARead` chứng minh lệnh gửi có hạn chờ riêng; `waitsForASendLongerThanSinoZaloWaitsForZalo` giữ con số.

Hai chi tiết nhỏ:
- `Authorization: Bearer <khóa>` đặt một lần bằng `defaultHeaders`, nên không lời gọi nào quên được nó.
- `HttpClient` đặt `HTTP_1_1`: với địa chỉ `http://`, client của JDK mặc định thử nâng lên HTTP/2 (h2c), mà `sino-zalo` (server `http` của Node) không dùng tới. Nói thẳng phiên bản thì bỏ được một bước thương lượng vô ích.

### 10.5 Bảng đổi lỗi D-281
Mỗi lỗi của `sino-zalo` thành đúng một `ProviderErrorCode`, và mỗi mã đã có sẵn cách xử lý trong lõi (thử lại sau, ghi "Cần đăng nhập lại", hay hỏi lại sau khi gửi):

| `sino-zalo` trả | Khi đọc / tra tin | Khi gửi |
|---|---|---|
| không kết nối được (chưa chạy) | `PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE`: chưa có gì đi |
| hết giờ, đứt kết nối giữa chừng | `PROVIDER_UNAVAILABLE` | `OUTCOME_UNKNOWN`: có thể đã đi |
| `5xx` (kể cả `504 OUTCOME_UNKNOWN`) | `PROVIDER_UNAVAILABLE` | `OUTCOME_UNKNOWN` |
| `404 UNKNOWN_ACCOUNT`, `410 SESSION_ENDED` | `PUT session` rồi gọi lại một lần (mục 10.6) | như bên trái: chưa có gì đi |
| `410` hoặc `400` của chính `PUT session` | `AUTH_EXPIRED` (`400` có thêm log WARN kèm `code` của `sino-zalo`) | |
| `429` | `RATE_LIMITED` | `RATE_LIMITED` |
| `422 REJECTED` | | `REQUEST_REJECTED` |
| `409 CANNOT_TELL` | `PROVIDER_UNAVAILABLE` | |
| `401` | `PROVIDER_UNAVAILABLE` + log ERROR | như bên trái |
| `4xx` khác (kể cả `404` không có mã `UNKNOWN_ACCOUNT`) | `REQUEST_REJECTED` | `REQUEST_REJECTED` |
| `200` mà body đọc không được | `PAYLOAD_NORMALIZATION_FAILED` | `OUTCOME_UNKNOWN` |

Ba hàng đáng nhớ:
- **Gửi khác đọc ở chỗ "không biết".** Đọc mà hết giờ thì đọc lại là xong. Gửi mà hết giờ thì tin có thể đã tới Zalo; gửi lại là có thể gửi hai lần. Vì vậy gửi dùng `OUTCOME_UNKNOWN` (D-135, như Gmail ở mục 2.3), và `ZaloClient` **không bao giờ tự gửi lại** sau một lỗi như thế (các test đếm đúng một `POST`). Chỉ khi chắc chắn chưa có kết nối nào (`ConnectException`, hết giờ lúc kết nối) mới là `PROVIDER_UNAVAILABLE`.
- **`404` phải đúng là của `sino-zalo`.** Route không tồn tại (ví dụ hai service lệch phiên bản) cũng trả `404`, nhưng body của Fastify không có `code: "UNKNOWN_ACCOUNT"`. `ZaloClient` đọc `code` trong body, và chỉ `404` có mã đó mới là "chưa có phiên"; gửi lại phiên không chữa được một route không có.
- **`401` là lỗi cấu hình**, không phải lỗi của account: hai service được cho hai khóa khác nhau. Mã `PROVIDER_UNAVAILABLE` để lượt sau thử lại (sửa khóa xong là chạy), còn log ERROR để người chạy app thấy. `AUTH_EXPIRED` ở đây sẽ sai: nó bắt người dùng quét lại QR, mà quét bao nhiêu lần cũng không sửa được khóa.

Lời của mọi `ProviderException` chỉ nói lỗi gì ("sino-zalo answered 503"), không bao giờ có khóa, phiên hay body `sino-zalo` gửi về, vì lời này có thể vào log và vào các mục bị bỏ qua của lượt đồng bộ. Mọi test lỗi đều kiểm thêm điều này (`assertFails`).

### 10.6 Gửi lại phiên rồi gọi lại đúng một lần (D-289)
```text
 gọi (đọc / gửi / tra tin)
   |-- thành công ----------------------------------------------> kết quả
   |-- 404 UNKNOWN_ACCOUNT (sino-zalo vừa khởi động lại)
   |-- 410 SESSION_ENDED   (sino-zalo giữ phiên cũ, Sino có phiên mới)
          |
          v
   PUT session với phiên đang lưu
          |-- 410 / 400 ------------------------------------------> AUTH_EXPIRED ("Cần đăng nhập lại")
          |-- 204
                 v
          gọi lại lần hai
                 |-- thành công ----------------------------------> kết quả
                 |-- 410 lần nữa ---------------------------------> AUTH_EXPIRED
                 |-- 404 lần nữa ---------------------------------> PROVIDER_UNAVAILABLE (lượt sau thử lại)
```
Vì sao chỉ một lần: lần hai vẫn lỗi thì vấn đề không phải "thiếu phiên" nữa; lặp tiếp chỉ đẩy thêm request vào một `sino-zalo` đang có chuyện. Vì sao gửi lại được với lệnh gửi: `404`/`410` của route gửi đến **trước** khi `sino-zalo` gọi Zalo (route kiểm phiên trước, mục 9.1), nên chưa có gì đi.

**Exception làm tín hiệu nội bộ.** Hàm gọi thấp nhất (`call`) gặp `404`/`410` thì ném `NoSession`, một exception `private` của `ZaloClient`; `inSession` bắt nó, gửi phiên, gọi lại. `NoSession` không bao giờ ra khỏi lớp: lời gọi `PUT session` dùng loại lời gọi `SESSION`, loại này không sinh `NoSession`, và lần gọi lại biến `NoSession` thứ hai thành `ProviderException`. Constructor `super(null, null, false, false)` tắt ghi stack trace: tạo stack trace là phần đắt nhất của một exception, mà tín hiệu này không bao giờ được in.

**Phiên đi như JSON.** Phiên nằm trong `TokenCredentials` dưới dạng một chuỗi JSON (D-274). `ZaloClient` đọc chuỗi đó thành cây JSON (`JsonMapper.readTree`) rồi gửi `{ "session": <cây> }`, chứ không ghép chuỗi bằng tay. Chuỗi không phải object JSON (lỗi không đáng có) thì là `AUTH_EXPIRED` mà không gọi `sino-zalo`: quét lại sẽ cho một phiên đúng.

### 10.7 Capability theo task, và bộ test contract F03
`ZaloProvider` của task này **chưa khai capability nào** (agent chốt, cần xem lại). ZL-08 thêm `READ_MESSAGES` và `PUSH_WEBHOOK` khi `fetchUpdates` và `registerPush` có thật, ZL-09 thêm `SEND_MESSAGES`. Lý do:
- nơi gọi tin vào capability trước khi gọi (FR-06): khai `SEND_MESSAGES` mà `sendMessage` chưa có thì màn hình sẽ cho bấm Gửi;
- bộ test contract F03 (`MessageProviderContractTest`) đọc capability để biết phải kiểm gì.

Bộ test contract là một **abstract test class**: connector nào cũng viết một lớp con, đưa vào connector và dữ liệu mẫu, và nhận về cả bộ kiểm tra chung. Các test của nó dùng `assumeTrue(capability)` / `assumeFalse(capability)`: với Zalo hôm nay, 6 test chạy (khai báo định danh, che khóa trong `toString()`, và các test "không có capability thì từ chối, không gọi provider"), 7 test của các capability chưa khai bị bỏ qua (JUnit báo "skipped", không phải "failed"). Tới ZL-08, chỉ cần khai capability là các test đọc tin tự chạy trên Zalo; không ai phải nhớ thêm chúng vào.

### 10.8 Bản ghi dây giữ dạng chữ
Các record nhận JSON của `sino-zalo` (`MessagePage`, `Message`, `Conversation`) giữ `threadType` và `sentAt` ở dạng `String`, không phải `enum` hay `Instant`. Nếu là `enum`, một tin có `threadType` lạ sẽ làm Jackson ném lỗi cho **cả trang**, và cả trang bị bỏ. Giữ dạng chữ thì việc "tin này dùng được không" để cho bước chuẩn hóa (ZL-08) quyết **từng tin một**: tin hỏng vào danh sách bỏ qua, các tin khác vẫn vào Hộp thư (bộ contract đòi đúng điều này: `aBrokenMessageIsSkippedAndTheOthersAreKept`). Chiều gửi đi thì ngược lại: `ThreadType` là `enum` (`USER`, `GROUP`), vì Sino tự viết nó và không được viết sai.

Tra tin đã gửi mà câu trả lời thiếu `msgIds` thì là lỗi, không phải danh sách rỗng: rỗng nghĩa là "chắc chắn chưa đi" (mục 9.5), và Sino sẽ cho người dùng gửi lại.

### 10.9 Review tìm ra
Một reviewer độc lập đọc bản chụp của code trước khi commit (đọc cả mã nguồn của Spring 7 và JDK 25 để kiểm):
- **Sửa ở đây (HIGH):** khóa có ký tự ngoài ASCII hay khoảng trắng lọt vào lời lỗi của JDK (mục 10.3). Thêm luật "ASCII nhìn thấy được" cho khóa và lớp chặn `IllegalArgumentException`; test cũ "16 chữ đ là đủ" đổi thành test "bị từ chối".
- **Sửa ở đây (LOW):** công tắc đọc như boolean của Spring (mục 10.3); log WARN kèm `code` khi `PUT session` trả `400`; contract test trỏ tới một cổng đóng thay vì `8090`, nơi `sino-zalo` của máy dev có thể đang chạy; test gọi thẳng `sendFailure`, vì trên Windows một cổng đóng không trả "từ chối" ngay mà làm hết giờ kết nối, nên nhánh `ConnectException` không bao giờ chạy qua mạng thật; thêm ca gửi gặp `410` rồi `PUT` cũng `410` (hoặc `502`), và ca gửi bị `400` / `401`, mỗi ca đếm đúng một `POST`; đổi tên một test hứa nhiều hơn điều nó kiểm.
- **Không sửa, ghi lại:** spec `provider-registry` của f05c nói connector có công tắc vẫn ở trong registry khi tắt; với Zalo điều đó đúng trở lại ở ZL-07 (ghi trong `tasks.md` ZL-07). `sendFailure` và `brokeOff` chép từ `GmailApi`: gom chúng vào một chỗ chung là việc riêng, vì phải sửa cả code của Gmail; đáng làm khi có connector thứ ba.
- **Reviewer nghi, kiểm rồi, không phải lỗi:** `after` của tra tin có tới 9 chữ số lẻ (giờ lấy từ PostgreSQL); `Date.parse` của Node đọc đúng (`2026-10-17T08:00:00.123456789Z` ra `...000123`).

### 10.10 Kiểm chứng (ZL-06)
- **Đỏ trước:** 5 file test, biên dịch đỏ vì chưa có `ZaloClient`, `ZaloProvider`, `ZaloProperties`, `ZaloConfiguration`. Sau review: 8 test mới đỏ đúng chỗ (khóa ngoài ASCII được nhận ×2, `SINO_ZALO_ENABLED=maybe` không dừng app, `1`/`yes`/`on` để Zalo tắt ×3, không có log WARN cho `PUT 400`, `IllegalArgumentException` lọt ra); các test bổ sung cho `sendFailure` và các ca gửi xanh ngay vì chúng giữ hành vi đã có.
- **Xanh:** `./mvnw -B -ntp test -Dtest='Zalo*'` 83 test của `ZaloErrorMappingTests`, `ZaloConfigurationTests`, `ZaloProviderTests`, `ZaloProviderContractTest` (7 bỏ qua: capability chưa khai), cộng `ZaloWiringTests` (cả app khi bật Zalo: `GET /api/providers` có `zalo`, "Zalo", `CHAT`, capability rỗng). `./mvnw -B -ntp verify` trong worktree riêng, trên `dev` mới nhất (`9f8af03`, sau BE-82): 1613 test, 0 lỗi, 0 hỏng, 11 bỏ qua, `ModularityTests` xanh.
- **Gài lỗi (mutation), trên bản trước review:** 16 lỗi gài vào `ZaloClient` và `ZaloConfiguration` (bỏ lần thử lại, đổi mã của `PUT 410`/`400`, `5xx` khi gửi, công tắc tắt vẫn gọi, `409`, hạn chờ gửi bằng hạn chờ đọc, đảo lần lỗi thứ hai, tra tin thiếu `msgIds`, `401` không log ERROR, mọi `404` đều gửi phiên, đảo kết quả gửi không có câu trả lời, `429`, khóa đếm bằng ký tự, khóa 31 byte, địa chỉ không có host): 16/16 bị bắt. Lượt chạy đầu báo "16/16" nhưng sai: `mvnw.cmd` không chạy được, nên lỗi gài nào cũng bị tính là bị bắt; script sửa lại để chạy `./mvnw` và đòi đường chạy gốc xanh trước.
- **Chạy thật với `sino-zalo`** (cổng 8093, không gọi Zalo): sai khóa -> `401` -> `PROVIDER_UNAVAILABLE` + log ERROR; đọc, gửi, tra tin cho một account lạ -> `404` thật -> `PUT session` (Fastify kiểm body tới `body/session/imei`, tức dạng `{ session: {...} }` đúng) -> `400` vì `imei` rỗng -> `AUTH_EXPIRED` + log WARN `FST_ERR_VALIDATION`; body gửi và body tra tin (`after` 9 chữ số lẻ) qua schema; cookie và khóa không có trong log nào.
- **Chưa kiểm:** `PUT session` với phiên thật (đăng nhập bằng cookie vào Zalo), đọc và gửi tin thật: ZL-08, ZL-09, rồi ZL-13 bằng nick phụ.

## 11. Kết nối bằng mã QR: SPI, API, kết nối lại, một nick một owner (ZL-07)

**Ở đâu:**
- `provider`: `ConnectMethod`, `ProviderDescriptor` (`connectMethod`, `connectable`), `spi/{QrLogin,QrChallenge,QrLoginState}`, `MessageProvider.{qrLogin,turnedOn}`, `DefaultProviderRegistry`, `api/ProviderResponse`;
- `account`: `application/{QrConnectService,QrConnectStatus,QrConnectStart,PendingQrConnect}`, `api/{QrConnectController,PendingQrConnects,QrConnectRequest,QrChallengeResponse,QrStatusResponse}`, mã lỗi mới, một truy vấn mới của `ConnectedAccountRepository`;
- `provider/infrastructure/zalo`: `ZaloQrLogin`, `ZaloClient` (`/logins`), `ZaloProvider`, `ZaloConfiguration`;
- web: `accounts.api.ts` đọc `connectable`.

Claude làm ở chế độ AUTO.

### 11.1 Luồng: ba request, một lần đăng ký
```text
 web                          sino-api                                     sino-zalo
 ---                          --------                                     ---------
 POST .../zalo/qr  ---------> QrConnectService.start
 {acceptRisk:true}              - provider có qrLogin()? (không: 422)
                                - đang bật? (không: 409)
                                - kết nối lại: account của owner? (không: 404)
                                QrLogin.start() --------------------------> POST /logins  (chờ Zalo cho mã, <= 15 s)
 <-- 201 {loginId, qrImage} --  session giữ PendingQrConnect(loginId)
 (hiện mã, mỗi 2 s hỏi)
 GET .../qr/{loginId} ------> session có loginId này? (không: 404)
                              QrLogin.status() ---------------------------> GET /logins/{id}
                                WAITING / SCANNED -> trả về, giữ trong session
                                EXPIRED / DECLINED / FAILED -> trả về, xóa khỏi session
                                DONE (một lần) -> kiểm D-290, kiểm nick khi kết nối lại,
                                                  AccountRegistrationService.register (F02),
                                                  xóa khỏi session
 <-- 200 {state, accountId?, reconnected?, code?}
 DELETE .../qr/{loginId} ---> có trong session -> QrLogin.cancel() -------> DELETE /logins/{id}
 <-- 204 (luôn luôn)
```
Không có gì của luồng này nằm trong database cho tới khi người dùng xác nhận trên điện thoại. Lần kết nối đang chờ nằm trong **HTTP session** của trình duyệt đã bắt đầu nó (`PendingQrConnects`, như `PendingConnects` của OAuth2 ở F04a), nên chỉ trình duyệt đó hỏi hay hủy được, và không có gì phải dọn khi người dùng bỏ ngang.

### 11.2 Mở rộng contract mà không phá connector cũ: `default` method
Contract F03 có thêm hai phương thức, cả hai là **`default` method** của interface:
- `default Optional<QrLogin> qrLogin()`: mặc định rỗng;
- `default boolean turnedOn()`: mặc định `true`.

`default` method là phần thân viết sẵn trong interface: lớp nào không viết lại thì dùng bản đó. Nhờ vậy Gmail và 10 connector giả trong test **không phải sửa một dòng**. Ngược lại, `kind()` của BE-110 cố ý *không* có default, vì quên khai loại thì màn hình sai; quên khai QR thì chỉ là "không kết nối bằng QR", đúng với mọi connector cũ. Câu hỏi cần đặt khi thêm vào một contract: giá trị mặc định có đúng cho **mọi** lớp đang có không? Đúng thì `default`, không thì để trống và để trình biên dịch bắt.

Registry kiểm một luật mới lúc khởi động: một connector có cả `oauth2()` lẫn `qrLogin()` thì app dừng, vì web sẽ không biết hiện bước nào.

### 11.3 Trạng thái là một sealed interface
`QrLoginState` là một **sealed interface** với sáu record con: `Waiting`, `Scanned(displayName)`, `Done(profile, credentials)`, `Expired`, `Declined`, `Failed(reason)`. `sealed` nghĩa là danh sách con đóng: không lớp nào ngoài sáu lớp đó được là `QrLoginState`. Lợi ích nằm ở `switch`:

```text
return switch (state) {
    case QrLoginState.Waiting waiting   -> ...;
    case QrLoginState.Scanned scanned   -> ... scanned.displayName() ...;
    case QrLoginState.Done done         -> ... done.profile(), done.credentials() ...;
    ...  (đủ sáu)
};
```
Trình biên dịch biết đủ sáu trường hợp, nên không cần nhánh `default`; thêm một trạng thái thứ bảy thì mọi `switch` thiếu nó **không biên dịch được**, thay vì lặng lẽ rơi vào `default`. Mỗi trạng thái mang đúng dữ liệu của nó: chỉ `Done` có credential, chỉ `Scanned` có tên. So với một `enum` cộng các trường có thể `null`, kiểu này làm cho trạng thái sai (một `WAITING` có credential) không viết ra được.

`Done.toString()` không cần viết lại: record in các thành phần bằng `toString()` của chúng, và `TokenCredentials.toString()` đã che khóa (test `aFinishedLoginNeverPrintsItsCredential`). `QrChallenge` thì viết lại `toString()` để bỏ ảnh QR: vài kilobyte base64 không có chỗ trong một dòng log.

### 11.4 Mâu thuẫn trong hồ sơ, và `turnedOn()`
Khi code, mình thấy ba câu trong hồ sơ không thể cùng đúng:
1. D-286: tắt Zalo thì `qrLogin()` rỗng;
2. spec `provider-catalog-api`: tắt Zalo thì `connectMethod` = `QR`, `connectable` = false;
3. spec `qr-connect`: kết nối provider đang tắt thì `409 PROVIDER_DISABLED`.

Nếu `qrLogin()` rỗng thì registry không biết Zalo kết nối bằng QR (`connectMethod` = `null`, trái câu 2), và `POST .../qr` sẽ trả `422 CONNECT_METHOD_MISMATCH` (trái câu 3). Cách gỡ (agent chốt, cần xem lại): **cách kết nối** và **đang bật hay tắt** là hai sự thật khác nhau, nên là hai phương thức. `qrLogin()` luôn có; `turnedOn()` nói công tắc. Registry tính `connectable = connectMethod != null && turnedOn()`, và `QrConnectService` trả `409` khi `turnedOn()` là false. Spec và D-286 được sửa theo, có ghi lý do. Bài học: khi hai yêu cầu đánh nhau, thường là một khái niệm đang bị dùng cho hai việc.

### 11.5 Kết nối lại, và một nick một owner (D-290)
Khi connector báo `Done`, `QrConnectService.finish` hỏi theo thứ tự:
1. **Kết nối lại mà quét nhầm nick?** Lần kết nối đang chờ có `accountId` thì `ownId` vừa quét phải bằng `externalAccountId` của account đó; khác thì `FAILED CONNECT_WRONG_ACCOUNT`, không account nào đổi. Giống Gmail (F04a).
2. **Nick đã thuộc owner khác?** Truy vấn `existsByProviderAndExternalAccountIdAndOwnerIdNotAndRemovedAtIsNull`: Spring Data dựng câu SQL từ chính **tên phương thức** (`exists` + các điều kiện nối bằng `And`, `Not` là khác, `IsNull` là `removed_at is null`). Account đang tắt vẫn tính; account đã xóa thì không. Có thì `FAILED CONNECT_ACCOUNT_IN_USE`. Luật này đặt ở đây, không trong `register`, vì luồng OAuth2 của Gmail cũng đi qua `register` mà Gmail không cần nó.
3. **Account cần kết nối lại đã bị xóa trong lúc quét?** Thì `FAILED CONNECT_FAILED`.
4. Còn lại: `register` (F02), một transaction, rồi `DONE` với `accountId` và `reconnected` (owner đã có account chưa xóa với nick này trước đó chưa). Web dùng `reconnected` để biết có cần nhập lần đầu không (D-288).

Credential của Zalo là `TokenCredentials` chứa nguyên JSON phiên `sino-zalo` đưa (D-274), lưu vào bảng credential đã mã hóa với `credential_type` = `TOKEN`. Test `theSessionGoesBackToSinoZaloAsItCame` đi trọn vòng: phiên lúc `DONE` thành credential, credential thành body của `PUT session`, và body đó bằng đúng JSON ban đầu.

### 11.6 Hai lần hỏi cùng lúc: khóa theo session
`sino-zalo` chỉ nói `DONE` **một lần** rồi quên lần đăng nhập. Nếu hai lần hỏi của cùng một trình duyệt chạm nhau (hai tab, hay một lần hỏi chậm bị lần sau đuổi kịp), lần thứ nhất nhận `DONE` và đăng ký account, lần thứ hai nhận "không biết" và báo `FAILED`, và web có thể hiện lỗi dù account đã kết nối. `QrConnectController.status` vì vậy chạy trong `synchronized (WebUtils.getSessionMutex(session))`: các lần hỏi của một session đi lần lượt, lần sau thấy lần kết nối đã bị xóa và nhận `404`. Khóa giữ trong lúc gọi `sino-zalo` (tối đa 10 giây), nhưng chỉ các request QR của chính session đó phải chờ; người dùng khác không bị ảnh hưởng.

### 11.7 Mã lỗi: 400 hay 422
Spec ghi `400 CONNECT_METHOD_MISMATCH`, nhưng trong app, lỗi sai luật nghiệp vụ (`ErrorCategory.INVALID`) luôn trả `422 Unprocessable Content`, kể cả `CONNECT_NOT_SUPPORTED` cùng loại ở luồng OAuth2. `400 Bad Request` để dành cho request sai dạng: body không đọc được, hay thiếu `acceptRisk` (Bean Validation `@NotNull @AssertTrue`, mã `VALIDATION_FAILED`). Mình theo quy ước của app và sửa spec (agent chốt). Các mã mới: `PROVIDER_DISABLED` (`409`), `QR_LOGIN_NOT_FOUND` (`404`), `QR_UNAVAILABLE` (`502`: `sino-zalo` không đưa mã QR, hay không trả lời một lần hỏi; lần kết nối vẫn được giữ, lần hỏi sau hỏi lại), và `CONNECT_ACCOUNT_IN_USE` trong `code` của `FAILED`.

### 11.8 Zalo luôn có trong registry, và web đọc `connectable`
`ZaloConfiguration` giờ luôn tạo `ZaloProvider`; khi tắt nó chỉ không kiểm khóa và ghi một dòng "Zalo is off". Lựa chọn "chỉ đăng ký khi bật" của bạn ở ZL-06 được trả về đúng D-286. Để việc này không làm hộp thoại kết nối cho bấm một Zalo đang tắt, `fetchConnectProviders` của web đọc `connectable` từ API (phần này kéo lên từ ZL-11, agent chốt); backend cũ không có trường này thì coi là kết nối được. Hộp thoại chưa có bước QR (ZL-11), nên web tạm chỉ coi provider OAuth2 là kết nối được: bật Zalo lúc này mà cho bấm thì hộp thoại sẽ đi nhầm luồng OAuth2 và nhận `422` (review tìm ra). Kết quả trên `dev`: Zalo, tắt hay bật, hiện "Sắp có" trong hộp thoại kết nối, như canvas vẽ cho một provider chưa kết nối được; ZL-11 bỏ điều kiện tạm này khi có bước QR.

Công tắc đọc như mọi boolean của Spring nhờ chính `ZaloProperties` (`boolean enabled`): `true`/`on`/`yes`/`1` là bật, `false`/`off`/`no`/`0` là tắt, giá trị khác thì app dừng ở bước bind cấu hình. Hai `Condition` tự viết ở ZL-06 không còn cần nữa.

**Hạn chờ "lời gọi chậm".** `sino-zalo` chờ Zalo đưa mã QR tối đa 15 giây, dài hơn hạn chờ đọc 10 giây của client. Lệnh gửi tin và lệnh bắt đầu đăng nhập giờ chung một hạn chờ "chậm" là 20 giây (`ZaloProvider.SLOW_TIMEOUT`, trước đây là `SEND_TIMEOUT` 15 giây), trên cả 10 giây của lệnh gửi và 15 giây chờ mã QR.

### 11.9 Review tìm ra
Một reviewer độc lập đọc bản chụp của code (không có lỗi CRITICAL hay HIGH):
- **Sửa ở đây:**
  - `register` ném lỗi sau `DONE` thì trả `FAILED` và xóa lần kết nối, thay vì `500` (provider đã quên lần đăng nhập, nên không có lần sau);
  - `displayName` rỗng từ `sino-zalo` (Zalo không báo ai quét) thì tên là `ownId`, thay vì thất bại và mất phiên;
  - web chỉ coi provider OAuth2 là kết nối được cho tới khi có bước QR (mục 11.8);
  - thêm test hai lần hỏi chạy song song (luồng thật, một lần hỏi bị giữ giữa chừng bằng `CountDownLatch`), "Thêm" với nick đã có (`reconnected` = true), account bị xóa trong lúc quét (không sống lại), và `401`/`403` cho hỏi và hủy.
- **Không sửa, có lý do:**
  - kiểm D-290 không khóa: giới hạn đã chấp nhận ở D-290;
  - khóa session giữ trong lúc gọi `sino-zalo`: lấy lần kết nối ra rồi trả lại thì một lần hỏi chồng lên lúc còn `WAITING` sẽ nhận `404` sai (design D-275 "Chốt ở ZL-07").
- **Bài học, lần thứ hai** (lần đầu ở ZL-05): một bất biến về đồng thời ("không đăng ký hai lần") phải có test chạy đồng thời, không chỉ một dòng Javadoc.

### 11.10 Kiểm chứng (ZL-07)
- **Đỏ trước:**
  - tầng provider biên dịch đỏ (thiếu `ConnectMethod`, `QrLogin`…);
  - `QrConnectApiTests` 22/23 đỏ với `404` (route chưa có);
  - các test Zalo 26 đỏ;
  - test web đỏ (Zalo bị gán `connectable: true`);
  - sau review, 4 test mới đỏ đúng chỗ. Một test `401` đỏ vì chính test sai: session vừa `POST` đã đăng nhập, nên phải hỏi bằng một session mới.
- **Xanh:** `./mvnw -B -ntp verify` trong worktree trên `5a80bb4`: 1681 test, 0 lỗi, 0 hỏng, 11 bỏ qua, `ModularityTests` xanh. Web, trên `dev` mới nhất (`9461f75`, sau các trang public): `pnpm lint` 0, `tsc -b` 0, `pnpm test` 769/769 (90 file), `pnpm build` 0. Backend không đổi gì giữa `5a80bb4` và `9461f75` ngoài một test `real-gmail` của BE-83.
- **Gài lỗi:** 19 lỗi gài vào service, controller, trạng thái, session, registry, `ZaloQrLogin`, `ZaloClient`, `ZaloConfiguration`; 2 sống sót lúc đầu (hỏi dưới provider khác, `SCANNED` bị coi là xong), thêm 2 test thì bị bắt; 19/19.
  - Lần chạy lại đầu báo "đường gốc hỏng": script khôi phục file bằng `copyFileSync`, mà trên Windows nó giữ giờ sửa cũ, nên Maven giữ class của lỗi gài cuối. Đã sửa script; kết quả trong vòng lặp vẫn đúng, vì mỗi lỗi gài được ghi bằng `writeFileSync`.
- **Chạy thật với `sino-zalo`** (cổng 8093, không gọi Zalo, không `POST /logins`): login lạ thì `404 UNKNOWN_LOGIN` rồi `Failed`; hủy thì `204`; sai khóa thì `401`, `PROVIDER_UNAVAILABLE` và log ERROR; khóa không có trong log. Lần chạy đầu treo 555 giây trước request đầu tiên (máy treo hoặc ngủ); chạy lại mất 1,5 giây.
- **Chưa kiểm:** quét mã QR thật bằng nick phụ, phiên thật đi qua `PUT session`: ZL-13. Màn QR trên web: ZL-11. Hộp thoại kết nối trong Chrome (extension Chrome không kết nối được lúc làm): `connectable` lấy từ API có test, và chữ "Sắp có" của provider không kết nối được có test sẵn (`connect.format.test.ts`).

## 12. Bước Zalo trong hộp thoại kết nối trên `sino-web` (ZL-11)

**Ở đâu:** `apps/sino-web/src/features/accounts/{connect.types.ts,accounts.api.ts,connect.format.ts,useQrConnect.ts,components/{RiskStep.tsx,QrStep.tsx,ConnectWizard.tsx,ReauthAlert.tsx,MobileAccountDetail.tsx},AccountsPage.tsx,AccountDetailPage.tsx}`, test `accounts.api.test.ts`, `connect.format.test.ts`, `ConnectOnApi.test.tsx`. Làm ở chế độ AUTO, chữ cảnh báo DN-2 do bạn chốt.

### 12.1 Luồng trên web: một hộp thoại, hai nhánh kết nối
```text
 Bước 1: Chọn nhà cung cấp (GET /api/providers -> connectMethod, connectable)
    |
    +-- connectMethod = OAUTH2 (Gmail)
    |      |-- Bước 2: Quyền truy cập (ScopeReview)
    |      |-- Bước 3: Đăng nhập (POST /api/accounts/connect/{provider} -> chuyển trang)
    |      |-- Bước 4: Đồng bộ lần đầu (SyncChoice)
    |      +-- Bước 5: Hoàn tất ("Mở hộp thư")
    |
    +-- connectMethod = QR (Zalo)
           |-- Bước 2: Rủi ro & quyền (RiskStep + checkbox "Tôi hiểu rủi ro", nút "Hiện mã QR" khóa tới khi tick)
           |-- Bước 3: Quét mã QR (QrStep + useQrConnect)
           |      |-- POST /api/accounts/connect/zalo/qr {acceptRisk: true, accountId?}
           |      |-- GET  /api/accounts/connect/zalo/qr/{loginId} mỗi 2 giây khi còn WAITING / SCANNED
           |      |-- Đóng hộp thoại giữa chừng -> DELETE /api/accounts/connect/zalo/qr/{loginId}
           |      |-- EXPIRED -> ẩn ảnh QR, hiện "Mã đã hết hạn" + "Tạo mã mới"
           |      |-- DECLINED / FAILED -> hiện lời báo tiếng Việt (gồm CONNECT_ACCOUNT_IN_USE) + "Thử lại"
           |      +-- DONE:
           |             |-- reconnected = false -> POST /api/accounts/{id}/initial-sync {range: "ALL"} -> Bước 5
           |             +-- reconnected = true  -> làm mới danh sách account, đóng hộp thoại
           +-- Bước 5: Hoàn tất ("Sino nhận tin Zalo từ bây giờ. Mở Tin nhắn để đọc.")
```
`fetchConnectProviders` trong `accounts.api.ts` bỏ chặn tạm `connectMethod === 'OAUTH2'` của ZL-07 và cho phép cả `'OAUTH2'` lẫn `'QR'` khi `connectable` là `true`. Khi `SINO_ZALO_ENABLED=false`, API trả `connectable: false` và bước 1 vẫn hiện Zalo với nhãn "Sắp có", radio bị khóa.

### 12.2 Polling theo trạng thái bằng `refetchInterval` và dọn dẹp khi đóng
`useQrConnect` dùng `useQuery` của TanStack Query với `refetchInterval` là một hàm đọc trạng thái hiện tại:
- khi dữ liệu chưa về hoặc `state` là `'WAITING'` hay `'SCANNED'`, hàm trả `2000` (hỏi lại mỗi 2 giây);
- ngay khi sang `'DONE'`, `'EXPIRED'`, `'DECLINED'` hoặc `'FAILED'`, hàm trả `false` và vòng hỏi dừng hẳn.

Khi người dùng đóng hộp thoại hoặc bấm "Quay lại" lúc phiên đăng nhập QR chưa `DONE`, `ConnectWizard` gọi `qr.cancel()`, gửi `DELETE /api/accounts/connect/{provider}/qr/{loginId}` (best-effort, bỏ qua lỗi mạng) để `sino-zalo` hủy phiên QR đang chờ.

### 12.3 Kết nối mới và quét lại (`reconnected`)
Zalo không có lịch sử cũ để chọn khoảng thời gian ở bước 4 (D-288):
- **Kết nối mới (`reconnected: false`):** `useQrConnect` gọi luôn `POST /api/accounts/{accountId}/initial-sync` với `range: 'ALL'` (để `sino-api` bật `registerPush` / listener và đánh dấu `firstImport = DONE`), làm mới cache `['accounts']`, rồi chuyển thẳng từ bước 3 sang bước 5 ("Hoàn tất", hiện "Sino nhận tin Zalo từ bây giờ. Mở Tin nhắn để đọc." và nút "Mở Tin nhắn" trỏ tới `/messages`).
- **Quét lại (`reconnected: true`):** account đã nhập lần đầu từ trước, nên không gọi lại `initial-sync` (gọi nữa sẽ nhận `409ALREADY_IMPORTED`); chỉ làm mới danh sách account và đóng hộp thoại. Ở danh sách và trang chi tiết account, tài khoản Zalo ở trạng thái `AUTH_EXPIRED` hiện nút "Quét QR lại" thay vì "Đăng nhập lại", bấm vào mở thẳng bước 2 (cảnh báo rủi ro) với `accountId` của tài khoản đó.

### 12.4 Kiểm chứng (ZL-11)
- **Đỏ trước:** 12 test mới trong `accounts.api.test.ts`, `connect.format.test.ts` và `ConnectOnApi.test.tsx` đỏ vì `fetchConnectProviders` còn chặn `QR`, thiếu hàm gọi API QR, thiếu `ZALO_RISK_WARNING` / `qrFailedMessage` và `ConnectWizard` chưa có bước QR.
- **Xanh:** `pnpm lint` 0 lỗi, `pnpm exec tsc -b` 0 lỗi, `pnpm build` 0 lỗi, `pnpm test -- --run` 90/90 file (778/778 test) xanh, giữ nguyên cả test `InitialSyncOnApi.test.tsx` (D-305) cho luồng bước 4 sang bước 5.

## 13. Đọc và chuẩn hóa tin Zalo, nhận push ở `sino-api` (ZL-08)

**Ở đâu:** `apps/sino-api/src/main/java/dev/sino/provider/infrastructure/zalo/{ZaloMessageNormalizer,ZaloWebhookController,ZaloWebhookErrorCode,ZaloProvider}.java`; test `ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`, `ZaloWebhookTests`, cập nhật `ZaloProviderContractTest`, `ZaloProviderTests`, `ZaloWiringTests`. Làm ở chế độ AUTO.

### 13.1 Đường đi của tin mới từ `sino-zalo` sang Hộp thư Sino
```text
 Zalo WebSocket ---> sino-zalo (MessageBuffer, giữ theo thứ tự msgId)
                        |
                        | 1. POST /api/webhooks/zalo  (Authorization: Bearer <SINO_ZALO_SECRET>, <= 1 KB)
                        |    {"accountId": "...", "ownId": "100000000000000001"}
                        v
                   sino-api: ZaloWebhookController
                        |    phát ProviderPushReceived(ZaloProvider.TYPE, ownId, now)
                        v
                   PushNotices (F07) ---> tìm sync_checkpoint có watch_address = ownId
                        |
                        v
                   ImportRunner ---> ZaloProvider.fetchUpdates(context, cursor)
                        |
                        | 2. GET /accounts/{accountId}/messages?after={cursor}&limit=100
                        v
                   ZaloMessageNormalizer (D-279)
                        |    - USER -> DIRECT, GROUP -> GROUP
                        |    - isSelf -> OUTBOUND + SENT + read=true; tin khác -> INBOUND + read=false
                        |    - webchat -> TEXT; 5 loại khác -> chữ thay thế tiếng Việt + metadata.zaloType
                        |    - cắt > 100 000 ký tự (không chẻ đôi surrogate pair), xóa \u0000
                        |    - lọc sentAt < cursor.since() khi quét đầu; tin hỏng -> SkippedItem
                        v
                   JdbcConversationStore ---> phát MailStored ---> SSE đẩy lên sino-web
```
Nhờ dùng lại nguyên xi `ProviderPushReceived` và `PushNotices` của F07, lõi đồng bộ (`sync`) không có thêm một nhánh `if (zalo)` nào: với Gmail, `watch_address` là địa chỉ email nhận từ Pub/Sub; với Zalo, `watch_address` là `ownId` mà `sino-zalo` gửi trong thông báo webhook.

### 13.2 `registerPush` giữ phiên sống sau khi `sino-zalo` khởi động lại (D-277)
`ZaloProvider.registerPush(context)` gọi `PUT /accounts/{accountId}/session` trên `sino-zalo` rồi trả `PushRegistration(ownId, now + 3 ngày)`:
- hạn 3 ngày bằng đúng ngưỡng `RENEW_BEFORE` (3 ngày) của `PushWatches`;
- nhờ vậy mỗi giờ khi `PushWatches` quét các tài khoản sắp hết hạn watch, tài khoản Zalo luôn được gọi `registerPush` lại — nếu `sino-zalo` vừa khởi động lại và mất bộ nhớ, phiên được nạp lại tự động mà không phải đợi người dùng bấm đồng bộ;
- trong khi đó `watch_expires_at > now()` vẫn đúng suốt 3 ngày, nên lịch đồng bộ dự phòng (`dueForSync`) chỉ hỏi mỗi 30 phút thay vì mỗi 1 phút.

### 13.3 Chuẩn hóa từng tin và giữ trang sống khi có tin hỏng (D-279)
`ZaloMessageNormalizer` tách việc chuẩn hóa một tin (`normalize(Message, ownId)`) khỏi việc gom cả trang (`normalize(MessagePage, ownId, since, cursor)`):

| `zaloType` từ `sino-zalo` | `MessageType` | `textContent` | `metadata` |
|---|---|---|---|
| `webchat` | `TEXT` | nội dung gốc (đã xóa `\u0000`, cắt ở `100 000` ký tự) | `{}` |
| `chat.photo` | `IMAGE` | `[Ảnh]` | `{"zaloType": "chat.photo"}` |
| `chat.sticker` | `UNKNOWN` | `[Sticker]` | `{"zaloType": "chat.sticker"}` |
| `share.file` | `FILE` | `[Tệp]` | `{"zaloType": "share.file"}` |
| `chat.voice` | `AUDIO` | `[Tin nhắn thoại]` | `{"zaloType": "chat.voice"}` |
| loại khác (`chat.video.msg`, ...) | `UNKNOWN` | `[Tin Zalo chưa hỗ trợ]` | `{"zaloType": "<loại gốc>"}` |

Một tin thiếu `msgId`, `threadId`, `threadType` hợp lệ (`USER`/`GROUP`), `sentAt` chuẩn ISO-8601, `fromId` (khi không phải `isSelf`), hoặc `webchat` mà `text` là `null` sẽ ném `ProviderException(PAYLOAD_NORMALIZATION_FAILED)` ở hàm đơn; hàm gom trang bắt lỗi đó và đưa vào `SkippedItem(Kind.MESSAGE, msgId, PAYLOAD_NORMALIZATION_FAILED, ...)` để các tin lành trong cùng trang vẫn vào Hộp thư.

### 13.4 Webhook `/api/webhooks/zalo`: so khóa hằng thời gian và chặn body quá 1 KB
`ZaloWebhookController` kiểm `Authorization: Bearer <SINO_ZALO_SECRET>` bằng `MessageDigest.isEqual` (so sánh hằng thời gian, không rò độ dài hay ký tự qua thời gian trả lời) trước khi chạm vào body:
- thiếu hoặc sai khóa (hoặc Zalo đang tắt): ném `ZaloWebhookErrorCode.PUSH_TOKEN_INVALID` -> `401 Unauthorized`, không đọc body, không phát sự kiện;
- khóa đúng: đọc tối đa `MAX_BODY_BYTES + 1` (`1025` byte) từ `InputStream`; nếu vượt `1024` byte hoặc JSON hỏng / thiếu `ownId` thì trả `400 Bad Request` và không phát sự kiện, log cảnh báo không bao giờ in nội dung body hay khóa.

### 13.5 Kiểm chứng (ZL-08)
- **Đỏ trước:** 3 lớp test mới (`ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`, `ZaloWebhookTests`) và `ZaloProviderContractTest` (phần `READ_MESSAGES` + `PUSH_WEBHOOK`) đỏ khi chưa có `ZaloMessageNormalizer`, `ZaloWebhookController` và `ZaloProvider.{fetchUpdates,registerPush}`.
- **Xanh:** `ZaloMessageNormalizerTests`, `ZaloFetchUpdatesTests`, `ZaloWebhookTests`, `ZaloProviderContractTest`, `ZaloProviderTests`, `ZaloWiringTests`, `ModularityTests` xanh toàn bộ.

---

## 14. ZL-09 — Trả lời tin Zalo: `sendMessage`, `findSentMessages` và đối chiếu `409 CANNOT_TELL`

### 14.1 Luồng gửi và đối chiếu tin Zalo từ `ReplyService` (D-280, D-289)
Khi người dùng trả lời một cuộc trò chuyện Zalo trên màn Tin nhắn (`/messages`), `ReplyService.send` (F10) ghi bản nháp `PENDING` với `clientMessageId`, rồi gọi `ZaloProvider.sendMessage(context, command)`:
```text
ReplyService.begin (Transaction 1)
  |  - đọc external_conversation_id + type (DIRECT / GROUP) từ bảng conversation
  |  - Replies.recipientsOf: lấy người gửi tin INBOUND mới nhất, hoặc recipients.to() của tin OUTBOUND,
  |    hoặc chính cuộc trò chuyện (DIRECT / GROUP) khi chỉ có tin tự gửi từ điện thoại
  |  - ghi message(status='PENDING', external_message_id='sino:<clientMessageId>')
  v
ZaloProvider.sendMessage(context, command)
  |  - đổi ConversationType.GROUP -> ThreadType.GROUP, còn lại -> ThreadType.USER
  |  - POST /accounts/{accountId}/messages {threadId, threadType, text, clientMessageId}
  |  - gặp 404 UNKNOWN_ACCOUNT / 410 SESSION_ENDED -> PUT /session -> gửi lại 1 lần (D-289)
  v
ReplyService.sent / failed (Transaction 2)
  |  - 201 {msgId, sentAt} -> cập nhật external_message_id = msgId, status = 'SENT'
  |  - 429 RATE_LIMITED / 422 REQUEST_REJECTED -> status = 'FAILED' (gửi lại được)
  |  - 504 SEND_TIMEOUT / đứt mạng sau khi gửi -> status = 'UNKNOWN' (đợi reconcile)
```

### 14.2 Vì sao `409 CANNOT_TELL` ở `findSentMessages` ném `OUTCOME_UNKNOWN` thay vì dừng vòng đối chiếu
Trong bảng D-281 của `ZaloClient`, mã HTTP `409 CANNOT_TELL` từ `POST /accounts/{accountId}/sent/lookup` ném `ProviderException(PROVIDER_UNAVAILABLE)` để báo rằng `sino-zalo` vừa khởi động lại sau mốc `startedAt` nên đã mất bộ đệm RAM và bảng `SentLog` của thời điểm gửi đó — tuyệt đối không được trả danh sách rỗng `[]` (vì danh sách rỗng nghĩa là chắc chắn chưa gửi, sau 10 phút `ReplyService` sẽ chuyển tin sang `FAILED` và cho phép gửi lại lần hai).

Tuy nhiên, `ReplyService.reconcile(accountId)` duyệt các tin `UNKNOWN` của tài khoản từ cũ tới mới. Nếu một tin cũ nhận `PROVIDER_UNAVAILABLE`, `reconcile` hiểu là cả nhà cung cấp đang sập và `return` ngay, khiến mọi tin `UNKNOWN` mới hơn đứng sau nó bị kẹt mãi mãi dù `sino-zalo` đã sống lại và biết rõ kết quả của các tin mới.

Giải pháp ở `ZL-09`:
1. `ZaloProvider.findSentMessages` bắt `ProviderException` từ `client.lookup`; nếu là `409 CANNOT_TELL` (`ZaloClient.cannotTell(failure)`), nó ném lại `ProviderException(OUTCOME_UNKNOWN, failure.getMessage())` (trong khi `ZaloClient.lookup` vẫn giữ `PROVIDER_UNAVAILABLE` theo bảng D-281).
2. Trong `ReplyService.reconcile`, khi `findSentMessages` ném `CAPABILITY_NOT_SUPPORTED` **hoặc** `OUTCOME_UNKNOWN`, vòng lặp đặt `canTell = false` cho riêng tin đó (nên `givenUp = canTell && message.givenUp()` là `false`, tin đó giữ nguyên `UNKNOWN` kể cả khi đã quá 10 phút) rồi **tiếp tục sang tin kế tiếp** thay vì `return`.

### 14.3 Kiểm chứng (ZL-09)
- **Đỏ trước:** `ZaloSendTests`, `ZaloProviderTests`, `ZaloWiringTests` và 2 test mới trong `ConversationSendApiTests` (`aMessageSinoZaloCannotTellAboutStaysUnknownWhileANewerOneSettles`, `aChatConversationWithOnlyAnOutboundMessageRepliesToItsThreadAndPassesItsType`) đỏ trước khi sửa `ZaloProvider`, `ReplyService` và `Replies`.
- **Xanh:** `Zalo*`, `ConversationSendApiTests`, `ConversationReplyApiTests`, `ModularityTests` (208 test chạy, 0 lỗi).

---

## 15. ZL-10 — Ngắt phiên khi xóa hoặc tắt tài khoản; công tắc tắt Zalo trọn vẹn

### 15.1 Mở rộng contract `MessageProvider.disconnect(ProviderContext)`
`MessageProvider` thêm phương thức mặc định:
```java
default void disconnect(ProviderContext context) {
}
```
- Mặc định không làm gì: các connector không giữ trạng thái sống theo tài khoản (như Gmail, vốn chỉ thu hồi refresh token OAuth2 qua `OAuth2TokenRevoker` khi xóa tài khoản) không cần ghi đè.
- `ZaloProvider.disconnect(context)` gọi `ZaloClient.deleteSession(context)` -> `DELETE /accounts/{accountId}/session` tới `sino-zalo` kèm `Authorization: Bearer <SINO_ZALO_SECRET>`. Tại `sino-zalo`, `SessionRegistry.remove(accountId)` dừng WebSocket listener của `zca-js` và xóa phiên cộng bộ đệm tin trong RAM (D-284).

### 15.2 Vì sao `AccountManagementService` chỉ gọi `disconnect` sau khi transaction đã commit
Nếu `AccountManagementService` gọi `DELETE /accounts/{accountId}/session` **trước** khi transaction cơ sở dữ liệu commit mà ngay sau đó transaction bị rollback (ví dụ do xung đột khóa lạc quan `OptimisticLockingFailureException` hoặc lỗi ở một `@EventListener`), tài khoản trong PostgreSQL vẫn ở trạng thái `CONNECTED` nhưng `sino-zalo` đã xóa mất phiên và tắt listener.

Do đó `AccountManagementService` tách việc ngắt phiên ra sau commit ở cả hai đường:
```text
1. Xóa tài khoản — AccountManagementService.remove(ownerId, accountId)
   +-------------------------------------------------------------------+
   | transaction.execute:                                              |
   |   - đọc Revocation (OAuth2) và ProviderContext trước khi xóa      |
   |   - account.remove(now) + credentials.delete(id)                  |
   |   - publish AccountRemoved                                        |
   +-------------------------------------------------------------------+
                                   |
                         (commit thành công)
                                   v
   +-------------------------------------------------------------------+
   | Ngoài transaction (best-effort):                                  |
   |   - revoker.revoke(...) nếu provider có OAuth2 revocation URI     |
   |   - connector.disconnect(context) -> lỗi chỉ ghi LOG.warn         |
   +-------------------------------------------------------------------+

2. Tắt tài khoản — AccountManagementService.update(ownerId, accountId, command)
   +-------------------------------------------------------------------+
   | @Transactional:                                                   |
   |   - command.enabled() == false và account.disable() đổi trạng thái|
   |   - publish AccountStatusChanged(..., DISABLED)                   |
   |   - đăng ký TransactionSynchronization.afterCommit()              |
   +-------------------------------------------------------------------+
                                   |
                         (commit thành công)
                                   v
   +-------------------------------------------------------------------+
   | afterCommit() (best-effort):                                      |
   |   - connector.disconnect(context) -> lỗi chỉ ghi LOG.warn         |
   +-------------------------------------------------------------------+
```
Khi `connector.disconnect(context)` ném `ProviderException` hoặc `RuntimeException` (ví dụ `sino-zalo` đang tắt hoặc trả `500`), `AccountManagementService` chỉ ghi `LOG.warn` với `accountId`, tên provider và `errorCode` / tên lớp ngoại lệ (không bao giờ in nội dung lỗi thô hay credential), giữ nguyên kết quả xóa hoặc tắt tài khoản.

### 15.3 Công tắc tắt khẩn cấp (`sino.zalo.enabled=false`) trọn vẹn (D-286)
Khi `sino.zalo.enabled=false`:
1. `ZaloProvider` vẫn có mặt trong `ProviderRegistry` với `turnedOn() = false`, `connectMethod = QR`; `GET /api/providers` trả `connectable = false`.
2. `POST /api/accounts/connect/zalo/qr` bị `QrConnectService` chặn ngay với `409 PROVIDER_DISABLED`.
3. Mọi lời gọi ra `sino-zalo` trên `ZaloProvider` (`fetchUpdates`, `sendMessage`, `findSentMessages`, `registerPush`, `disconnect` và `qrLogin().start/status/cancel`) đều bị `ZaloClient.requireOn()` chặn trước khi mở kết nối mạng và ném `ProviderException(PROVIDER_UNAVAILABLE)`.

### 15.4 Kiểm chứng (ZL-10)
- **Đỏ trước:** 8/11 test trong `ZaloDisconnectTests` và `AccountDisconnectTests` đỏ khi `ZaloProvider.disconnect` và `AccountManagementService` chưa cài đặt.
- **Xanh:** `ZaloDisconnectTests`, `AccountDisconnectTests`, `RemoveAccountRevokesTests`, `AccountsApiTests`, toàn bộ `Zalo*` và `ModularityTests` (195 test chạy, 0 lỗi).
## 16. ZL-12 — Chạy `sino-zalo` cạnh `sino-api`, và CI cho một package trong monorepo

### 16.1 Cấu hình qua biến môi trường: một secret, hai tiến trình
Sino chạy Zalo bằng **hai tiến trình riêng**, nên cùng một bí mật phải có ở hai chỗ và phải khớp nhau:

```text
apps/sino-zalo/.env                        apps/sino-api/.env
  SINO_ZALO_SECRET=<S>  <--- phải bằng --->  SINO_ZALO_SECRET=<S>
  SINO_ZALO_HOST=127.0.0.1                   SINO_ZALO_ENABLED=true
  SINO_ZALO_PORT=8090   <--- trỏ tới  ---->  SINO_ZALO_URL=http://127.0.0.1:8090
  SINO_API_URL=http://127.0.0.1:8080 ------> nơi sino-zalo gọi webhook
```

Hai điều đáng học ở cách đặt cấu hình này:

1. **Hỏng thì chết ngay lúc khởi động, không chết lúc đang dùng.** Cả hai bên đều kiểm cấu hình ở lần chạy đầu: `loadConfig(env)` của `sino-zalo` thoát mã 1 kèm tên biến sai, còn `ZaloConfiguration.check(properties)` của `sino-api` ném `IllegalStateException` làm Spring dừng khởi động. Hệ quả thực tế rất tiện khi vận hành: **tiến trình còn sống nghĩa là cấu hình đã đúng**, không có trạng thái "chạy được nhưng cấu hình sai" để phải đoán.
2. **Thông báo lỗi nêu *tên* biến, không bao giờ in *giá trị*.** `SINO_ZALO_SECRET` là bí mật dùng chung; in nó ra log là rò rỉ. Mọi câu lỗi trong `ZaloConfiguration` đều theo kiểu "SINO_ZALO_SECRET (sino.zalo.secret) must be at least 32 bytes", đủ để sửa mà không tiết lộ gì.

`ZaloConfiguration` còn chặn secret có ký tự ngoài ASCII hiển thị: nó đi vào HTTP header `Authorization`, và JDK sẽ từ chối header lạ **kèm nguyên nội dung header trong câu lỗi** — tức là làm rò rỉ secret qua đúng cái lỗi đó. Chặn sớm ở cấu hình vừa cho câu lỗi dễ hiểu, vừa tránh rò rỉ.

### 16.2 Health check: vì sao `GET /health` không cần secret
`src/auth.ts` giữ một danh sách đường dẫn công khai:
```ts
const PUBLIC_ROUTES = new Set(["/health"]);
```
Mọi đường dẫn khác — kể cả đường chưa có route nào phục vụ — đều phải có `Authorization: Bearer <SINO_ZALO_SECRET>`. Cách này (chặn mặc định, mở theo danh sách trắng) an toàn hơn cách ngược lại: thêm route mới về sau là **tự động** được bảo vệ, không phải nhớ thêm gì.

`/health` được mở vì nó chỉ trả **số đếm**, không trả nội dung tin:
```text
GET /health  ->  200 {"status":"UP","sessions":{"live":0,"ended":0}}
```
Người kiểm tra cần biết "tiến trình có sống không" trước khi có secret trong tay (script khởi động, docker healthcheck, hay chính người dùng chạy `curl`). Mở một endpoint chỉ có số đếm là cái giá nhỏ để đổi lấy việc đó.

### 16.3 Tắt khẩn cấp: thứ tự hai bước, và vì sao thứ tự đó
Cơ chế của công tắc đã nằm ở mục 15.3. Phần vận hành là **thứ tự**:

1. **Dừng tiến trình `sino-zalo` trước.** Listener WebSocket chết theo tiến trình, nên phiên Zalo dừng ngay tại Zalo. Bước này không cần `sino-api` làm gì cả — mà lúc khẩn cấp, `sino-api` có thể chính là chỗ đang hỏng.
2. **Rồi `SINO_ZALO_ENABLED=false` và khởi động lại `sino-api`.** Không còn lời gọi nào ra `sino-zalo`, hộp thoại kết nối thôi mời Zalo, nhưng Gmail và tin Zalo đã lưu vẫn đọc được.

Đây là lý do hồ sơ **bỏ** phương án "`sino-api` gọi `DELETE session` cho mọi account" (D-286): phương án đó cần `sino-api` còn khỏe, còn phải lặp đúng qua mọi account; dừng tiến trình thì chắc chắn hơn và không phụ thuộc gì. Bài học chung: **đường tắt khẩn cấp nên phụ thuộc vào càng ít thành phần càng tốt** — nhất là không phụ thuộc vào thành phần có thể đang là nguyên nhân.

Làm thiếu một bước thì: chỉ bước 1, `sino-api` cứ gọi một service không có ai trả lời (an toàn, nhưng mọi lời gọi Zalo đều lỗi); chỉ bước 2, phiên Zalo vẫn sống nguyên trong `sino-zalo`.

### 16.4 CI cho một package trong monorepo: `paths` filter
`.github/workflows/zalo-ci.yml` chỉ chạy khi có thay đổi liên quan:
```yaml
on:
  push:
    branches: [main, dev, "feature/**"]
    paths:
      - "apps/sino-zalo/**"
      - ".github/workflows/zalo-ci.yml"

concurrency:
  group: zalo-ci-${{ github.ref }}
  cancel-in-progress: true
```
Mấy chi tiết dễ bỏ sót:

- **Chính file workflow nằm trong `paths`.** Sửa workflow mà không có dòng đó thì job không chạy, và không biết mình vừa làm nó hỏng hay chưa.
- **`concurrency.group` gắn với tên nhánh** cộng `cancel-in-progress: true`: push liên tiếp trên cùng nhánh thì lần cũ bị hủy, chỉ lần mới nhất chạy. Tên group phải có tên workflow ở đầu như trên, nếu không `zalo-ci` và `frontend-ci` sẽ hủy lẫn nhau.
- **`cache-dependency-path` trỏ vào `apps/sino-zalo/pnpm-lock.yaml`.** Repo này **không** có pnpm workspace ở gốc: mỗi app có `pnpm-lock.yaml` riêng. Trỏ sai lockfile thì cache không bao giờ trúng (và xấu hơn: trúng cache của app khác).
- **`pnpm install --frozen-lockfile`** chứ không phải `pnpm install`: lockfile lệch `package.json` thì CI phải đỏ, không được âm thầm cập nhật lockfile rồi chạy tiếp.
- **Không có bước Build.** Node chạy trực tiếp file TypeScript (nó chỉ xóa phần type), nên không có sản phẩm build nào để tạo. Nhưng chính vì Node **không** kiểm type, `pnpm typecheck` (`tsc`) phải là một bước riêng — nếu không thì lỗi type sẽ không bao giờ bị CI bắt. So với `frontend-ci`, chỗ `Build` được thay bằng `Type-check`.

### 16.5 Một cái bẫy: oxlint bỏ `node_modules` là nhờ `.gitignore`
Khi kiểm chứng ZL-12, cách làm là dựng lại đúng các lệnh của job trong một thư mục sạch (không `node_modules`, không `.env`) rồi chạy. Lần đầu `pnpm lint` **đỏ**, oxlint đi vào `node_modules/typescript/lib/typescript.js` và báo lỗi trong code của người khác.

Nguyên nhân không phải CI: `.oxlintrc.json` của `sino-zalo` **không** có `ignorePatterns`, và oxlint bỏ qua `node_modules` chỉ vì `.gitignore` có dòng đó. Bản copy thủ công của thư mục sạch đã thiếu `.gitignore`. Thêm `.gitignore` vào thì lint về 0.

Hai bài học:

1. **Khi dựng lại CI tại máy, phải dựng lại đúng cả những file "không phải code".** `actions/checkout` mang theo *mọi* file đã commit, `.gitignore` nằm trong đó; một bản copy chọn tay thì không. Một "CI đỏ" dựng lại sai cách sẽ dẫn đi sửa nhầm chỗ.
2. **Công cụ hay đọc `.gitignore` làm cấu hình.** oxlint, ripgrep, prettier, nhiều bundler đều vậy. Nghĩa là `.gitignore` không chỉ nói với Git: xóa một dòng trong đó có thể làm lint hoặc build đổi hành vi. `apps/sino-web` cũng dựa vào đúng cơ chế này và `frontend-ci` vẫn xanh, nên đây là kiểu dùng bình thường — chỉ cần biết là mình đang dựa vào nó.

## 17. ZL-14 — Hiển thị sticker Zalo và tin nhắn GIF dạng ảnh trong chat

### 17.1 Vấn đề: `chat.sticker` chỉ mang id, và tin nhắn ảnh động GIF cần xử lý chuyên biệt
Khi người dùng chat qua Zalo gửi một sticker, thư viện `zca-js` nhận được sự kiện với `msgType === "chat.sticker"`. Dữ liệu `data.content` trong sự kiện này không chứa địa chỉ URL của ảnh, mà chỉ chứa một đối tượng với các thuộc tính định danh: `{ id, catId, type }`. Ngoài ra, Zalo còn có dạng tin nhắn ảnh động GIF (`msgType === "chat.gif"`) khi người dùng chia sẻ từ kho GIF tích hợp.
Trước ZL-14, Sino chỉ hiển thị văn bản đại diện `[Sticker]` hoặc `[GIF]` (theo bảng D-279). Người dùng kiểm tra thấy trong giao diện chat chỉ hiện chữ thay vì hình ảnh trực quan. Hơn nữa, với các sticker động, nếu chỉ lấy thumbnail WebP nén tĩnh (`webpc`) thì hình ảnh bị đứng yên, mất chuyển động.

Để hiển thị hình ảnh sticker và GIF thật (bao gồm cả ảnh động):
1. `sino-zalo` (Node.js): Phân giải `{ id, catId, type }` từ `data.content`, gọi API `getStickersDetail(id)` của `zca-js`. Ưu tiên lấy `detail.stickerUrl` (ZL-14 tưởng đây là ảnh động; thực ra là PNG tĩnh, xem mục 18) trước `detail.stickerWebpUrl` (ảnh thumbnail tĩnh dạng WebP). Với `chat.gif`, trích xuất trực tiếp địa chỉ URL từ nội dung `data.content` hoặc trường `params`.
2. `sino-api` (Spring Boot / Java): Xác thực URL an toàn (chấp nhận HTTPS, danh sách tên miền tin cậy gồm CDN Zalo và các nhà cung cấp GIF phổ biến như `tenor.com`, `giphy.com`), lưu vào trường `metadata.stickerUrl`, gán `textContent` là `[Sticker]` hoặc `[GIF]`, và trả trường `sticker` ở API tin nhắn (`GET /api/conversations/{id}/messages`).
3. `sino-web` (React / TypeScript): Kiểm tra URL an toàn qua hàm `pictureOf`, kết xuất thẻ ảnh `<img>` với thuộc tính `loading="lazy"` và `referrerPolicy="no-referrer"`. Nếu ảnh bị lỗi khi tải hoặc URL không an toàn, tự động quay về khung tin nhắn chữ tương ứng `[Sticker]` hoặc `[GIF]`.

### 17.2 Phân giải URL sticker và xử lý tin nhắn GIF tại `sino-zalo` (`Stickers.ts` và `ZcaGateway.ts`)
Việc gọi API ngoài để lấy chi tiết sticker có thể gặp độ trễ hoặc lỗi mạng tạm thời. Nếu gọi tuần tự cho từng tin nhắn mỗi lần đọc tin, toàn bộ lượt đồng bộ sẽ bị chậm lại.
Giải pháp được thiết kế trong lớp `Stickers` và gateway:
- Ưu tiên tài nguyên động: Trong `ZcaGateway`, thứ tự trích xuất URL chi tiết sticker là `detail?.stickerUrl || detail?.stickerWebpUrl || null`. Giả định của ZL-14 là thứ tự này giữ được hoạt cảnh của sticker động; giả định đó sai, xem mục 18.
- Xử lý tin nhắn `chat.gif`: Hàm `gifStickerOf` và `gifUrlOf` phân tích cấu trúc đa dạng của tin nhắn GIF (dạng chuỗi URL, đối tượng JSON, hoặc chuỗi JSON lồng nhau trong `params` với các khóa `href`, `url`, `normalUrl`, `oriUrl`). Tin nhắn sau khi trích xuất được gắn sẵn `sticker: { id, catId, type, url }`.
- Cache URL thông minh: Trong `Stickers.fill(messages)`, nếu tin nhắn đã có sẵn URL (như tin nhắn GIF), hệ thống nạp thẳng vào bộ nhớ cache mà không cần gửi truy vấn tới Zalo API. Với các sticker cần tra cứu qua `id`, hệ thống lưu cache khi thành công và không cache kết quả null để cho phép thử lại.
- Giới hạn thời gian (Timeout 2 giây): Toàn bộ lời gọi phân giải sticker trong một mẻ tin nhắn bị chặn tối đa 2 giây bằng `Promise.race` và `AbortSignal`, đảm bảo API đọc tin nhắn `GET /accounts/{accountId}/messages` không bao giờ bị nghẽn quá lâu.
- Bất biến (Immutability): Mảng tin nhắn gốc không bị sửa đổi trực tiếp; hàm `fill(messages)` trả về bản sao nông có bổ sung thuộc tính `sticker?: ZaloSticker`.

### 17.3 Chuẩn hóa an toàn và chống lừa đảo URL tại `sino-api`
Dữ liệu nhận từ dịch vụ trung gian hoặc bên thứ ba luôn tiềm ẩn rủi ro tấn công XSS hoặc rò rỉ dữ liệu qua URL (`javascript:`, `data:`, hoặc các domain độc hại).
`ZaloMessageNormalizer` sử dụng phương thức `pictureAddress` để kiểm tra nghiêm ngặt:
- Phải là địa chỉ HTTPS tuyệt đối (`url.getProtocol().equalsIgnoreCase("https")`).
- Không chứa thông tin xác thực người dùng (`url.getUserInfo() == null`), ngăn ngừa dạng lừa đảo `https://user:pass@domain`.
- Chiều dài chuỗi tối đa 2000 ký tự và chỉ chứa ký tự ASCII in được (`0x20` đến `0x7E`).
- Tên miền (`host`) bắt buộc phải thuộc các domain tin cậy:
  - CDN chính thức của Zalo: `zadn.vn`, `zdn.vn`, `zaloapp.com`, `zalo.me`, hoặc các subdomain kết thúc bằng `.zadn.vn`, `.zdn.vn`.
  - Nhà cung cấp ảnh động GIF: `tenor.com`, `tenor.co`, `giphy.com`, hoặc các subdomain liên quan như `media.tenor.com`, `c.tenor.com`, `media.giphy.com`.

Khi hợp lệ, URL được đưa vào `metadata.stickerUrl`. Khi lưu trữ hoặc đọc ra, câu lệnh SQL truy vấn trực tiếp JSON metadata:
`m.metadata ->> :stickerUrl AS sticker_url`
và trả về `MessageResponse.sticker`.

### 17.4 Hiển thị và xử lý lỗi tải ảnh tại `sino-web`
Tại giao diện web, tin nhắn sticker và GIF có hai yêu cầu quan trọng:
1. Danh sách hội thoại bên trái (inbox list / snippet): Cần giữ nguyên chữ tóm tắt `[Sticker]` hoặc `[GIF]` để người dùng liếc nhanh biết loại tin nhắn. Vì vậy `textContent` ở backend vẫn lưu tương ứng `[Sticker]` hoặc `[GIF]`.
2. Khung chat bên phải (thread detail): Thay vì vẽ khung tin nhắn chữ nền màu, component `Bubble` kiểm tra `pictureOf(message.sticker)`:
   - Nếu có URL hợp lệ và ảnh chưa bị lỗi: hiển thị thẻ `<img src={sticker} alt={isGif ? "GIF" : "Sticker"} loading="lazy" referrerPolicy="no-referrer" className="size-32 object-contain select-none" />`. Thẻ ảnh hiển thị mượt mà cả ảnh tĩnh lẫn hoạt ảnh GIF động.
   - `loading="lazy"` giúp trình duyệt chỉ tải ảnh khi cuộn tới vị trí tin nhắn.
   - `referrerPolicy="no-referrer"` ngăn trình duyệt gửi thông tin máy chủ Sino trong tiêu đề `Referer` khi tải tài nguyên từ bên ngoài.
   - Quản lý trạng thái lỗi bằng React state `brokenSticker`: Khi sự kiện `onError` xảy ra (ví dụ CDN xóa ảnh hoặc mất mạng), `brokenSticker` chuyển thành `true` và giao diện tự động quay trở lại hiển thị bóng tin nhắn chữ tương ứng (`[Sticker]` hoặc `[GIF]`).

### 17.5 Kiểm chứng (ZL-14)
- `apps/sino-zalo`: 17 unit test trong `test/stickers.test.ts` kiểm tra parse `toZaloMessage` cho cả sticker tĩnh, sticker động và `chat.gif`, cache URL, timeout, và route `GET /accounts/{accountId}/messages`. Toàn bộ 154/154 test passed trên 13 file test, oxlint 0 lỗi.
- `apps/sino-api`: 28 test trong `ZaloStickerTests` kiểm tra toàn bộ các trường hợp URL hợp lệ, không hợp lệ, URL độc hại, tin nhắn `chat.gif`, và các domain Tenor/GIPHY. Toàn bộ 28/28 test passed, `mvn test` thành công.
- `apps/sino-web`: 11 test trong `sticker.test.ts` (bao gồm kiểm tra domain Tenor/GIPHY), 19 test trong `inbox.api.test.ts`, 6 test trong `Sticker.test.tsx` (kiểm tra đầy đủ việc hiển thị ảnh, các thuộc tính bảo mật, và fallback khi `onError`). Toàn bộ 799/799 test của `sino-web` đều passed, `oxlint` 0 lỗi, `tsc -b` và `pnpm build` thành công.

## 18. ZL-15 — Sticker Zalo chuyển động bằng sprite sheet

### 18.1 Vấn đề: ảnh đang hiển thị chỉ là khung đầu
Sau ZL-14, sticker hiện ra nhưng đứng yên, và người dùng thấy nó "chỉ là ảnh thường". Nguyên nhân là ZL-14 tin rằng `detail.stickerUrl` là ảnh động. Kiểm tra thật (chỉ xin header và 33 byte đầu của PNG, hai sticker đã nhận):

| Địa chỉ | Là gì | Kích thước |
|---|---|---|
| `.../sticker/webpc?eid=33784&size=130` | PNG tĩnh, một khung | 130 x 130, 8 KB |
| `.../sprite?eid=33784&size=130` | PNG sprite sheet | 910 x 130 (7 khung), 75 KB |
| `.../sprite?eid=45342&size=130` | PNG sprite sheet | 2470 x 130 (19 khung), 185 KB |

Sticker chuyển động của Zalo vì vậy là **một tấm ảnh dài**, các khung xếp cạnh nhau trên một hàng, mỗi khung vuông bằng chiều cao tấm ảnh. `getStickersDetail` trả thêm `stickerSpriteUrl`, `totalFrames` và `duration`.

```text
sprite sheet 910 x 130, 7 khung:
+------+------+------+------+------+------+------+
|  0   |  1   |  2   |  3   |  4   |  5   |  6   |   mỗi khung 130 x 130
+------+------+------+------+------+------+------+

hộp hiển thị 128 x 128, overflow ẩn: chỉ thấy một khung.
Tấm ảnh trượt sang trái từng bước: 0, -128, -256, ... -768 px, rồi về 0.
```

### 18.2 `sino-zalo`: lấy sprite cùng ảnh tĩnh trong một lời gọi
`stickerArt(id)` thay `stickerUrl(id)` và trả `{ url, sprite }`, vẫn chỉ một lần gọi `getStickersDetail`. Hàm thuần `stickerArtOf` quyết định: ảnh tĩnh là `stickerUrl`, rồi `stickerWebpUrl`; sprite chỉ có khi Zalo nêu địa chỉ sprite, `totalFrames` là số nguyên lớn hơn 1 và `duration` làm tròn lớn hơn 0. Một điều chỉ biết được từ dữ liệu thật: `duration` là **mili giây mỗi khung**, không phải cả lượt. Hai sticker đầu tiên cho 7 khung với 150 và 19 khung với 100; nếu đó là cả lượt thì 19 khung chạy trong 100 ms. Vì vậy một lượt là `duration` nhân số khung (1050 ms và 1900 ms), và phép nhân nằm ở `stickerArtOf`, nơi duy nhất biết Zalo nghĩ gì, để `durationMs` trong phần còn lại của hệ thống luôn là cả một lượt. Nếu cả ảnh tĩnh lẫn sprite đều không có thì trả `null` (Zalo không biết sticker). `Stickers` cache cả hai và ghi một dòng log số khung và thời lượng lần đầu thấy mỗi sticker, chỉ có số, để kiểm đơn vị của `duration` trên dữ liệu thật.

### 18.3 `sino-api`: kiểm tra và lưu
Metadata là bảng chữ-sang-chữ, nên ba giá trị mới lưu dạng chữ: `stickerSpriteUrl`, `stickerFrames`, `stickerDurationMs`. Chỉ `chat.sticker` có sprite; GIF tự nó đã là ảnh động.
- Địa chỉ sprite qua đúng `pictureAddress` của ảnh tĩnh (https, không user info, tên miền Zalo).
- Số khung từ 2 đến 300, thời lượng cả một lượt từ 100 đến 10 000 ms. Ngoài khoảng đó **bỏ cả sprite** thay vì cắt cho vừa: nếu `duration` hóa ra không tính bằng mili giây, cắt sẽ cho một sticker chạy sai tốc độ mà không ai biết, còn bỏ thì sticker hiện ảnh tĩnh và dữ liệu thật cho thấy lỗi.
- Đọc lại: `MessageHistory.spriteOf` phân tích chữ thành số có `try/catch`; thiếu một giá trị hoặc số hỏng thì không có sprite, sticker vẫn có ảnh tĩnh.
- API tin nhắn giữ nguyên `sticker` (ảnh tĩnh) và thêm `stickerSprite { url, frames, durationMs }`. Thêm trường chứ không đổi trường cũ, nên web và sino-zalo cũ vẫn chạy với nhau.

### 18.4 `sino-web`: chạy sprite bằng CSS
`StickerPicture` đặt `<img>` rộng `frames x 100%` của hộp 128 x 128 (mỗi khung đúng bằng hộp) và gắn `animate-sticker`:

```text
animation: sticker-run var(--sticker-ms) steps(var(--sticker-frames), jump-none) infinite
@keyframes sticker-run { to { transform: translateX(calc(-100% * (frames - 1) / frames)) } }
```

- `translateX` theo phần trăm tính trên bề rộng của chính phần tử, nên `-(frames-1)/frames` là đúng khung cuối.
- `steps(N, jump-none)` cho đủ N vị trí từ đầu đến cuối; `steps(N)` thường chỉ cho N-1 vị trí đầu và bỏ khung cuối.
- Số khung và thời lượng đi qua hai biến CSS `--sticker-frames`, `--sticker-ms` đặt trên chính thẻ `<img>`, nên CSS là một đoạn cố định.
- `motion-reduce:animate-none`: người đọc bật giảm chuyển động thì sticker đứng ở khung đầu.
- Sprite lỗi tải thì ảnh tĩnh, ảnh tĩnh lỗi thì chữ `[Sticker]`: ba tầng, mỗi tầng một state `brokenSprite`, `brokenSticker`.
- `spriteOf` kiểm lại cùng giới hạn với backend: giá trị mà trang chạy đã qua hai lần kiểm.

### 18.5 Kiểm chứng (ZL-15)
- `jsdom` không chạy được CSS animation, nên phần chuyển động kiểm riêng trong trình duyệt thật với sprite thật: đọc `transform` sau khi đặt thời gian của animation bằng Web Animations API. Đồng hồ của tab nền trong khung xem trước đứng yên (`timeline = 0`), nên lấy mẫu theo thời gian thật không thấy gì dù CSS đúng; đặt `currentTime` cho kết quả xác định: 7 vị trí `0 … -768` px.
- sino-zalo 165/165, sino-api 1796 test, sino-web 831/831 (trên worktree sạch). Kèm sửa một lỗi `TS18048` của ZL-14 trong `test/stickers.test.ts`.
- Lần chạy thật đầu tiên (hai sticker, 2026-10-19) xác nhận tên trường và sprite, và sửa đơn vị của `duration` (mục 18.2). Bài học: một giá trị mà không ai kiểm bằng dữ liệu thật thì chỉ là giả định. Ở đây giả định sai không làm hỏng gì rõ ràng, chỉ làm hoạt cảnh nhanh gấp hàng chục lần, nên phải có dòng log số khung và thời lượng (mục 18.2) để thấy được. Hai dòng đã lưu với số sai được sửa tay một lần trong DB dev.
- Người dùng xác nhận trên màn chat (2026-10-19): sau bản sửa đơn vị, hai sticker thật chạy đúng tốc độ. Sticker đã lưu trước ZL-15 giữ ảnh tĩnh, theo thiết kế.
- Một sự cố đi kèm: sino-api chạy từ IDE có `spring-boot-devtools`, nên build vào `target/classes` khi nó đang chạy làm ứng dụng tự khởi động lại giữa chừng. Đồng bộ báo lỗi `INTERNAL` cho đến khi người dùng khởi động lại hẳn. Nguyên nhân chưa chứng minh được vì không có log, nhưng quy tắc rút ra thì rõ: build và chạy test ở bản copy, không ở thư mục mà ứng dụng đang chạy.

## 19. ZL-16 — Ảnh Zalo hiện trong chat

### 19.1 Vấn đề: ảnh bị bỏ ở cả ba tầng
Sau ZL-14 và ZL-15 sticker hiện đúng, nhưng một tin ảnh (`chat.photo`) vẫn chỉ là chữ `[Ảnh]`. Không phải một chỗ làm hỏng mà là cả đường đi không mang địa chỉ ảnh:

```text
Zalo                 sino-zalo              sino-api                      sino-web
content {            toZaloMessage          ZaloMessageNormalizer         Bubble
  href, thumb,  -->  photo { url,      -->  metadata imageUrl,       -->  PhotoPicture
  title, params }      thumbUrl,              imageThumbUrl,              (img + liên kết)
                       caption }              imageCaption                + chú thích
(trước ZL-16: bỏ)    (trước: không có)      (trước: chỉ chữ "[Ảnh]")      (trước: chỉ chữ)
```

Thiết kế theo đúng khuôn sticker: địa chỉ ảnh đi **thẳng từ CDN của Zalo tới trình duyệt**. Sino không tải ảnh về và không lưu ảnh; thứ duy nhất Sino lưu là một dòng chữ địa chỉ trong `metadata`. Lý do chọn: không phải lưu và phục vụ ảnh (dung lượng, quyền riêng tư, bản quyền), và nhất quán với sticker đã chạy. Cái giá: trình duyệt phải lấy được ảnh từ Zalo, và địa chỉ có thể hết hạn (mục 19.5).

### 19.2 `sino-zalo`: đọc nội dung ảnh
`photoOf` đọc `content` của tin `chat.photo`:
- `href` là ảnh như khung chat Zalo hiện, `thumb` là ảnh nhỏ. Bằng chứng không phải từ ảnh thật mà từ chính zca-js: khi trích dẫn một ảnh nó gán `normalUrl = content.href` và `thumbUrl = content.thumb` (`sendMessage.js`).
- Thiếu `href` thì tìm trong `content.params`, một **chuỗi JSON** (`rawUrl`, `normalUrl`, `oriUrl`, `hdUrl`, `hd`), rồi mới tới `thumb`. `paramsOf` bọc `JSON.parse` trong `try/catch` vì đây là dữ liệu từ ngoài: hỏng thì coi như không có.
- `title` là chú thích người gửi gõ kèm ảnh; rỗng hoặc toàn khoảng trắng thì là `null`.
- `webAddress` chỉ nhận chuỗi bắt đầu bằng `https://` hoặc `http://`. Việc quyết định tên miền nào đáng tin **không** làm ở đây mà ở `sino-api`, nơi duy nhất giữ danh sách tên miền Zalo.
- Toán tử `??` nối các nguồn theo thứ tự ưu tiên: `webAddress(href) ?? (khóa trong params) ?? thumb`. Khác với `||`, nó chỉ đi tiếp khi vế trái là `null`/`undefined`, nên một chuỗi rỗng không bị coi là "có".
- Chỉ `chat.photo` có `photo`; một tin khác dù content giống ảnh cũng không.

Vì chưa ai thấy content của một ảnh thật, `SessionManager` ghi thêm một cờ vào dòng log "Zalo message" của tin `chat.photo`: `photo: true` nghĩa là đã tìm thấy địa chỉ, `photo: false` nghĩa là không. Cờ là một boolean, **không bao giờ** là địa chỉ hay chú thích (địa chỉ ảnh riêng tư mở được ảnh). Có cờ này thì khi ảnh không hiện, ta biết lỗi ở tầng nào chứ không phải đoán.

Lần chạy thật đầu cho thấy một bài học về cách làm: ảnh vẫn là `[Ảnh]` mà không có dòng lỗi nào, vì mỗi tầng đều "an toàn" bằng cách bỏ qua điều nó không hiểu. Một đường đi chỉ bỏ qua lặng lẽ thì không tự cho biết nó hỏng ở đâu. Vì vậy thêm hai thứ. Thứ nhất, khi tin `chat.photo` không tìm được ảnh, `contentShape` ghi tên các khóa của nội dung với loại giá trị (`href:url`, `title:string(0)`, `params:string(143)`), không bao giờ ghi giá trị, nên nhìn dòng log là biết Zalo gửi gì mà không lộ địa chỉ. Thứ hai, `photoOf` cũng đọc nội dung dạng chuỗi JSON, một dạng có thể gặp mà chưa ai thấy. Hàm `objectOf` làm chung việc "lấy object từ một giá trị hoặc từ chuỗi JSON" cho cả nội dung lẫn `params`, thay hai đoạn `JSON.parse` viết riêng.

### 19.3 `sino-api`: kiểm tra, lưu, đọc lại
- `ZaloClient.Message` thêm thành phần `photo` kiểu `Photo(url, thumbUrl, caption)`. Một `record` Java có đúng một constructor chính tắc, và Jackson dùng nó để đọc JSON; mỗi thành phần thêm vào làm mọi chỗ `new Message(...)` cũ không biên dịch được. Vì vậy hai constructor cũ (9 và 10 tham số) được giữ, gọi constructor chính tắc với `null` cho phần còn thiếu. Một JSON không có `photo` (sino-zalo cũ) đọc ra `photo = null`.
- `ZaloMessageNormalizer.photoBody` dùng lại `pictureAddress` của sticker: https, không user info, không ký tự lạ, độ dài tối đa 2000, tên miền là tên miền Zalo hoặc con của nó. Thứ tự quyết định:

```text
ảnh chính hợp lệ?      có  -> imageUrl = ảnh chính; ảnh nhỏ hợp lệ và khác ảnh chính -> imageThumbUrl
                       không, ảnh nhỏ hợp lệ?  có -> imageUrl = ảnh nhỏ (đứng thay), không có imageThumbUrl
                                               không -> không khóa nào; log WARN tên miền
```
- Chữ của tin vẫn là `[Ảnh]` và `type` vẫn là `IMAGE`: danh sách hội thoại và bản xem trước đọc `textContent`, nên không đổi gì ở đó.
- Chú thích: `clean` (bỏ NUL, bỏ khoảng trắng hai đầu, rỗng thì `null`) rồi `cut` đến 2000 ký tự. `cut` được tổng quát hóa thành `cut(text, max)`; vẫn không cắt đôi một cặp thay thế UTF-16 (một emoji ngoài BMP là hai `char`), nếu ký tự thứ `max` là nửa đầu của cặp thì lùi một. `metadata` là nơi chứa giá trị nhỏ, nên chú thích có trần riêng, thấp hơn trần 100 000 ký tự của chữ tin.
- WARN khi không còn địa chỉ nào: `warnRefused` ghi **tên miền** và giao thức (chỉ khi khớp mẫu an toàn, không thì "unreadable"), độ dài, và `plain` (chỉ ASCII in được, không dấu cách). Ba thứ sau giúp phân biệt một tên miền Zalo mà danh sách chưa có với một địa chỉ bị từ chối vì cách viết (ví dụ có dấu cách hay quá dài). Đường dẫn và chú thích không bao giờ vào log. Mục đích: nếu CDN ảnh của Zalo nằm ở một tên miền mà danh sách `PICTURE_DOMAINS` chưa có, ảnh sẽ lặng lẽ ở lại là `[Ảnh]`; dòng WARN cho biết tên miền nào cần thêm.
- Đọc lại: `MessageHistory` thêm ba cột `image_url`, `image_thumb_url`, `image_caption` (toán tử `->>` của PostgreSQL lấy một khóa của cột jsonb ra dạng chữ). Tám tên khóa metadata giờ được gắn bằng một hàm `withMetadataKeys(StatementSpec)` dùng chung cho hai truy vấn (`page` và `message`), thay vì lặp lại từng dòng `.param(...)` ở cả hai nơi: thêm một khóa thì chỉ sửa một chỗ, và không thể quên chỗ thứ hai (một tham số có tên mà câu SQL dùng nhưng không được gắn sẽ làm cả endpoint lỗi).
- `imageOf` trả `null` khi không có `image_url`, dù chú thích có hay không: ảnh không có địa chỉ thì không có `image`. `InboxMessage.Image` đi tới `MessageResponse.image`, thêm trường chứ không đổi trường cũ.

### 19.4 `sino-web`: vẽ ảnh
- `photoOf` (trong `photo.ts`) kiểm lại bằng `pictureOf` mà sticker đã dùng: giá trị mà trang tải đã qua hai lần kiểm (backend và web). Ảnh nhỏ hợp lệ đứng thay ảnh chính bị từ chối; ảnh nhỏ trùng ảnh chính thì bỏ; chú thích được cắt khoảng trắng.
- `PhotoPicture` bọc `<img>` trong `<a target="_blank" rel="noopener noreferrer">`. `noopener` không cho tab mới điều khiển trang Sino qua `window.opener`; `noreferrer` không gửi địa chỉ trang Sino cho Zalo. `<img>` có `loading="lazy"` (chỉ tải khi cuộn tới) và `referrerPolicy="no-referrer"`.
- Cỡ lấy từ ô `.photo` của canvas: bo 14 px, viền 1 px, rộng tối đa 280 px (220 px trên điện thoại). Khác khung gạch chéo của canvas, ảnh thật **giữ tỉ lệ**: `w-auto h-auto max-h-80 max-w-55 md:max-w-70`, nên ảnh dọc cao đến 320 px thay vì bị cắt thành ô 280 x 180. `min-h-20 min-w-20` giữ liên kết không co về 0 trong lúc ảnh chưa tải; cái giá là ảnh rất nhỏ (60 x 40) bị phóng lên 2 lần.
- `Bubble` giữ trạng thái `photoStep` kiểu hợp `'FULL' | 'THUMB' | 'BROKEN'`: ảnh chính lỗi tải thì sang ảnh nhỏ (nếu có), ảnh nhỏ cũng lỗi thì ra chữ `[Ảnh]`. Dùng một hợp ba giá trị thay vì hai biến boolean vì ba trạng thái loại trừ nhau; ghép hai boolean cho ra một tổ hợp vô nghĩa. Chú thích tách khỏi chuỗi lùi này: ảnh hỏng hẳn thì vẫn còn chữ `[Ảnh]` và chú thích bên dưới, người đọc không mất chữ.
- `TextBubble` được tách ra khỏi `Bubble` (cũ là một `<div>` viết thẳng) vì giờ có hai chỗ dùng: chữ của tin và chú thích.

### 19.5 Kiểm chứng và những gì chưa kiểm
- Viết test trước và thấy đỏ ở cả ba app, rồi xanh. Gài lỗi (mutation) vào `photoOf` của sino-zalo, cờ log, `photoBody`, `MessageHistory`, `MessageResponse`, `photo.ts`, `Bubble`, `PhotoPicture`: chỉ một mutant sống (nhánh `Array.isArray` thừa); nó tương đương nên mã được rút gọn thay vì thêm test. Bài học: một nhánh mà không test nào phân biệt được thường là nhánh không cần có.
- Chrome thật chạy trên bản build với API và ảnh Zalo giả, vì cần đăng nhập mới vào được màn chat. Đo bằng script: ảnh ngang 280 x 187, vuông 280 x 280, dọc 214 x 320, và ba trường hợp lùi (ảnh nhỏ, chữ, chữ có chú thích).
- Môi trường của phiên này không có JDK 25 và Docker, nên sino-api chạy bằng JDK 21 bật `--enable-preview` và PostgreSQL 16 cục bộ có hàm `uuidv7()` bù, trên một bản sao của cây. Hệ quả: một số test phụ thuộc thứ tự ID trong cùng một mili-giây đỏ ngẫu nhiên, y hệt trên mã chưa sửa. Một bộ test chạy trên môi trường khác nhà phát triển thường dùng thì chỉ chứng minh được phần nó chạm tới; so với mã gốc trong cùng môi trường mới nói được "tôi không làm hỏng gì thêm".
- **Chưa kiểm trên ảnh thật:** tên trường trong `content` của một ảnh nhận về; CDN của Zalo có cho trình duyệt lấy ảnh mà không cần cookie và không có Referer hay không; địa chỉ ảnh có hết hạn sau một thời gian không (nếu có, ảnh cũ sẽ lùi về `[Ảnh]` khi mở lại). Cả ba chỉ biết được khi gửi một ảnh thật.
- Tin ảnh đã lưu trước ZL-16 giữ chữ `[Ảnh]` vì metadata của chúng không có địa chỉ; không backfill, như sticker ở ZL-15. Ảnh mới gửi từ giờ sẽ hiện.

## 20. ZL-17 — Sticker ngoài bộ chuẩn: đường lùi theo bộ, và log chỉ đúng chỗ rơi

### 20.1 Vấn đề: một thư viện nuốt lỗi
Sau khi ảnh hiện, người dùng báo sticker chuẩn của Zalo hiện còn "sticker khác" thì không. Nhìn vào `getStickersDetail` của zca-js thì thấy lý do có thể:

```text
getStickersDetail(ids)
  -> với mỗi id gọi Zalo ("sticker_detail")
  -> Promise.allSettled(...)         chờ tất cả, KHÔNG ném lỗi nào
  -> chỉ giữ những cái "fulfilled"   cái bị từ chối bị bỏ im lặng
  -> trả về mảng (có thể rỗng)
```

Sticker nào Zalo từ chối trả theo từng id (một sticker ngoài danh mục, hoặc thuộc một bộ mà dịch vụ này không phục vụ) làm mảng rỗng, và `sino-zalo` đọc "mảng rỗng" là "Zalo không biết sticker này": tin hiện chữ `[Sticker]` mà không một dòng log nào. Đây là cùng bài học của ảnh (mục 19): một tầng "an toàn" bằng cách bỏ qua điều nó không hiểu thì không tự cho biết nó hỏng ở đâu.

### 20.2 Đường lùi: hỏi theo bộ
zca-js có `getStickerCategoryDetail(cateId)`, trả **cả bộ** sticker của một `catId`. Tin sticker mang sẵn `catId`, nên khi hỏi theo từng sticker không ra ảnh, `findStickerArt` hỏi cả bộ và lấy sticker có đúng `id`:

```text
getStickersDetail(id) có ảnh?  có -> dùng (via: detail)
                               không -> catId là số nguyên dương?  không -> không có ảnh
                                        có -> bộ đã có trong bộ nhớ?  có -> dùng
                                                                     không -> hỏi Zalo, nhớ lại
                                        sticker có trong bộ và có ảnh?  có -> dùng (via: category)
                                                                       không -> không có ảnh
```
- Một bộ chỉ hỏi một lần (`Map<number, StickerDetail[]>` trong phiên): các sticker khác của bộ đó lấy từ bộ nhớ. Bộ hỏi lỗi thì **không** nhớ, để sticker sau hỏi lại; nhớ lỗi sẽ làm cả bộ hỏng mãi.
- `catId` là chữ, đọc bằng `wholeNumber`; `0`, số âm, chữ hay rỗng thì không hỏi bộ (không có bộ nào để hỏi).
- Lỗi của lời hỏi thứ nhất vẫn đi lên như cũ; `findStickerArt` là hàm nhận `api` và bộ nhớ làm tham số, nên kiểm thử bằng một `api` giả mà không cần Zalo.
- Đây là **một phỏng đoán có cơ sở, chưa kiểm trên sticker thật**: nếu "sticker khác" không thuộc loại này thì đường lùi không phí gì (chỉ chạy khi cách thứ nhất thất bại) nhưng cũng không giúp gì.

### 20.3 Log chỉ đúng chỗ rơi
Vì chưa biết "sticker khác" là gì, phần quan trọng hơn là làm cho mỗi chỗ có thể rơi đều để lại một dòng:
- `sino-zalo` `Stickers`: WARN "Zalo gave no picture for the sticker" với `stickerId`, `catId`, `stickerType` (đều là số) khi cả hai cách đều không ra ảnh; INFO "through its category" khi phải lấy theo bộ. Chữ `via` chỉ để ghi log, không đi vào tin gửi cho `sino-api`.
- `sino-zalo` `SessionManager`: dòng "Zalo message" của sticker có thêm ba số đó; của **mọi** tin mà đường ống không hiểu thì có thêm `contentShape` (tên khóa và loại giá trị, không bao giờ một giá trị). `unseen` quyết định tin nào: loại tin chưa ai xử lý (không nằm trong `KNOWN_TYPES`), ảnh không tìm được ảnh, sticker không đọc được, GIF không có địa chỉ. Một `switch` theo loại tin, mỗi loại có điều kiện "không hiểu" riêng.
- `sino-api`: WARN khi từ chối địa chỉ ảnh tĩnh, sprite hay GIF của sticker, dùng chung một hàm `warnRefused(what, raw)` với ảnh. Trước đây một sticker ở tên miền lạ lặng lẽ ở lại là chữ.

```text
Sticker không hiện. Xem lần lượt:
  dòng "Zalo message" của nó      zaloType gì? có stickerId, stickerCatId không? contentShape?
  WARN sino-zalo "no picture"     Zalo không có ảnh, kể cả theo bộ
  WARN sino-zalo "did not give"   gọi Zalo bị lỗi (có lý do)
  WARN sino-api "does not accept" địa chỉ bị từ chối: tên miền nào
  không có WARN nào               địa chỉ đã qua sino-api; xem tab Network của trình duyệt
```

### 20.4 Kiểm chứng và giới hạn
- Viết test trước (24 đỏ), rồi xanh. Gài lỗi tìm ra hai chỗ test yếu: không có ca nào kiểm "tin GIF không ghi mã sticker" (GIF mang một đối tượng `sticker` với `id` là mã tin, nên một điều kiện thiếu loại tin sẽ ghi sai), và không có ca "chỉ ảnh nhỏ bị từ chối". Cả hai đã thêm test.
- Chưa có sticker thật nào của người dùng, và container này không với tới CDN của Zalo (proxy chặn), nên không thử được địa chỉ nào. Chưa xác nhận đường lùi cứu được sticker nào.
- Sticker đã lưu trước đó giữ như cũ, không backfill (như ZL-15 và ZL-16).
