# Trang công khai trong sino-web (landing + privacy) · Implementation Plan

> **AUTO mode** (frontend). Người dùng 2026-10-17: "trước mắt landing page tích hợp vào trong sino-web đi"; phạm vi "Landing + Privacy", cách "Chép sang, giữ sino-site"; D-310…D-315 duyệt ("làm đi").
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở 1440 và 390; file kiến thức phase 1 (mục 24) + `.docx`, `genoffice docs check`; commit riêng trên `dev`.

## 1. Nền

- [ ] 1.1 **WP-01 — Cổng `/`, khung trang công khai, `gsap`, chuyển động**
  - **Thực hiện:** `HomeGate` (D-310), route `/`, `/privacy`, `/en/privacy` tải riêng (D-313); `PublicFrame`, `PublicHeader`, `PublicFooter`, `nav.ts`, `text.ts`, `public.css`, `animate-enter` trong `index.css`; cuộn tới `#…`; tiêu đề tab (D-315); `gsap` 3.15.0; 5 component chuyển động và test của chúng chép từ `sino-site`.
  - **Acceptance criteria:** spec *Trang giới thiệu ở `/`* (cổng: chưa đăng nhập, đã đăng nhập, máy chủ lỗi), scenario *Trang công khai* của `web-app-foundation` với khung trang.

## 2. Nội dung

- [ ] 2.1 **WP-02 — Trang giới thiệu Sino Messages**
  - **Thực hiện:** `LandingPage` và các khối (Hero, ProviderStrip, Features, Planning, HowItWorks, Privacy, Faq, Band, MailRow, SectionHead) chép từ `sino-site/src/pages/messages`, link theo D-311.
  - **Acceptance criteria:** *Trang giới thiệu ở `/`*, *Link của trang giới thiệu*.

- [ ] 2.2 **WP-03 — Chính sách quyền riêng tư VI/EN, thông tin chủ sở hữu**
  - **Thực hiện:** `PolicyPage`, `PrivacyPages`, `privacy.vi.tsx`, `privacy.en.tsx`, `privacy.shared.ts` chép từ `sino-site/src/pages/privacy`; `owner.ts`, `OwnerValue` (D-314); link đổi ngôn ngữ.
  - **Acceptance criteria:** *Chính sách quyền riêng tư trong app web*, *Trang công khai tải riêng*.

## 3. Nghiệm thu (để sau, như các màn khác)

- [ ] 3.1 **WP-04 — Nghiệm thu, tài liệu, archive** (1440 / 1024 / 768 / 390 × 2 theme; nhắc người dùng điền `owner.ts` giống `sino-site/site.config.ts` trước khi nộp Google).
