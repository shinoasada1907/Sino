# Kiến thức Phase 3 — Đồng bộ nền và Hộp thư realtime

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F07 + F08, `openspec/changes/f07-f08-realtime-inbox` (thư mới tự vào Sino và tự hiện trên web): BE-48, BE-49, BE-50, BE-51, BE-52.
> **Cập nhật:** 2026-10-10. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

---

## 0. Bức tranh: thư mới đi từ Gmail tới màn hình

Sau lần nhập đầu (F05), Sino đã có thư cũ và một **con trỏ** (`historyId` của Gmail) đánh dấu "đã đọc tới đây". Việc của Phase 3 là cứ có thay đổi thì đọc tiếp từ con trỏ đó, rồi báo cho web đang mở.

```text
 Gmail ──(1) báo có thay đổi──> Sino ──(2) đọc thay đổi từ con trỏ──> database
                                                  |
                                 (3) sau khi commit: báo cho web
                                                  v
                               trình duyệt: tải lại Hộp thư, "2 thư mới"
```

| Quyết định | Nội dung |
|---|---|
| D-76 | (1) Gmail báo qua Pub/Sub tới webhook của Sino, có hỏi định kỳ làm dự phòng (người dùng chọn cách an toàn nhất) |
| D-77 | (3) SSE từ Sino tới trình duyệt (agent chốt theo ủy quyền) |
| D-78 | Thư mới chỉ hiện trong Sino: danh sách, số đếm, dòng báo nhỏ; không thông báo hệ điều hành |
| D-79 | (2) Đồng bộ tăng dần là chế độ thứ hai của vòng đọc trang trong module `sync`; lịch bằng `@Scheduled` |

---

## 1. Đồng bộ tăng dần và "Đồng bộ ngay" (BE-48)

**Ở đâu:** `sync/application/ImportRunner` (vòng đọc trang, hai chế độ), `sync/infrastructure/SyncCheckpoints` (bảng `sync_checkpoint`), `sync/application/LiveSyncService`, `sync/api/LiveSyncController`, migration `V12__sync_add_live_sync.sql`.

```text
POST /api/accounts/{id}/sync  ->  202 { importDone, lastSyncAt, lastError, push, pushExpiresAt }
GET  /api/accounts/{id}/sync  ->  200 (cùng hình dạng)

ImportRunner.run(account): đọc dòng sync_checkpoint
   RUNNING -> nhập lần đầu (F05, không đổi)
   DONE    -> lượt đồng bộ: đọc từ con trỏ đã lưu tới khi provider nói "hết"
   khác    -> không làm gì
```

### 1.1 Một vòng đọc trang, hai chế độ
Lần nhập đầu và đồng bộ đều là: hỏi provider một trang (ngoài transaction), lưu trang và tiến con trỏ (trong một transaction), lặp tới khi hết. Chúng chỉ khác ở **ghi gì khi xong và khi lỗi**:

| | Nhập lần đầu | Đồng bộ |
|---|---|---|
| Sau mỗi trang | tiến con trỏ + cộng số đã nhập | chỉ tiến con trỏ |
| Trang cuối | `import_status = DONE` (cùng câu SQL) | `last_sync_at = now()`, xóa lỗi (cùng câu SQL) |
| Lỗi | `import_status = FAILED` | ghi `last_sync_error`, import vẫn `DONE` |
| Con trỏ hết hạn | đọc lại từ mốc của lần nhập | đọc lại từ một ngày trước lần đọc trọn gần nhất (mục 1.6) |

Trong code, sự khác nhau nằm ở một `enum Pass { IMPORT, SYNC }` riêng của `ImportRunner`. Viết hai vòng riêng thì mỗi lần sửa bảng xử lý lỗi (chờ khi bị giới hạn, thử lại khi provider sập, đọc lại khi con trỏ hết hạn) phải sửa hai chỗ, và sớm muộn hai chỗ sẽ lệch nhau.

### 1.2 Vì sao tiến con trỏ phải kèm `import_status = 'DONE'` (câu gợi ý của task)
```sql
UPDATE sync_checkpoint SET cursor = :cursor
WHERE account_id = :account AND import_status = 'DONE'
```
Chuyện có thể xảy ra:

```text
luồng đồng bộ                       người dùng
đọc trang từ con trỏ C (Gmail)
                                    bấm "nhập lại 30 ngày":
                                    dòng -> RUNNING, con trỏ = NULL
lưu trang + ghi con trỏ C'  <- nếu không có điều kiện, C' đè lên
                               lần nhập mới: nó sẽ "nhập" từ C'
                               và bỏ qua 30 ngày thư
```
Với điều kiện `import_status = 'DONE'`, câu `UPDATE` không khớp dòng nào. Code thấy 0 dòng thì ném một exception ngay trong transaction, nên trang vừa lưu bị **rollback**. Lượt đồng bộ dừng, không ghi lỗi; lần nhập mới chạy ngay sau đó. Đây là cách "khóa lạc quan" (optimistic) bằng chính điều kiện của câu SQL: không giữ khóa trong lúc chờ Gmail, chỉ kiểm lúc ghi.

Ba chỗ khác cùng nguyên tắc:
- **Đầu mỗi vòng** của lượt đồng bộ, dòng phải còn `DONE`. Nếu người dùng nhập lại trong lúc lượt đồng bộ đang chờ thử lại, lượt dừng luôn, không gọi Gmail thêm lần nào vô ích.
- **Ghi thành công** nằm trong cùng câu `UPDATE` với việc tiến con trỏ ở trang cuối. Tách thành hai câu thì giữa chúng có một khe: người dùng nhập lại đúng lúc đó sẽ thấy lần nhập mới mang "đồng bộ thành công" của lần cũ.
- **Ghi lỗi** (`syncFailed`) cũng có `WHERE import_status = 'DONE'`: lỗi của một lượt bắt đầu trước khi người dùng nhập lại không được dính lên lần nhập mới.

### 1.3 Gộp yêu cầu: "một lượt nữa", không phải "mỗi yêu cầu một lượt"
Webhook, lịch và nút bấm đều chỉ gọi `submit(accountId)`. Mỗi account có một bộ đếm (`AtomicInteger`):

```text
0 -> 1   có luồng đang đọc
1 -> 3   hai yêu cầu đến trong lúc đọc
xong một lượt: còn > 1 -> đặt về 1 và đọc thêm MỘT lượt; = 1 -> về 0, luồng kết thúc
```
`updateAndGet(count -> count > 1 ? 1 : 0)` làm việc đó trong một bước nguyên tử. Trước BE-48, mỗi yêu cầu làm luồng nhìn lại dòng một lần: vô hại vì nhìn một dòng `DONE` chẳng làm gì. Giờ nhìn một dòng `DONE` nghĩa là gọi Gmail, nên ba cú webhook dồn dập không được thành ba lượt.

**Bẫy: `Error` không phải `Exception`.** `run()` bắt mọi `RuntimeException`, nhưng `StackOverflowError` hay `OutOfMemoryError` là `Error`, đi xuyên qua. Luồng chết mà bộ đếm vẫn là 1, nên mọi yêu cầu sau chỉ tăng bộ đếm, không bao giờ mở luồng mới: account đó im lặng không đồng bộ nữa cho tới khi khởi động lại. `work()` giờ bắt `Error`, đặt bộ đếm về 0, ghi log rồi ném tiếp (không nuốt `Error`: JVM có thể đang hỏng thật).

Hệ quả có chủ đích: yêu cầu đến **trong lúc nhập lần đầu** giờ làm một lượt đồng bộ ngay khi nhập xong. Lượt đó đọc đúng những thay đổi xảy ra trong lúc nhập. Test `startingTwiceRunsOnce` của F05 được sửa theo (3 lần gọi để nhập, rồi 1 lần đồng bộ từ con trỏ đã lưu).

### 1.4 "Đồng bộ ngay" và mã lỗi
- `409 IMPORT_NOT_DONE`: chưa có con trỏ theo dõi thay đổi để đi tiếp (chưa nhập, đang nhập, hoặc nhập lỗi: lần nhập lỗi giữ con trỏ của danh sách để nhập tiếp, không phải con trỏ thay đổi). Web dùng bước "Đồng bộ" của lần nhập đầu cho các trường hợp đó.
- `409 ACCOUNT_DISABLED`: người dùng đã tắt account (D-12).
- Account đã **tạm dừng đồng bộ tự động** (`syncEnabled = false`) vẫn đồng bộ được khi bấm tay: tạm dừng là dừng cái tự động, không phải cấm.
- Phần kiểm "account có phải của bạn không, có bị tắt không" dùng chung với API nhập lần đầu qua `AccountChecks`.

### 1.5 Ba cột mới, và vì sao không thêm một bảng
`last_sync_at`, `last_sync_attempt_at`, `last_sync_error` nằm ngay trong `sync_checkpoint`: mỗi account một dòng, đúng như con trỏ. Bảng lịch sử từng lượt (`sync_run` trong 02B) để sau; hiện chỉ cần biết "lần cuối thế nào". `last_sync_attempt_at` khác `last_sync_at`: lịch (BE-49) hẹn lượt sau theo lần **thử**, nên một account đang lỗi không bị hỏi dồn mỗi 15 giây. Bắt đầu nhập lại thì ba cột về `NULL`: lần nhập mới chưa có lượt đồng bộ nào.

### 1.6 Con trỏ hết hạn: đọc lại từ đâu
Gmail chỉ giữ lịch sử thay đổi khoảng một tuần. Sino tắt lâu hơn thế thì `historyId` đã lưu không còn dùng được (`CURSOR_EXPIRED`), và cách duy nhất là liệt kê lại thư theo mốc thời gian.

```text
mốc nhập (import_since)              T = lần đọc trọn gần nhất               bây giờ
|------------------------------------|----|-------------------------------------|
                                T - 1 ngày     Sino tắt hơn một tuần:
                                                historyId đã lưu hết hạn
cách cũ:  đọc lại từ mốc nhập  ------------------------------------------------->
cách mới: đọc lại từ T - 1 ngày          --------------------------------------->
```

- Bản đầu tiên đọc lại từ mốc của lần nhập (`import_since`), y như lần nhập đầu (D-60). Review chỉ ra mốc đó đóng băng từ ngày nhập: nhập "90 ngày" cách đây một năm thì đọc lại 15 tháng; nhập "toàn bộ" thì đọc lại cả hộp thư.
- Thư trước lần đọc trọn gần nhất đã nằm trong Sino; đọc lại chúng chỉ để cập nhật nhãn của thư cũ. Nên giờ đọc lại từ **một ngày trước** lần đọc trọn gần nhất (lần đồng bộ thành công cuối, chưa có thì lúc lần nhập xong). Một ngày là khoảng chồng lên để chắc không sót thư đến sát giờ.
- Không cần cột mới: con trỏ đọc lại mang luôn mốc thời gian, nên sau trang đầu nó được lưu như con trỏ thường. Lượt đó hỏng giữa chừng thì lần sau gặp lại `CURSOR_EXPIRED` và đọc lại từ cùng chỗ.

### 1.7 Kiểm chứng (BE-48)
- **Đỏ trước:** 10/11 test đỏ (test CSRF xanh từ đầu vì lớp bảo mật chặn trước endpoint). Sau review, 4 test mới đỏ đúng 4 lỗi review nêu (bộ đếm kẹt, con trỏ bị xóa, đọc lại từ quá xa, nhập lại không xóa trạng thái cũ).
- **Một test cũ đổi kỳ vọng có chủ đích:** `startingTwiceRunsOnce` của F05 giờ thấy 3 lần gọi để nhập rồi 1 lần đồng bộ (mục 1.3).
- **Test theo xác suất:** `requestsDuringASyncMakeOneMorePass` chỉ thấy lượt thừa nếu nó tới trong 200 ms. Không bao giờ đỏ oan, nhưng trên máy chậm có thể để lọt lỗi "mỗi yêu cầu một lượt"; đã ghi trong test.
- **Kiểm tra ngược:** vòng 1: 14 lỗi cố ý, 2 sống sót tới khi test được siết (giữ hai trang cho lượt đồng bộ, kiểm `last_sync_attempt_at`). Vòng 2 sau review: 23 lỗi cố ý, 21 bị bắt. Hai cái sống sót là chốt cho tranh chấp trong khe giữa hai câu SQL liền nhau (`beginSync`, `startOver`): không dựng được trong test, giữ vì rẻ và vô hại. Đây là bài học về kiểm tra ngược: một lỗi cố ý sống sót không phải lúc nào cũng là test thiếu; đôi khi đoạn code đó chỉ có tác dụng trong tình huống test không tạo ra được, và khi đó phải nói rõ lý do giữ nó.
- **Toàn bộ:** `./mvnw -B -ntp verify` → 856 test, 0 lỗi, 3 bỏ qua.
- **Hai lớp test một context:** `LiveSyncApiTests` khai báo cùng `@MockitoSpyBean` với `InitialSyncApiTests`. Bean bị thay là một phần của khóa cache context; khác nhau thì Spring dựng context mới, kèm một container PostgreSQL mới.

## 2. Đồng bộ tự động theo lịch (BE-49)

**Ở đâu:** `sync/application/LiveSyncScheduler` (chọn account đến hạn), `LiveSyncSchedule` (nhịp `@Scheduled`, có công tắc), `LiveSyncProperties` (`sino.sync.live.*`), `SyncConfiguration` (`@EnableScheduling`), `SyncCheckpoints.dueForSync`, `account/AccountDirectory.byId`.

```text
mỗi 15 giây (sino.sync.live.tick), lần đầu 15 giây sau khi khởi động:
  dueForSync(60 giây)                 các dòng DONE có lần thử gần nhất (chưa thử: lúc nhập xong) cũ hơn
                                       now() - 60 giây, theo đồng hồ của PostgreSQL
    -> bỏ account đang được đọc        (ImportRunner.isReading)
    -> AccountDirectory.byId(id)       còn đó, của ai, trạng thái, có bật đồng bộ tự động không
    -> bỏ: tạm dừng, DISABLED, AUTH_EXPIRED, đã xóa
    -> ImportRunner.submit(id)         như mọi cò khác (mục 1.3)
```

### 2.1 Vì sao hẹn theo lần **thử** chứ không theo lần thành công (câu gợi ý của task)
Nếu hẹn theo `last_sync_at` (lần thành công), một account đang lỗi (Gmail từ chối, mạng hỏng) sẽ không bao giờ có lần thành công mới, nên lần nào lịch quét (mỗi 15 giây) nó cũng "đến hạn": Sino gọi Gmail 4 lần một phút cho một việc chắc chắn hỏng, đốt hạn mức và làm đầy log. Hẹn theo `last_sync_attempt_at` thì account lỗi chỉ được hỏi lại sau mỗi khoảng.

Review chỉ ra bản đầu vẫn hỏng ở đúng những lượt lỗi: thời điểm thử chỉ ghi lúc lượt **bắt đầu**, và lịch vẫn xếp thêm yêu cầu cho account đang được đọc. Một lượt bị giới hạn tần suất chờ tới 5 lần × 30 giây, dài hơn 60 giây; vừa hỏng xong là lượt xếp hàng chạy ngay, gọi Gmail liền sau một lỗi 429. Sửa hai chỗ:
- Thời điểm thử được ghi **lại khi lượt kết thúc** (cùng câu ghi thành công hoặc ghi lỗi), nên khoảng 60 giây tính từ lúc lượt xong.
- Lịch **bỏ qua account đang được đọc** (`ImportRunner.isReading`): lượt đang chạy tự hẹn lần sau khi nó xong.

Account chưa đồng bộ lần nào thì chưa có lần thử: lấy lúc lần nhập xong (`last_success_at`) làm mốc, bằng `coalesce(last_sync_attempt_at, last_success_at)` ngay trong câu SQL.

### 2.2 `@Scheduled` và cái công tắc cho test
- `@Scheduled(fixedDelayString = "${sino.sync.live.tick:PT15S}")`: chạy lại 15 giây **sau khi lần trước xong** (`fixedDelay`), không chồng lên nhau như `fixedRate` khi một lần quét chậm. Chuỗi `PT15S` là thời lượng ISO-8601 Spring hiểu được.
- `@Scheduled` chỉ chạy khi trong ứng dụng có `@EnableScheduling` ở **đâu đó**. Profile test cần tắt lịch: nếu không, lịch thật chen vào giữa các test của lần nhập và đồng bộ, và các test đếm số lần gọi connector sẽ đỏ lúc có lúc không.
- **Bẫy đã gặp:** bản đầu đặt công tắc lên chính `@EnableScheduling` (một cấu hình con chỉ bật khi `sino.sync.live.scheduled` khác `false`). Kiểm tra ngược bỏ hẳn `@EnableScheduling` mà lịch vẫn chạy: `spring-modulith-moments` (`MomentsAutoConfiguration`) đã bật scheduling cho cả ứng dụng. Nghĩa là công tắc không tắt được gì, và lịch thật vẫn chạy trong mọi test. Sửa: `@Scheduled` nằm trên một bean nhỏ riêng, `LiveSyncSchedule`, và **chính bean đó** có `@ConditionalOnProperty`; tắt công tắc thì bean không tồn tại, không có gì để lịch gọi. `@EnableScheduling` vẫn để trên `SyncConfiguration` cho rõ module này cần nó, không dựa ngầm vào thư viện khác.
- Test của lịch gọi thẳng `dueAccounts()` và `syncDueAccounts()`; `theScheduleIsOffInTheseTests` kiểm bean `liveSyncSchedule` không có trong context test; riêng `ScheduledSyncTests` bật lịch thật (nhịp 0,2 giây) để chứng minh nó chạy.
- `dueAccounts()` tách khỏi `syncDueAccounts()` để test được **chính xác**: "account này không đến hạn" kiểm bằng danh sách trả về, không phải chờ một khoảng rồi đoán là không có gì xảy ra.

### 2.3 Hai đồng hồ: dùng đồng hồ của database
`last_sync_attempt_at` và `last_success_at` do PostgreSQL ghi bằng `now()`. Bản đầu so chúng với mốc tính bằng đồng hồ của Java (`clock.instant() - 60 giây`). Hai đồng hồ có thể lệch nhau: ở máy này JVM chạy trên Windows còn PostgreSQL chạy trong máy ảo của Docker, đồng hồ máy ảo hay lệch sau khi máy ngủ. Java nhanh hơn 60 giây thì account nào cũng "đến hạn" mỗi lần quét. Sửa: tính cả mốc trong SQL, `now() - make_interval(secs => :seconds)`, một nguồn giờ duy nhất. Quy tắc chung: **so hai thời điểm thì cả hai phải do cùng một đồng hồ ghi.**

### 2.4 `AccountDirectory.byId`: tìm account không theo owner
Các API cho người dùng luôn tìm account **theo owner** (account của người khác trông y như không tồn tại). Lịch thì không chạy cho người dùng nào: nó cần biết account còn đó không, có đang tạm dừng không. `byId` trả account chưa xóa của bất kỳ owner nào, kèm `ownerId` và `syncEnabled`; Javadoc ghi rõ chỉ dùng cho việc nền. `AccountSummary` thêm hai thành phần đó (record đổi constructor chuẩn, các chỗ gọi trong test được sửa theo).

### 2.5 Log khi một account lỗi mãi
Lịch hỏi account lỗi mỗi phút. Log WARN mỗi phút cho cùng một lỗi sẽ chôn các lỗi khác. `syncFailed` ghi lỗi và trả về lỗi đó có **mới** không: so lỗi cũ với lỗi mới bằng `previous.last_sync_error IS DISTINCT FROM :code` trong `RETURNING`, với `previous` là chính dòng đó đọc trước câu `UPDATE`. Mới thì WARN (lỗi không lường trước thì ERROR kèm stack trace), giống lần trước thì DEBUG. Các dòng "chờ …" và "đọc lại từ đầu" của lượt đồng bộ cũng là DEBUG; của lần nhập đầu vẫn là WARN vì nó chỉ chạy một lần. Lượt thành công xóa lỗi, nên lần hỏng đầu tiên sau đó vẫn được nói ra.

`IS DISTINCT FROM` khác `<>` ở chỗ so được với `NULL`: `NULL <> 'X'` cho `NULL` (không phải đúng), còn `NULL IS DISTINCT FROM 'X'` cho đúng.

Lần quét của lịch cũng có thể hỏng (database sập): `LiveSyncSchedule.tick` bắt lỗi, nói một lần lúc bắt đầu hỏng và một lần lúc chạy lại được, lịch không dừng.

## 3. Sự kiện và SSE: module `realtime` (BE-50)

**Ở đâu:** `realtime/api/EventStreamController` (`GET /api/events/stream`), `realtime/application/EventHub` (các luồng đang mở), `RealtimeEvents` (từ sự kiện của module khác sang sự kiện cho trình duyệt), `RealtimeProperties` (`sino.realtime.*`); sự kiện `sync/MailStored`, `sync/SyncStateChanged`, `conversation/ConversationChanged`; `StoreResult` thêm `conversationIds`, `newInbound`.

```text
ImportRunner: transaction { lưu trang; tiến con trỏ; publish MailStored, SyncStateChanged }
InboxService.change (PATCH): transaction { đổi đã đọc/lưu trữ; publish ConversationChanged }
account: AccountConnected, AccountStatusChanged, AccountRemoved
            |
            |  @EventListener: tìm owner (AccountDirectory.byId) ngay trong transaction đó,
            |  đăng ký gửi sau commit (TransactionSynchronization.afterCommit)
            v
RealtimeEvents -> (sau commit) EventHub.publish(owner, type, data)
            v
mỗi luồng của owner: hàng đợi -> luồng ghi riêng -> trình duyệt
  event:conversations.changed
  data:{"type":"conversations.changed","accountId":...,"conversationIds":[...],"newInbound":2,"source":"sync","at":...}
```

### 3.1 Vì sao gửi sự kiện **sau commit** (câu gợi ý của task)
Trình duyệt nhận sự kiện thì gọi lại API để đọc dữ liệu mới. Nếu sự kiện đi trước commit:
- trình duyệt có thể đọc **trước** khi dữ liệu được ghi, thấy dữ liệu cũ và tưởng đã cập nhật xong;
- transaction có thể **rollback** (lưu trang lỗi, người dùng nhập lại giữa chừng), và trình duyệt được báo về một thay đổi không bao giờ tồn tại.

`RealtimeEvents` nghe bằng `@EventListener` thường, nên được gọi ngay lúc `publishEvent`, **bên trong** transaction đang lưu. Nó làm hai việc:
- tìm owner ngay lúc đó (đọc trong cùng transaction, nên thấy cả account vừa tạo trong transaction ấy);
- **đăng ký** việc gửi với transaction: `TransactionSynchronizationManager.registerSynchronization(...)` với `afterCommit()`. Spring chỉ gọi `afterCommit` khi transaction commit; rollback thì bỏ. Sự kiện phát **ngoài** transaction (ví dụ ghi lỗi nhập trong `fail()`) thì gửi ngay.

Test `aRolledBackChangeSendsNothing` phát một sự kiện rồi rollback, phát sự kiện thứ hai và commit: trình duyệt chỉ thấy sự kiện thứ hai. `aFailedImportTellsTheBrowser` đi qua nhánh ngoài transaction.

**Vì sao không dùng `@TransactionalEventListener`.** Bản đầu dùng nó. Review chỉ ra: trong ứng dụng có Spring Modulith, mỗi sự kiện tới một listener kiểu transaction được ghi vào bảng `event_publication` (registry), để chạy lại nếu listener hỏng. Cơ chế đó dành cho việc **phải** xảy ra (gửi mail, cập nhật module khác). Với SSE, chạy lại vô nghĩa: trình duyệt đọc lại dữ liệu mỗi lần nối lại. Vậy mà mỗi trang thư tốn thêm hai `INSERT` và hai `DELETE`, có thể cần thêm một connection lúc đánh dấu hoàn tất, và để lại dòng mồ côi khi listener lỗi. Tự đăng ký `afterCommit` cho cùng bảo đảm "chỉ sau commit" mà không cần bảng nào; test kiểm `event_publication` vẫn rỗng.

### 3.2 `SseEmitter`: một request không bao giờ trả lời xong
Controller trả `SseEmitter` thay vì dữ liệu. Spring MVC bật chế độ **async** của Servlet: luồng xử lý request được trả về pool ngay, kết nối vẫn mở, và code ghi sự kiện vào `SseEmitter` lúc nào cũng được. Khi luồng kết thúc (hết 20 phút, bị đóng), Servlet làm một lần **dispatch ASYNC** để đóng request; Spring Security cũng kiểm lần dispatch đó, nên `SecurityConfig` cho phép `DispatcherType.ASYNC` như đã cho `ERROR`.

### 3.3 Một trình duyệt chậm không được làm chậm việc lưu thư
`emitter.send` ghi ra mạng. Nếu `ImportRunner` gọi thẳng nó, một trình duyệt mạng yếu làm luồng lưu thư phải chờ. `EventHub` cho **mỗi luồng một hàng đợi (100 sự kiện) và một virtual thread** chỉ để ghi: `publish` đặt sự kiện vào hàng đợi rồi đi tiếp. Hàng đợi đầy (trình duyệt không theo kịp) thì luồng bị đóng ngay trên thread đang publish (một lần `complete()`, không ghi mạng): trình duyệt tự nối lại và đọc lại dữ liệu, nên không mất gì. Thứ tự sự kiện trong một luồng được giữ vì chỉ một thread ghi. Thread ghi dừng theo một **cờ** `closed`, kiểm ít nhất hai lần mỗi giây (`poll` có thời hạn), không dựa vào interrupt, vì code mạng có thể nuốt cờ interrupt.

**Race giữa mở và đóng (review).** Bản đầu thêm luồng bằng hai bước (`computeIfAbsent` rồi `addLast`) và gỡ bằng hai bước (`remove` rồi xóa deque rỗng khỏi map). Một luồng đóng chen vào giữa hai bước của luồng đang mở thì luồng mới bị thêm vào một deque đã bị gỡ khỏi map: không nhận sự kiện nào suốt 20 phút, trong khi web tưởng đang kết nối. Giờ mọi thay đổi danh sách luồng của một owner nằm trong **một** lần `ConcurrentHashMap.compute`/`computeIfPresent` trên khóa đó, kể cả việc gỡ các luồng vượt giới hạn; việc đóng chúng (gọi `complete()`) làm sau, ngoài `compute`, vì `compute` không được gọi lại chính map đó.

**Tắt ứng dụng.** Spring Boot tắt web server "graceful": chờ các request đang chạy, tới 30 giây. Một luồng SSE không bao giờ tự xong, nên nếu đợi tới `destroy()` mới đóng thì lần tắt nào cũng chờ đủ 30 giây khi còn tab mở. `EventHub` đóng mọi luồng ngay khi nhận `ContextClosedEvent`, sự kiện đầu tiên của quá trình tắt.

### 3.4 Các chi tiết của giao thức
| Dòng / header | Để làm gì |
|---|---|
| `retry:3000` | lần đầu: trình duyệt nối lại sau 3 giây khi rớt |
| `:` mỗi 25 giây | comment: giữ proxy không cắt luồng im lặng, và lộ ra trình duyệt đã đóng (ghi lỗi) |
| `event:` = `type` | web gắn `addEventListener(type)` |
| không có `id:` | không phát lại sự kiện lỡ; nối lại thì web đọc lại dữ liệu |
| `X-Accel-Buffering: no` | proxy như nginx không giữ sự kiện lại chờ đầy bộ đệm |
| `Cache-Control: no-store` | không cache một luồng |
| đóng sau 20 phút | trình duyệt nối lại, nên đăng nhập được kiểm lại; phiên hết thì `401` |
| tối đa 5 luồng mỗi người | luồng thứ 6 đóng luồng cũ nhất, giới hạn tài nguyên mỗi người dùng |

### 3.5 Sự kiện không mang nội dung thư
Sự kiện chỉ có loại, ID account, ID conversation, số thư đến mới, nguồn (`import`, `sync`, `user`) và thời điểm. Web dùng `source = sync` để hiện "N thư mới" (lần nhập đầu không hiện), rồi gọi API như mọi lần: mọi kiểm tra quyền vẫn ở API, và nội dung thư không đi qua kênh nào khác. Test kiểm dữ liệu của luồng không chứa chữ của thư mẫu.

### 3.6 Test SSE bằng HTTP thật
MockMvc không có mạng thật và không giữ được một response đang chảy dài. `RealtimeApiTests` chạy server trên cổng ngẫu nhiên, đăng nhập bằng `Browser`, rồi mở luồng bằng `java.net.http.HttpClient` với `BodyHandlers.ofLines()`: một virtual thread đọc từng dòng vào hàng đợi, test lấy dòng hay sự kiện ra với thời hạn chờ.

Hai bẫy gặp khi viết test, đều do **code đúng**: kết nối account phát `AccountConnected`, nên luồng mở trước khi kết nối thấy `account.changed` trước tiên; và sau khi bấm PATCH, sự kiện của các trang nhập sau vẫn còn tới trước sự kiện của PATCH. Test giờ kết nối account trước khi mở luồng, và đọc qua các sự kiện tới khi gặp đúng sự kiện có `source: user`.

## 4. Gmail báo cho Sino: đăng ký watch (BE-51)

**Ở đâu:** `provider/spi/MessageProvider.registerPush`, `PushRegistration`; `provider/infrastructure/gmail/GmailApi.watch`, `GmailProvider.registerPush`, `GmailProperties.PubSub` (`sino.google.pubsub.topic`), `GmailConfiguration` (kiểm tên topic); `sync/application/PushWatches` (đăng ký, gia hạn), `LiveSyncSchedule.checkWatches` (mỗi giờ), `LiveSyncScheduler` (khoảng 5 phút khi có watch), `LiveSyncService` (`push`, `pushExpiresAt`); migration `V13__sync_add_push_watch.sql`.

Gmail không gọi thẳng Sino. Sino nhờ Gmail "theo dõi" (watch) hộp thư và đẩy mỗi thay đổi vào một **topic** của Cloud Pub/Sub trong dự án Google của mình; Pub/Sub chuyển tiếp tới webhook của Sino (BE-52).

```text
              (1) users.watch {topicName}
   Sino  ─────────────────────────────────>  Gmail
     ^                                         |
     |  (3) push subscription: POST            |  (2) hộp thư đổi: publish
     |      /api/webhooks/gmail (BE-52)        v      {emailAddress, historyId}
     └────────────────────────────  topic Pub/Sub của dự án
```

```text
khi lần nhập đầu xong (ImportRunner, lượt IMPORT, trang cuối đã lưu)
   -> PushWatches.watch(account)
mỗi giờ (sino.sync.live.push-check), lần đầu 1 phút sau khi khởi động, trên một virtual thread riêng:
   dueForWatch(2 ngày)   dòng DONE chưa có watch, lần đăng ký trước lỗi, hoặc watch hết hạn trong 2 ngày
   -> PushWatches.watch(account)

PushWatches.watch(account):
   đang có một lần đăng ký của account này -> thôi
   AccountDirectory.byId          bỏ: tạm dừng, DISABLED, AUTH_EXPIRED, đã xóa
   ProviderRegistry.find          bỏ connector không khai báo PUSH_WEBHOOK (không gọi gì cả)
   ProviderAccess.call(registerPush)
        Gmail: users.getProfile (lấy emailAddress) rồi users.watch {topicName}
   thành công -> watched(address, expiresAt), xóa lỗi; phát SyncStateChanged
   rỗng       -> watchFailed(PUSH_NOT_REGISTERED)
   lỗi        -> watchFailed(code); lỗi mới thì WARN và phát SyncStateChanged
                 (thread bị ngắt vì ứng dụng đang tắt: không ghi gì)
```

### 4.1 `registerPush` trong contract: mặc định rỗng
Cùng kiểu với `estimateMessages`: một **default method** của interface `MessageProvider`, trả `Optional.empty()` và không gọi provider. Chỉ connector khai báo `PUSH_WEBHOOK` mới cài đè. Khác `sendMessage` (gọi khi không có capability thì ném `CAPABILITY_NOT_SUPPORTED`, vì đó là lỗi của bên gọi): "không có push" là trạng thái bình thường, ví dụ Gmail khi chưa cấu hình topic, nên trả rỗng chứ không ném. Bộ kiểm contract có hai test: connector không có `PUSH_WEBHOOK` trả rỗng; connector có thì trả địa chỉ không rỗng và hạn ở tương lai. `FakeMessageProvider` được thêm `push(...)` và `pushFailure(...)` để các test của `sync` dựng được connector có push.

`PushRegistration` tự viết `toString()` để che địa chỉ: địa chỉ hộp thư là dữ liệu của một người, không được lọt vào log hay thông báo lỗi.

### 4.2 Vì sao địa chỉ của watch lấy từ profile Gmail (câu gợi ý của task)
Thông báo Gmail gửi qua Pub/Sub chỉ có `{"emailAddress", "historyId"}`. Webhook (BE-52) phải từ `emailAddress` tìm ra account. Account đã có `address` (BE-47), nhưng nó lấy từ `email` của OpenID lúc kết nối, là một nguồn khác, ở một thời điểm khác. Thông báo thì mang đúng giá trị `emailAddress` của `users.getProfile`. Nên lúc đăng ký watch, Sino đọc chính `getProfile` và lưu giá trị đó vào `watch_address`: thứ được so và thứ đem ra so đến từ **cùng một nguồn**, giống quy tắc "cùng một đồng hồ" ở mục 2.3. Webhook so không phân biệt hoa thường (index trên `lower(watch_address)`).

### 4.3 Topic là cấu hình, không phải bí mật
`SINO_GOOGLE_PUBSUB_TOPIC` có dạng `projects/<project id>/topics/<tên>`. Nó không phải khóa, ai biết tên cũng không làm được gì nếu không có quyền trong dự án. Gmail chỉ nhận tên đầy đủ; tên thiếu sẽ chỉ hỏng ở lần watch đầu tiên, sâu trong log. Vì vậy `GmailConfiguration` kiểm dạng tên lúc khởi động và **dừng ứng dụng** với thông báo nêu tên biến (không nêu giá trị), giống cách nó xử lý thiếu client id/secret. Để trống thì Gmail chỉ được hỏi định kỳ, và ứng dụng nói một dòng INFO lúc khởi động.

`GmailProvider` chỉ khai báo `PUSH_WEBHOOK` khi có topic. Nhờ vậy module `sync` không cần biết gì về Google: nó chỉ hỏi capability.

### 4.4 `expiration`: số 64 bit viết thành chuỗi
`users.watch` trả `{"historyId": "1234", "expiration": "1760688000123"}`: hạn tính bằng mili giây từ 1970, viết thành **chuỗi**. JSON của Google viết mọi số 64 bit thành chuỗi vì số của JavaScript mất chính xác sau 2^53. Record `Watch` khai báo `expiration` là `String`, code kiểm toàn chữ số rồi mới `Instant.ofEpochMilli(Long.parseLong(...))`. Giá trị hỏng thành `PAYLOAD_NORMALIZATION_FAILED`, không để `NumberFormatException` thoát ra. Test có cả dạng chuỗi lẫn dạng số.

### 4.5 Gia hạn: mỗi giờ kiểm, gia hạn khi còn dưới 2 ngày
Watch của Gmail hết sau khoảng 7 ngày nếu không gọi lại; gọi `watch` lần nữa khi watch còn hạn là an toàn, nó chỉ thay hạn mới. Sino kiểm mỗi giờ và gia hạn watch còn dưới 2 ngày, nên một watch được gia hạn khoảng 5 ngày sau khi đăng ký. Nếu lần gia hạn hỏng, còn khoảng 48 lần kiểm nữa trước khi watch thật sự hết. Lần đăng ký lỗi cũng được thử lại ở lần kiểm sau (`watch_error IS NOT NULL` trong `dueForWatch`).

Phương án bị loại: gia hạn trong mỗi lượt đồng bộ (mỗi phút một lần gọi `watch` cho mỗi account, tốn hạn mức vô ích); chỉ đăng ký lúc nhập xong (watch hết sau 7 ngày, thư mới lại chậm mà không ai biết).

Log theo cùng cách với lỗi đồng bộ (mục 2.5): `watchFailed` trả lỗi có mới không; lỗi mới thì WARN (lỗi không lường trước kèm stack trace), lặp lại thì DEBUG. Câu SQL dùng một tính năng mới của PostgreSQL 18:
```sql
UPDATE sync_checkpoint SET watch_error = :code, updated_at = now()
WHERE account_id = :account
RETURNING old.watch_error IS DISTINCT FROM :code
```
Từ PostgreSQL 18, `RETURNING` đọc được cả `old` (dòng như câu lệnh tìm thấy) lẫn `new` (dòng sau khi sửa). Bản đầu, và `syncFailed` của BE-49, dùng một subquery `previous` đọc lại chính dòng đó trước câu `UPDATE`: dài hơn, và hai câu chạy cùng lúc có thể cùng thấy giá trị cũ. `old` là đúng phiên bản dòng mà câu `UPDATE` này đã khóa và sửa.

### 4.6 Khi có watch, hỏi định kỳ 5 phút một lần
Webhook làm thư tới trong vài giây, nhưng Sino vẫn hỏi định kỳ, chỉ thưa hơn:
```sql
coalesce(last_sync_attempt_at, last_success_at) < now() - make_interval(secs =>
    CASE WHEN watch_expires_at > now() AND watch_error IS NULL THEN :fallback ELSE :seconds END)
```
- Có watch còn hạn và lần đăng ký gần nhất không lỗi: 5 phút (`fallback-interval`). Pub/Sub có thể trễ hay mất tin, webhook có thể không tới được (đường hầm trên máy local đã đóng): 5 phút là giới hạn trên của độ trễ khi đó.
- Lần đăng ký gần nhất lỗi: 60 giây, **kể cả khi watch cũ còn hạn**. Lỗi có thể là chính quyền publish của Gmail vào topic đã bị gỡ; Sino không biết thông báo có còn tới không, nên quay về hỏi mỗi phút cho chắc.
- Không có watch, hoặc watch đã hết: 60 giây như trước.

Cả hai mốc đều tính trong SQL bằng `now()` của PostgreSQL (mục 2.3).

### 4.7 Trạng thái `push`
`GET /api/accounts/{id}/sync` trả `push`:

| `push` | Khi nào | `pushExpiresAt` |
|---|---|---|
| `FAILED` | lần đăng ký gần nhất lỗi (đứng trước mọi trường hợp khác) | `null` |
| `ACTIVE` | watch còn hạn | hạn của watch |
| `OFF` | không có watch, hoặc đã hết hạn | `null` |

"Watch còn hạn không" được hỏi ở hai chỗ: lịch (5 phút hay 60 giây) và trạng thái (`ACTIVE` hay `OFF`). Bản đầu, lịch hỏi bằng `now()` của PostgreSQL, trạng thái hỏi bằng `Instant.now()` của Java: ở đúng lúc watch hết, hai chỗ có thể trả lời khác nhau. Review chỉ ra đây là lần thứ hai gặp lỗi hai đồng hồ (lần đầu ở BE-49, mục 2.3). Giờ `find` tính luôn trong SQL: `coalesce(watch_expires_at > now(), false) AS watch_on`, và trạng thái đọc cột đó. Hạn do đồng hồ của Google viết, nhưng câu hỏi "còn hạn **lúc này** không" thì cả hệ thống phải dùng một đồng hồ.

### 4.8 Đăng ký ngay khi nhập xong
`readPages` giờ trả `boolean`: `true` khi đọc và lưu hết các trang, `false` khi lượt hỏng (và đã ghi lỗi). `run()` gọi `PushWatches.watch` chỉ khi lượt **nhập lần đầu** đọc hết. Gọi ngay trên virtual thread đang đọc account đó, nên account vẫn được tính là "đang đọc" và lịch không chen vào. Lần nhập hỏng không đăng ký; lượt đồng bộ không đăng ký lại (việc của lần kiểm mỗi giờ). `watch` không bao giờ ném lỗi: mọi lỗi được ghi vào `watch_error`.

Account đã nhập xong từ trước BE-51 (như account Gmail đang dùng thử) chưa có watch: lần kiểm đầu tiên, 1 phút sau khi khởi động, đăng ký cho nó.

### 4.9 Review: luồng lịch chỉ có một thread
Review (agent `senior-reviewer`) không thấy lỗi nặng; một lỗi mức trung bình đáng nhớ:

- **Lịch của Spring chỉ có một thread.** Mặc định Spring Boot chạy mọi `@Scheduled` trên **một** thread (`spring.task.scheduling.pool.size = 1`). Bản đầu, lần kiểm watch gọi Google ngay trên thread đó. Google chậm thì mỗi account tốn tới 20-30 giây (giới hạn kết nối 5 giây, đọc 10 giây, mỗi lần đăng ký hai request, có thể thêm một lần làm mới token). Trong lúc đó `tick()` không chạy, nên **không account nào được đồng bộ theo lịch**, đúng lúc Google trục trặc, khi đường dự phòng cần nhất. Sửa: `checkWatches()` chỉ trao việc cho một virtual thread riêng (`Executors.newSingleThreadExecutor`) rồi trả về ngay; một cờ `AtomicBoolean` giữ cho hai lần kiểm không chồng nhau; tắt ứng dụng thì `shutdownNow()` ngắt lần kiểm đang chạy. Bài học: thứ gì chạy trên thread lịch phải nhanh và không chờ mạng; việc chậm thì giao đi.
- **Một account, hai lần đăng ký cùng lúc.** Worker vừa nhập xong đăng ký account, đúng lúc lần kiểm mỗi giờ thấy dòng đó chưa có watch: hai lần gọi Google, và nếu một thành công một lỗi thì lần ghi sau có thể là lần lỗi, account hiện `FAILED` dù watch đang chạy. Sửa: `PushWatches` giữ tập các account đang đăng ký (`ConcurrentHashMap.newKeySet()`); `add` trả `false` thì đã có người làm, bỏ qua. `add` của một tập đồng thời là một thao tác nguyên tử, nên không có khe hở giữa "kiểm" và "đánh dấu". Phương án bị loại: cho việc đăng ký vào hàng đợi theo account của `ImportRunner`. Bộ đếm ở đó nghĩa là "nhìn lại dòng thêm một lần" và mỗi lần nhìn là một lượt đọc thư, nên mỗi lần gia hạn sẽ kéo theo một lượt đồng bộ không ai cần.
- **Ứng dụng đang tắt.** Thread bị ngắt giữa lúc gọi Google thì lời gọi hỏng thành `PROVIDER_UNAVAILABLE`. Bản đầu ghi lỗi đó vào `watch_error`, nên sau khi khởi động lại account hiện `FAILED` một lúc. Giờ `failed` kiểm `Thread.currentThread().isInterrupted()` trước, như `ImportRunner.fail` vẫn làm: đang tắt thì không ghi gì.
- **Connector có push mà không đăng ký.** Khai báo `PUSH_WEBHOOK` mà trả rỗng là trái contract. Bản đầu lặng lẽ bỏ qua, account mãi `OFF`. Giờ ghi lỗi `PUSH_NOT_REGISTERED` và thử lại ở lần kiểm sau.
- **Javadoc nói quá.** Bản đầu ghi "Never throws" trong khi lời tìm account nằm ngoài khối `try`. Giờ mọi bước nằm trong `try`, và Javadoc nói đúng điều code làm.
- **Đặt topic trước BE-52.** Có topic thì Gmail chỉ được hỏi 5 phút một lần; chưa có webhook thì không ai nhận thông báo, thư mới chậm tới 5 phút. `.env.example` giờ ghi: chỉ đặt topic cùng với phần webhook.

### 4.10 Kiểm chứng (BE-51)
- **Build trong worktree riêng.** Từ BE-51, mọi lần build, test và kiểm tra ngược chạy trong một git worktree (`git worktree add --detach <thư mục> dev`): một bản sao làm việc thứ hai của cùng repo, có `target/` riêng. Lý do: IntelliJ của người dùng chạy ứng dụng từ `apps/sino-api/target/classes` có DevTools; build ở đó làm ứng dụng của người dùng khởi động lại, có lúc với code đang gài lỗi (sự cố ở BE-50). Hai worktree cho phép chạy kiểm tra ngược song song, nhanh gấp đôi.
- **RED:** thay sáu chỗ logic bằng bản rỗng (Gmail không khai báo và không đăng ký, không kiểm topic, lịch bỏ khoảng 5 phút, `PushWatches.watch` rỗng, trạng thái luôn `OFF`, lịch không kiểm watch): 28 test đỏ. Các test kiểu "không được làm gì" (connector không có push, account tạm dừng) xanh từ đầu, đúng như mong đợi.
- **Kiểm tra ngược hai vòng:** 21 lỗi cố ý trước review, 25 sau review (7 cái nhắm vào chính các sửa của review). Tất cả bị bắt trừ một cái giữ có chủ đích: lỗi "account bị xóa giữa hai câu lệnh" ghi thành `INTERNAL` thay vì mã đúng, không dựng được trong test.
- **Một lỗi cố ý sống sót vì test chờ sai.** Test "lần nhập lỗi không đăng ký watch" chờ tới khi **có** watch rồi mới đếm số lần đăng ký. Với code gài lỗi (đăng ký cả sau lần nhập lỗi), watch có ngay sau lần nhập lỗi, nên test đếm lúc mới có một lần và vẫn xanh. Sửa: chờ lần nhập thứ hai **xong và worker rảnh** rồi mới đếm. Bài học: khi test "không có chuyện X", phải chờ tới lúc chắc chắn mọi việc có thể gây ra X đã chạy xong; chờ "một điều kiện đúng" là chưa đủ.
- `./mvnw -B -ntp verify` → 948 test, 0 lỗi, 4 bỏ qua (giả định theo capability trong bộ kiểm contract), BUILD SUCCESS, `ModularityTests` 2/2.
- **Chưa xác minh:** Gmail thật (gọi lại `watch` khi còn hạn trả hạn mới; mã lỗi khi topic ở dự án khác hay thiếu quyền). Làm ở BE-53 cùng webhook.

## 5. Webhook: nhận thông báo của Gmail (BE-52)

**Ở đâu:** `provider/infrastructure/gmail/GmailPushController` (`POST /api/webhooks/gmail`), `GmailPushTokens` (kiểm token), `GmailPushErrorCode`, `GmailProperties.PubSub` (`audience`, `service-account`, `jwk-set-uri`), `GmailConfiguration.checkPubSub`; sự kiện `provider/ProviderPushReceived`; `sync/application/PushNotices`, `SyncCheckpoints.watchedBy`; `common/security/SecurityConfig`.

```text
Pub/Sub --POST /api/webhooks/gmail-->  chuỗi bảo mật riêng: không đăng nhập, không session, không CSRF
          Authorization: Bearer <JWT Google ký>
                                   |
                                   v
GmailPushController
  1. GmailPushTokens.check        token sai -> 401, không làm gì khác
                                  không tải được khóa của Google -> 503 (Pub/Sub gửi lại sau)
  2. đọc body, tối đa 64 KB       đứt giữa chừng -> 400 (Pub/Sub gửi lại)
  3. message.data: base64 -> {"emailAddress", "historyId"}; chỉ lấy emailAddress
                                  đọc không được -> 204 + WARN (không in nội dung)
  4. publish ProviderPushReceived(gmail, địa chỉ)
                                   |  @EventListener, ngay trong request
                                   v
PushNotices (module sync)
  watchedBy(địa chỉ)              các dòng có watch_address trùng, không phân biệt hoa thường
  -> giữ account cùng provider, tự đồng bộ được (không tạm dừng, tắt, hết quyền, đã xóa)
  -> ImportRunner.submit          trả 204 ngay; lượt đồng bộ chạy nền
```

### 5.1 JWT và chữ ký: Sino biết request đến từ Google bằng cách nào
Webhook là một đường dẫn công khai: ai trên Internet cũng gửi được `POST` tới nó. Pub/Sub gửi kèm mỗi request một **JWT** (JSON Web Token) trong header `Authorization: Bearer ...`. Một JWT có ba phần, ngăn bởi dấu chấm, mỗi phần là base64url:

```text
eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9 . eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLC4uLn0 . <chữ ký>
   header {"alg":"RS256","kid":"..."}        payload (các claim) {"iss", "aud", "email", "exp", ...}
```

Google ký phần đầu và phần giữa bằng **khóa bí mật RSA** của nó. Ai cũng kiểm được chữ ký bằng **khóa công khai** Google đăng ở `https://www.googleapis.com/oauth2/v3/certs` (một JWKS: danh sách khóa, mỗi khóa có `kid`). Sửa một chữ trong payload là chữ ký sai; muốn làm token mới phải có khóa bí mật của Google. Vì vậy Sino không cần giữ bí mật nào của Google cho webhook: chỉ cần khóa công khai.

### 5.2 Kiểm những gì, và mỗi thứ chặn kiểu tấn công nào
Chữ ký đúng mới chỉ nói "Google làm ra token này". Google làm token cho rất nhiều dịch vụ, nên Sino còn kiểm token đó dành cho **chính nó**:

| Kiểm | Chặn |
|---|---|
| chữ ký RS256, khóa lấy từ JWKS của Google | token tự làm; token ký bằng khóa khác; `alg: none` (không ký); `HS256` (ký bằng một "mật khẩu" mà kẻ tấn công tự chọn) |
| `exp` bắt buộc và chưa qua (lệch tối đa 60 giây), `nbf` nếu có | token cũ bị lấy được rồi gửi lại về sau |
| `iss` là `https://accounts.google.com` hoặc `accounts.google.com` | token của nơi khác cấp |
| `aud` chứa `audience` đã cấu hình | token Google cấp cho **dịch vụ khác** (một push subscription của người khác cũng có token Google ký thật) |
| `email` là tài khoản dịch vụ đã cấu hình và `email_verified = true` | token của một tài khoản Google bất kỳ có cùng `aud` |

Bẫy đã gặp khi đọc mã nguồn Spring Security 7.1.1: `JwtTimestampValidator` mặc định **cho qua token không có `exp`** (chỉ kiểm khi có). Token không hết hạn thì bị lấy được một lần là dùng mãi, nên Sino bật `setAllowEmptyExpiryClaim(false)`. Có test cho từng dòng của bảng trên (`GmailPushTokensTests`).

### 5.3 Vì sao nội dung hỏng vẫn trả 204 còn token sai thì 401 (câu gợi ý của task)
Pub/Sub coi mọi mã 2xx là "đã nhận" và xóa tin; mã khác thì **gửi lại**, giãn dần, tới 7 ngày.
- **Token sai → 401.** Request không phải của Google (hoặc cấu hình `audience` sai): không làm gì cả. Nếu là cấu hình sai của mình, Pub/Sub cứ gửi lại cho tới khi sửa xong, nên thông báo không mất.
- **Token đúng, nội dung hỏng → 204.** Google gửi thật nhưng Sino không đọc được: gửi lại bao nhiêu lần cũng vẫn hỏng. Trả lỗi chỉ làm Pub/Sub gửi lại vô ích suốt một tuần. Nhận rồi bỏ, ghi một dòng WARN (không in nội dung). Lịch hỏi định kỳ 5 phút vẫn mang thư về.
- **Không tải được khóa của Google → 503.** Lỗi tạm thời ở phía Sino hoặc Google: muốn Pub/Sub gửi lại sau.

### 5.4 Kiểm token trước, đọc body sau, và chỉ đọc 64 KB
Nếu controller nhận `@RequestBody`, Spring đọc và parse cả body **trước** khi code của Sino kịp kiểm token: một người lạ gửi vài trăm MB JSON là Sino phải đọc hết. Controller nhận `InputStream`, kiểm token xong mới đọc, và chỉ đọc tối đa 64 KB + 1 byte (`readNBytes`); dài hơn là bỏ. Một thông báo của Gmail chỉ vài trăm byte.

### 5.5 Khóa của Google: giữ 5 phút, tải lại tối đa hai lần mỗi 30 giây
Khóa công khai của Google đổi định kỳ; khi token mang `kid` lạ, thư viện tải lại JWKS. Bẫy: builder `NimbusJwtDecoder.withJwkSetUri(...)` của Spring Security **tắt** giới hạn tần suất tải lại (`rateLimited(false)`). Một người lạ chỉ cần gửi token mang `kid` bịa là buộc Sino gọi Google ở mỗi request, và các request xếp hàng sau một khóa (lock). Sino tự dựng nguồn khóa bằng `JWKSourceBuilder` của Nimbus: giữ JWKS 5 phút, tải lại tối đa hai lần mỗi 30 giây, mỗi lần tải giới hạn 5 giây và 50 KB, và tắt việc làm mới trước hạn (nó giữ một thread mà không gì dừng khi DevTools khởi động lại ứng dụng). Khi bị giới hạn, thư viện báo "rate limit reached": token nêu một khóa không có trong bộ vừa tải, hoặc các lần tải vừa rồi hỏng (đã được log lúc đó). Sino trả 401 cho trường hợp này; Pub/Sub gửi lại như mọi lần bị từ chối.

### 5.6 Đủ ba cấu hình hoặc không có gì
`SINO_GOOGLE_PUBSUB_TOPIC`, `SINO_GOOGLE_PUBSUB_AUDIENCE`, `SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT` đi cùng nhau: có cả ba thì Gmail khai báo push và webhook tồn tại; không có cái nào thì chỉ hỏi định kỳ, webhook trả 404; thiếu một hai cái thì ứng dụng **không khởi động**, thông báo nêu tên biến thiếu (không nêu giá trị). Việc này đóng luôn giới hạn của BE-51 (đặt topic mà chưa có webhook thì thư chậm 5 phút).

Hai lỗi thật chỉ lộ ra khi chạy RED trên **toàn bộ** ứng dụng:
- `GmailPushController` có `@RestController`, nên **component scan** tự tạo nó, kể cả khi đã có một `@Bean` tạo nó có điều kiện. Mọi context không có cấu hình Pub/Sub đều hỏng. Sửa: đặt `@Conditional` thẳng lên lớp controller, để chính scan quyết định.
- Record `PubSub` có thêm một constructor phụ `PubSub(String topic)` cho tiện. Spring Boot bind `sino.google.pubsub.*` vào record qua constructor; có hai constructor thì nó chọn nhầm cái một tham số, và `audience` luôn rỗng. Sửa: chỉ để một constructor; Javadoc ghi lý do.

### 5.7 Webhook có chuỗi bảo mật riêng
Spring Security cho phép nhiều `SecurityFilterChain`; request đi vào chuỗi **đầu tiên** khớp. `SecurityConfig` có hai chuỗi:
- `webhookSecurityFilterChain` (`@Order(Ordered.HIGHEST_PRECEDENCE)`): chỉ khớp `POST /api/webhooks/*`; không đòi đăng nhập, `STATELESS` (không tạo session), không CSRF, không lưu request. Việc kiểm token nằm ở controller của connector, vì module `common` không được biết về Google.
- `apiSecurityFilterChain`: mọi request còn lại, như trước (phiên cookie, CSRF kiểu SPA, remember-me).

Bản đầu chỉ thêm `permitAll` cho webhook vào chuỗi chung và bỏ CSRF cho `/api/webhooks/**`. Review chỉ ra hai điểm: bộ lọc CSRF rộng hơn chỗ mở (mọi method, mọi độ sâu, nên một endpoint dùng cookie sau này dưới `/api/webhooks/` sẽ mất CSRF mà không ai để ý); và chuỗi chung vẫn có thể tạo cookie `XSRF-TOKEN` hay session cho request của Google. Chuỗi riêng khớp đúng một đường, và test kiểm response không có `Set-Cookie`, request không tạo session.

### 5.8 Thông báo chỉ là tín hiệu
Sino không tin `historyId` hay bất kỳ dữ liệu nào trong thông báo: chỉ lấy địa chỉ để biết account nào cần đọc, rồi đọc thay đổi từ con trỏ của chính nó (`history.list`). Kẻ nào đó dù có token hợp lệ cũng chỉ làm được một việc: khiến Sino đồng bộ sớm hơn. Connector Gmail giữ phần riêng của Google (Pub/Sub, OIDC) và phát `ProviderPushReceived` ở gói gốc `provider` (API của module); module `sync` nghe sự kiện đó và không biết gì về Google. Địa chỉ không bao giờ vào log: `toString` của sự kiện che nó, log của `PushNotices` chỉ nêu provider.

### 5.9 Review: một lần từ chối không được im lặng
Review (agent `senior-reviewer`) không thấy lỗ hổng bảo mật; một lỗi nặng đáng nhớ là **từ chối mà không để lại dấu vết**. Bản đầu trả 401 cho mọi token sai mà không log dòng nào (`GlobalExceptionHandler` không log lỗi của `SinoException`). Ở BE-53, người dùng cấu hình tay trên Google Console; gõ sai `audience` hay chọn nhầm tài khoản dịch vụ thì: watch vẫn đăng ký được (không cần webhook), nên Sino chỉ hỏi Gmail 5 phút một lần; mọi thông báo bị 401 trong im lặng; thư về **chậm hơn cả khi không bật push**, và log không nói vì sao. Sửa: phân loại lần từ chối.

| Trường hợp | Log |
|---|---|
| Không có token, token không phải của Google (chữ ký sai), `kid` lạ | DEBUG: ai trên Internet cũng gửi được, không đáng một dòng WARN |
| Token Google ký nhưng sai `aud`, `email`, `iss`, hết hạn | WARN, tối đa một lần mỗi phút, chỉ nêu tên kiểm tra ("The aud claim is not valid"), nhắc kiểm hai biến cấu hình |
| Không tải được khóa của Google | WARN, tối đa một lần mỗi phút |

Giới hạn "một lần mỗi phút" dùng một `AtomicLong` giữ thời điểm (`System.nanoTime()`) lần nói gần nhất và `compareAndSet`, nên hai request cùng lúc không cùng in. Các sửa nhỏ khác: client ngắt giữa lúc gửi body thì trả 400 và một dòng WARN thay vì 500 kèm stack trace; Javadoc sửa "tải lại tối đa một lần" thành "hai lần" cho đúng thư viện; test HS256 giờ đặt cả khóa bí mật vào bộ khóa, để nếu ai đó nới thuật toán thì test bắt được; thêm một test đi trọn đường: thông báo của Google → account Gmail có watch → lượt đồng bộ gọi Gmail API (giả bằng WireMock).

### 5.10 Kiểm chứng (BE-52)
- **RED trên toàn bộ ứng dụng:** thay năm chỗ logic bằng bản rỗng: 40 test đỏ. Lần chạy này còn lộ ra hai lỗi thật của chính code (mục 5.6), không phải của bản rỗng. Bài học: chạy RED cả trên các test khởi động toàn bộ ứng dụng, đừng chỉ chạy test đơn vị.
- **Test không cần Spring cho phần khó:** `GmailPushTokensTests` tự sinh khóa RSA bằng `RSAKeyGenerator` của Nimbus, ký token giả bằng `RSASSASigner`, và đưa khóa công khai cho bộ kiểm qua `ImmutableJWKSet` (không cần mạng); vài test tải khóa qua WireMock để kiểm cache, giới hạn tần suất và Google sập. Chạy trong vài giây.
- **Test đi trọn đường:** `GmailWebhookTests` dựng cả ứng dụng với một Google giả (WireMock phục vụ cả khóa lẫn Gmail API): thông báo hợp lệ → `ProviderPushReceived` → `PushNotices` → `ImportRunner` → `GmailProvider` gọi `history.list` → con trỏ của account tiến.
- **Kiểm tra ngược hai vòng:** 22 lỗi cố ý trước review, 21 sau review, chạy song song trong hai worktree. Một lỗi cố ý sống sót lộ ra test base64 URL-safe dùng chuỗi mẫu mà hai bảng mã cho cùng kết quả (chỉ khác nhau khi gặp `+` hay `/`). Hai lỗi cố ý sống sót có chủ đích vì tương đương: bỏ `@Order` (thứ tự khai báo đã đặt chuỗi webhook trước) và bỏ `STATELESS` (Spring Security vốn không tạo session cho request ẩn danh; giữ làm chốt).
- `./mvnw -B -ntp verify` → 1000 test, 0 lỗi, BUILD SUCCESS, `ModularityTests` 2/2.
- **Chưa xác minh:** Pub/Sub và Google Console thật (BE-53).
