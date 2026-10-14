# Mở rộng F05 · Một chuỗi ở nhiều tài khoản là một dòng · Technical Design

> Mode: **HYBRID**. Quyết định kiến trúc thuộc TRAINING: người dùng chọn gom thành một dòng ("làm A đi làm 1 dòng tính theo account email") và duyệt thiết kế bên dưới ("ok duyệt", 2026-10-12). D-180…D-187 là **người dùng duyệt**; các chốt kỹ thuật là agent chốt, để phiên backend sửa khi làm.
> Change dùng chung: phiên web viết hồ sơ, contract và phần Web (FE-80…); phiên backend nhận mục Backend (BE-80…) và được sửa task của mình khi nhận. Số quyết định: D-180…D-189.

## Context

Dữ liệu thật (2026-10-12, database local, chỉ đọc), hai tài khoản Gmail của cùng chủ gửi thư qua lại:

| Thread Gmail của `tienct07` | Thread Gmail của `bonzed2001` | Thư trong mỗi bản |
|---|---|---|
| `1a12fae4…` "xin chào" 17:41 | `1a12fadf…` | 3 thư: Helllo (17:35), xin chào (17:37, gửi từ Sino), hello (17:41) |
| `1a12f457…` "xin chào" 15:46 | `1a12f45c…` | 3 thư |
| `1a12f48a…` "hihi" 15:44 | `1a12f48e…` | 1 thư |

- Trong mỗi hộp thư, thư trả lời đã vào đúng chuỗi (kể cả thư gửi từ Sino). Hai chuỗi "xin chào" là hai thư mới riêng, Gmail cũng tách.
- Hai bản của một thư có `message.metadata.rfcMessageId` **giống hệt nhau**, kể cả thư gửi từ Sino sau khi đồng bộ (Gmail thay `Message-ID` của Sino bằng của nó, BE-60, và lượt đồng bộ lưu `Message-ID` của Gmail). Database có 21 `Message-ID` nằm ở hơn một tài khoản. Thư vừa gửi từ Sino chưa có `rfcMessageId` cho tới lượt đồng bộ sau.
- `conversation` là một dòng cho mỗi cuộc trò chuyện của **một** account (unique `(account_id, external_conversation_id)`, F05). API Hộp thư (`InboxService`, `ConversationSummaries`), lịch sử thư (`MessageHistory`), trả lời (`Replies`, `ReplyService`) đều làm việc trên một `conversation`.
- Web: `ConversationItem.accountId` (một tài khoản); IN-10 (D-97) ghi địa chỉ tài khoản trên dòng khi nguồn có từ hai tài khoản; đầu thư ghi "Gmail · địa chỉ"; `Composer` ghi "Gửi từ {tài khoản}" chỉ từ 1280px.

## Goals / Non-Goals

**Goals:** một chuỗi chỉ hiện một dòng dù nằm ở nhiều tài khoản của bạn; mở ra thấy mỗi thư một lần; biết chuỗi nằm ở những tài khoản nào và thư trả lời đi từ tài khoản nào.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Decisions

### D-180 — Một nhóm = các cuộc trò chuyện có thư chung `Message-ID` · **Người dùng duyệt** (2026-10-12)
Hai cuộc trò chuyện thuộc một nhóm khi cùng chủ, cùng nhà cung cấp, khác tài khoản, và có ít nhất một thư cùng `rfcMessageId`. Nhóm có tính bắc cầu: thư chung giữa A và B, rồi giữa B và C, thì A, B, C là một nhóm. Một cuộc trò chuyện không chung thư với ai là nhóm một bản, chạy như trước.
**LÝ DO:** `Message-ID` là mã của một thư theo RFC 5322, giống nhau ở mọi hộp thư nhận hay gửi thư đó; dữ liệu thật khớp từng thư. Không cần gọi thêm Gmail hay lưu thêm header.
**Bắc cầu qua cùng một tài khoản (người dùng chốt 2026-10-12, khi BE-80 review thấy spec tự mâu thuẫn):** Gmail của một tài khoản có thể tách một chuỗi thành hai thread mà tài khoản kia giữ chung một thread; khi đó cả ba là một nhóm ("Gộp cả ba thành một dòng"), trả lời đi trong thread của bản chính. Hai thread của một tài khoản không tự gộp vì chung thư với nhau.
**Phương án bị loại:** gom theo tiêu đề + người tham gia (gom nhầm hai chuỗi cùng tên, như hai "xin chào" ở trên); gom theo gốc của `References` (phải lưu thêm header, không hơn gì khi đã có thư chung); gom ở web (danh sách từng trang và số đếm của server sẽ sai).

### D-181 — Bản chính của nhóm · **Người dùng duyệt**
Bản chính là bản giữ thư mới nhất. Khi thư mới nhất có ở nhiều bản (cùng `rfcMessageId`), bản chính là bản mà thư đó là thư **đến**; vẫn ngang nhau thì bản cũ nhất. Tên người (`title`), tiêu đề, xem trước, `accountId` và tài khoản trả lời lấy từ bản chính.
**LÝ DO:** trả lời từ địa chỉ vừa nhận thư là điều người gửi chờ; với thư tự gửi giữa hai tài khoản, bản nhận cho tên của người kia.
**Phương án bị loại:** luôn lấy bản cũ nhất (trả lời có thể đi từ tài khoản không nhận thư mới nhất); cho người dùng chọn mỗi lần (thêm một bước cho việc hiếm).

### D-182 — Dòng của nhóm và nhãn tài khoản · **Người dùng duyệt**
- Dòng ghi **mọi** tài khoản của nhóm (`accountIds`, bản chính trước): từ 1280px "Gmail · tienct07@gmail.com, bonzed2001@gmail.com", dưới 1280px chỉ địa chỉ (mở rộng D-97). Đầu chuỗi đang mở ghi đủ danh sách.
- Chưa đọc: bản nào còn thư chưa đọc (`unreadCount` = lớn nhất của các bản). Cần trả lời: chỉ khi **mọi** bản đều cần trả lời, nên thư tự gửi giữa hai tài khoản không bị tính, và trả lời từ một tài khoản làm cả nhóm hết "Cần trả lời". Có tệp: bản nào có tệp. Lưu trữ: khi mọi bản đã lưu trữ. Giờ: thư mới nhất của mọi bản.
**LÝ DO:** người dùng: "1 dòng tính theo account email". Một bản cần trả lời mà bản kia là người viết cuối thì người dùng đã viết cuối.
**Phương án bị loại:** "2 tài khoản" thay cho địa chỉ (không biết là tài khoản nào); "Cần trả lời" khi một bản cần (thư tự gửi luôn bị tính); cộng số chưa đọc của các bản (một thư bị đếm hai lần).

### D-183 — Mã của nhóm ổn định · **Người dùng duyệt**
Mã của nhóm trong API là mã của cuộc trò chuyện **cũ nhất** (`created_at`, rồi `id`) trong các bản còn trong phạm vi (D-66: tài khoản chưa xóa, không `DISABLED`). Mọi đường `/api/conversations/{id}…` nhận mã của **bất kỳ** bản nào và làm việc trên cả nhóm; dòng trả về mang mã của nhóm. Web gặp mã khác thì thay đường dẫn bằng mã của nhóm.
**LÝ DO:** đường dẫn đang mở, dòng đã tải, sự kiện realtime cũ vẫn dùng được khi hai nhóm gộp lại về sau.
**Phương án bị loại:** mã nhóm mới hoàn toàn (đổi mọi đường dẫn đã có, thêm một loại mã); mã của bản chính (đổi mỗi khi có thư mới ở bản khác).

### D-184 — Thư của chuỗi gộp · **Người dùng duyệt**
`GET /api/conversations/{id}/messages` trả thư của mọi bản, mỗi `rfcMessageId` một lần; thư chưa có `rfcMessageId` (vừa gửi từ Sino) luôn có mặt. Một thư có ở nhiều bản thì lấy bản mà nó là thư **đi** (để còn `clientMessageId`, trạng thái gửi của Sino), không có thì bản chính, rồi bản cũ nhất. Web: thư của bạn ghi "Bạn · {địa chỉ gửi}" khi chuỗi có nhiều tài khoản.
**LÝ DO:** cùng một thư hiện hai lần (một "đi", một "đến") là điều người dùng đang phàn nàn.
**Phương án bị loại:** chỉ hiện thư của bản chính (thiếu thư mà chỉ bản kia có, ví dụ tài khoản được CC sau).

### D-185 — Đã đọc và lưu trữ áp cho mọi bản · **Người dùng duyệt**
`PATCH /api/conversations/{id}` với `read`/`archived` đổi mọi bản trong phạm vi; mở chuỗi là đọc mọi bản. `read: false` đánh dấu chưa đọc thư mới nhất của bản chính. Vẫn chỉ trong Sino (D-67).
**Phương án bị loại:** đổi riêng bản chính (bản kia làm dòng vẫn chưa đọc hay vẫn nằm trong Hộp thư).

### D-186 — Trả lời gửi từ tài khoản của bản chính · **Người dùng duyệt**
`reply` (trạng thái, người nhận) tính trên bản chính (D-133 giữ nguyên); `POST /api/conversations/{id}/messages` gửi trong thread Gmail của bản chính và lưu thư vào bản đó. Ô trả lời ghi "Gửi từ {địa chỉ}" ở mọi cỡ màn khi chuỗi có nhiều tài khoản (bình thường chỉ từ 1280px).
**Phương án bị loại:** cho chọn tài khoản trong ô trả lời (để "Tạo thư mới" có ô "Từ" rồi dùng lại).

### D-187 — Số đếm và bộ lọc theo nhóm · **Người dùng duyệt**
`/api/conversations/counts` đếm nhóm (mỗi nhóm một lần) theo cùng điều kiện của dòng (D-182); `byProvider` theo nhà cung cấp của nhóm. Lọc `accountId`: nhóm có mặt khi có một bản thuộc tài khoản đó. Lọc `provider`: nhà cung cấp của nhóm.

### D-188 — Nhóm không tách khi tài khoản nối nó ra khỏi Hộp thư · **Agent chốt theo ủy quyền (BE-81, 2026-10-14), để người dùng xem lại**
A↔B, B↔C rồi xóa (hay tắt) tài khoản B: A và C vẫn là một dòng. Bản của B không còn trong dòng (D-66), mã nhóm là bản cũ nhất còn lại (D-183).
**LÝ DO:** chúng vẫn là một chuỗi (thư chung đã từng có thật); BE-80 chỉ gộp, không tách; tách phải gom lại cả nhóm mỗi khi một tài khoản đổi trạng thái, và đường dẫn đang mở có thể đổi mã.
**Phương án bị loại:** tách nhóm khi tài khoản bị xóa (gom lại từ đầu theo thư chung còn trong phạm vi).

### D-189 — Sự kiện `conversations.changed` mang mã mà Hộp thư hiện · **Agent chốt theo ủy quyền (BE-81, 2026-10-14), để người dùng xem lại**
Module `realtime` đổi mỗi mã cuộc trò chuyện của sự kiện (đồng bộ, nhập, người dùng) thành mã mà Hộp thư hiện, qua interface `InboxIds` của module `conversation` (mã nhóm theo D-183; mã Hộp thư không biết thì giữ nguyên), đọc trong transaction của bên phát, nên thấy cả lần gộp vừa xảy ra. Sự kiện của lượt lưu đã gộp bản của tài khoản kia mang mã nhóm, nên web cũng biết dòng của tài khoản kia đổi.
**Phương án bị loại:** đổi `StoreResult`/`MailStored` của module `sync` (module `sync` phải biết Hộp thư gộp thế nào); gửi cả mã bản lẫn mã nhóm (web chỉ biết mã nhóm, và nó đọc lại Hộp thư với mọi sự kiện).

**D-186, gửi lại (agent chốt khi làm BE-81):** thư gửi lỗi gửi lại cùng `clientMessageId` thì đi tiếp từ bản đã ghi nó, kể cả khi bản chính đã đổi; mọi tài khoản của nhóm bị khóa theo một thứ tự trước khi tìm `clientMessageId` trong mọi bản. **LÝ DO:** chỉ tìm trong bản chính thì thư cũ ở bản kia không được thấy và gửi hai lần (D-131); gửi trong thread của bản chính một thư ghi ở bản kia thì thư và thread lệch nhau. Thư đó nằm ở bản của một tài khoản đã ra khỏi Hộp thư (tắt, xóa) thì từ chối, `409 REPLY_NOT_ALLOWED` với `ACCOUNT_UNAVAILABLE`: gửi từ tài khoản khác có thể thành hai thư.

### Chốt kỹ thuật (agent, phiên backend sửa được khi làm)
- **Cột nhóm:** ~~`conversation.thread_group_id uuid NOT NULL`; cuộc trò chuyện mới có `thread_group_id = id`.~~ `grouped_with uuid` (bản cũ nhất của nhóm, `NULL` khi là nhóm một bản) và `thread_group_id uuid GENERATED ALWAYS AS (COALESCE(grouped_with, id)) STORED` (BE-80). **LÝ DO:** PostgreSQL không cho giá trị mặc định lấy từ cột khác, nên `NOT NULL` + "bằng `id` khi tạo" buộc mọi câu `INSERT` (store, test chèn bằng SQL) phải biết về nhóm, hoặc phải có trigger; cột tự tính cho cùng `thread_group_id` không bao giờ rỗng để BE-81 đọc. Gộp hai nhóm: mọi bản của cả hai nhóm lấy ~~`thread_group_id`~~ `grouped_with` là bản cũ nhất. Mã của nhóm trong API vẫn theo D-183 (tính khi đọc), không dựa vào giá trị cột.
- **Gom khi lưu:** sau khi `ConversationStore.store` ghi thư có `rfcMessageId`, tìm cuộc trò chuyện của tài khoản **khác** cùng chủ, cùng nhà cung cấp có thư cùng `rfcMessageId`, rồi gộp nhóm. Hai tài khoản đồng bộ song song có thể cùng gộp một lúc: khóa theo chủ trong transaction (`pg_advisory_xact_lock`) ~~hoặc cập nhật theo thứ tự cố định~~. **Đã làm (BE-80):** `ThreadGroups.group` cuối `JdbcConversationStore.store`, chủ và nhà cung cấp lấy qua `AccountDirectory` (module `conversation` không đọc bảng của `account`), khóa `thread-groups:<chủ>` sau khóa của tài khoản.
- **Gom dữ liệu đã có:** ~~trong migration V20 (vòng lặp gộp tới khi không đổi), hoặc~~ một lần chạy khi khởi động (BE-80: `GroupingAtStartup` → `ThreadGroups.groupAll`, mỗi lần Sino khởi động; lỗi chỉ ghi log). **LÝ DO:** cùng một đoạn code với lúc lưu, và migration không biết chủ, nhà cung cấp của tài khoản nếu không đọc thẳng bảng `connected_account` của module `account`; chạy lại mỗi lần khởi động không đổi gì khi đã gom xong.
- **Index:** `message ((metadata->>'rfcMessageId'))` khi khác null; `conversation (thread_group_id)` (V19).
- **Sự kiện realtime:** `conversations.changed` mang mã của nhóm (D-183), để web làm mới đúng chuỗi đang mở. **Đã làm (BE-81, D-189):** module `realtime` đổi mã qua `InboxIds`.
- **Đọc theo nhóm (BE-81):** mỗi trang tính mọi nhóm của chủ bằng một câu `GROUP BY thread_group_id` trên các cuộc trò chuyện trong phạm vi (giờ của nhóm là của bản mới nhất, nên không index nào của một bản cho đúng thứ tự), lọc và cắt trang theo `(giờ, mã nhóm)`, rồi một câu thứ hai đọc các bản của những nhóm trong trang (thư mới nhất của mỗi bản: `Message-ID`, chiều) để chọn bản chính bằng Java. Danh sách bản của một nhóm lấy từ câu thứ nhất, nên hai câu không lệch nhau khi một lượt lưu gộp nhóm ở giữa.
- **Đường con:** `…/messages/{messageId}/body`, tệp đính kèm, `DELETE …/messages/{messageId}` nhận thư của bất kỳ bản nào trong nhóm.

## Contract API (thay đổi)

```json
// GET /api/conversations, GET /api/conversations/{id}, PATCH /api/conversations/{id}: mỗi item
{
  "id": "<mã của nhóm, D-183>",
  "accountId": "<tài khoản của bản chính, D-181>",
  "accountIds": ["<bản chính>", "<các bản khác, theo thứ tự cũ → mới>"],
  "title": "…", "subject": "…", "snippet": "…", "lastMessageAt": "…",
  "unreadCount": 1, "needsReply": false, "hasAttachments": false, "archived": false
}
```
- `accountIds` luôn có, ít nhất một phần tử (nhóm một bản: `[accountId]`).
- `GET /api/conversations/{memberId}` với mã của một bản không phải mã nhóm → `200` với `id` là mã của nhóm (không chuyển hướng HTTP).
- `participants` của `GET /api/conversations/{id}`: gộp mọi bản, mỗi địa chỉ một lần; mọi tài khoản của bạn có `self: true`.
- Các mã lỗi giữ nguyên.

## Backend design (phiên backend nhận; được sửa khi làm)

1. **Dữ liệu (~~V20~~ V19):** cột ~~`thread_group_id`~~ `grouped_with` + `thread_group_id` tự tính, hai index; gom dữ liệu đã có khi khởi động; `JdbcConversationStore` ~~ghi `thread_group_id = id` khi tạo và~~ gom sau khi lưu thư (chốt kỹ thuật).
2. **Danh sách và số đếm:** `ConversationSummaries`/`InboxService.page` trả một dòng cho mỗi nhóm trong phạm vi: bản chính theo D-181 (ví dụ `DISTINCT ON (thread_group_id)` theo thứ tự ưu tiên), các trường gộp theo D-182, `accountIds`; keyset theo `(lastMessageAt của nhóm, mã nhóm)`. `counts` đếm nhóm (D-187).
3. **Một chuỗi:** `detail`, `change` (`PATCH`), `requireInInbox` tìm nhóm từ mã bất kỳ, làm việc trên mọi bản trong phạm vi (D-183, D-185).
4. **Thư:** `MessageHistory` lấy thư của mọi bản, bỏ trùng theo D-184; cursor theo `(sent_at, id)` trên tập đã bỏ trùng; nội dung, tệp, xóa nhận thư của bất kỳ bản nào.
5. **Trả lời:** `Replies.of` và `ReplyService.send` dùng bản chính (D-186); sự kiện mang mã nhóm.

## Web

- `inbox.types.ts`: `ConversationItem.accountIds: string[]`.
- `inbox.api.ts`: ánh xạ `accountIds` (API cũ chưa có → `[accountId]`, D-56).
- `format.ts`: `rowAccount` (IN-10) thành `rowAccounts(item, accounts)`: các tài khoản của dòng theo `accountIds` khi nguồn có từ hai tài khoản, rỗng khi không; `threadSubtitle` ghi mọi địa chỉ.
- `ConversationList`: nhãn ghi mọi địa chỉ, cách nhau ", " (D-182).
- `EmailThread`: đầu chuỗi ghi mọi tài khoản; người gửi "Bạn · địa chỉ" khi `accountIds` có nhiều hơn một (D-184); `Composer` ghi "Gửi từ" ở mọi cỡ khi chuỗi có nhiều tài khoản (D-186).
- `InboxPage`: chuỗi mở bằng mã của một bản → thay đường dẫn bằng mã của nhóm (giữ bộ lọc), không thêm mục vào lịch sử trình duyệt (D-183).
- Dữ liệu mẫu và fixture MSW: thêm `accountIds`, một chuỗi gộp giữa hai tài khoản Gmail.

## Testing

**Backend:**
- Gom: hai tài khoản có thư chung → một nhóm; thư chung đến sau gộp hai nhóm có sẵn; bắc cầu ba bản; cùng tài khoản hai thread → không gộp; khác nhà cung cấp → không gộp; thư không có `rfcMessageId` → không gộp; gom dữ liệu đã có của migration.
- API: một dòng cho nhóm; `accountIds` đúng thứ tự; bản chính theo D-181 (gồm trường hợp ngang nhau); các trường gộp D-182; số đếm và lọc D-187; mã của bản khác → mã nhóm; `PATCH` đổi mọi bản; thư bỏ trùng và chọn bản theo D-184; trả lời từ bản chính; tài khoản đã xóa ra khỏi nhóm; sự kiện mang mã nhóm.

**Web (MSW theo Contract):** nhãn nhiều địa chỉ trên dòng (mọi cỡ), đầu chuỗi, "Bạn · địa chỉ", "Gửi từ" ở mọi cỡ khi gộp, chuyển mã của bản khác về mã nhóm, API cũ không có `accountIds`.

## Risks / Trade-offs

- **Danh sách theo nhóm chậm hơn:** truy vấn gộp theo nhóm cho mỗi trang. Với một chủ và vài nghìn cuộc trò chuyện thì chấp nhận được; nếu chậm, lưu tóm tắt theo nhóm.
- **Hai đồng bộ song song** của hai tài khoản cùng gộp: cần khóa theo chủ (chốt kỹ thuật), nếu không có thể còn hai nhóm.
- **Thư mới mở đầu chuỗi gửi từ Sino** chỉ gộp ở lượt đồng bộ sau (chưa có `rfcMessageId`); trong vài giây có thể thấy hai dòng.
- **Bản chính đổi** khi có thư mới ở bản khác: tài khoản trả lời đổi theo; ô trả lời ghi rõ "Gửi từ".
- **Thư tự gửi giữa hai tài khoản** có mọi người gửi là "Bạn": đúng, nhưng lạ; nhãn "Bạn · địa chỉ" cho biết địa chỉ nào.
- **Nhóm không bao giờ tách** (BE-80): A↔B, B↔C rồi xóa tài khoản B thì A và C vẫn chung nhóm dù không còn thư chung trong phạm vi. BE-81 quyết có hiện như vậy không. **→ D-188:** vẫn một dòng.
- **Gộp không phát sự kiện cho tài khoản kia** (BE-80): khi lưu thư của một tài khoản gộp nhóm với cuộc trò chuyện của tài khoản khác, sự kiện của lượt lưu chỉ nói về cuộc trò chuyện của tài khoản đang lưu. BE-81 phát `conversations.changed` theo mã của nhóm. **→ D-189:** sự kiện mang mã nhóm, đổi ở module `realtime`.
- **Gom lại mỗi lần khởi động** (BE-80): quét mọi thư có `Message-ID` của từng tài khoản, mỗi tài khoản một transaction ngắn; hộp thư rất lớn làm lần khởi động lâu hơn (đo ở BE-83).
- **V19 ghi lại toàn bảng `conversation`** (cột tự tính `STORED`, khóa `ACCESS EXCLUSIVE` trong lúc chạy): chấp nhận với một người dùng; PostgreSQL 18 không index được cột tự tính `VIRTUAL`.

## Migration Plan

~~V20 thêm cột (mặc định `id`), index, gom dữ liệu đã có.~~ V19 thêm `grouped_with` và `thread_group_id` tự tính, hai index; dữ liệu đã có được gom khi Sino khởi động (BE-80). Quay lại: web chạy được với API chưa có `accountIds` (coi là một bản); cột thừa không ảnh hưởng code cũ.

## Definition of Done

- [ ] D-180…D-187 làm đúng ở backend, có test; `./mvnw -B -ntp verify` xanh.
- [ ] Web: dòng, đầu chuỗi, người gửi, ô trả lời, chuyển mã; `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome ở các cỡ đụng tới.
- [ ] Chạy thật với hai tài khoản Gmail của người dùng: mỗi chuỗi "xin chào" / "hihi" một dòng ghi hai tài khoản; mở ra mỗi thư một lần; đọc / lưu trữ áp cho cả hai; trả lời đi từ tài khoản của bản chính.
- [ ] File kiến thức của phase (web, backend) có phần của change; `openspec validate f05b-merged-threads --strict`; archive.
