## Mode

**AUTO** (người dùng 2026-10-27, AUTO cho cả năm change *Hoàn thiện chat Zalo*; `project-mode.yaml` `task_overrides.zalo-nicknames`). Đội Sino: quản lý (phiên `sino-16`, người dùng chọn 2026-11-01) giao việc, kỹ sư `sino-zalo`, `sino-api`, `sino-web` làm phần app của mình (`CLAUDE.md`, *Đội Sino*). Người dùng duyệt đề án này trước khi giao việc, và nghiệm thu từng task trước khi commit.

## Context

- **zca-js 2.2.0** có `changeFriendAlias(alias, friendId)`, `removeFriendAlias(friendId)`, `getAliasList(count?, page?)` → `{ items: { userId, alias }[], updateTime }`. Listener **không có** sự kiện khi tên gợi nhớ đổi, nên chiều Zalo → Sino phải hỏi định kỳ.
- `sino-zalo` (`sessions/Conversations.ts`, `ZcaGateway.userInfo`) đặt tên chat 1-1 bằng `displayName || zaloName` của `getUserInfo`, tra lại mỗi giờ. Chưa biết `displayName` của bạn bè đã là tên gợi nhớ hay chưa (D-419).
- `sino-api` lưu tên đó vào `conversation.title`. `JdbcConversationStore` chỉ đổi `title` khi trang tin có thư mới hơn, nên đổi tên mà không có tin mới thì không về. `external_conversation_id` của chat 1-1 Zalo là ID của người kia.
- `PATCH /api/conversations/{id}` hôm nay nhận `read`, `archived` và không bao giờ gửi xuống nhà cung cấp (D-67).
- `MessageProvider` có mẫu facet tùy chọn (`Optional<QrLogin> qrLogin()`, `Optional<OAuth2Connection> oauth2()`). Thay đổi cuộc trò chuyện phát `ConversationChanged`, `RealtimeEvents` đẩy xuống web.
- Canvas "Sino UI" chưa có chỗ đặt biệt danh.

## Goals / Non-Goals

**Goals:** đặt, sửa, xóa biệt danh của bạn bè chat 1-1 từ Sino, và thấy biệt danh đặt trên Zalo trong vòng 5 phút; tên gốc Zalo vẫn còn, xóa biệt danh là tên gốc hiện lại ngay.

**Non-Goals:** xem `proposal.md`.

## Decisions

### DN-1 — Chỗ đặt biệt danh · **người dùng chốt** (2026-11-01, brainstorm)
Bấm tên ở đầu khung chat 1-1 (desktop và đầu trang chat ở điện thoại) mở hộp "Đặt biệt danh". Không qua khung Thông tin (khung này chỉ hiện từ xl).

### DN-2 — Cột riêng, Zalo đồng ý mới lưu, hỏi định kỳ · **người dùng chốt** (2026-11-01, brainstorm)
`conversation.nickname` tách khỏi `title`; tên hiện là `nickname ?? title`. Không ghi đè vào `title`.
**Phương án bị loại:** ghi biệt danh vào `title` (không migration) — `title` chỉ đổi khi có tin mới hơn, và xóa biệt danh thì mất tên gốc.

### D-414 — Hình dạng biệt danh · agent chốt
Chuỗi đã cắt khoảng trắng hai đầu, bỏ ký tự điều khiển; chuỗi rỗng hay `null` nghĩa là xóa. Độ dài tối đa: theo giới hạn thật của Zalo, NK-01 đọc mã zca-js và thử trên nick phụ; chưa biết thì tạm **50** ký tự (code point) và ghi lại ở NK-01. `sino-api` kiểm cùng giới hạn, sai thì `400`.

### D-415 — Hợp đồng `sino-api` → `sino-zalo` · agent chốt
```text
PUT    /accounts/:accountId/aliases/:friendId   { "alias": "…" }   → 204
DELETE /accounts/:accountId/aliases/:friendId                      → 204
GET    /accounts/:accountId/aliases                                → 200 { "items": [ { "friendId", "alias" } ] }
```
`GET` lật hết các trang của `getAliasList` (cỡ trang lớn nhất zca-js cho), nhớ kết quả 60 giây theo tài khoản (hai lần hỏi sát nhau không gọi Zalo hai lần); `PUT`/`DELETE` xóa bộ nhớ đó. Lỗi: không có phiên → `409` như các route hiện có; Zalo từ chối (không phải bạn bè, tên không hợp lệ) → `422 { "code": "ALIAS_REJECTED" }`; Zalo lỗi khác hay quá giờ → `502`. Xác thực bằng khóa dùng chung như các route khác. Log chỉ ID, không có tên gợi nhớ.

### D-416 — API của `sino-api` · agent chốt
- `ConversationResponse` (danh sách và đầu chi tiết) có thêm `nickname: string | null`; `title` giữ là tên Zalo.
- `PATCH /api/conversations/{id}` nhận thêm `nickname` (`string`; `""` hay `null` tường minh là xóa). `UpdateConversationRequest` phân biệt "không gửi" với "gửi `null`" (một cờ `nicknameGiven`, hay đọc bằng `JsonNullable`; kỹ sư chọn, ghi D-xx). Chỉ đổi biệt danh mà không có `read`/`archived` vẫn hợp lệ.
- Luồng: cuộc trò chuyện của chủ tài khoản, loại chat 1-1, nhà cung cấp có `NICKNAMES` → gọi `nicknames().set(context, externalId, nickname)` → thành công thì ghi cột, phát `ConversationChanged`, trả cuộc trò chuyện mới.
- Lỗi: nhóm hay thư → `422 NICKNAME_NOT_SUPPORTED`; Zalo từ chối → `422 NICKNAME_REJECTED`; không gọi được Zalo → `502` theo mã lỗi nhà cung cấp hiện có. Cột không đổi khi lỗi. Biệt danh được gửi đi trong cùng request (như gửi tin, D-131), không qua hàng đợi.
- D-67 ("PATCH không gửi xuống nhà cung cấp") giữ cho `read`/`archived`; `nickname` là ngoại lệ có ghi lại.

### D-417 — Facet `Nicknames` của nhà cung cấp · agent chốt
`ProviderCapability.NICKNAMES` và `default Optional<Nicknames> nicknames()` trên `MessageProvider`, theo mẫu `qrLogin()`. `Nicknames`: `void set(ProviderContext, String friendId, @Nullable String nickname)` và `Map<String, String> list(ProviderContext)`. Bản Zalo gọi D-415; Gmail không có.

### D-418 — Đồng bộ từ Zalo mỗi 5 phút · agent chốt
Việc định kỳ (`@Scheduled`, `sino.sync.nicknames.interval`, mặc định `PT5M`) cho mỗi tài khoản đang kết nối có `NICKNAMES`: gọi `list`, rồi với mọi chat 1-1 của tài khoản: có trong danh sách → ghi biệt danh; không có → `null`. Chỉ ghi dòng khác (`IS DISTINCT FROM`), rồi một `ConversationChanged` cho các dòng đã đổi. **Zalo là bản gốc**: hai bên cùng đổi thì lần hỏi sau theo Zalo. Lỗi một tài khoản: log cảnh báo (không tên), bỏ qua tới lần sau, không đổi cột. Một biệt danh của người chưa có chat trong Sino thì bỏ qua.

### D-419 — Tên gốc Zalo không lẫn biệt danh · agent chốt
NK-01 kiểm (đọc mã zca-js, thử trên nick phụ) xem `getUserInfo().displayName` của một người bạn có đổi theo tên gợi nhớ không. Có thì `sino-zalo` đặt `title` chat 1-1 bằng `zaloName` (tên người đó tự đặt), để `title` luôn là tên gốc và dòng "Tên Zalo: …" đúng. Không thì giữ như hôm nay. Kết quả ghi ở NK-01.

### D-420 — Hiển thị trên web · agent chốt
Một hàm dùng chung `displayName(conversation) = nickname ?? title`, dùng ở hàng danh sách, đầu khung chat (`ConversationAvatars`/đầu trang chat ở điện thoại), mục Thành viên (người kia của chat 1-1). Tên chỉ bấm được ở chat 1-1 Zalo khi `capabilities` có `NICKNAMES` (hoặc cờ tương đương trong phản hồi; kỹ sư web dùng cái đang có cho reaction). Hộp: ô nhập điền sẵn biệt danh, giới hạn theo D-414, Lưu (tắt khi không đổi), "Xóa biệt danh" (chỉ khi đang có), dòng "Tên Zalo: <title>". Lưu thì gọi `PATCH`, chờ trả về rồi đóng (không optimistic: Zalo có thể từ chối); lỗi thì hiện trong hộp, giữ chữ đã gõ. Sau đó danh sách và đầu chat dùng dữ liệu trả về; sự kiện `ConversationChanged` làm mới như hôm nay. Hình dạng hộp theo frame canvas NK-03.

## Risks / Trade-offs

- [Zalo đổi tên gợi nhớ trên điện thoại, Sino thấy muộn tới 5 phút] → chấp nhận; listener không báo. Hỏi dày hơn thì thêm tải lên Zalo cho một tính năng ít đổi.
- [Tài khoản nhiều bạn, `getAliasList` nhiều trang] → lật hết trong một lần hỏi, nhớ 60 giây; NK-01 ghi cỡ trang lớn nhất và giới hạn nếu có.
- [Gửi `changeFriendAlias` với người không phải bạn bè] → Zalo trả lỗi, `422`, web hiện "Zalo không cho đặt biệt danh cho người này"; NK-01 ghi mã lỗi thật Zalo trả.
- [`displayName` đã là tên gợi nhớ] → D-419.
- [Hai tab Sino cùng sửa] → lần ghi sau thắng, như Zalo.

## Contract tóm tắt

```text
sino-zalo  PUT|DELETE /accounts/:id/aliases/:friendId, GET /accounts/:id/aliases               (D-415)
sino-api   V24 conversation.nickname; NICKNAMES + Optional<Nicknames> nicknames()             (D-417)
sino-api   PATCH /api/conversations/{id} { nickname }; GET … items[].nickname                  (D-416)
sino-api   every PT5M: list → conversation.nickname → ConversationChanged                      (D-418)
sino-web   displayName = nickname ?? title; hộp "Đặt biệt danh" ở đầu khung chat 1-1            (D-420)
```
