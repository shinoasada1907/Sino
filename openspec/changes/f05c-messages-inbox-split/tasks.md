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

- [x] 3.3 **FE-112 — Hai màn, routes, tự chuyển (D-303, D-304)**
  - **Files:** `app/router.tsx`, `features/inbox/InboxPage.tsx` (cấu hình màn theo loại), `useInboxFilter.ts`, `components/ConversationList.tsx`, `ChatThread.tsx`, `EmailThread.tsx`, `NewMail.tsx`, `SourcePane.tsx`, `useNewMailNotice.ts`, `useInbox.ts`.
  - **Đã làm (2026-10-16, AUTO):**
    - `screen.ts` (mới): `SCREENS` (`CHAT` → `/messages` "Tin nhắn", `EMAIL` → `/inbox` "Hộp thư"), `kindOfProvider` (thiếu → `EMAIL`), `screenFrame` (provider và tài khoản của một loại).
    - Router: `/messages`, `/messages/:conversationId` → `InboxPage kind="CHAT"`; `/inbox`, `/inbox/:id`, `/inbox/new` → `kind="EMAIL"`; mỗi element có `key` theo loại để đổi màn là dựng lại.
    - `InboxPage(kind)`: frame và danh sách của loại, nguồn và tài khoản của loại, "Đồng bộ lần đầu" theo tài khoản của loại, link quay lại theo màn, tự chuyển sang màn đúng loại bằng `replace` (bỏ bộ lọc cũ) trước khi vẽ hay đánh dấu đã đọc.
    - Khóa cache: `inboxKey(kind)` = `['inbox','frame',kind]`, `conversationsKey(kind, filter)`; `moveCounts` sửa frame cùng loại, frame kia chỉ đổi `unreadByKind`; `refreshInbox` và lỗi gửi thư mới đọc lại mọi frame; `useConversationActions` quay về màn của dòng.
    - `ConversationList(screen)`: tiêu đề theo màn, "Thư mới" chỉ ở Hộp thư, link dòng theo `kind` của dòng, dòng báo "N tin mới" ở Tin nhắn; `ChatThread`: link "Tin nhắn" → `/messages`.
    - `useNewMailNotice(accountIds)`: chỉ đếm sự kiện của tài khoản cùng loại.
    - Dữ liệu mẫu: hai chat mới của canvas "Hà" (`conv-10`), "Nhóm sửa nhà" (`conv-11`); `countsByKind` (email 7 / 2 / 3 / 1 / 1, chat 5 / 1 / 2 / 1 / 0) và `counts` = tổng hai loại; `frameOf(sample, kind)` cho `renderApp` và API mẫu.
  - **Làm khác kế hoạch:**
    - Thêm: chữ "Tin hẹn giờ không gửi được" cho chat (canvas `Messages`), email giữ "Thư hẹn giờ…". **LÝ DO:** canvas đã duyệt ghi vậy; test viết trước đỏ đúng chữ đó.
    - "Đồng bộ lần đầu" theo loại làm luôn ở đây thay vì FE-113. **LÝ DO:** frame của màn đã lọc tài khoản theo loại, tách ra FE-113 thì phải giữ hai danh sách tài khoản chỉ để đợi.
    - Trạng thái trống khi chưa có tài khoản vẫn là "Hộp thư đang trống." trên cả hai màn và chỉ hiện khi không có tài khoản nào: trạng thái trống của Tin nhắn là việc của FE-113.
    - Số trên điều hướng không đổi ngay khi đọc (như trước FE-112): nó đọc lại khi luồng realtime báo (D-93).
  - **Bằng chứng (2026-10-16):** đỏ trước 10 test đúng lý do (`MessagesScreen.test` 8: không có màn `/messages`, danh sách gộp, số chưa theo loại; `LiveInbox.test` 2: "N tin mới"), sau đó 1 đỏ ở "Tin hẹn giờ không gửi được"; xanh 8/8 và 5/5. Test cũ viết cho danh sách gộp (27 test trong 8 file) đổi theo hai màn: chat mở ở `/messages`, Hộp thư chỉ còn email, số theo loại, request có `kind=email`. `pnpm lint` 0; `pnpm build` 0 (`tsc -b` 0); `pnpm test` 686/686 (78 file). Chrome (trình duyệt tích hợp) với backend tạm của worktree (8091, PostgreSQL 18 tạm, Vite 5174) để đăng nhập, API Hộp thư trả bằng `window.fetch` tạm trong trang (như CDP `Fetch.fulfillRequest` các lượt trước): 1440 `/messages` hỏi `counts?kind=chat` và `?view=all&kind=chat`, chỉ có 4 chat, nguồn Zalo 4 / Messenger chấm đỏ, không có "Thư mới", cột phải "Chọn một cuộc trò chuyện để đọc.", Lê Hoàng "Tin hẹn giờ không gửi được"; mở Gia đình có "Tin nhắn" → `/messages`; `/inbox/c-2` tự chuyển `/messages/c-2`; `/inbox` chỉ 4 thư, Gmail 7, có "Thư mới", hỏi `kind=email`; 1024: rail + danh sách 320 px + chat 632 px, nguồn "Zalo · 3" (sau khi đọc Gia đình), Messenger; 375: đầu trang "Tin nhắn · 4 chưa đọc", chip chỉ chat, không "Thư mới", tab Tin nhắn sáng, mở Nhóm sửa nhà có "Quay lại Tin nhắn" → `/messages`, không tab bar, không cuộn ngang ở mọi cỡ. Dọn xong: dừng backend và Vite, xóa container, worktree, file cấu hình tạm, tài khoản thử. File kiến thức phase 1 mục 22.6 + câu 143–145, `.docx` sinh lại, `genoffice docs check` không lỗi.
  - **Acceptance criteria:** spec `messages-screen` *Màn Tin nhắn*, *Hội thoại chat ở Tin nhắn*, *Hai màn dùng chung hành vi của một cuộc trò chuyện*, *Chuyển tới màn đúng loại*; `inbox-screen` *Danh sách hợp nhất*, *Dòng ghi tài khoản khi một nguồn có nhiều tài khoản*, *Lọc hộp thư*, *Danh sách trên API Hộp thư (F05)*; `inbox-live` *Hàng mới và dòng báo*.
  - **Test:** design mục Testing (Web): hai màn, tự chuyển hai chiều bằng `replace`, nguồn theo loại, không có Thư mới ở Tin nhắn, dòng báo đúng màn, link quay lại.
  - **Depends on:** FE-111

- [x] 3.4 **FE-113 — Trạng thái trống, hộp thoại kết nối, Tổng quan (D-305)**
  - **Files:** `features/inbox/components/InboxStates.tsx`, `features/accounts/components/ConnectWizard.tsx`, `features/overview/cards/InboxCard.tsx`.
  - **Đã làm (2026-10-16, AUTO):**
    - `InboxPage`: trạng thái trống khi frame **của màn** (`screenFrame`) không có tài khoản, thay vì khi cả hai loại đều không có; chỉ đưa provider cùng loại.
    - `NoSources(screen, providers)`: chữ và icon theo loại trong `EMPTY: Record<ProviderKind, …>` theo canvas `InboxState` (`emptyInbox`: "HỘP THƯ · CHƯA CÓ NGUỒN", icon Inbox; `emptyMessages`: "TIN NHẮN · CHƯA CÓ NGUỒN", icon MessagesSquare), tiêu đề "{màn} đang trống."; một dòng "Kết nối" cho mỗi provider cùng loại (dòng đầu là nút chính); danh mục chưa có provider của loại thì một nút "Kết nối tài khoản" (`/accounts?connect=new`) dưới đoạn chữ, một cột.
    - `ConnectWizard` bước 5: loại lấy bằng `kindOfProvider` (thiếu → `EMAIL`, D-308); `OPEN_SCREEN` (`EMAIL` "Mở hộp thư", `CHAT` "Mở Tin nhắn") cho cả nút (`SCREENS[kind].path`) và câu "… {nút} để đọc." khi nhập xong.
    - `InboxCard`: `OPEN = [SCREENS.CHAT, SCREENS.EMAIL]`; từ 768px hai nút ghost "Tin nhắn", "Hộp thư" xếp dọc bên phải (canvas `Dashboard`), dưới 768px hai nút secondary chia đôi (`MobileDashboard`).
    - `screen.test.ts` (mới): provider thiếu trong danh mục là email, tài khoản của nó chỉ ở Hộp thư.
  - **Làm khác kế hoạch:**
    - Câu "đã nhập xong" của tài khoản chat được test ở `InitialSyncOnApi.test.tsx`, không ở `ConnectReturn.test.tsx`. **LÝ DO:** khi lần nhập xong, hộp thoại đọc lại danh sách tài khoản; trên dữ liệu mẫu request đó không có handler MSW và test hỏng vì "Requests without an MSW handler". `ConnectReturn.test` giữ phần nút.
    - Nút "Kết nối tài khoản" (danh mục chưa có provider của loại) đặt dưới đoạn chữ, một cột. **LÝ DO:** canvas không vẽ trạng thái này; để ở cột phải như danh sách thì Chrome cho thấy nút đứng lơ lửng giữa khoảng trống.
    - Thêm `screen.test.ts`. **LÝ DO:** lỗi gài "provider lạ thành CHAT" sống sót qua cả bộ test, vì mọi test dùng provider có trong danh mục.
    - Tablet (768–1279px) của thẻ Tổng quan vẫn theo bố cục desktop (tỷ lệ theo nguồn, nút bên phải), hai nút xếp dọc; canvas `TabletDashboard` để hai nút thành hàng bên trái và không có tỷ lệ. **LÝ DO:** khác biệt có từ `fe-ui-overview` (thẻ dùng một bố cục từ `md`), FE-113 chỉ đổi nút; sửa bố cục tablet là việc riêng.
  - **Bằng chứng (2026-10-16):** đỏ trước 6 test đúng lý do (`MessagesScreen.test` 3: không có "Tin nhắn đang trống."; `InboxStates.test` 1: Hộp thư còn dòng Zalo/Messenger; `ConnectReturn.test` 1: không có "Mở Tin nhắn"; `OverviewPage.test` 1: còn "Mở hộp thư"); test câu "đã nhập xong" trên API thêm sau, đỏ với `ConnectWizard` cũ (2 test đỏ) và xanh với bản mới. Lỗi gài 17 (hàm của `screen.ts`, `toProviderInfo`, `unreadByKindOf`, `kindQuery`, `newMailText`, `rowFlag`, `countsAfter`, điều kiện trống của `InboxPage`, nút "Kết nối tài khoản", loại ở bước 5): 16 làm test đỏ, 1 sống (`kindOfProvider` mặc định `CHAT`) → thêm `screen.test.ts`, lỗi đó giờ làm 2 test đỏ. `pnpm lint` 0; `tsc -b` 0; `pnpm build` 0; `pnpm test` 693/693 (79 file) một lượt; ba lượt khác 692/693, cùng một test của Ghi chú (`NotesPage.test` "makes a new note once it has text…", D-203) không tìm thấy dòng ghi chú mới khi máy chạy nặng, xanh khi chạy riêng (47/47); FE-113 không sửa file nào của Ghi chú. Chrome (trình duyệt tích hợp) với backend tạm của worktree (8091, PostgreSQL 18 tạm, Vite 5174): backend tạm không có cấu hình Google nên `GET /api/providers` trả `[]` → `/messages` và `/inbox` đều "… đang trống." với một nút "Kết nối tài khoản" dưới đoạn chữ (1440, 375); `window.fetch` tạm trong trang (Gmail `EMAIL`, Zalo, Messenger `CHAT`): chỉ có Gmail → `/messages` 1440 "Tin nhắn đang trống." với Zalo (nút chính), Messenger, không có Gmail; 1024 hai cột; 375 các dòng dưới đoạn chữ, tab Tin nhắn sáng; chỉ có Zalo → `/inbox` "Hộp thư đang trống." với một dòng Gmail (1440, 375); `/accounts?connected=acc-zalo` → "Bắt đầu đồng bộ" → bước 5 "Mở Tin nhắn" → `/messages` (bấm thử, hộp thoại đóng); câu "đã nhập xong" không xem được ở Chrome (luồng realtime đang mở nên app chờ sự kiện, bản tạm không phát) và do test trên API phủ; Tổng quan 1440 hai nút xếp dọc bên phải, 1024 cũng vậy, 375 hai nút 149 px chia đôi cách 8 px; ở 1024 và 375 cửa sổ app bị ẩn nên không chụp được ảnh, bố cục đo bằng `getBoundingClientRect`; không cuộn ngang ở mọi cỡ, không lỗi React trong console. Dọn xong: dừng backend và Vite, xóa container, worktree, file cấu hình tạm, tài khoản thử. File kiến thức phase 1 mục 22.7 + câu 146–150, `.docx` sinh lại, `genoffice docs check` không lỗi.
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
