# Số thật trên khung app · Implementation Plan

> **AUTO mode** (`frontend: AUTO`). D-321…D-327 do agent chốt, cần xem lại; DN-1…DN-3 do người dùng chốt (2026-10-19: A, A, làm).
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ khung đổi (1440, 1024, 390); file kiến thức phase 1 (`.md`; `.docx` sinh lại bằng GenOffice); commit trên `dev`. Không push khi người dùng chưa bảo.

## 1. Số tài khoản cần xử lý

- [x] 1.1 **NS-01 — Số "cần xử lý" đếm từ danh sách tài khoản thật**
  - **Goal:** `Tài khoản` ở khung app thôi báo "1 cần xử lý" của dữ liệu mẫu (D-321…D-324).
  - **Files:** `apps/sino-web/src/features/accounts/useAccounts.ts`, `apps/sino-web/src/app/shell/{AppShell.tsx,MorePage.tsx}` (+ test), `apps/sino-web/src/test/accountsWithStatus.ts`; ba test cũ gieo danh sách (`MobileSubPage`, `EventStream`, `LiveInbox`).
  - **Acceptance criteria:** spec `web-nav-counts` *Số tài khoản cần xử lý lấy từ danh sách tài khoản* và *Đọc số tài khoản cần xử lý không làm đọc lại hộp thư*.
  - **Thực hiện:** commit `21316b7` (2026-10-19, AUTO).
  - **Ghi chú về tài liệu:** `tasks.md` không được viết cùng commit đó (proposal và design nhắc tới nó). Bằng chứng riêng của NS-01 nằm trong test của commit; tôi không chạy lại NS-01 một mình, nó nằm trong toàn bộ bộ test xanh của NS-02/NS-03 dưới đây (cây đã có NS-01).

## 2. Cái chưa có nguồn, và tổng số tài khoản

- [x] 2.1 **NS-02 — Chuông và Đăng ký không báo gì khi chưa có nguồn thật**
  - **Goal:** chuông ở thanh trên cùng, dòng Thông báo và Đăng ký ở trang Thêm, mục Đăng ký ở điều hướng thôi nói "3 mới", "1 mới" của dữ liệu mẫu (D-325, DN-1 = A, DN-2 = A).
  - **Files:** `apps/sino-web/src/app/shell/useShellData.ts` (`shellToday`), `apps/sino-web/src/test/renderApp.tsx` (`shell: null`); test `useShellData.test.tsx` (mới), `AppShell.test.tsx`, `MorePage.test.tsx`.
  - **Acceptance criteria:** spec *Chuông thông báo và mục Đăng ký không báo gì khi chưa có nguồn thật* (cả 2 scenario).
  - **Test:** Vitest; `renderApp(..., { shell: null })` cho đường dữ liệu thật; một test cho mỗi nơi "vẫn hiện số khi dữ liệu có".
  - **Depends on:** NS-01 (NS-03 cùng sửa `useShellData.ts`).

- [x] 2.2 **NS-03 — "N tài khoản" đếm từ danh sách tài khoản thật**
  - **Goal:** chân cột bên và thẻ chủ tài khoản ở trang Thêm thôi nói "3 tài khoản" cố định (D-326, D-327, DN-3 = làm).
  - **Files:** `apps/sino-web/src/features/accounts/useAccounts.ts` (`useAccountCounts` thay `useAccountsNeedingAction`; `useDisconnectAccount` thôi ghi cache shell), `apps/sino-web/src/app/shell/{useShellData.ts,shell.types.ts,AppShell.tsx,MorePage.tsx,Sidebar.tsx}`; test `useAccounts.test.tsx`, `useShellData.test.tsx`, `AppShell.test.tsx`, `MorePage.test.tsx`.
  - **Acceptance criteria:** spec *Số tài khoản lấy từ danh sách tài khoản* (cả 3 scenario).
  - **Depends on:** NS-01.

  **Thực hiện NS-02 + NS-03 (2026-10-19, AUTO, một commit):** `useAccountCounts()` trả `{ total, needingAction }` qua `select`; `useShellData` ghép `accountCount` (`null` khi chưa có danh sách) và `accountsNeedingAction` (0 khi chưa có) vào dữ liệu khung, và `queryFn` là `shellToday` (mẫu trừ thông báo và đăng ký bằng 0); `AppShell` và `MorePage` bỏ phần ghi đè số tài khoản; `Sidebar` và `MorePage` bỏ dòng "N tài khoản" khi `accountCount` là `null`.

  **Làm khác kế hoạch:**
  - NS-02 và NS-03 chung một commit. **LÝ DO:** cùng sửa `useShellData.ts` và cùng vài test; tách ra thì commit đầu phải mang một bản `useShellData` nửa chừng, mà tôi không kiểm chứng riêng được nó xanh.
  - ~~Hai chỗ gọi một dòng ở `AppShell` và `MorePage` (D-322)~~ → `useShellData` ghép (D-327). **LÝ DO:** điều kiện D-322 đặt ra (`useDisconnectAccount` không còn ghi vào cache shell) xảy ra đúng ở NS-03, hết vòng phụ thuộc import.
  - Thêm `shell: null` cho `renderApp`. **LÝ DO:** mọi test cũ gieo `createShellSample` vào cache nên không bao giờ chạy dữ liệu khung của chính app; không có nó thì không kiểm được "app mở ra không báo gì".
  - `ShellData.accountCount` từ `number` thành `number | null` (đổi hợp đồng dữ liệu, D-326): người dùng xem lại.

  **Bằng chứng (2026-10-19):**
  - **Đỏ trước:** `useAccounts.test.tsx` 6 test `useAccountCounts is not a function` + test ngắt kết nối (`useDisconnectAccount` còn ghi `accountCount` vào cache shell); `useShellData.test.tsx` 4 test (`expected 3 to be +0`, `expected 9 to be 4`, `expected 3 to be null`, `expected 3 to be 1`); `AppShell.test.tsx` 5 test và `MorePage.test.tsx` 3 test (`Unable to find an element with the text: 2 tài khoản`, `Unable to find role="link" and name "Thông báo"`, ...).
  - **Một lần xanh sai, bắt được:** ba test `shell: null` đầu (chuông, Đăng ký, trang Thêm) **xanh ngay ở lần đỏ đầu**, vì trước khi dữ liệu về chuông vốn không có số. Sửa: đợi `SHELL_QUERY_KEY` có dữ liệu rồi mới khẳng định; sau đó đỏ đúng (không tìm thấy link "Thông báo" vì tên còn là "Thông báo, 3 mới"). Một test "giữ cùng object khi danh sách đổi mà số không đổi" cũng được viết lại để thật sự đổi danh sách (công tắc kênh) trước khi so, nếu không nó xanh dù không có chia sẻ cấu trúc ở `select`.
  - **Xanh:** `src/app/shell` + `useAccounts.test.tsx` 113/113 (baseline trước khi sửa 103). Cổng đầy đủ: `pnpm lint` 0 lỗi (2 cảnh báo cũ ở `features/public`), `pnpm exec tsc -b` 0, `pnpm test` **99 file / 905 test** xanh, `pnpm build` 0.
  - **Chrome thật (Chromium của Playwright, Vite thật của `apps/sino-web` cổng 5199, `/api/*` giả bằng `page.route`: ba tài khoản `CONNECTED`, `AUTH_EXPIRED`, `ERROR`, không có backend), theme sáng:**
    - **1440:** cột bên `Tài khoản` ghi "2 cần xử lý", `Đăng ký` không "mới", chân cột "3 tài khoản", hai chuông tên "Thông báo", 0 chấm. Danh sách tài khoản treo vĩnh viễn: `Tài khoản` không "cần xử lý", chân cột không có dòng "N tài khoản".
    - **1024:** dải icon `Tài khoản, 2 cần xử lý`, `Đăng ký` không "mới", chuông "Thông báo".
    - **390:** trang Thêm "3 tài khoản · 2 cần xử lý" với chấm đỏ, dòng `Tài khoản, 2 cần xử lý`, dòng `Đăng ký` và `Thông báo` không huy hiệu; chuông "Thông báo". Xem ảnh chụp lúc chạy; không lưu vào repo.
  - **NOT VERIFIED:** theme tối (để cho task nghiệm thu của màn, theo `CLAUDE.md`); backend thật (không có ở môi trường này; `GET /api/accounts` đã có từ trước và nằm trong các test MSW); `frontend-ci` trên GitHub (chưa push); `openspec validate --strict` (CLI `openspec` không có ở môi trường này: spec viết theo đúng mẫu `Requirement` MUST + `Scenario` WHEN/THEN của các spec có sẵn); `.docx` của file kiến thức phase 1 (GenOffice không có ở môi trường này: `.md` đã sửa, `.docx` cần sinh lại).

- [x] 2.3 **NS-05 — Hai test `AppShell` không phụ thuộc giờ chạy** · `sino-web` (2026-10-28, ngoài kế hoạch đầu; người dùng: "giao kỹ sư sino-web sửa 2 test AppShell phụ thuộc đồng hồ ngay sau khi AV-03 xong")
  - **Goal:** `src/app/shell/AppShell.test.tsx` *rail (tablet) › names each icon-only link, with what needs attention* và *tab bar (mobile) › has the five mobile tabs of the canvas…* xanh ở mọi giờ, mọi ngày, mọi múi giờ.
  - **Hiện trạng:** hai test đếm việc quá hạn của dữ liệu mẫu theo đồng hồ thật mà không cố định ngày giờ: đỏ lúc 00:07 ngày 2026-10-28 (Asia/Ho_Chi_Minh), xanh ngày 2026-10-27; đỏ cả trên `524da56` khi chưa có thay đổi nào. Test cạnh đó ("takes the owner from the shell data…") đã cố định đồng hồ bằng `CANVAS_NOW`. Có thể làm `frontend-ci` đỏ tùy giờ chạy.
  - **Acceptance criteria:** chỉ ra vì sao số "quá hạn" đổi theo giờ; hai test cố định đồng hồ và xanh khi chạy ở nhiều giờ khác nhau (giả `TZ` và giờ hệ thống: trước và sau nửa đêm, sau 21:05 giờ Việt Nam, giờ UTC như CI); không đổi code sản phẩm, trừ khi tìm ra lỗi thật (khi đó dừng và báo quản lý); `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build` xanh.
  - **Files:** `apps/sino-web/src/app/shell/AppShell.test.tsx`, helper test nếu cần.

  **Nguyên nhân gốc (2026-10-28):** `renderApp` mặc định dùng `createTasksSample(new Date())`; mọi giờ trong mẫu dời theo `now − CANVAS_NOW`. Việc có `dueAt` (hóa đơn tháng 9, tiền nhà) dời đúng từng mili giây nên không đổi: hóa đơn luôn quá hạn, tiền nhà luôn chưa. Việc cả ngày "Trả lời: Ảnh chuyến đi Đà Lạt" (`dueDate`) thì dời theo **số ngày làm tròn** (`dayClockFrom`, mốc 14:05) còn `AppShell` so nó với **ngày hôm nay theo múi giờ** (`isOverdue`: `dueDate < localDateOf(now)`), ngày đổi lúc 00:00. Làm tròn nửa ngày cách mốc 14:05 là 02:05, nên từ **00:00 đến 02:04 giờ Việt Nam** ngày của việc cả ngày đã qua và mẫu có 2 việc quá hạn thay vì 1 (`navCountsOf` trả `tasksOverdue: 2`, tên link thành "… 2 quá hạn"). Thêm một cái nữa không làm đỏ hai test này: sau **21:05** tiền nhà (17:00 ngày canvas) rơi sang ngày hôm sau nên `tasksDue` từ 3 về 2 (đó là lý do test "takes the owner…" đã cố định đồng hồ). Logic "quá hạn" của app đúng; chỉ dữ liệu mẫu mô phỏng thời gian không nhất quán trong khung 00:00–02:04. Màn Việc và khung app lấy việc từ API thật (`useTasks`); `createTasksSample` chỉ vào bản chạy thật qua màn Lịch, chưa có API nên dùng dữ liệu mẫu (`calendar.api.ts` → `calendar.sample.ts`, D-42): trong khung 00:00–02:04 giờ Việt Nam, màn Lịch mẫu đặt việc cả ngày lệch một ngày so với "hôm nay". Chỉ là dữ liệu mẫu; không sửa, báo quản lý nếu muốn xử.

  **Thực hiện NS-05 (2026-10-28, AUTO):** `AppShell.test.tsx` thêm helper `atCanvasMoment(test)` (dựng `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(CANVAS_NOW)`, `useRealTimers()` trong `finally`; giải thích ngay trên helper). Hai test *rail (tablet) › names each icon-only link…* và *tab bar (mobile) › has the five mobile tabs…* chạy trong helper. Test "takes the owner from the shell data…" vốn đã tự cố định đồng hồ bằng đúng đoạn đó nên chuyển sang dùng helper (hành vi y nguyên, bỏ chú thích lẻ đã gộp vào helper). Không đổi code sản phẩm, không đổi `renderApp`/`tasks.sample.ts`/`canvasClock.ts`.

  **Kiểm chứng (2026-10-28):**
  - **Cách giả giờ:** `faketime` không có, nên dùng một cấu hình Vitest tạm nằm ngoài repo (scratchpad): gộp `vite.config.ts` và thêm một setup file chạy trước `setup.ts`, đặt `FAKE_NOW` bằng cách dời `globalThis.Date` (`new Date()` và `Date.now()` trả `thực + (FAKE_NOW − lúc chạy)`), và đặt `TZ` qua `test.env`. Kiểm bằng file thăm dò: giờ giả giữ nguyên cả sau `vi.useRealTimers()`; `TZ` đúng múi giờ yêu cầu. Cấu hình của repo ép `test.env.TZ = 'Asia/Ho_Chi_Minh'` nên `TZ=UTC` ở ngoài (như CI) **không có tác dụng**: kiểm bằng `TZ=UTC pnpm exec vitest run …` thấy múi giờ trong test vẫn là Asia/Ho_Chi_Minh; do đó CI luôn chạy ở giờ Việt Nam, và đổi theo **giờ trong ngày**, không theo múi giờ.
  - **Đỏ trước, xanh sau (cùng hai test, file HEAD so với file mới, TZ Asia/Ho_Chi_Minh):** giờ giả 27/10 12:00, 28/10 02:05:30, 21:30, 23:59:30 → cả hai xanh; 28/10 00:07 và 01:59:30 → **bản cũ đỏ 2/2** (`Unable to find … name "Việc cần làm, 1 quá hạn"` và `"Việc, 1 quá hạn"`), bản mới xanh 2/2. Bản cũ cũng đỏ ở giờ thật 00:31 ngày 28/10 trước khi sửa.
  - **Cả file `AppShell.test.tsx` (41 test), bản mới, xanh 41/41 ở:** Asia/Ho_Chi_Minh 27/10 23:59:40, 28/10 00:00, 00:07, 01:00, 02:04:30, 02:05:30, 09:00, 14:05, 21:04:30, 21:05:30, 23:59:30, 31/10 00:10, 31/12 23:59:30, 29/02/2028 00:30; `TZ=UTC` 27/10 23:59:40, 28/10 00:07, 01:00, 02:04:30, 21:05:30, 23:59:30, 31/12 23:59:30, 29/02/2028 00:30; `America/Los_Angeles` bốn mốc (00:07, 21:05:30 giờ VN; 12:00Z và 17:00Z). Giờ thật 23:49 với `TZ=UTC` bên ngoài: 41/41.
  - **Hai test đích cũng xanh ở** `Pacific/Kiritimati` (UTC+14) và `Pacific/Pago_Pago` (UTC−11), mỗi nơi bốn mốc.
  - **Phát hiện, ngoài phạm vi, không sửa:** test "takes the owner from the shell data…" đỏ ở `Pacific/Kiritimati` và `Pacific/Pago_Pago` (`Việc cần làm, 2 tới hạn` không có) vì ngày của tiền nhà/việc cả ngày rơi sang ngày khác ở múi giờ đó; **đỏ cả ở file HEAD** nên có từ trước. Không vào được từ repo (`test.env.TZ` ép giờ Việt Nam), nên chỉ ghi lại.
  - **Cổng:** `pnpm lint` 0 lỗi (2 cảnh báo cũ ở `features/public`); `pnpm exec tsc -b` 0; `pnpm build` 0; `pnpm exec vitest run --maxWorkers=4` (một lần, giờ thật 23:49) **130 file / 1350 test xanh**, 70 giây.
  - **NOT VERIFIED:** `frontend-ci` trên GitHub (chưa push). Toàn bộ suite chỉ chạy một lần ở giờ thật (23:49 VN), theo giới hạn RAM của máy; các test khác (ngoài `AppShell.test.tsx`) chưa chạy ở các giờ giả. Quét 24 giờ chỉ làm cho `createTasksSample` + `navCountsOf` (mỗi 5 phút ngày 28/10): chỉ khung 00:00–02:04 cho 2 việc quá hạn; `tasksDue` đổi tại 21:05.
  - **Nghiệm thu:** người dùng 2026-10-28 ("Được, commit"). Quản lý chạy lại: `pnpm lint` 0 lỗi (2 cảnh báo cũ), `tsc -b` 0, `AppShell.test.tsx` 41/41 với `TZ=Asia/Ho_Chi_Minh` và `TZ=UTC`, toàn bộ `vitest run --maxWorkers=4` 130 file, 1350/1350, `pnpm build` 0. `frontend-ci` trên GitHub kiểm sau lần push tới.

## 3. Nghiệm thu

- [ ] 3.1 **NS-04 — Người dùng xem, rồi archive**
  - **Việc:** người dùng xem khung app (chuông, Đăng ký, "N tài khoản", trang Thêm); sinh lại `.docx` của `docs/knowledge/phase-1-frontend-foundation.md`; `openspec validate shell-real-counts --strict`; `openspec archive shell-real-counts -y`.
  - **Còn lại, ngoài change này (thấy khi làm, không sửa):** cột bên đọc tên chủ tài khoản từ `shell.owner` (mẫu "An Nguyễn"); thanh trên cùng luôn "Đồng bộ 2 phút trước"; trong lúc số thật của hộp thư, tin nhắn, việc đang tải thì `AppShell` cho số mẫu (7, 5, 3) chớp lên; màn Tổng quan là mẫu cả màn: ở Chrome thật Tổng quan vẫn nói "Hai tài khoản đang chạy bình thường · Messenger cần đăng nhập lại" trong khi cột bên đã nói "2 cần xử lý" từ danh sách thật. Chưa có yêu cầu nào cho các chỗ này.
