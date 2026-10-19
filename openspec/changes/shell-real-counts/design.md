## Mode

**AUTO** cho phần 1 (NS-01): sửa dữ liệu mẫu nói dối của khung app là việc của `frontend: AUTO`, có nguồn thật sẵn, không thêm tính năng. D-321…D-324 do agent chốt, cần người dùng xem lại. **Phần 2 (DN-1, DN-2, DN-3) chưa làm**: `architecture: TRAINING` và `new_features: TRAINING`, nên agent chỉ nêu phương án và đề xuất, người dùng chốt. Số quyết định: D-321…D-324 (đã chốt), DN-1…DN-3 (chờ). Task: NS-01 (xong), NS-02, NS-03 (chờ).

## Context

- `useShellData` trả `createShellSample` làm dữ liệu API (D-42). Các số `messagesUnread`, `inboxUnread`, `tasksDue`, `tasksOverdue` được `AppShell` ghi đè bằng số thật; còn lại là mẫu: `accountsNeedingAction: 1`, `registrationsNew: 1`, `unreadNotifications: 3`, `accountCount: 3`, và cả `owner` ("An Nguyễn") và `sync` ("Đồng bộ 2 phút trước", tính từ `now - 2 phút` mỗi lần mở app).
- `MorePage` (`/more`, mobile) gọi `useShellData()` trực tiếp, không qua `AppShell`: mọi số nó hiện là mẫu, kể cả `accountsNeedingAction`, `unreadNotifications` (huy hiệu ở dòng Thông báo) và `registrationsNew`.
- Màn Tài khoản đã có định nghĩa "cần xử lý": `needsAttention(account)` = `status` là `AUTH_EXPIRED` hoặc `ERROR` (`features/accounts/format.ts`; dùng cho bộ lọc "Cần xử lý" và phụ đề mobile "3 TÀI KHOẢN · 1 CẦN XỬ LÝ"). `DEGRADED` ("có trục trặc") và `DISABLED` ("đã tắt") không tính.
- Danh sách tài khoản thật có sẵn: `fetchAccounts` (`GET /api/accounts`, `GET /api/providers`, và `GET /api/accounts/{id}/initial-sync` cho từng tài khoản), query `ACCOUNTS_QUERY_KEY`, `staleTime: Infinity`, được `useEventStream` đọc lại khi có `account.changed` và khi stream mở lại sau khi mất.
- `/notifications` và `/registrations` không có route riêng (rơi vào trang "đang được dựng") và không có backend.

## Decisions

### D-321 — Số tài khoản cần xử lý: đếm từ danh sách thật, qua hook riêng đọc cùng query · agent chốt
`useAccountsNeedingAction()` (trong `useAccounts.ts`) = `useQuery({ queryKey: ACCOUNTS_QUERY_KEY, queryFn: fetchAccounts, staleTime: Infinity, select: đếm needsAttention })`. `AppShell` ghi số đó vào `navCounts.accountsNeedingAction`, như nó đang làm cho số việc.

- **Vì sao không gọi `useAccounts()`:** hook đó có hai bổn phận của màn Tài khoản: đọc danh sách lại mỗi 2 giây khi một lần nhập đầu đang chạy mà stream không mở, và đọc lại hộp thư mỗi khi có tài khoản `firstImport.state === 'DONE'`. Trạng thái `DONE` còn mãi, nên gắn hook đó vào `AppShell` thì **mỗi lần mở app đọc lại hộp thư một lần thừa** (và `invalidateQueries` mặc định hủy lần đọc đang chạy của chính màn hộp thư). Test `useAccounts.test.tsx` "reads the list without the first-import duties" canh điều này; đổi hook sang `useAccounts()` thì đỏ (đã thử).
- **Phương án bỏ: một query riêng chỉ `GET /api/accounts`** (1 request thay vì 2 + N). Hai nguồn cho cùng một sự thật, không tự đổi khi màn Tài khoản đổi danh sách (ngắt kết nối, bật tắt), phải dạy `useEventStream` thêm một khóa. Người dùng cũng đã chỉ rõ dùng query sẵn có.
- **Phương án bỏ: thêm số vào một endpoint "shell" của backend.** Chưa có endpoint; `D-42` giữ hợp đồng này cho đến khi backend làm.
- **Cái giá, phải nói thẳng:** danh sách tài khoản giờ có người quan sát sống ở mọi màn. Trước đây `account.changed` và việc mở lại stream chỉ đánh dấu danh sách cũ rồi nó được đọc khi người dùng vào Tài khoản; giờ chúng đọc lại ngay ở mọi màn, mỗi lần 2 + N request (`/api/accounts`, `/api/providers`, một `initial-sync` mỗi tài khoản). Cùng cỡ với hộp thư (mỗi `conversations.changed` đã đọc `/api/accounts`, `/api/providers`, `/api/conversations/counts`), nên chấp nhận. Nếu về sau N lớn thì `fetchAccounts` nên bỏ `initial-sync` của tài khoản đã `DONE`, không phải bỏ query này.

### D-322 — `MorePage` đọc cùng hook; chưa gom thành một hook "shell thật" · agent chốt
`MorePage` thay `shell.navCounts.accountsNeedingAction` bằng `useAccountsNeedingAction() ?? 0` (cả dòng "3 tài khoản · N cần xử lý", chấm ở thẻ chủ tài khoản, chấm ở dòng Tài khoản). Gom phần ghi đè vào một hook dùng chung cho `AppShell` và `MorePage` là cách đúng về lâu dài, nhưng `useAccounts.ts` import `SHELL_QUERY_KEY` từ `useShellData.ts` (nó ghi `accountCount` khi ngắt kết nối), nên `useShellData` không thể import ngược hook này mà không thành vòng phụ thuộc. Hai chỗ gọi một dòng mỗi chỗ là cái giá hiện tại; gom khi các số còn lại có nguồn thật và `useDisconnectAccount` không còn ghi vào cache shell.

### D-323 — Chưa biết thì không nói gì: danh sách chưa về hoặc lỗi thì số là 0 · agent chốt
Trước khi danh sách về (và khi nó lỗi), `accountsNeedingAction` là 0 chứ không phải số mẫu 1: không chấm, không chữ. Đây đúng là yêu cầu "số lấy từ dữ liệu của app": một số chưa biết không được thay bằng một số bịa. Số 0 đó đổi thành số thật khi danh sách về, không cần tải lại.

### D-324 — `useDisconnectAccount` thôi ghi `accountsNeedingAction` vào cache shell · agent chốt
Nó trừ 1 khỏi số mẫu khi ngắt kết nối một tài khoản đang cần xử lý. Số hiển thị giờ đếm từ chính danh sách mà hook này vừa cập nhật (`withoutAccount`), nên lệch không thể xảy ra, và ghi vào một trường không ai đọc là mã chết kèm hai test canh nó. Hai test đó đổi: bỏ dòng canh số mẫu; hành vi thật được canh ở `AppShell.test.tsx` ("follows the list as an account needs the owner and then does not"). `accountCount` vẫn được ghi (nó vẫn là mẫu, DN-3).

## Decision Needed (người dùng chốt)

### DN-1 — Chuông thông báo ở thanh trên cùng (và huy hiệu ở dòng Thông báo của trang Thêm)
Hiện: `BellLink` hiện chấm và nhãn "Thông báo, 3 mới" vì `unreadNotifications = 3` mẫu. Bấm vào đi tới `/notifications`, là trang "đang được dựng".

| | Phương án | Việc | Nói thật? | Rủi ro |
|---|---|---|---|---|
| A | **Ẩn chấm và nhãn cho đến khi có nguồn thật** (`unreadNotifications` = 0 ở một chỗ; chuông vẫn dẫn tới trang) | rất nhỏ: một dòng + test, kể cả huy hiệu ở trang Thêm | có: chuông không hứa gì | chuông thành đồ trang trí cho đến khi có nguồn |
| B | **Chuông theo số "cần chú ý" thật** (hiện là số tài khoản cần xử lý, về sau cộng thêm các loại khác) | vừa: bấm chuông phải cho thấy lý do, nên `/notifications` phải liệt kê "Tài khoản X cần đăng nhập lại" (tạo trên web từ danh sách tài khoản) | có, nhưng là một "mô hình thông báo" dựng ở client | dựng nửa tính năng thông báo trên web rồi bỏ khi backend làm; không có trạng thái đã đọc |
| C | **Mô hình thông báo ở backend** (bảng, API, sự kiện, đã đọc/chưa đọc), một change riêng | lớn: BE + FE, quyết định kiến trúc (ai tạo thông báo, giữ bao lâu, đẩy qua SSE thế nào) | có, đúng lâu dài | chưa có ai tạo thông báo nào ngoài "tin mới" (đã có thanh `NoticeBar`) và "tài khoản cần đăng nhập lại" |

**Đề xuất: A ngay bây giờ, C khi có từ hai loại thông báo trở lên cần lưu.** A làm chuông thành thật trong một dòng và không khóa hướng nào. B bị loại vì chấm không có trang nào giải thích nó. Chiều B đã có đường đi gọn hơn: thanh `NoticeBar` của `inbox-notifications` được viết để thêm loại thông báo thứ hai ("Tài khoản cần đăng nhập lại", D-320) mà không đổi chỗ đặt.

### DN-2 — `registrationsNew` ("Đăng ký" luôn nói "1 mới")
Hiện: mẫu cố định 1, đúng với thẻ Đăng ký của Tổng quan (cũng là dữ liệu mẫu, UI-first). Không có backend nào về đăng ký.

- **A (đề xuất):** `registrationsNew` là 0 cho đến khi có nguồn thật: "Đăng ký" không có huy hiệu. Cùng chỗ với DN-1 A.
- **B:** giữ mẫu, ghi rõ trong spec rằng đó là dữ liệu mẫu. Bỏ: đúng là điều thay đổi này sinh ra để chấm dứt, và lại nói dối ở môi trường deploy.
- **C:** đợi tính năng Đăng ký có backend rồi mới nối. Là hệ quả của A, không phải phương án khác.

### DN-3 — `accountCount` ("3 tài khoản" ở chân cột bên và trang Thêm)
Cùng bệnh, cùng nguồn: là mẫu cố định 3, trong khi số thật nằm trong danh sách tài khoản mà NS-01 đã đọc. Không nằm trong ba mục người dùng liệt kê nên **không làm khi chưa được phép**. Đề xuất **làm trong change này (NS-03)**: thêm số tài khoản vào cùng hook, hai chỗ gọi, vài test. Nếu không, "3 tài khoản" nằm cạnh "0 cần xử lý" vẫn nói dối.

## Ngoài phạm vi, thấy khi đọc code (không sửa, không có trong DN)

- Cột bên (`Sidebar`) đọc tên chủ tài khoản từ `shell.owner` (mẫu "An Nguyễn"), còn trang Thêm đọc `useMe()`. Mọi người dùng thấy "An Nguyễn" ở cột bên.
- Thanh trên cùng luôn nói "Đồng bộ 2 phút trước": `sync.lastSyncedAt` mẫu là `now - 2 phút` tại thời điểm mở app.
- Trong lúc số thật của hộp thư, tin nhắn và việc đang tải, `AppShell` cho số mẫu (7, 5, 3) chớp lên rồi mới đổi. D-323 chỉ làm đúng cho số tài khoản.
- Tổng quan là mẫu cả màn (UI-first, `fe-ui-overview`).

## Risks / Trade-offs

- **Đọc danh sách ở mọi màn** (D-321). Chấp nhận, đã ghi.
- **Test cũ phải biết danh sách tài khoản có người đọc ở mọi màn:** ba file test cũ (`MobileSubPage`, `EventStream`, `LiveInbox`) hỏng vì MSW không có handler cho `GET /api/accounts…` mà app giờ đọc, hoặc vì một lần đọc còn dở rơi sang test kế (MSW reset handler giữa các test). Sửa bằng cách gieo danh sách vào cache, thêm handler, và đợi `queryClient.isFetching() === 0` ở cuối test có đọc lại.
- **`select` chỉ báo khi con số đổi:** người quan sát của `AppShell` không vẽ lại khi danh sách đổi mà số cần xử lý giữ nguyên.
