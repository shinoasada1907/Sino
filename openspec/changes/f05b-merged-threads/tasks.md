# Mở rộng F05 — Một chuỗi ở nhiều tài khoản là một dòng · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng chọn gom thành một dòng và duyệt thiết kế (2026-10-12): D-180…D-187 là người dùng duyệt.
> Change dùng chung: phiên web làm mục 2; phiên backend nhận mục 1 và được sửa task của mình khi nhận.

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [x] 1.1 **BE-80 — Nhóm của một chuỗi: cột, gom khi lưu, gom dữ liệu đã có (D-180)**
  - **Goal / Why:** nhận ra các bản của một chuỗi ở nhiều tài khoản.
  - ~~**Thực hiện:** design mục Backend 1 và chốt kỹ thuật: V20 (`thread_group_id`, index `rfcMessageId`, `thread_group_id`), gom dữ liệu đã có; `JdbcConversationStore` gom sau khi lưu, khóa theo chủ.~~
  - **Thực hiện (2026-10-12, AUTO, phiên sino-api-27):**
    - V19: `conversation.grouped_with` (bản cũ nhất của nhóm, `NULL` = nhóm một bản) và `thread_group_id` tự tính `COALESCE(grouped_with, id)` `STORED`; index `conversation (thread_group_id)` và `message ((metadata ->> 'rfcMessageId'))` khi khác null.
    - `ThreadGroups` (`conversation/infrastructure`): `lock(accountId)` lấy các tài khoản cùng chủ, cùng nhà cung cấp qua `AccountDirectory` và khóa `thread-groups:<chủ>`; `group(others, messageIds)` tìm bản sao của các thư vừa lưu ở tài khoản khác, gộp các nhóm (union-find), nhóm gộp lấy bản cũ nhất (`created_at`, rồi `id`); `groupAll()` mỗi tài khoản một transaction. `JdbcConversationStore.store`: khóa tài khoản → khóa chủ → ghi dòng → gom theo các thư của trang. `GroupingAtStartup`: `groupAll` khi Sino khởi động, lỗi chỉ ghi log.
    - `NormalizedMessage.RFC_MESSAGE_ID` (khóa `metadata`, trước chỉ là hằng riêng của Gmail).
  - **Làm khác kế hoạch:**
    - ~~V20~~ → V19. **LÝ DO:** phiên `planner` (sino-api-94) nhường V19 vì chưa có ngày làm lịch; quy ước mới: ai commit trước lấy số trống tiếp theo trên `dev`.
    - ~~`thread_group_id uuid NOT NULL`, ghi `= id` khi tạo~~ → `grouped_with` + `thread_group_id` tự tính. **LÝ DO:** PostgreSQL không cho giá trị mặc định lấy từ cột khác; không phải sửa câu `INSERT` nào hay thêm trigger.
    - ~~Gom dữ liệu đã có trong migration~~ → khi khởi động, mỗi lần. **LÝ DO:** cùng code với lúc lưu; migration không biết chủ và nhà cung cấp của tài khoản nếu không đọc thẳng bảng của module `account`.
    - Khóa chủ ngay sau khóa tài khoản, trước khi ghi dòng nào; gom theo thư của trang, không theo cả cuộc trò chuyện; `groupAll` mỗi tài khoản một transaction. **LÝ DO:** review (HIGH): khóa chủ ở cuối `store` sau khi đã khóa dòng thì hai lượt đồng bộ của hai tài khoản có thư chung có thể deadlock; (MEDIUM, LOW): một transaction cho mọi chủ giữ khóa suốt lượt gom, quét cả cuộc trò chuyện tốn với chuỗi dài.
    - Spec *Nhóm của một chuỗi*: thêm bắc cầu qua cùng một tài khoản. **LÝ DO:** spec vừa bắt bắc cầu vừa cấm gộp hai thread của một tài khoản; người dùng chọn "Gộp cả ba thành một dòng" (2026-10-12).
  - **Kiểm chứng (2026-10-12):** đỏ trước trên khung (`ThreadGroups` chưa làm gì): `ThreadGroupsTests` 6/10 (các test gom; 4 test "không gộp" xanh vì khung không gom), `GroupingAtStartupTests` 1/2; 74 test cũ của store xanh với V19 (cột tự tính không làm hỏng câu `INSERT` nào). Review `senior-reviewer`: HIGH deadlock (khóa chủ sau khi khóa dòng) → khóa chủ ngay sau khóa tài khoản; MEDIUM `groupAll` một transaction cho mọi chủ → mỗi tài khoản một transaction; MEDIUM spec mâu thuẫn về bắc cầu → người dùng chốt; MEDIUM test thiếu (`created_at` khác thứ tự `id`, thư được thêm `Message-ID` sau, tài khoản đã xóa, `DISABLED`, thứ tự khóa) → thêm 6 test; LOW: gom theo thư của trang, hằng `NormalizedMessage.RFC_MESSAGE_ID`, Javadoc nói quá, ghi chú migration; LOW ghi cho BE-81 ở design (nhóm không tách, sự kiện cho tài khoản kia, chi phí gom khi khởi động). Test của các phần sửa viết **sau** code sửa (lệch TDD): bằng chứng là lỗi gài `late-lock` (khóa chủ ở cuối như bản cũ), `id-only`, `new-mail-only`, `disabled-left-out` đều làm test đỏ. Kiểm tra ngược: đợt 1 (trước review) 11, 10 bị bắt, `null-ids-kept` tương đương (`IS NOT NULL` chỉ để PostgreSQL dùng index một phần; `NULL = NULL` không bao giờ đúng); đợt 2 (code cuối) 14, 13 bị bắt, `disabled-left-out` sống sót vì test lưu tài khoản `DISABLED` sau → đảo thứ tự, chạy lại bị bắt; không JVM sập. Dữ liệu thật (chỉ đọc, chưa áp V19 vào database Compose): 17 cặp cuộc trò chuyện `tienct07`–`bonzed2001` chung `Message-ID`, mỗi cặp một-một, cùng tiêu đề (gồm ba chuỗi "xin chào"/"hihi" hôm nay). Xanh: `ThreadGroupsTests` 16, `GroupingAtStartupTests` 2, `JdbcConversationStoreTests` 50, `ConversationSummaryTests` 24, `GmailMessageNormalizerTests` 58, `ConversationsApiTests` 35, `ModularityTests` 2. `./mvnw -B -ntp verify` trên `dev` `f65087a`: 1452 test, 0 sai, 0 lỗi, 4 bỏ qua, BUILD SUCCESS. `openspec validate f05b-merged-threads --strict` hợp lệ. **NOT VERIFIED:** gom trên database thật (V19 chỉ vào database Compose khi backend chạy code mới; BE-83 kiểm), index có được dùng trên dữ liệu thật (`EXPLAIN` ở BE-83), thời gian gom khi khởi động với dữ liệu thật.
  - **Test:** design mục Testing (Gom); dữ liệu đã có trước change được gom đúng.
  - **Acceptance criteria:** spec `thread-merge` *Nhóm của một chuỗi ở nhiều tài khoản*.

- [x] 1.2 **BE-81 — API Hộp thư theo nhóm (D-181…D-183, D-185, D-187)**
  - **Thực hiện:** design mục Backend 2, 3: một item mỗi nhóm, `accountIds`, bản chính, trường gộp, keyset; số đếm; lọc; mã của bản bất kỳ → mã nhóm; `PATCH` mọi bản; `participants` gộp; sự kiện mang mã nhóm.
  - **Đã làm (2026-10-14, AUTO, phiên sino-api-84; người dùng: "làm BE 81...83 đi"):**
    - `InboxService`: câu 1 `GROUP BY thread_group_id` trên các cuộc trò chuyện trong phạm vi (bản cũ → mới, mã nhóm = bản đầu, `max`/`bool_and`/`bool_or` theo D-182, cùng tên cột nên điều kiện `InboxView` dùng lại được), lọc, keyset `(giờ nhóm, mã nhóm)`; câu 2 đọc các bản của nhóm trong trang (thư mới nhất: `Message-ID`, chiều) và chọn bản chính bằng Java (D-181: giữ thư mới nhất theo giờ hoặc cùng `Message-ID`, rồi thư đến, rồi bản cũ nhất); `counts` đếm nhóm; lọc `accountId` bằng `HAVING bool_or`; `detail`/`change`/`requireInInbox` nhận mã bản bất kỳ; `PATCH` khóa mọi tài khoản của nhóm theo thứ tự, đọc/lưu trữ mọi bản, chưa đọc = thư mới nhất của bản chính; người tham gia gộp (`array_agg … FILTER`, `bool_or(is_self)`).
    - `InboxItem`: `id` (nhóm), `primaryId`, `accountIds`, `copies` (bản + tài khoản), `accountOf`. `ConversationResponse.accountIds`.
    - `InboxIds` (interface mới, gói gốc `conversation`), cài đặt ở `InboxService`; `RealtimeEvents` đổi mã của mọi `conversations.changed` qua nó (D-189).
    - `MessageBodies`, `MessageFiles`, `ReplyService.discard`: tài khoản của bản trong đường dẫn (`accountOf`), thư vẫn tìm trong bản đó (BE-82 đổi).
  - **Làm khác kế hoạch:**
    - ~~D-186 (trả lời từ bản chính) ở BE-82~~ → làm ở BE-81. **LÝ DO:** từ BE-81 mã của dòng là mã nhóm (bản cũ nhất), còn tài khoản của dòng là của bản chính; không đổi `Replies`/`ReplyService` trong cùng commit thì một chuỗi gộp có thể gửi từ tài khoản này vào thread của tài khoản kia.
    - Thêm: gửi lại cùng `clientMessageId` đi tiếp từ bản đã ghi thư (tìm trong mọi bản của nhóm, khóa mọi tài khoản theo thứ tự); thư đó ở bản của tài khoản đã ra khỏi Hộp thư thì `409 REPLY_NOT_ALLOWED` (`ACCOUNT_UNAVAILABLE`). **LÝ DO:** chỉ tìm trong bản chính thì gửi hai lần (D-131); tự review thấy cả trường hợp tài khoản bị tắt (test viết trước đỏ: `201`, thư thứ hai).
    - Thêm D-188 (nhóm không tách khi tài khoản nối nó bị xóa/tắt) và D-189 (mã nhóm trong sự kiện, đổi ở `realtime`), agent chốt, để người dùng xem lại; spec `thread-merge` thêm 3 scenario.
  - **Kiểm chứng (2026-10-14):** Docker Desktop đang tắt, agent bật lên để chạy Testcontainers. RED: `MergedThreadsApiTests` 19/19 + test realtime mới 1/1 đỏ đúng lý do (hai dòng, thiếu `accountIds`, mã của bản). GREEN 19/19, `RealtimeApiTests` 10/10; `ConversationsApiTests` đổi danh sách khóa của item (thêm `accountIds`). Hai test thêm sau review: gửi lại ở đúng bản (viết sau code, bằng chứng: hai lỗi gài "luôn bản chính", "chỉ tìm ở bản chính" đều làm nó đỏ), từ chối khi tài khoản đã ra khỏi Hộp thư (viết trước, đỏ `201`). Toàn bộ test `conversation` + `realtime` + `ModularityTests`: 330, 0 sai. `./mvnw -B -ntp verify` trên `dev` `fa496b7` + thay đổi: 1517 test, 0 sai, 0 lỗi, 4 bỏ qua, BUILD SUCCESS. `openspec validate f05b-merged-threads --strict` hợp lệ. **NOT VERIFIED:** tốc độ với dữ liệu thật (`EXPLAIN` ở BE-83).
  - **Acceptance criteria:** spec `thread-merge` *Một dòng cho một nhóm*, *Số đếm và bộ lọc theo nhóm*, *Mở và đổi một nhóm bằng mã của bất kỳ bản nào*.

- [ ] 1.3 **BE-82 — Thư và trả lời theo nhóm (D-184, D-186)**
  - **Thực hiện:** design mục Backend 4, 5: thư bỏ trùng và chọn bản, cursor; nội dung, tệp, xóa theo nhóm; ~~`reply` và gửi trên bản chính~~ (làm ở BE-81, xem LÝ DO ở đó).
  - **Acceptance criteria:** spec `thread-merge` *Thư của một nhóm*, *Trả lời một nhóm*.

- [ ] 1.4 **BE-83 — Chạy thật với hai tài khoản Gmail, README**
  - **Test:** dữ liệu thật của người dùng (`tienct07`, `bonzed2001`): mỗi chuỗi "xin chào" / "hihi" một item với hai `accountIds`; thư 3 chứ không 6; số đếm. Không gửi thư thật nếu người dùng không cho phép rõ ràng.

## 2. Web — phiên web

> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`. Làm theo Contract trước, test bằng MSW.

- [x] 2.1 **FE-80 — `accountIds`, dòng và đầu chuỗi ghi mọi tài khoản (D-182)**
  - **Thực hiện (2026-10-12, AUTO):** `ConversationItem.accountIds` (bắt buộc); `inbox.api.ts` `accountIds?` → `[accountId]` khi API chưa có; dữ liệu mẫu (`rows` rồi thêm `accountIds`), fixture `c-1` là chuỗi gộp `acc-1` + `acc-2`, `c-2` như API cũ; `format.rowAccount` → `rowAccounts` (theo `accountIds`, bản chính trước); `threadSubtitle(item, accounts[], …)` nối địa chỉ bằng ", "; `ConversationList` ghi mọi địa chỉ; `EmailThread` nhận `accounts` (InboxPage tính từ `accountIds`); `ChatThread` truyền `[account]` (chat không gộp).
  - **Làm khác kế hoạch:** thêm một sửa bố cục ở đầu chuỗi: icon và chữ nguồn gộp thành một cụm không xuống dòng. **LÝ DO:** Chrome cho thấy hai địa chỉ đẩy icon lên một dòng riêng ở cả 1440 và 390.
  - **Kiểm chứng (2026-10-12):** RED 4/4 (`rowAccounts` chưa có; `threadSubtitle` ra "Gmail · undefined"; adapter thiếu `accountIds`; màn không có nhãn hai địa chỉ), GREEN; test IN-10 đỏ vì dữ liệu test chỉ đổi `accountId` → sửa dữ liệu theo hợp đồng mới. Chrome thật (headless, `vite` :5174, API qua CDP, chuỗi gộp `c-1`): dòng ghi hai địa chỉ ở 1440/1024/390 (cắt "…" khi thiếu chỗ, tài khoản chính luôn đọc được), một tài khoản giữ "Gmail" từ 1280px; đầu chuỗi ghi đủ hai địa chỉ, icon cùng hàng với chữ (lần 1 icon ở dòng riêng → sửa); thư một tài khoản không đổi; không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `pnpm test` 557/557 (67 file), `pnpm build` 0. File kiến thức mục 18 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Đã biết, ngoài phạm vi:** cột trái của đầu chuỗi ở 1440 hẹp (~176px) vì cụm nút bên phải (có từ IN-02, ghi ở IN-06), nên hai địa chỉ xuống 3 dòng.
  - **Acceptance criteria:** spec `inbox-merged-threads` *Dòng của chuỗi gộp ghi mọi tài khoản*.

- [x] 2.2 **FE-81 — Mở chuỗi gộp: "Bạn · địa chỉ", "Gửi từ", chuyển mã (D-183, D-184, D-186)**
  - **Thực hiện (2026-10-12, AUTO):** `Message.ownAddress` (adapter lấy từ `sender.address` khi `sender.self`); `format.mailSender(mail, manyAccounts)`; `EmailThread` truyền `sender` cho `FoldedMail`, `MailCard` và `from` cho `Composer` khi `accounts` có nhiều hơn một; `Composer` có dòng "Gửi từ {địa chỉ}" `xl:hidden` (từ 1280px dùng nút "Gửi từ" sẵn có); `InboxPage` thay đường dẫn bằng mã của nhóm (`replace`, giữ bộ lọc) và chỉ đánh dấu đã đọc khi đường dẫn đã là mã của nhóm.
  - **Kiểm chứng (2026-10-12):** `MergedThreadOnApi.test.tsx` (MSW): RED 3/5 ("Bạn · địa chỉ", dòng "Gửi từ", chuyển mã), 2 test giữ hành vi cũ xanh từ đầu; GREEN 5/5. Test đơn vị `mailSender` viết **sau** code (hành vi đã đỏ trước ở test màn). Chrome thật (headless, `vite` :5174, API qua CDP, chuỗi 3 thư tự gửi giữa hai tài khoản): 1440 nút "Gửi từ tienct07@gmail.com", không có dòng; 1024 và 390 dòng "Gửi từ tienct07@gmail.com"; người gửi "Bạn · bonzed2001@gmail.com" / "Bạn · tienct07@gmail.com"; `/inbox/c-9?view=unread` → `/inbox/c-1?view=unread`, đúng một `PATCH` lên `c-1`; không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `pnpm test` 563/563 (68 file), `pnpm build` 0. File kiến thức mục 18.4 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** spec `inbox-merged-threads` *Thư của bạn ghi địa chỉ trong chuỗi gộp*, *Ô trả lời ghi tài khoản gửi trong chuỗi gộp*, *Mã của bản khác chuyển về mã của nhóm*.

- [ ] 2.3 **FE-82 — Chạy với backend thật (sau BE-83)**
  - **Test:** web :5173 với hai tài khoản Gmail: dòng, mở, đọc / lưu trữ, trả lời (chỉ khi người dùng cho phép gửi thật).

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Definition of Done, archive** (`design.md` mục Definition of Done; `openspec archive f05b-merged-threads -y` sau các change F05, F06, F10 mà nó dựa vào).
