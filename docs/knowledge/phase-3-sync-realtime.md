# Kiến thức Phase 3 — Đồng bộ nền và Hộp thư realtime

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F07 + F08, `openspec/changes/f07-f08-realtime-inbox` (thư mới tự vào Sino và tự hiện trên web): BE-48.
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
