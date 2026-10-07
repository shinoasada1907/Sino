# Màn Tổng quan với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận ("để tôi làm UI-xx") thì chạy TRAINING.
> Brainstorm với người dùng 2026-10-07 (D-42, D-43, D-44). Phần cấu trúc được duyệt; người dùng: "làm đi". Hợp đồng dữ liệu (`design.md`) để người dùng xem trước UI-02.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push), cập nhật `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`. `pnpm lint && pnpm test && pnpm build` xanh trước khi commit.

## 1. Khung app

- [ ] 1.1 **UI-01 — Router, khung app co giãn, trang "đang được dựng", 404**
  - **Goal / Why:** khung dùng chung cho mọi màn; điều hướng chạy được ngay cả khi màn chưa dựng.
  - **Depends on:** FE-01.
  - **Files:** `src/main.tsx`, `src/app/router.tsx`, `src/app/shell/{AppShell,Sidebar,Rail,TabBar,Topbar,navItems}.tsx`, `src/app/UnderConstructionPage.tsx`, `src/app/NotFoundPage.tsx`, xóa `src/app/App.tsx` (trang tạm của FE-01), test.
  - **Hướng làm:** `createBrowserRouter` với một route layout (`AppShell` + `Outlet`) chứa các trang, `/` → `/overview` (`Navigate`), `*` → 404 (ngoài khung app). Bảng mục điều hướng một chỗ (`navItems`: đường dẫn, nhãn, icon, nhóm, khóa số đếm). Sidebar/Rail/TabBar/Topbar ẩn hiện theo breakpoint của canvas bằng class Tailwind (`xl:` = 1280px, `md:` = 768px). Số đếm, tên người dùng, trạng thái đồng bộ đọc từ `useOverview()`; ở task này hook trả một khung dữ liệu mẫu tối thiểu, UI-02 hoàn thiện. `/overview` tạm là trang "đang được dựng" cho tới UI-03.
  - **Test:** `/` → `/overview`; đủ mục điều hướng với đúng `href`; mục đang mở có `aria-current="page"`; số đếm lấy từ dữ liệu (đổi dữ liệu trong test thì số đổi); mục Rail có `aria-label`; `/calendar` hiện trang "đang được dựng" có tên màn và liên kết về Tổng quan; `/khong-co-trang-nay` hiện 404 có liên kết về; nút đổi theme có trong thanh trên cùng; không có nút ngôn ngữ. Trình duyệt thật: 1440 / 1024 / 390px, không tràn ngang, Tab qua điều hướng có viền focus.
  - **Acceptance criteria:** requirement *Khung app co giãn theo kích thước màn hình*, *Điều hướng chính*, *Trang đang được dựng*, *Trang không tồn tại* (spec `web-app-shell`).

## 2. Dữ liệu của màn Tổng quan

- [ ] 2.1 **UI-02 — Hợp đồng dữ liệu, dữ liệu mẫu, `useOverview`, hàm định dạng**
  - **Goal / Why:** template giao backend, và nguồn dữ liệu duy nhất cho màn.
  - **Depends on:** UI-01; người dùng đã xem hợp đồng dữ liệu trong `design.md`.
  - **Files:** `src/features/overview/{overview.types,overview.sample,useOverview,format}.ts`, `src/shared/time/useNow.ts`, test.
  - **Hướng làm:** kiểu đúng như `design.md`; `createOverviewSample(now)` sinh mốc thời gian tương đối theo `now`, nội dung theo canvas; `useOverview()` dùng TanStack Query với hàm lấy dữ liệu trả mẫu (sau này đổi sang gọi API); `format.ts` gồm các hàm thuần, nhận `now` và múi giờ từ ngoài.
  - **Test:** từng hàm định dạng (lời chào 4 buổi và ranh giới giờ, dòng ngày giờ, giờ tương đối trong ngày / hôm qua / cũ hơn, "sau N giờ", tỷ lệ theo nguồn kể cả tổng 0, câu tóm tắt tài khoản, câu từng loại hoạt động, số thành chữ); dữ liệu mẫu có mốc thời gian trước `now` và tổng khớp nhau (ví dụ `inbox.unreadCount` = tổng `bySource`); kiểm tra ngược cho các hàm.
  - **Acceptance criteria:** requirement *Dữ liệu của màn Tổng quan theo hợp đồng* (spec `overview-screen`).

## 3. Màn Tổng quan

- [ ] 3.1 **UI-03 — Phần đầu trang và 7 thẻ, co giãn, trạng thái chưa có dữ liệu**
  - **Goal / Why:** màn Tổng quan đúng canvas ở 3 kích thước.
  - **Depends on:** UI-02.
  - **Files:** `src/features/overview/OverviewPage.tsx`, `src/features/overview/cards/*.tsx`, CSS bổ sung nếu cần (ví dụ nền chấm của canvas), `router.tsx`, test.
  - **Hướng làm:** theo `Dashboard`, `TabletDashboard`, `MobileDashboard`; mỗi thẻ một component nhận phần dữ liệu của nó; phần `null` → "Chưa có dữ liệu"; nút dẫn trang dùng `Link`, nút chưa có chức năng `type="button"` không gắn hành động.
  - **Test:** mỗi thẻ hiện dữ liệu mẫu (tiêu đề, số, dòng); scenario của spec (phần đầu trang lúc 14:05, Gmail 58%, việc quá hạn); `inbox = null` → "Chưa có dữ liệu" và thẻ khác vẫn hiện; "Mở hộp thư" → `/inbox`; nút chưa có chức năng không đổi trang. Trình duyệt thật: 1440 / 1024 / 390px × sáng / tối, ảnh chụp so với canvas.
  - **Acceptance criteria:** requirement *Phần đầu trang Tổng quan*, *Các thẻ của màn Tổng quan*, *Phần chưa có dữ liệu*, *Nút trên màn Tổng quan* (spec `overview-screen`).

## 4. Nghiệm thu

- [ ] 4.1 **UI-04 — Nghiệm thu, hợp đồng dữ liệu cuối, tài liệu, archive**
  - **Goal / Why:** chốt template giao backend theo code thật; đóng change.
  - **Depends on:** UI-01…UI-03.
  - **Files:** `design.md` (hợp đồng + bảng đối chiếu theo code), `apps/sino-web/README.md`, `docs/knowledge/phase-1-frontend-foundation.{md,docx}`, file này, `PROJECT_STATE.md`.
  - **Test:** checklist *Definition of Done* trong `design.md`; sau đó `openspec archive fe-ui-overview -y`.
