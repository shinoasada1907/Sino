## Mode

**AUTO** (người dùng 2026-10-27, AUTO cho cả năm change *Hoàn thiện chat Zalo*; `project-mode.yaml` `task_overrides.zalo-media-library`). Đội Sino giao việc theo `CLAUDE.md`. **Đề án được duyệt 2026-11-04** ("có duyệt nhé"): DN-1, DN-2, DN-3 đều chọn A. Người dùng nghiệm thu từng task trước khi commit.

## Context

Số liệu đo ngày 2026-11-04 trên DB `sino` bằng câu lệnh chỉ đọc (chỉ đếm, không lấy nội dung tin) và lệnh `GET` một byte đầu tới địa chỉ đã lưu.

**Zalo không cho lấy kho.** 158 API của zca-js 2.2.0 không có hàm liệt kê file hay link của một cuộc trò chuyện. `getGroupChatHistory` chỉ nhận `count`, không lật trang, và trả `404` ở spike 2026-10-14. Zalo có thể có API riêng cho kho của họ, nhưng chưa dò, và dò phải mở `chat.zalo.me`, việc này đá phiên Sino của nick đó.

**Tin đã lưu của Zalo (2 tài khoản):**

| Loại | Số tin | Địa chỉ nằm ở đâu |
|---|---|---|
| `chat.photo` | 56 | 43 tin có `metadata.imageUrl`; 13 tin không có. Không có dòng `attachment` |
| `share.file` | 15, đều OUTBOUND | 3 tin có dòng `attachment` với `remote_url`; 12 tin chỉ có chữ `[Tệp]`, chưa rõ vì sao (ZF-20 cho biết tin mới có còn bị vậy không) |
| `chat.voice`, `chat.video.msg` | 0 | Chưa từng nhận |
| `chat.recommended` | 1 | `[Tin Zalo chưa hỗ trợ]`, địa chỉ không được lưu |
| Chữ có `http(s)://` | 1 trong 92 tin chữ | Trong `text_content` |

**Địa chỉ cũ còn mở được không (tin 14–16 ngày tuổi):**

- Tệp: 3/3 còn mở được.
- Ảnh: 24/43 còn mở được, 19/43 trả `404`. Toàn bộ 18 ảnh ngày 19/10 trả `404`, ảnh ngày 21/10 đều còn. Thêm Referer của Zalo không đổi kết quả.
- **Chưa kết luận được là địa chỉ hết hạn:** ZL-18 đã thấy địa chỉ `b-f11-zpc.zdn.vn` trả `404` ngay từ đầu, nên hai nguyên nhân đang lẫn vào nhau. Cần đo trên ảnh mới theo thời gian (ML-20).

**Hình dạng tin thoại, video, link: chưa từng thấy thật.** zca-js chỉ cho biết phía gửi: `voiceUrl`, `m4aUrl`, `fileSize`; `videoUrl`, `thumbUrl`, `duration`, `width`, `height`, `fileSize`; `href`, `title`, `desc`, `thumb`. Bản giao qua listener có thể khác, và zca-js còn ghi chú "don't know" cho `chat.link`. Log hiện có (`contentShapeOf`) không nói gì về `chat.voice` vì nó đã nằm trong `KNOWN_TYPES`, và không đọc sâu vào `params`; `photoShapeOf` đọc sâu nhưng chỉ chạy cho `chat.photo`.

**Web:** `ConversationInfo.tsx` có thay đổi chưa commit của `chat-ui-refactor` (Antigravity, người dùng đã duyệt): khối Ảnh & video, Tệp tài liệu, Liên kết đã vẽ, nhưng `inbox.api.ts` đặt `files: null` và không ai điền `linkedUrl`, nên trên dữ liệu thật luôn hiện "Chưa có tệp…". "Xem tất cả" và nút tải chưa có hành động. Cột chỉ hiện từ `xl`; nút "Thông tin cuộc trò chuyện" ở trang chat điện thoại chưa có hành động. `href` của link chưa kiểm scheme. Canvas chưa có màn kho.

**API tệp hiện có:** `GET /{messageId}/attachments/{attachmentId}` đọc tệp từ nhà cung cấp và giữ cả tệp trong bộ nhớ, tối đa 25 MiB (`MessageFiles`, D-125: không lưu tệp).

## Goals / Non-Goals

**Goals:** mở một chat Zalo là thấy ảnh, video, tệp, link, âm thanh đã qua Sino của chat đó, mở được từng mục; tin thoại, video, link mới hiện đúng trong khung chat; địa chỉ đã chết thì báo rõ thay vì vỡ giao diện.

**Non-Goals:** xem `proposal.md`.

## Decisions

### DN-1 — Kho đọc dữ liệu từ đâu · **người dùng chốt A** (2026-11-04)

| | A. Đọc trực tiếp từ `message` và `attachment` (đề xuất) | B. Bảng mới `message_media` |
|---|---|---|
| Cách làm | Mỗi loại một câu truy vấn trên tin của cuộc trò chuyện, dùng chỉ mục `(conversation_id, sent_at DESC)` có sẵn | Ghi thêm một dòng mỗi khi lưu tin, kèm migration nạp dữ liệu cũ |
| Được | Không migration; 43 ảnh và 3 tệp đã có hiện ngay; không có bản dữ liệu thứ hai phải giữ cho khớp | Một dạng dữ liệu duy nhất; đếm và đọc nhanh ở mọi cỡ |
| Mất | Ba nguồn có hình dạng khác nhau (`metadata`, `attachment`, chữ); tìm link trong chữ phải quét chữ mỗi lần đọc | Thêm migration, thêm chỗ phải đồng bộ khi tin đổi hoặc bị bỏ |

**Đề xuất A:** mỗi lần đọc chỉ quét một cuộc trò chuyện, và dữ liệu hiện rất nhỏ (92 tin chữ). Khi nào đo thấy chậm thì đổi sang B mà API không đổi.

### DN-2 — Địa chỉ của Zalo chết thì sao · **người dùng chốt A** (2026-11-04)

| | A. Chỉ giữ địa chỉ của Zalo (đề xuất) | B. Chép ảnh và tệp về Sino khi nhận | C. Chỉ giữ ảnh thu nhỏ |
|---|---|---|---|
| Khi địa chỉ chết | Mục vẫn còn trong danh sách, hiện "Không còn trên Zalo" | Vẫn mở được | Vẫn thấy ảnh nhỏ, không mở được bản gốc |
| Lưu trữ | Không thêm | Cần chỗ lưu mới, sao lưu, giới hạn dung lượng | Ít, nhưng vẫn là chỗ lưu mới |
| Quyền riêng tư | Giữ nguyên D-125, không đổi trang Privacy | Bỏ D-125; Sino giữ bản sao tệp của người khác, phải sửa Privacy | Như B, ở mức nhỏ hơn |

**Đề xuất A cho change này,** và đo độ bền địa chỉ ở ML-20. Hôm nay 19/43 ảnh đã không mở được nên A có thể làm kho thiếu dần, nhưng chưa tách được nguyên nhân (Context). Nếu đo thấy địa chỉ mới cũng chết nhanh, B nên là một change riêng, vì nó đổi cam kết về dữ liệu.

### DN-3 — Kho nằm ở đâu trên giao diện · **người dùng chốt A** (2026-11-04)

| | A. Cột "Chi tiết hội thoại" + danh sách đầy đủ trong cột (đề xuất) | B. Trang riêng `/messages/:id/media` ở mọi cỡ màn | C. Hộp thoại |
|---|---|---|---|
| Desktop | Xem trước trong cột; "Xem tất cả" thay nội dung cột bằng bốn tab, chat vẫn còn bên cạnh | Rời khung chat | Che khung chat |
| Điện thoại | Trang con `/messages/:id/media`, mở từ nút "Thông tin cuộc trò chuyện" | Cùng trang | Hộp thoại chật ở 390 |
| Lưới ảnh | Hẹp (cột 340px) | Rộng nhất | Vừa |

**Đề xuất A:** dùng lại phần người dùng đã duyệt ở `chat-ui-refactor`, và xem kho mà không rời cuộc trò chuyện.

### D-467 — Bốn loại trong kho · agent chốt
- `MEDIA`: tin `IMAGE` có `imageUrl`, tin `VIDEO` có tệp đính kèm.
- `FILE`: tin `FILE` có dòng `attachment`.
- `LINK`: thẻ link và link trong chữ của tin `TEXT` (D-471).
- `AUDIO`: tin `AUDIO` có tệp đính kèm.

Tin giữ chỗ không có địa chỉ không vào kho, vì không có gì để mở. Sticker và ảnh vẽ như sticker không vào `MEDIA`: chúng không có `imageUrl` (ZL-19). API không phân biệt nhà cung cấp, chỉ đọc dữ liệu đã chuẩn hóa.

### D-468 — Hợp đồng `sino-zalo` → `sino-api` · agent chốt, ML-01 xác nhận
`ZaloMessage` có thêm ba trường tùy chọn, theo mẫu `photo`, `file`:
```text
voice: { url, sizeBytes|null, durationMs|null }
video: { url, thumbUrl|null, sizeBytes|null, durationMs|null, caption|null }
link:  { url, title|null, description|null, thumbUrl|null }
```
Tên phía `sino-api` nhận cố định theo khối trên. Khóa nào của Zalo đổ vào trường nào thì ML-01 đo rồi ghi ở `tasks.md`. Không có địa chỉ thì không gửi trường đó, và tin vẫn là chữ giữ chỗ. `chat.voice` không đọc được phải được log hình dạng như các loại chưa xử lý.

### D-469 — Lưu tin ở `sino-api` · agent chốt
- `chat.voice`: `AUDIO`, chữ `[Tin nhắn thoại]`, một `attachment` (`audio/mp4`, tên `tin-nhan-thoai.m4a`), `metadata.durationMs`. ML-01 đọc được định dạng khác thì sửa theo.
- `chat.video.msg`: `VIDEO`, chữ là `caption` hoặc `[Video]`, một `attachment` (`video/mp4`, tên `video.mp4`, `thumbnail_url`), `metadata.durationMs`.
- `chat.recommended`, `chat.link`: `TEXT`, chữ là tiêu đề hoặc địa chỉ, `metadata` có `linkUrl`, `linkTitle`, `linkDescription`, `linkThumbUrl`. Khóa đặt trong `NormalizedMessage` như `IMAGE_URL`, không để tên Zalo lọt vào lõi.
- Địa chỉ âm thanh, video kiểm bằng `FILE_DOMAINS`, thêm tên miền ML-01 đo được. Ảnh xem trước kiểm bằng `PICTURE_DOMAINS`. `linkUrl` nhận mọi host nhưng chỉ `http`, `https`, tối đa 2048 ký tự.
- `InboxMessage.File` và `MessageResponse` có thêm `url`, `thumbnailUrl`, `durationMs`; tin có thêm `link`. Mọi trường đều `null` được, thư Gmail không đổi hành vi.

### D-470 — API kho · agent chốt
```text
GET /api/conversations/{id}/media?kind=MEDIA|FILE|LINK|AUDIO&cursor=&limit=30
→ 200 {
  "items": [ {
    "messageId", "kind": "IMAGE|VIDEO|FILE|LINK|AUDIO", "sentAt",
    "sender": { "name", "self" },
    "attachmentId": null, "url", "thumbnailUrl", "name", "mimeType", "sizeBytes", "durationMs",
    "title", "description"
  } ],
  "nextCursor": null,
  "total": 12
}
```
- Kiểm quyền và bản sao của chat đã gộp bằng `inbox.requireInInbox`, như `MessageFiles`.
- Mới nhất trước; cùng thời điểm thì theo ID tin. Con trỏ mã hóa theo mẫu `MessageCursor`, trỏ tới tin. Một tin có nhiều link không bị cắt giữa trang, nên một trang `LINK` có thể nhiều hơn `limit` vài mục.
- `total` đếm theo loại ở mỗi lần gọi.
- Không gọi nhà cung cấp và không kiểm địa chỉ còn sống.

### D-471 — Link trong chữ · agent chốt
Lọc tin bằng `text_content ~ 'https?://'`, rồi tách trong Java bằng `https?://[^\s<>"]+`, bỏ dấu câu dính ở cuối, kiểm bằng `java.net.URI`, bỏ trùng trong một tin. Tin thẻ link có cùng địa chỉ trong chữ thì chỉ tính một mục, là mục có tiêu đề. Không ghi gì thêm vào DB. Thư không bị chặn ở API, nhưng web không gọi cho thư, vì chữ ký thư toàn link.

### D-472 — Khung chat · agent chốt
- Tin thoại: `<audio controls preload="none">`. Video: ảnh xem trước và `<video controls preload="none">`. Cả hai lấy trực tiếp từ địa chỉ của Zalo, như ảnh hôm nay.
- Thẻ link: tiêu đề, mô tả, host, ảnh xem trước. Tiêu đề và mô tả là chữ của người khác nên chỉ hiện dạng chữ.
- Không có địa chỉ: giữ chữ giữ chỗ.
- Trình duyệt có phát được trực tiếp hay không là việc phải kiểm ở ML-20. Nếu không phát được, nút phát đổi thành mở địa chỉ ở tab mới.

### D-473 — Web của kho · agent chốt
- `ConversationInfo` bỏ `detail.files` và `detail.linkedUrl`, gọi API qua `useQuery(['media', id, kind])` với `limit` nhỏ: 4 ảnh, 3 tệp, 3 link, 3 âm thanh. Chỉ gọi khi cột đang mở.
- "Xem tất cả" đổi nội dung cột thành bốn tab, dùng `useInfiniteQuery`, có nút quay lại xem trước.
- Dưới `xl`, nút "Thông tin cuộc trò chuyện" đi tới trang con `/messages/:conversationId/media`, chỉ có danh sách bốn tab.
- Có tin mới của cuộc trò chuyện thì làm mới theo sự kiện realtime hiện có, như khung chat.
- Tệp: `sizeBytes` lớn hơn 25 MiB thì mở `url` ở tab mới; còn lại dùng API tệp hiện có. API trả lỗi thì hiện lỗi tại hàng.
- Ảnh, video, âm thanh tải lỗi (`onError`) thì hiện "Không còn trên Zalo" một lần, không thử lại.
- Chỉ dựng `href` khi `new URL(url).protocol` là `http:` hoặc `https:`.

### D-474 — Log và Privacy · agent chốt
Log chỉ có ID, loại tin, tên khóa, loại giá trị và host; không có địa chỉ đầy đủ, tiêu đề, mô tả. Với DN-2 = A, Sino không giữ thêm tệp nào, chỉ giữ thêm địa chỉ và tiêu đề link ở cùng mức với chữ của tin. ML-20 đối chiếu lại với trang Privacy.

## Risks / Trade-offs

- [Hình dạng thật khác zca-js] → ML-01 đo trước khi chốt tên khóa; ML-02 và ML-03 không bắt đầu khi chưa đo.
- [Địa chỉ Zalo chết theo thời gian] → hiện "Không còn trên Zalo"; đo ở ML-20; hướng lưu bản sao là DN-2.
- [Trình duyệt không phát được từ địa chỉ Zalo] → D-472, mở ở tab mới.
- [Link trong chữ làm chậm khi chat rất dài] → chỉ quét một cuộc trò chuyện; đo thấy chậm thì chuyển DN-1 sang B.
- [Tiêu đề và địa chỉ link là dữ liệu do người ngoài đặt] → chỉ hiện dạng chữ, kiểm scheme ở cả `sino-api` và web, `rel="noopener noreferrer"`.
- [Web sửa trên thay đổi chưa commit của change khác] → `tasks.md`, *Điều kiện trước khi giao web*.
- [Mở `chat.zalo.me` lúc đo làm mất phiên] → ML-01 và ML-20 chỉ xem kết quả trên điện thoại hoặc nick nhận.

## Contract tóm tắt

```text
sino-zalo  ZaloMessage + voice? video? link?                                         (D-468)
sino-api   AUDIO, VIDEO, TEXT + link; NormalizedMessage.LINK_*; File + url, thumb     (D-469)
sino-api   GET /api/conversations/{id}/media?kind=&cursor=&limit=                     (D-470, D-471)
sino-web   ConversationInfo + tab "Xem tất cả" + /messages/:id/media                  (D-473)
sino-web   ChatThread: audio, video, thẻ link                                         (D-472)
```
