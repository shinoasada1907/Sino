# Màn Hộp thư với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-52, D-53 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint && pnpm test && pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [ ] 1.1 **IN-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
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
