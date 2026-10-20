# Dấu trên tab và thanh thông báo tin mới · Implementation Plan

> **AUTO mode** cho riêng change này (người dùng 2026-10-19: "AUTO đi"). D-317…D-320 do agent chốt, cần xem lại.
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở 1440, 1024 và 390 (khung shell đổi nên cả ba cỡ); file kiến thức phase 5 + `.docx`, `genoffice docs check`; commit trên `dev`. Không push khi người dùng chưa bảo.

## 1. Dấu trên tab

- [x] 1.1 **NF-01 — Số trong tiêu đề và chấm trên biểu tượng**
  - **Goal:** đang ở tab khác vẫn thấy có tin chưa đọc (D-317).
  - **Files:** `apps/sino-web/src/app/shell/useTabUnread.ts` (+ test), `apps/sino-web/public/favicon-unread.svg`, `apps/sino-web/src/app/shell/AppShell.tsx` (gọi hook, tính tổng), test `AppShell`.
  - **Acceptance criteria:** spec `web-notifications` *Tiêu đề và biểu tượng của tab theo số tin chưa đọc* (cả 7 scenario).
  - **Test:** Vitest: hook (`N`, `99+`, 0, `CHAT` null, undefined, gỡ ra thì trả lại); `AppShell` qua `renderApp` với số chưa đọc đã gieo, và một test số đổi khi cache đổi.
  - **Depends on:** không.
  - **Thực hiện (2026-10-19, AUTO):** `useTabUnread(total)` đặt `(N) Sino` và đổi `href` của `link rel="icon"`, trả lại đúng giá trị đã thấy khi số đổi và khi `AppShell` bị gỡ; `undefined` (số chưa về) thì không đụng tới. `AppShell` gọi nó với `EMAIL + (CHAT ?? 0)`. `public/favicon-unread.svg`: dấu Sino của `favicon.svg` thêm một chấm `#E56B6F`.
  - **Làm thêm so với kế hoạch:** `favicon.test.ts`. **LÝ DO:** mở thẳng `favicon-unread.svg` trong Chrome thì báo "Double hyphen within comment": chú thích XML của tôi có `--danger`, mà `--` cấm trong chú thích XML, nên file không hợp lệ và không được vẽ: tab sẽ không có biểu tượng đúng lúc có tin. Test của hook chỉ kiểm `href`, jsdom không mở file. Test mới đọc cả hai file, phân tích bằng `DOMParser` (`image/svg+xml`) và kiểm không có `parsererror`, có đúng một chấm ở bản chưa đọc, dấu Sino giống hệt bản thường.
  - **Bằng chứng (2026-10-19):** đỏ trước: `useTabUnread.test.ts` (thiếu module), `AppShell.test.tsx` 4 test `expected 'Sino' to be '(3) Sino'` (2 test canh hành vi cũ đã xanh từ đầu: không sinh `(0) Sino`, không đụng trang ngoài app); `favicon.test.ts` đỏ với `<parsererror>` ở `favicon-unread.svg` còn `favicon.svg` xanh (lần đỏ đầu tiên sai chỗ vì tôi dùng `import.meta.url`, không phải `file:` trong Vitest: đổi sang `process.cwd()`, rồi mới đỏ đúng). Xanh: 7 test hook + 6 test tab ở `AppShell` + 4 test favicon. Chrome thật: tiêu đề tab `(2) Sino` rồi `(3) Sino`, `(4) Sino`, về `Sino` khi đọc hết; biểu tượng `/favicon-unread.svg` rồi `/favicon.svg`; mở file SVG sau khi sửa: 0 `parsererror`, 1 `circle`, nhìn thấy dấu S với chấm đỏ.
  - **Lỗi thứ hai bắt được ở cổng cuối:** bản đầu của `favicon.test.ts` đọc file bằng `node:fs` và `process.cwd()`, nên `tsc -b` báo `Cannot find name 'node:fs'` (tsconfig của app chỉ nạp `vite/client`) và `pnpm build` hỏng theo, tức `frontend-ci` sẽ đỏ. Log của tôi vẫn in "tsc exit 0" vì cách nối `| tail && echo` luôn thoát 0; sửa bằng `import … ?raw` của Vite (không cần Node), và từ đó cổng lấy mã thoát thật của từng lệnh. Cổng cuối, mã thoát thật: lint 0 (0 lỗi, 2 cảnh báo cũ), `tsc -b` 0, build 0, test 0 với **97 file / 878 test**. Test favicon vẫn đỏ khi đưa lại `--` vào chú thích (3 test), xanh khi bỏ.

## 2. Thanh thông báo

- [x] 2.1 **NF-02 — Thanh tin mới trên mọi màn**
  - **Goal:** tin mới hiện ra ở mọi màn của app, không chỉ trong danh sách (D-318, D-319).
  - **Files:** `apps/sino-web/src/app/shell/useArrivalNotices.ts`, `NoticeBar.tsx` (+ test cạnh từng file), `apps/sino-web/src/app/shell/AppShell.tsx` (một hàng lưới).
  - **Acceptance criteria:** spec *Thanh thông báo tin mới trên mọi màn của app* (cả 10 scenario).
  - **Test:** Vitest + `renderApp` + `publishConversationsChanged`; kiểm vị trí: thanh nằm giữa thanh trên cùng và `main` ở ba cỡ (Chrome).
  - **Depends on:** NF-01 (cùng sửa `AppShell`).
  - **Thực hiện (2026-10-19, AUTO):** `useArrivalNotices()` nghe `onConversationsChanged`, đếm `sync` có `newInbound > 0`, đổi `accountId` ra loại từ frame trong cache (tải một lần khi tài khoản chưa có, `staleTime` 30 giây), không đếm khi đang ở đúng danh sách với tab hiện, tắt khi vào màn / "Xem" / đóng / 6 giây sau khi tab hiện lại trên màn đó. `NoticeBar` (vùng `role="status"` luôn có, cao 0 khi rỗng; mỗi loại một dòng với "Xem" và nút đóng). `AppShell`: lưới thành `auto auto minmax(0,1fr)`, thanh ở hàng 2, `main` ở hàng 3. `NOTICE_MS` của `useNewMailNotice` được `export` để hai dải dùng chung 6 giây. `shellPart` của `renderApp` biết thêm `notice-bar`.
  - **Làm khác kế hoạch:**
    - ~~Hỏi cả hai frame `inboxKey(CHAT)` và `inboxKey(EMAIL)`~~ → đọc frame có sẵn của loại nào cũng được, tải một lần khi thiếu (design D-318 đã sửa). **LÝ DO:** `fetchInbox` trả mọi tài khoản và mọi nhà cung cấp, `screenFrame` ở `InboxPage` mới lọc theo loại; hỏi cả hai là tải thừa.
    - Thêm `staleTime` 30 giây khi tải lại frame. **LÝ DO:** test `EventStream` cho thấy mỗi sự kiện của một tài khoản không có trong frame sẽ gây một lần tải; backend mà cứ gửi sự kiện của một tài khoản đã bị xóa thì web hỏi mãi.
    - ~~`useEffect` theo `pathname` để tắt dòng~~ → đặt state trong lúc render (`shownAt`). **LÝ DO:** lint `react/set-state-in-effect` (cảnh báo mới do tôi gây ra, đã sửa, `pnpm lint` về đúng 2 cảnh báo cũ ở `features/public`); effect chạy sau khi màn đã vẽ nên màn vẽ hai lần.
  - **Test cũ phải sửa (hành vi mới đúng chạm vào chúng):** `LiveInbox.test.tsx` 2 test khẳng định không có nút `tin mới`/`thư mới` trên **cả màn hình** mà ý của chúng là dải của danh sách → hỏi trong `list()`, và test Hộp thư thêm một dòng khẳng định thanh nói "1 tin mới"; `EventStream.test.tsx` phát sự kiện cho `acc-1` (không có trong mẫu) nên hook đi tải frame mà test không có handler → dùng `acc-gmail` của mẫu.
  - **Bằng chứng (2026-10-19):** đỏ trước: `useArrivalNotices.test.tsx` và `NoticeBar.test.tsx` (thiếu module), 5 test tích hợp của thanh ở `AppShell`. Xanh: 19 + 6 + 5 test. **Lỗi gài 12/12 bị bắt**; lần đầu 10/12, hai mutant sống sót chỉ ra chỗ hở thật nên thêm test: sự kiện `newInbound: 0` không được gọi mạng, và dòng phải còn khi tab ẩn lâu hơn 6 giây; thêm một test cho `staleTime` (đưa về 0 thì đỏ `got 2 times`). Chrome thật (Vite thật + API giả có SSE thật, `POST /__emit`): xem NF-03.

## 3. Nghiệm thu

- [ ] 3.1 **NF-03 — Chrome, kiến thức, state**
  - **Goal:** nhìn tận mắt ở ba cỡ × hai theme; ghi lại.
  - **Việc:** Chrome ở 1440 / 1024 / 390, sáng và tối: thanh hiện/tắt, tiêu đề tab đổi, biểu tượng đổi (chụp tab); ~~mục 18 trong `docs/knowledge/phase-5-multi-provider-send.md`~~ mục 7 của `docs/knowledge/phase-3-sync-realtime.md` + `.docx`; cập nhật `PROJECT_STATE.md`; `openspec archive inbox-notifications -y` khi xong và người dùng đã xem.
  - **Depends on:** NF-01, NF-02.
  - **Làm khác kế hoạch:** file kiến thức là phase 3 chứ không phải phase 5. **LÝ DO:** change này là về luồng sự kiện realtime của web (mục 3 của file phase 3 nói về `conversations.changed`), không phải về gửi tin nhiều nhà cung cấp.
  - **Đã làm (2026-10-19):** Chrome thật, Vite thật của `apps/sino-web` (cổng 15173) proxy tới một API giả viết tạm ở cổng 18090 (không nằm trong repo; chỉ có các response mà shell và hai danh sách đọc, cộng một cửa `POST /__emit` bắn `conversations.changed` thật qua SSE). Cổng 8080 không dùng vì là cổng backend của người dùng. **1440:** sáng và tối; thanh khít giữa thanh trên (đáy 73 px) và trang (đỉnh 122 px). **1024:** sáng và tối; đáy thanh trên 65 px = đỉnh thanh, đáy thanh 114 px = đỉnh trang, rộng 952 px. **390:** chỉ theme tối; không cuộn ngang, thanh sát đầu màn (màn Việc tự vẽ header di động nên thanh trên của shell ẩn), tab bar vẫn ở đáy. Hành vi: hai dòng cho hai loại; sự kiện `import` 300 thư không đếm; "Xem" sang `/messages`, dòng đó tắt, dòng kia còn; ở `/messages` với tab hiện, tin Zalo mới không thêm dòng vào thanh còn danh sách có dải riêng; nút đóng; đọc hết thì tiêu đề về `Sino` và vùng trạng thái cao 0 px. Tab ẩn: giả `visibilityState` là `hidden` rồi bắn `visibilitychange` ở `/messages`, bắn một tin: thanh hiện, còn sau 9 giây; cho tab hiện lại: còn ở giây 3, tắt ở giây 8 (3052 ms và 8070 ms).
  - **Còn lại:** người dùng xem rồi `openspec archive inbox-notifications -y`. **NOT VERIFIED:** theme sáng ở 390; một lần chuyển tab bằng tay thật (ở trên là giả bằng mã); một tin Zalo thật đi từ webhook tới thanh (cần `sino-api` + `sino-zalo` thật, thuộc ZL-13); dòng "2 tin mới" trên `apps/sino-web` build thật ở public.
