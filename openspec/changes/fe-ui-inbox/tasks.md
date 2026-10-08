# Màn Hộp thư với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-52, D-53 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [x] 1.1 **IN-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
  - **Thực hiện (2026-10-08, AUTO):** `inbox.types.ts` (`InboxData`, `ConversationItem`, `ConversationDetail`, `Message`, `LinkedItem`…); `inbox.sample.ts` (9 cuộc trò chuyện: 7 hiện như canvas, 1 đang tạm ẩn, 1 đã lưu trữ; id `conv-1`…`conv-4` trùng màn Tổng quan; chi tiết đầy đủ cho hợp đồng, Gia đình, Lê Hoàng hết quyền gửi); `inbox.api.ts` (`fetchInbox`, `fetchConversation`, `markRead`, `sendMessage` mẫu trễ 0,8 s để thấy "Đang gửi"); `useInbox.ts` (`useInbox`, `useConversation` lấy dòng từ danh sách, `useMarkRead` sửa danh sách + khung app + Tổng quan, `useSendMessage` thêm tin "Đang gửi" → tin đã lưu, lỗi → "Không gửi được"); `format.ts` (nhóm ngày, giờ của dòng, dòng dấu, xem trước, nguồn, lọc, kích thước tệp, đầu thư, giờ thư, trạng thái bong bóng, đoạn văn, việc liên quan). Dùng chung: `src/shared/time/canvasClock.ts` (giờ canvas cho dữ liệu mẫu, Tài khoản dùng lại), `weekdayNumbered`, `weekdayShort`, `daysSinceMonday` trong `local.ts`.
  - **Làm khác kế hoạch:**
    - Việc liên quan có thêm `allDay`. **LÝ DO:** canvas ghi "hạn T4 07/10" (không giờ) cho task cả ngày nhưng "T7 03/10 17:00" cho task có giờ.
    - Dòng dấu chọn việc **gần nhất sắp tới** (rồi tới việc gần nhất đã qua). **LÝ DO:** canvas tự mâu thuẫn: "Hợp đồng" (task + lịch hẹn + ghi chú) ghi "Task · hạn T4 07/10" còn "Gia đình" (cùng loại) ghi "Task · Lịch hẹn"; quy tắc này khớp 2/3 dòng của canvas và nói điều có ích nhất (hạn gần nhất); "Gia đình" thành "Task · hạn T7 03/10 17:00".
    - Danh sách lấy tin cuối **đã gửi xong**: tin "Đang gửi" 08:24 của Gia đình không đổi xem trước (canvas: dòng vẫn là tin của Hà 08:20).
    - Một hội thoại tạm ẩn rồi hiện lại xếp theo lúc hiện lại (desktop: "Nhóm chạy bộ" nằm "HÔM NAY", giờ "Hôm qua"). **LÝ DO:** canvas tablet đặt nó ở "HÔM QUA"; theo desktop.
  - **Kiểm chứng (2026-10-08):** RED 31/33 trên stub (2 test kiểm "không quá số đếm" qua được vì danh sách rỗng); GREEN 33/33. Kiểm tra ngược 43 lỗi gài: 40 bị bắt; lọt "chọn việc sớm nhất" (thêm ca việc đã qua đứng trước việc sắp tới → bắt), "trạng thái cho tin đến" (điều kiện thừa vì hợp đồng chỉ cho tin của mình có trạng thái → bỏ), 1 lỗi gài sai cú pháp (viết lại → bắt). Script kiểm tra ngược từng dừng vì Windows khóa file khi đổi tên → sửa script ghi thẳng, thử lại, luôn khôi phục; đã dọn file sót. `pnpm lint` 0/0, `pnpm test` 213/213, `pnpm build` ok.
  - **Files:** `src/features/inbox/{inbox.types,inbox.sample,inbox.api,useInbox,format}.ts`, test; có thể `src/shared/time/local.ts`.
  - **Hướng làm:** kiểu đúng `design.md`; mẫu theo canvas (7 cuộc trò chuyện hiện + 1 đang tạm ẩn + 1 đã lưu trữ; chi tiết đầy đủ cho "Hợp đồng thuê văn phòng" và "Gia đình", các cuộc khác ngắn gọn); `useMarkRead` sửa danh sách, khung app, Tổng quan; `useSendMessage` thêm tin "Đang gửi" rồi đổi khi xong.
  - **Test:** nhóm ngày, giờ của dòng, dấu việc, lọc, số đếm, kích thước tệp, câu trạng thái; dữ liệu mẫu nhất quán (số đếm khớp danh sách và Tổng quan); mutation đúng cuộc trò chuyện; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `inbox-screen`.

## 2. Desktop

- [ ] 2.1 **IN-02 — Bố cục 3 cột: cột nguồn, danh sách, đọc thư email; lọc; đánh dấu đã đọc**
  - **Files:** `src/features/inbox/InboxPage.tsx`, `components/*`, `src/app/router.tsx`, test.
  - **Test:** scenario *Hộp thư lúc 14:05*, *Chỉ Zalo, chưa đọc*, *Mở hợp đồng*, thư cũ bấm để mở, *Đọc Gia đình* (phần danh sách), nút chưa có chức năng; Chrome 1440 sáng / tối.
  - **Acceptance criteria:** *Danh sách hợp nhất*, *Lọc hộp thư*, *Đọc thư email*, *Đánh dấu đã đọc*, *Nút chưa có chức năng*.

- [ ] 2.2 **IN-03 — Hội thoại chat và cột thông tin**
  - **Files:** `components/ChatThread.tsx`, `components/ConversationInfo.tsx`, `InboxPage.tsx`, test.
  - **Test:** scenario *Mở Gia đình*; tin hệ thống, vạch chưa đọc, ảnh, việc gắn với tin; Chrome.
  - **Acceptance criteria:** *Hội thoại chat*.

## 3. Soạn, kích thước khác, trạng thái

- [ ] 3.1 **IN-04 — Soạn và gửi trên dữ liệu mẫu**
  - **Test:** scenario *Nhắn Gia đình*; Ctrl Enter với email; nội dung rỗng không gửi; "Đang gửi" rồi đổi.
  - **Acceptance criteria:** *Soạn và gửi*.

- [ ] 3.2 **IN-05 — Tablet và mobile**
  - **Test:** 2 cột ở 768–1279px; mobile: danh sách, chip lọc, trang hội thoại có nút quay lại và không có thanh dưới; Chrome 1024 / 768 / 390px.
  - **Acceptance criteria:** phần tablet, mobile của *Danh sách hợp nhất*, *Đọc thư email*, *Hội thoại chat*.

- [ ] 3.3 **IN-06 — Trạng thái hộp thư và hội thoại**
  - **Test:** đang tải, chưa có nguồn, đồng bộ lần đầu, lỗi + "Thử lại", ngoại tuyến; hội thoại của tài khoản hết quyền.
  - **Acceptance criteria:** *Trạng thái hộp thư*, phần `canSend` của *Soạn và gửi*.

## 4. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 4.1 **IN-07 — Nghiệm thu, tài liệu, archive**
