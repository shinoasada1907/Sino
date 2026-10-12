# Kiến thức Phase 5 — Nhiều provider và gửi tin

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F10, `openspec/changes/f10-reply` (trả lời một thư ngay trong Sino), được kéo lên làm ngay sau F06 vì bạn ưu tiên "kết nối và nhắn tin" (2026-10-09). Đã xong: BE-58. F09 (provider thứ hai) chưa mở.
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
