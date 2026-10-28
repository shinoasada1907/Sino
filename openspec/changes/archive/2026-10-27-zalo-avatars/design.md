## Mode

**AUTO** (người dùng 2026-10-27, "AUTO: đội tự code"; `project-mode.yaml` `task_overrides.zalo-avatars`). Đội Sino: quản lý giao việc, kỹ sư `sino-zalo`, `sino-api`, `sino-web` làm phần app của mình (`CLAUDE.md`, *Đội Sino*). Người dùng duyệt đề án này (DN-1 trong đó) trước khi giao việc, và nghiệm thu từng task trước khi commit.

## Context

- `sino-zalo` (`sessions/Conversations.ts`) đặt tên và ảnh cho cuộc trò chuyện của một trang tin, mỗi cuộc trò chuyện một lần tra Zalo mỗi giờ: chat 1-1 dùng `getUserInfo(threadId)` (`profile.avatar`), nhóm dùng `getGroupInfo(groupId)` (`fullAvt` hay `avt`). `participants` chỉ có `{ id, name }` lấy từ người gửi.
- `sino-api` nhận `Conversation(threadId, threadType, title, avatarUrl, participants)` (`ZaloClient.java`), lưu `conversation.avatar_url` (V6) và `conversation_participant.avatar_url` (V7) với `COALESCE` (ảnh không mất khi trang sau không có). `NormalizedParticipant` có `avatarUrl` nhưng bộ chuyển Zalo luôn để `null`.
- `ConversationResponse` (danh sách và đầu chi tiết) không có ảnh. Chi tiết có `participants[].avatarUrl` (luôn `null` với Zalo hôm nay).
- Web: `Avatar` (`shared/ui/avatar.tsx`) chỉ có vòng màu thay thế `.av-a…d`, "shown until there is a picture". `inbox.api.ts` đã khai `ParticipantResponse.avatarUrl` nhưng không đưa vào hợp đồng `Member`.
- Ảnh trong tin (`PhotoPicture`) tải thẳng từ CDN của Zalo với `referrerPolicy="no-referrer"`.

## Goals / Non-Goals

**Goals:** ảnh thật ở mọi chỗ canvas vẽ `.avatar` cho chat Zalo (đầu khung chat, cạnh tin của người khác trong nhóm, mục Thành viên; hàng danh sách không có `.avatar`, DN-2); không chậm, không vỡ khi Zalo không trả ảnh.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-408 — Ảnh tải thẳng từ Zalo, không qua Sino · agent chốt
Như ảnh trong tin: `<img src>` là địa chỉ CDN của Zalo, `referrerPolicy="no-referrer"`. Không proxy, không lưu bytes.
**Phương án bị loại:** proxy qua `sino-api` (thêm tải, thêm cache, mà ảnh trong tin đã đi thẳng). Đổi lại: CDN của Zalo thấy IP của trình duyệt, như với ảnh trong tin hôm nay.

### D-409 — Lấy ảnh người gửi trong `sino-zalo` · agent chốt
- Chat 1-1: người kia (`id = threadId`) lấy `avatarUrl` của cuộc trò chuyện, đã tra sẵn; không gọi thêm.
- Nhóm: người gửi chưa có trong bộ nhớ ảnh → **một** lời gọi `getUserInfo([ids])` cho cả trang tin, chạy song song với lần tra thông tin nhóm và cùng giới hạn thời gian (`infoTimeoutMs`). Nhớ ảnh mỗi người 24 giờ, theo tài khoản (cả kết quả `null`, để người không có ảnh không bị tra lại mỗi trang).
- Chính mình: `null` (web không vẽ ảnh cạnh tin của mình).
- Lỗi hay quá giờ: `avatarUrl: null`, log cảnh báo không kèm tên hay địa chỉ; tin vẫn đi đúng như hôm nay.

### D-410 — Hợp đồng `sino-zalo` → `sino-api` · agent chốt
Mỗi phần tử của `participants` thành `{ id, name, avatarUrl: string | null }`. `sino-api` đọc bằng `@JsonIgnoreProperties(ignoreUnknown = true)` nên hai phía đổi theo thứ tự nào cũng được.

### D-411 — `avatarUrl` của cuộc trò chuyện trong API · agent chốt
`ConversationResponse` (cả `GET /api/conversations` lẫn đầu `GET /api/conversations/{id}`) có thêm `avatarUrl: string | null`: `conversation.avatar_url` với chat (nhóm: ảnh nhóm; 1-1: ảnh người kia), `null` với thư. `participants[].avatarUrl` của chi tiết giữ nguyên tên, nay có giá trị với Zalo. Không migration.

### D-412 — `Avatar` vẽ ảnh · agent chốt
`Avatar` nhận `src?: string | null`. Có `src`: vòng thay thế nằm dưới, `<img>` phủ kín vòng tròn (`object-cover`), `alt=""` (ảnh trang trí, như hôm nay), `referrerPolicy="no-referrer"`, `loading="lazy"`, `decoding="async"`; ảnh lỗi thì gỡ `<img>`, còn vòng thay thế. Không `src` thì như hôm nay. Hợp đồng web: `ConversationItem.avatarUrl` và `Member.avatarUrl` (`string | null`), map trong `inbox.api.ts`.
Chỗ vẽ: ~~danh sách cuộc trò chuyện và~~ đầu khung chat (`ConversationAvatars`; đầu trang chat ở điện thoại) (**LÝ DO:** DN-2 = A, hàng danh sách giữ ô nhà cung cấp của canvas), ảnh cạnh tin của người khác trong nhóm (`ChatThread`, tìm người gửi trong `members` như vòng thay thế hôm nay), mục Thành viên (`ConversationInfo`).

### DN-1 — Ảnh của nhóm · **người dùng chốt A** (2026-10-27, "DN-1 = A", cùng lúc duyệt đề án)
Canvas vẽ nhóm bằng `.av-stack`: chồng tối đa 3 vòng của thành viên. Zalo có ảnh riêng của nhóm (`fullAvt`) khi nhóm đặt ảnh.
- **A (đề xuất):** nhóm có ảnh riêng thì hiện một vòng với ảnh đó; nhóm không có ảnh thì chồng 3 ảnh thành viên như canvas. Người dùng nhận ra nhóm như trên Zalo. Khác canvas ở nhóm có ảnh; ghi vào canvas cùng đợt vẽ của `zalo-mentions`.
- ~~**B:** luôn chồng 3 ảnh thành viên, đúng canvas; bỏ ảnh riêng của nhóm.~~ Không chọn.

### D-413 — Ảnh đại diện chỉ nhận https · quản lý chốt (2026-10-28)
Web đưa `avatarUrl` qua `pictureOf` như ảnh trong tin: chỉ `https:` không có user/password, còn lại là `null` và hiện vòng thay thế. Kỹ sư `sino-zalo` và `sino-api` cùng nêu là địa chỉ không được lọc; lọc ở web giữ một luật cho mọi ảnh của Zalo.

### DN-2 — Ảnh ở hàng danh sách cuộc trò chuyện · **người dùng chốt A** (2026-10-28, "DN-2 = A: hàng danh sách giữ như canvas")
D-412 ghi "danh sách cuộc trò chuyện", nhưng canvas (`Messages`, `MobileMessages`, `TabletMessages`) vẽ đầu mỗi hàng bằng ô biểu tượng nhà cung cấp (`.pmark`), không có vòng ảnh; kỹ sư AV-03 dừng ở đây và hỏi (đúng luật). Lỗi viết của quản lý.
- **A (đề xuất):** hàng giữ như canvas; ảnh ở đầu khung chat, cạnh tin, mục Thành viên. Change xong ngay.
- ~~**B:** hàng có vòng ảnh, dấu nhà cung cấp nhỏ ở góc (như `AccountAvatar`). Quản lý vẽ lại canvas trước, người dùng duyệt, rồi mới giao.~~ Không chọn.

## Risks / Trade-offs

- [Địa chỉ ảnh của Zalo hết hạn hay đổi khi người ta đổi ảnh] → ảnh lỗi thì còn vòng thay thế; thông tin cuộc trò chuyện tra lại mỗi giờ và ảnh người gửi mỗi 24 giờ nên tự cập nhật.
- [`getUserInfo` với nhiều ID trả khóa dạng `<id>_0` (đã gặp ở chat 1-1)] → `sino-zalo` đọc cả hai khóa như `userInfo` hôm nay; ZA-01 kiểm bằng test với gateway giả, lượt thật ở AV-20.
- [Nhóm đông, nhiều người gửi mới trong một trang] → một lời gọi cho cả trang, nhớ 24 giờ; nếu Zalo giới hạn số ID mỗi lần, chia lô (ZA-01 đọc mã zca-js).

## Contract tóm tắt

```text
sino-zalo  GET /accounts/:id/messages   conversations[].participants[] = { id, name, avatarUrl|null }   (D-410)
sino-api   GET /api/conversations        items[].avatarUrl                                              (D-411)
sino-api   GET /api/conversations/{id}   avatarUrl, participants[].avatarUrl                            (D-411)
sino-web   ConversationItem.avatarUrl, Member.avatarUrl  ->  <Avatar src>                               (D-412)
```
