# Màn Việc cần làm với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-80…D-84 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [x] 1.1 **TK-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
  - **Thực hiện (2026-10-09, AUTO):** `tasks.types.ts` (`TasksData`, `TaskItem`, `Recurrence`, `TaskSource`, `RelatedItem`, `CompletedTask`); `tasks.sample.ts` (10 việc như canvas; id `task-contract`, `task-cake` trùng việc mà mẫu Hộp thư gắn; nguồn là các cuộc trò chuyện của mẫu Hộp thư; `nextOccurrenceSample` cho máy chủ mẫu); `tasks.api.ts` (`fetchTasks`, `addTask`, `completeTask` trả `{ task, next }` và hủy nhắc chưa báo, `reopenTask`, `saveTaskNotes`); `useTasks.ts` (`useTasks`, `useTask`, `useAddTask`, `useToggleTask` đổi ngay, trả lại khi lỗi, không thêm cùng một lần kế tiếp hai lần, `useSaveTaskNotes`; mỗi thay đổi tính lại số trên điều hướng); `format.ts` (nhóm, chữ hạn / nhắc / lặp / xong / lần kế tiếp, đầu trang, lọc, số trên điều hướng, chữ chi tiết). Dùng chung: `LocalDate` trong `shared/domain.ts`; `shared/time/localDate.ts` (`localDateOf`, `daysBetweenDates`, `addDays`, `weekdayOfDate`, `dayMonthOfDate`); `dayClockFrom` trong `canvasClock.ts` (dời ngày của mẫu theo đồng hồ, làm tròn số ngày để việc cả ngày giữ chỗ giữa các việc có giờ); `WEEKDAY_NAMES`, `WEEKDAY_SHORT` của `local.ts` được export. Khung app: `NavCounts.tasksOpen` → `tasksDue`, chữ đọc "tới hạn" (D-83).
  - **Làm khác kế hoạch:**
    - Thứ tự trong một ngày: việc có giờ trước việc cả ngày (gạch ở `design.md`). **LÝ DO:** canvas.
    - `source` có thêm `subject`. **LÝ DO:** thẻ "Tin nhắn gốc" của canvas ghi cả tiêu đề thư.
    - Nguồn của "Gia hạn bảo hiểm TA-2025-0418" là tin đã bị xóa (`missing: true`). **LÝ DO:** mẫu Hộp thư không có cuộc trò chuyện "Bảo hiểm Tâm An"; dùng ca này để màn có một nguồn không mở được (thay vì một liên kết dẫn tới "không tìm thấy").
    - Canvas tự mâu thuẫn: Hộp thư ghi việc "Trả lời: Hợp đồng thuê văn phòng" hạn "T4 07/10" (cả ngày), màn Việc ghi "T4 07/10 · 17:00". Màn Việc theo canvas `Tasks`; mẫu Hộp thư không đổi.
  - **Kiểm chứng (2026-10-09):** hàm chữ RED 10/10 trên stub, GREEN; mẫu: 1 test đỏ đúng lý do (khung app chưa có `tasksDue`), xanh sau khi đổi tên; hook viết cùng code, kiểm bằng lỗi gài. Kiểm tra ngược 36 lỗi gài: 27 bị bắt ngay; 9 sống: 1 điều kiện thừa (`isOverdue` kiểm `OPEN` mà nơi gọi đã lọc → bỏ), 7 thiếu ca biên (hạn đúng bằng bây giờ, trễ 45 phút, chuỗi chỉ còn việc đã xong, hai việc mở cùng chuỗi, lặp ngày 31 sang tháng ngắn, ghi chú toàn khoảng trắng, `useTask` khi danh sách chưa về → thêm test, cả 7 bị bắt), 1 không bắt được ở máy này (`getUTCDay` → `getDay` chỉ khác ở múi giờ âm; test chạy `Asia/Ho_Chi_Minh`; code đúng, để nguyên). `pnpm lint` 0, `tsc -b` 0, `vitest` 369/369 (44 file), `pnpm build` 0.
  - **Files:** `src/features/tasks/{tasks.types,tasks.sample,tasks.api,useTasks,format}.ts`, test; `src/app/shell/{navItems.ts,shell.sample.ts}` (D-83); có thể `src/shared/time/local.ts`.
  - **Hướng làm:** kiểu đúng `design.md`; mẫu theo canvas `Tasks` (10 việc: 1 quá hạn, 2 hôm nay, 4 sắp tới, 1 không hạn, 2 đã xong; giờ dời theo đồng hồ, như canvas lúc 14:05 thứ Sáu 02/10); `completeTask` mẫu trả `next` cho việc lặp; mutation sửa cache danh sách và tính lại số trên điều hướng.
  - **Test:** nhóm, thứ tự, chữ hạn / nhắc / lặp / xong, dòng đầu trang, lọc, số trên điều hướng; mẫu khớp canvas; mutation; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `tasks-screen`.

## 2. Màn hình

- [x] 2.1 **TK-02 — Desktop: đầu trang, lọc, thêm việc, nhóm, dòng, khối chi tiết**
  - **Thực hiện (2026-10-09, AUTO):** `TasksPage.tsx` (`/tasks`, `/tasks/:taskId`; danh sách và cột "Chi tiết việc" 400 px từ 1280 px; dưới 1280 px một việc đang mở thay chỗ danh sách, D-82); `useTaskFilter.ts` (`?filter=messages|repeat`, "Tất cả" để địa chỉ sạch, giá trị lạ là "Tất cả"); `components/TaskRow.tsx` (ô xong, tiêu đề và các dòng là một liên kết mở việc, nhãn nguồn), `TaskCheck.tsx`, `QuickAdd.tsx` (Enter, bỏ khoảng trắng, tối đa 200 ký tự, giữ focus), `TaskDetail.tsx` (dữ kiện, tin nhắn gốc, ghi chú lưu khi rời ô, liên quan, "Đánh dấu xong" / "Mở lại", "Đóng"); `format.taskMeta` (dòng và biểu tượng của một việc theo canvas); route trong `router.tsx`; `renderApp` nhận `tasks`.
  - **Làm khác kế hoạch:**
    - `TasksData` có thêm `providers` (tên nhà cung cấp cho "Trần Minh Anh · Gmail"). **LÝ DO:** API việc không có tên nhà cung cấp; như Hộp thư, adapter sẽ hỏi thêm `GET /api/providers`.
    - Ô xong là checkbox thật (`appearance: none`), không phải nút. **LÝ DO:** lớp `.check` của canvas viết cho checkbox; trình đọc màn hình đọc được "đã chọn / chưa chọn".
    - Dòng việc đã xong chỉ ghi "Xong …" và "Đã tạo lần kế tiếp …" (không ghi quy tắc lặp, nhắc). **LÝ DO:** canvas, nhóm "ĐÃ XONG".
    - Không chọn việc nào thì cột phải ghi "Chọn một việc để xem chi tiết."; nút chính của việc đã xong là "Mở lại"; "Đóng" là liên kết về danh sách (giữ bộ lọc). **LÝ DO:** canvas chỉ vẽ cột phải đang mở một việc chưa xong; theo cách Hộp thư làm.
  - **Kiểm chứng (2026-10-09):** `taskMeta` RED 3 (2 test hàm chữ + 1 test mẫu) rồi GREEN; test màn viết trước code, chạy sau khi dựng (không có lần RED riêng), kiểm bằng lỗi gài. Kiểm tra ngược 28 lỗi gài: 24 bị bắt; 4 sống vì thiếu ca (nhãn "QUÁ HẠN" đỏ, rời ô ghi chú không sửa thì không lưu, dòng "Lặp lại" của việc lặp, bộ lọc lạ trong địa chỉ) → thêm test, cả 4 bị bắt (ca ghi chú phải theo dõi lời gọi `saveTaskNotes`, vì TanStack giữ nguyên object khi dữ liệu không đổi). Chrome (headless, `vite` dev :5174, chỉ `/api/auth/me` trả lời qua CDP): 1440 tối và sáng: danh sách 792 px, cột chi tiết 400 px, ô thêm 52 px, dòng đang mở được đánh dấu; xong việc quá hạn + thêm một việc → "8 việc đang mở · 5 việc tạo từ tin nhắn", hết nhóm "QUÁ HẠN"; 1024: danh sách chiếm cả màn, mở một việc thì chi tiết thay chỗ; không cuộn ngang. Lỗi gặp khi xem ảnh: ô thêm bị ép còn 25 px vì cột flex có cuộn co các phần tử con khi tràn → `*:shrink-0`. Lint báo 2 cảnh báo `jsx-key` (JSX trong một mảng dữ kiện) → thay bằng thành phần `Fact`; `pnpm lint` 0 cảnh báo, `tsc -b` 0, `vitest` 386/386 (45 file), `pnpm build` 0.
  - **Files:** `src/features/tasks/TasksPage.tsx`, `components/*`, `src/app/router.tsx`, test.
  - **Hướng làm:** theo canvas `Tasks` (1440): danh sách và khối "Chi tiết việc" 2 cột từ 1280 px; `/tasks/:taskId` chọn việc; lọc trong URL; ghi chú lưu khi rời ô.
  - **Test:** nhóm và dòng như canvas, lọc, thêm việc, xong / mở lại, chi tiết, tin nhắn gốc, đóng, việc không tồn tại.
  - **Acceptance criteria:** *Danh sách việc theo nhóm*, *Lọc việc*, *Thêm việc*, *Đánh dấu xong và mở lại*, *Chi tiết một việc* (desktop), *Số việc trên điều hướng*, *Nút chưa có chức năng*.

- [x] 2.2 **TK-03 — Tablet và mobile, trạng thái**
  - **Thực hiện (2026-10-09, AUTO):** dưới 768 px danh sách có đầu trang riêng như `MobileTasks` ("Việc cần làm", "8 đang mở", nút "Lọc" mở menu chọn một trong ba; nút đọc "Lọc: Từ tin nhắn" khi đang lọc), khung app ẩn thanh trên (`handle.mobilePageHeader`); dòng việc là đường kẻ ngang thay cho thẻ bo góc; ô thêm ghi "Thêm việc mới" (từ 768 px ghi đủ câu, chọn bằng `shared/lib/useMediaQuery.ts` vì CSS không đổi được placeholder); trang chi tiết dưới 1280 px có đầu trang con "Chi tiết việc" và nút quay lại giữ bộ lọc, không có thanh tab (`hideTabBar`); hàng "Task ⋯ ×" của khối chi tiết chỉ hiện từ 768 px. `components/TaskStates.tsx`: khung xương "Đang tải việc cần làm", "Không tải được việc cần làm" + "Thử lại"; danh sách rỗng ghi "Chưa có việc nào.", bộ lọc không còn việc nào ghi "Không có việc nào khớp bộ lọc này.". `shared/ui/dropdown-menu.tsx` có lại `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`.
  - **Làm khác kế hoạch:**
    - Không có canvas cho trạng thái và cho chi tiết trên điện thoại: dựng theo khối chi tiết desktop và trạng thái của Hộp thư (D-55); câu lỗi không đoán nguyên nhân ("Việc của bạn vẫn còn nguyên. Hãy thử lại."). **LÝ DO:** dữ liệu mẫu chưa có lỗi thật để phân loại (khác Hộp thư, nơi đã có `failureReason`).
    - Bỏ `md:bg-dots` của danh sách. **LÝ DO:** `<main>` của khung app đã có nền chấm cho mọi màn.
  - **Kiểm chứng (2026-10-09):** RED 7/7 (chưa có đầu trang mobile, menu lọc, trang con, trạng thái), GREEN; test desktop sửa một chỗ (hai tiêu đề `h1`, CSS chọn hiện một). Kiểm tra ngược 11 lỗi gài: 10 bị bắt; 1 gài sai (đổi thẻ mở `RadioItem` mà không đổi thẻ đóng, file không biên dịch, 22 test không chạy) → gài lại đúng cả hai thẻ, bị bắt. Chrome 390 sáng và tối: đầu trang "Việc cần làm | 8 đang mở", ô thêm "Thêm việc mới", không có thanh trên, thanh tab hiện; menu "Lọc" có 3 mục, "Tất cả" đang chọn, chọn "Từ tin nhắn" → `?filter=messages`, nút đọc "Lọc: Từ tin nhắn"; trang chi tiết: quay lại `/tasks?filter=messages`, không có thanh tab, không có hàng "Task ⋯ ×"; 768: danh sách 696 px; không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `vitest` 393/393 (46 file), `pnpm build` 0.
  - **Files:** `src/features/tasks/**`, test.
  - **Hướng làm:** theo canvas `MobileTasks`: đầu trang riêng ("Việc cần làm", "8 đang mở", nút "Lọc"), ô thêm, nhóm; dưới 1280 px chi tiết là trang riêng (D-82); trạng thái đang tải / lỗi / rỗng (D-55 của Hộp thư làm mẫu).
  - **Test:** mobile và tablet, trang chi tiết, trạng thái.
  - **Acceptance criteria:** *Chi tiết một việc* (dưới 1280 px), *Lọc việc* (mobile), *Trạng thái màn Việc cần làm*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **TK-04 — Nghiệm thu, tài liệu, archive**
  - **Acceptance criteria:** checklist *Definition of Done* trong `design.md`.
