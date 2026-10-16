# Mở rộng F05 — Tách "Tin nhắn" và "Hộp thư" · Implementation Plan

> **AUTO mode** (người dùng, 2026-10-16: "Đây là sửa Hộp thư, chạy AUTO"). Agent làm từng task đủ quy trình, commit riêng trên `dev`, rồi báo và dừng. D-300…D-308 người dùng duyệt; D-309 agent chốt.
> Thứ tự: canvas (mục 1) trước phần web (mục 3); backend (mục 2) không chờ canvas nhưng chờ BE-82 của `f05b-merged-threads`; FE-114 sau BE-111.

## 1. Canvas

- [x] 1.1 **CV-01 — Vẽ lại canvas "Sino UI" (D-302)**
  - **Goal:** canvas có hai mục Tin nhắn, Hộp thư và các màn của Tin nhắn trước khi code web.
  - **Thực hiện:** đọc bản mới nhất của https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB, sửa các frame trong bảng "Canvas" của `design.md` (bản tối và sáng), thêm `Messages`, `TabletMessages`, `MobileMessages`, publish lên cùng link (artifact giữ phiên bản cũ).
  - **Acceptance criteria:** người dùng duyệt trên link; chữ, icon, vị trí trong canvas khớp D-300…D-305 (chỗ canvas chốt khác spec thì sửa spec và ghi **LÝ DO** ở đây).
  - **Depends on:** —
  - **Duyệt (2026-10-16):** người dùng: "Duyệt canvas, kể cả hai cuộc chat mẫu mới."
  - **Đã vẽ (2026-10-16):** publish phiên bản `1792119157-a180` ("Tách Tin nhắn và Hộp thư (CV-01)"), sửa từ bản `1790948862-287a` (bản repo đang khớp).
    - Mục "Tin nhắn" trong `Sidebar`, `Rail`, `TabBar` (icon hai bong bóng, `MessagesSquare`; số 5, Hộp thư 7); tab bar mất Lịch, `TabBar` coi `active="calendar"` là "Thêm"; `MobileMore` có Lịch ở đầu.
    - Mới: `Messages`, `TabletMessages`, `MobileMessages`, `MessagesState` (`InboxState` với `screen="messages"`) và bản Light của từng frame; hai cuộc chat mẫu mới "Hà", "Nhóm sửa nhà".
    - `Inbox`, `TabletInbox`, `MobileInbox`, trạng thái của `InboxState` chỉ còn Gmail; `Conversation`, `MobileConversation`, trạng thái "Cần kết nối lại" của `ThreadState` quay về Tin nhắn; ba frame Tổng quan có hai nút, thẻ mobile đổi tên thành "Hộp thư hợp nhất"; thẻ nguồn Zalo trong `Calendar` dẫn tới Tin nhắn.
    - `ConnectWizardStep5` không đổi: canvas vẽ luồng Gmail, nút "Mở hộp thư" vẫn đúng.
    - `canvas.json`: 8 frame mới; Tin nhắn đứng sau Tổng quan nên các frame sau nó ở trang Desktop và Responsive dời sang phải.

- [x] 1.2 **CV-02 — Bản sao trong repo khớp link**
  - **Files:** `design/sino-ui/project/` (các frame đã đổi, frame mới, `canvas.json`).
  - **Acceptance criteria:** từng frame đã đổi trong repo giống bản đã duyệt; `PROJECT_STATE.md` ghi mã phiên bản đã khớp.
  - **Depends on:** CV-01
  - **Bằng chứng (2026-10-16):** link vẫn ở `1792119157-a180` (danh sách file của artifact); chép 24 file (15 frame đã sửa, 8 frame mới, `canvas.json`); kích thước từng file bằng danh sách của link; SHA-256 của `canvas.json`, `Inbox`, `Messages`, `InboxState` bằng mã link trả về; `cmp` bản chép với bản đã publish không lệch byte nào; thư mục có 185 file như link (183 frame, `canvas.json`, `sino.css`). `PROJECT_STATE.md` ghi phiên bản đã khớp.

## 2. Backend

> Mỗi task: test đỏ trước rồi xanh, `./mvnw -B -ntp verify` xanh trong worktree riêng (người dùng chạy backend từ IntelliJ), file kiến thức `docs/knowledge/phase-2-one-provider.md` + `.docx`, commit riêng trên `dev`.

- [ ] 2.1 **BE-110 — Provider khai loại (D-306)**
  - **Goal:** mỗi connector nói mình là email hay chat; web đọc được trên `/api/providers`.
  - **Files:** `provider/ProviderKind.java` (mới), `provider/spi/MessageProvider.java`, `provider/ProviderDescriptor.java`, `provider/application/DefaultProviderRegistry.java`, `provider/api/ProviderResponse.java`, `provider/infrastructure/gmail/GmailProvider.java`, các provider giả trong `src/test`.
  - **Acceptance criteria:** spec `provider-contract` *Connector khai báo loại*; `provider-registry` *Mô tả provider cho bên dùng*; `provider-catalog-api` *Loại của provider trên REST*.
  - **Test:** descriptor mang loại của connector giả `EMAIL` và `CHAT`; `GET /api/providers` có `kind`; Gmail là `EMAIL`.
  - **Depends on:** —

- [ ] 2.2 **BE-111 — API theo loại (D-307, D-308)**
  - **Goal:** danh sách và số đếm lọc được theo loại; điều hướng có số của từng loại; `kind` của dòng theo provider.
  - **Files:** `conversation/api/ConversationsController.java`, `conversation/api/CountsResponse.java`, `conversation/api/ConversationResponse.java`, `conversation/application/InboxService.java`, `conversation/application/InboxItem.java`, helper loại mới trong `conversation/application`, `apps/sino-api/README.md`.
  - **Acceptance criteria:** spec `inbox-api` *Lọc danh sách theo loại*, *Số đếm theo loại*, *Loại của provider không có connector*, *Nội dung một conversation trong danh sách*; `provider-registry` *Connector có công tắc tắt vẫn ở trong registry* (ghi chú cho ZL-06/ZL-10, Gmail không thuộc trường hợp này).
  - **Test:** design mục Testing (Backend); kiểm bằng lỗi gài cho lọc theo loại và `unreadByKind`.
  - **Depends on:** BE-110; BE-82 của `f05b-merged-threads` đã vào `dev` (cùng sửa `InboxService`)

## 3. Web

> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; đối chiếu canvas; Chrome một lượt ở các cỡ task đụng tới; file kiến thức `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`, `genoffice docs check`; commit riêng trên `dev`. Làm theo hợp đồng trong `design.md`, test bằng MSW.

- [x] 3.1 **FE-110 — Hợp đồng dữ liệu theo loại**
  - **Goal:** web biết loại của provider và số chưa đọc của từng loại.
  - **Files:** `shared/domain` (`ProviderInfo.kind`), `features/inbox/inbox.api.ts`, `inbox.types.ts`, `inbox.sample.ts`, ~~`useInbox.ts` (query key có `kind`)~~, handler MSW.
  - **Acceptance criteria:** request có `kind=email`/`kind=chat`; provider thiếu `kind` tính là `EMAIL`; counts thiếu `unreadByKind` theo spec `web-app-shell` *Tin nhắn và Hộp thư trên điều hướng*.
  - **Test:** ánh xạ API (có và không có trường mới); MSW lọc theo `kind`; dữ liệu mẫu tách chat và email.
  - **Depends on:** CV-02
  - **Đã làm (2026-10-16, AUTO):**
    - `shared/domain`: `ProviderKind`, `ProviderInfo.kind` bắt buộc; `shared/api/providers.ts`: `toProviderInfo` (thiếu `kind` → `EMAIL`, D-308), dùng ở `inbox.api`, `accounts.api` (cả `fetchConnectProviders`), `tasks.api`.
    - `inbox.types`: `ConversationKind = ProviderKind`, `InboxCounts.unreadByKind` (null khi backend chưa có), `UnreadByKind` cho điều hướng.
    - `inbox.api`: `fetchInbox(kind?)` → `counts?kind=`, `fetchConversations(filter, cursor, kind?)` → `kind=` sau `view`, `fetchUnreadByKind()` (thiếu `unreadByKind` → `{ EMAIL: unread, CHAT: null }`); `useInbox` gọi `() => fetchInbox()` (TanStack truyền ngữ cảnh vào `queryFn`).
    - `conversationChange.countsAfter` cập nhật cả `unreadByKind` theo `kind` của dòng.
    - Dữ liệu mẫu: provider có `kind` (Gmail `EMAIL`, Zalo, Messenger, Telegram `CHAT`; "Google" của Đăng ký `EMAIL` theo D-308), `unreadByKind` = `{ EMAIL: 7, CHAT: 5 }` như canvas; fixture API (`API_PROVIDERS`, `API_COUNTS`) theo hợp đồng mới; `test/inboxSampleApi` lọc theo `kind` và có `fetchUnreadByKind`.
  - **Làm khác kế hoạch:**
    - ~~Query key có `kind` ở FE-110~~ → FE-112. **LÝ DO:** cache Hộp thư được sửa thẳng bằng khóa `INBOX_QUERY_KEY` (đặt số đếm sau khi đọc, đọc lại `exact: true`); đổi khóa mà màn chưa truyền `kind` thì không màn nào kiểm được các chỗ đó. FE-112 đổi khóa cùng lúc với hai màn.
    - Hai cuộc chat mẫu mới của canvas ("Hà", "Nhóm sửa nhà") để FE-112. **LÝ DO:** hôm nay `/inbox` còn hiện cả chat; thêm dòng bây giờ làm đổi các test danh sách gộp rồi phải sửa lại lần nữa khi tách màn. Số `unreadByKind` của mẫu đã khớp canvas mà không cần hai dòng đó.
    - Không có handler MSW chung cho Hộp thư: mỗi test tự khai handler; phần "MSW lọc theo `kind`" là test hỏi đúng `?kind=` và API mẫu `test/inboxSampleApi` lọc theo `kind`.
  - **Bằng chứng (2026-10-16):** đỏ trước: 9 test (`inbox.api.test` 7, `inbox.sample.test` 2) đúng lý do (thiếu `kind`, thiếu `?kind=`, `fetchUnreadByKind is not a function`), rồi 1 test `countsAfter` đỏ (`{ EMAIL: 3, CHAT: 2 }` thay vì `{ EMAIL: 2, … }`); xanh 36/36 ở ba file. `tsc -b` chỉ ra 28 chỗ dựng provider thiếu `kind` (API, mẫu, test), sửa hết; 3 test API của Tài khoản và Việc đổi mong đợi thêm `kind: 'EMAIL'`. Toàn bộ: `pnpm lint` 0; `pnpm test` 658/665, 7 đỏ đều ở `features/notes` và đỏ y như vậy trên `dev` khi cất tạm thay đổi của task (`git stash`); `tsc -b` chỉ còn 2 lỗi ở `features/notes/notes.sample.ts`, cũng có sẵn trên `dev` (WIP `b23f5b3` của `fe-ui-diagram-notes`, ghi "chưa chạy tsc"), nên `pnpm build` dừng ở `tsc`; `vite build` riêng xanh. Không chạy Chrome: task không đổi màn nào. File kiến thức phase 1 mục 22.0–22.4 + câu 135–137, `.docx` sinh lại, `genoffice docs check` không lỗi.

- [x] 3.2 **FE-111 — Điều hướng Tin nhắn và Hộp thư (D-300, D-301)**
  - **Files:** `app/shell/navItems.ts`, `shell.types.ts`, `shell.sample.ts`, `AppShell.tsx`, `MorePage.tsx`, test của shell.
  - **Acceptance criteria:** spec `web-app-shell` *Điều hướng chính*, *Tab Thêm trên mobile*, *Tin nhắn và Hộp thư trên điều hướng*; `inbox-live` *Số Hộp thư trên điều hướng*.
  - **Test:** thứ tự mục, số theo loại, tab bar năm ô, "Thêm" sáng ở `/calendar`, Lịch trong trang Thêm, tên đọc được của mục chỉ có icon.
  - **Depends on:** FE-110
  - **Đã làm (2026-10-16, AUTO):**
    - `navItems`: mục "Tin nhắn" (`/messages`, `MessagesSquare`, số `messagesUnread`) giữa Tổng quan và Hộp thư ở thanh bên và rail; tab bar Tổng quan · Tin nhắn · Hộp thư · Việc · Thêm; `MORE_PATHS` có `/calendar`; `badgeOf` coi số `null` như 0 (không hiện).
    - `NavCounts.messagesUnread: number | null`; mẫu shell 5 / 7 như canvas.
    - `useUnreadByKind` thay `useInboxUnread`, cùng khóa `INBOX_UNREAD_QUERY_KEY` nên realtime vẫn làm mới số; `AppShell` lấy `CHAT` cho Tin nhắn, `EMAIL` cho Hộp thư. `fetchUnreadCount` bỏ (không còn ai gọi); `unreadByKindOf` là quy tắc dùng chung của `fetchUnreadByKind`, `renderApp` và API mẫu.
    - `MorePage`: Lịch đầu tiên trong "Đi tới".
    - `/messages` hiện trang "đang dựng" (D-42) cho tới FE-112.
    - Hai test cũ đổi mong đợi theo spec mới: `UserMenu.test` (trang Thêm có `/calendar` đầu tiên), `overview.sample.test` (thẻ "Hộp thư hợp nhất" = Tin nhắn + Hộp thư).
  - **Bằng chứng (2026-10-16):** đỏ trước 14 test đúng lý do (không có link "Tin nhắn", số Hộp thư vẫn 12, tab bar còn Lịch, `unreadByKindOf is not a function`, "Thêm" không sáng ở `/calendar`); xanh 32/32 ở `AppShell.test`, `MobileSubPage.test`, `inbox.sample.test`. Trên `dev` sau DG-01 (`f55a8bc`) cộng task này: `pnpm lint` 0; `pnpm build` 0 (`tsc -b` 0); `pnpm test` lần 1 có 1 test của `NotesPage.test` đỏ, chạy riêng file đó 8/8 xanh, chạy lại toàn bộ 674/674 (77 file) xanh, nên đó là test chậm khi máy tải nặng, không do task. Chrome (trình duyệt tích hợp) với backend thật: jar của worktree tạm ở cổng 8091, PostgreSQL 18 tạm trong Docker, Vite 5174 trỏ vào 8091, tài khoản thử tạo cho lượt này; 1440: chỉ thanh bên hiện, Tổng quan → Tin nhắn (`messages-square`) → Hộp thư, `/messages` hiện "Màn Tin nhắn đang được dựng" và Tin nhắn sáng; 1024: chỉ rail, ô 44 px, cùng thứ tự; 375: chỉ tab bar, 5 tab mỗi tab 72 px, chữ không tràn, trang không cuộn ngang, `/more` có Lịch đầu tiên, `/calendar` làm "Thêm" sáng. Backend chưa có `unreadByKind` (BE-111) và database trống, nên hai mục không hiện số: đúng đường "backend chưa đếm theo loại"; số theo loại kiểm bằng test. Console chỉ có 401 của `/api/auth/me` trước khi đăng nhập. Dọn xong: dừng backend và Vite, xóa container, worktree, file cấu hình Vite tạm và tài khoản thử. File kiến thức phase 1 mục 22.5 + câu 140–142, `.docx` sinh lại, `genoffice docs check` không lỗi.

- [ ] 3.3 **FE-112 — Hai màn, routes, tự chuyển (D-303, D-304)**
  - **Files:** `app/router.tsx`, `features/inbox/InboxPage.tsx` (cấu hình màn theo loại), `useInboxFilter.ts`, `components/ConversationList.tsx`, `ChatThread.tsx`, `EmailThread.tsx`, `NewMail.tsx`, `SourcePane.tsx`, `useNewMailNotice.ts`, `useInbox.ts`.
  - **Acceptance criteria:** spec `messages-screen` *Màn Tin nhắn*, *Hội thoại chat ở Tin nhắn*, *Hai màn dùng chung hành vi của một cuộc trò chuyện*, *Chuyển tới màn đúng loại*; `inbox-screen` *Danh sách hợp nhất*, *Dòng ghi tài khoản khi một nguồn có nhiều tài khoản*, *Lọc hộp thư*, *Danh sách trên API Hộp thư (F05)*; `inbox-live` *Hàng mới và dòng báo*.
  - **Test:** design mục Testing (Web): hai màn, tự chuyển hai chiều bằng `replace`, nguồn theo loại, không có Thư mới ở Tin nhắn, dòng báo đúng màn, link quay lại.
  - **Depends on:** FE-111

- [ ] 3.4 **FE-113 — Trạng thái trống, hộp thoại kết nối, Tổng quan (D-305)**
  - **Files:** `features/inbox/components/InboxStates.tsx`, `features/accounts/components/ConnectWizard.tsx`, `features/overview/cards/InboxCard.tsx`.
  - **Acceptance criteria:** spec `messages-screen` *Trạng thái trống của Tin nhắn*; `inbox-screen` *Trạng thái hộp thư*; `connect-wizard` *Kết quả quay về*; `overview-screen` *Các thẻ của màn Tổng quan*, *Nút trên màn Tổng quan*.
  - **Test:** trạng thái trống có và không có provider chat trong danh mục; nút bước 5 theo loại; hai nút ở Tổng quan; kiểm bằng lỗi gài cho hàm thuần của change (chọn màn theo loại, lọc nguồn theo loại).
  - **Depends on:** FE-112

- [ ] 3.5 **FE-114 — Chạy với backend thật**
  - **Test:** backend từ `dev` có BE-111: thư Gmail thật ở Hộp thư, số "Hộp thư" khớp `unreadByKind.EMAIL`, Tin nhắn hiện trạng thái trống; mở một link cũ `/inbox/<id>` từ Việc vẫn đúng; Chrome 1440 / 1024 / 390.
  - **Depends on:** BE-111, FE-113

## 4. Ghi chú sang change khác

- [x] 4.1 **`zalo-personal`:** thêm vào ZL-06 "khai `kind()` = `CHAT` (D-306)" và vào ZL-11 "nút cuối là 'Mở Tin nhắn' (D-305)". Làm sau khi phiên ZL-05 commit, vì phiên đó đang sửa `zalo-personal/tasks.md`.
  - **Đã làm (2026-10-16, sau commit ZL-05 `98be86e`):** ghi chú ở ZL-06 (`kind()` = `CHAT`, thứ tự với BE-110), ZL-08 (tin Zalo hiện ở Tin nhắn) và ZL-11 (nút "Mở Tin nhắn").
- [x] 4.2 **`f10-new-mail`:** BE-84 kiểm tài khoản gửi có provider `EMAIL`, không thì `422` (D-307).
  - **Đã làm (2026-10-16):** ghi chú vào BE-84 trong `openspec/changes/f10-new-mail/tasks.md`, cùng commit với hồ sơ này.

## 5. Nghiệm thu

- [ ] 5.1 **ACC — Nghiệm thu, tài liệu**
  - **Test:** Definition of Done của `design.md`; Chrome đủ cỡ (1440, 1280, 1024, 768, 390) × 2 theme cho Tin nhắn, Hộp thư, điều hướng, Tổng quan, bước 5 hộp thoại kết nối; ảnh so với canvas.
  - **Depends on:** FE-114

- [ ] 5.2 **Archive** (D-309): sau `f05-unified-inbox`, `f07-f08-realtime-inbox`, `fe-ui-overview`, `fe-ui-accounts`, `fe-ui-connect`, `fe-ui-inbox`, vì delta sửa requirement của các change đó. `openspec archive f05c-messages-inbox-split -y`.
