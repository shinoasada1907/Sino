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

## 3. Nghiệm thu

- [ ] 3.1 **NS-04 — Người dùng xem, rồi archive**
  - **Việc:** người dùng xem khung app (chuông, Đăng ký, "N tài khoản", trang Thêm); sinh lại `.docx` của `docs/knowledge/phase-1-frontend-foundation.md`; `openspec validate shell-real-counts --strict`; `openspec archive shell-real-counts -y`.
  - **Còn lại, ngoài change này (thấy khi làm, không sửa):** cột bên đọc tên chủ tài khoản từ `shell.owner` (mẫu "An Nguyễn"); thanh trên cùng luôn "Đồng bộ 2 phút trước"; trong lúc số thật của hộp thư, tin nhắn, việc đang tải thì `AppShell` cho số mẫu (7, 5, 3) chớp lên; màn Tổng quan là mẫu cả màn: ở Chrome thật Tổng quan vẫn nói "Hai tài khoản đang chạy bình thường · Messenger cần đăng nhập lại" trong khi cột bên đã nói "2 cần xử lý" từ danh sách thật. Chưa có yêu cầu nào cho các chỗ này.
