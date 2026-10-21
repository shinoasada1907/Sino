# Lưu cài đặt của người dùng · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** (backend: chạy app từ worktree và gọi API thật bằng `curl`, xem DB; web: Chrome thật), rồi mới viết test tự động; kiểm chứng; ghi chú và bằng chứng tại task; commit lên `dev`. Push chỉ khi người dùng bảo.
> **Hai phiên (D-407):** phần 1 do phiên `sino-api-e0`, phần 2 do phiên `sino-web-03`. Hợp đồng API ở `design.md` D-401…D-403; đổi hợp đồng thì báo phiên kia và hỏi người dùng.
> **Lệnh kiểm tra.** `apps/sino-api`: `./mvnw -B -ntp test` trong một worktree riêng (không build trong cây chính khi người dùng chạy app từ IntelliJ). `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

## 1. `sino-api` (phiên `sino-api-e0`)

- [x] 1.1 **SB-01 — Bảng `user_settings`, module `settings`, giá trị mặc định (D-401, D-404)** — XONG 2026-10-21 (AUTO, phiên `sino-api-e0`)
  - **Files:** `db/migration/V2x__settings_create_user_settings.sql`, `dev/sino/settings/**` ~~(+ `package-info.java`)~~, test. **LÝ DO bỏ `package-info.java`:** không module nào của `sino-api` có (chỉ `common`); Modulith coi mỗi gói con của `dev.sino` là một module, gói con của nó là nội bộ.
  - **Acceptance criteria:** đọc khi chưa có dòng trả mặc định mà không ghi; `ModularityTests` xanh.
  - **Test:** test tay: chạy app từ worktree, xem bảng; rồi Testcontainers.
  - **Thực hiện:** `V23__settings_create_user_settings.sql` (V23 còn trống trên `dev`; `zalo-reactions` chưa lấy số nào): mỗi tuỳ chọn một cột, `notifications` là **sáu cột `boolean`** (D-404 để phiên backend chọn: cột riêng thì database tự kiểm từng công tắc, không cần kiểm `jsonb`), `quiet_hours_start`/`_end` cùng `NULL` là tắt, `default_reminder_minutes` `NULL` là không nhắc, `CHECK` cho mọi giá trị API nhận, khoá ngoại tới `app_user` `ON DELETE CASCADE`. Múi giờ chỉ ứng dụng kiểm: ID IANA có trong `ZoneId.getAvailableZoneIds()`, nên `+07:00` hay `UTC+07:00` bị từ chối dù `ZoneId.of` đọc được. Module `dev.sino.settings`: `domain/{Theme,DateFormat,Motion,WeekStart,Notifications,QuietHours,Settings,UserSettings}` (`Settings.DEFAULTS` là giá trị canvas; `Settings` tự giữ luật: giờ "sáng mai" 05:00–12:00, nhắc thuộc 5/10/15/30/60/120/1440 hoặc `null`, giờ tròn phút, giờ yên lặng bắt đầu khác kết thúc), `infrastructure/UserSettingsRepository`, `application/SettingsService.read` (không có dòng thì trả `Settings.DEFAULTS`, giao dịch chỉ đọc, không ghi gì).
  - **Bằng chứng:** test tay: `./mvnw spring-boot:test-run` từ worktree ở cổng 8091 (Testcontainers, không đụng app 8080 của người dùng): Flyway "now at version v23", Hibernate `validate` qua (entity khớp bảng), `\d user_settings` đúng cột và ràng buộc, 0 dòng; chèn tay bằng `psql`: hàng mặc định và hàng "tắt giờ yên lặng, không nhắc" vào được; theme `PURPLE`, chỉ có giờ bắt đầu, bắt đầu = kết thúc, `12:01`, nhắc 7 bị đúng ràng buộc tên chặn; người dùng không tồn tại bị khoá ngoại chặn; xoá người dùng thì dòng cài đặt đi theo. Test tự động sau đó: `SettingsTests` 19 (mặc định, biên 05:00/12:00/04:59/12:01, giây lẻ, bảy mức nhắc và sáu mức sai, giờ yên lặng qua nửa đêm, múi giờ, entity giữ đủ mọi trường), `SettingsServiceTests` 5 trên PostgreSQL (đọc khi chưa có dòng trả mặc định và bảng vẫn 0 dòng, đọc lại đúng cái đã lưu, chỉ đọc của mình, xoá người dùng kéo theo dòng, không có dòng nào thiếu người dùng), `ModularityTests` 2/2. Cả bộ `./mvnw -B -ntp test` trong worktree ở `16af56e` + SB-01: **2671 test, 0 lỗi, 15 bỏ qua, BUILD SUCCESS** (7:14).

- [ ] 1.2 **SB-02 — `GET` và `PATCH /api/settings` (D-401, D-402)**
  - **Acceptance criteria:** spec `user-settings` phần "Đọc cài đặt của người dùng" và "Đổi cài đặt".
  - **Test:** test tay bằng `curl` (đăng nhập, đọc, đổi từng loại trường, gộp `notifications`, `null`, giá trị sai, trường lạ, `{}`, đăng xuất rồi đọc lại); rồi Testcontainers + MockMvc (hai `PATCH` song song không mất thay đổi).

- [ ] 1.3 **SB-03 — `GET /api/settings/storage` (D-403), README**
  - **Acceptance criteria:** spec "Số liệu dữ liệu đang lưu"; cách tính `bytes` ghi tại task; bảng API trong `apps/sino-api/README.md`.
  - **Test:** test tay trên DB thật của người dùng (số khớp `storedMessages` của `/api/accounts`); rồi Testcontainers (người dùng khác không được tính).

## 2. `sino-web` (phiên `sino-web-03`)

- [ ] 2.1 **SB-10 — Đọc và ghi cài đặt qua API (D-405)**
  - **Files:** `features/settings/{settings.api.ts,useSettings.ts,…}`, các mục, `shared/theme/**`, test.
  - **Acceptance criteria:** spec "Màn Cài đặt dùng cài đặt đã lưu" (trừ số liệu).
  - **Test:** Chrome thật trên backend thật khi SB-02 xong (trước đó MSW); rồi Vitest + MSW (đổi hiện ngay, lỗi trả về, theme đã lưu được áp).
  - **Thực hiện (SB-10 + SB-11, một commit, làm trên MSW trong lúc chờ backend):** `settings.api.ts` (kiểu `UserSettings`, `SettingsChange`, `DEFAULT_SETTINGS`, `withChange`, ba lời gọi), `useSettings.ts` (`useSettings` với `staleTime: Infinity`; `useUpdateSettings`: sửa cache ngay, lần lượt trong `scope`, máy chủ trả lời thì lấy bản của máy chủ, lỗi thì trả về và ghi khoá của dòng hỏng, `notifications.<công tắc>` cho một công tắc; `useSettingValues`: mặc định và khoá control cho tới khi có bản đã lưu; `useStorageUse`), `settings.sample.ts` chỉ còn phần vẫn là mẫu (thiết bị Web Push, phiên đăng nhập, phiên bản) cùng danh sách lựa chọn theo giá trị của API và hàm đổi cho giờ yên lặng / nhắc mặc định (giá trị API có mà canvas không có thì thêm vào ô chọn); các mục dùng chúng, `SettingRow` có `error`, `Segmented` (`shared/ui`) có `disabled`; trang có thông báo "Không tải được cài đặt đã lưu." với "Thử lại". Theme: `ThemeProvider` có `chosenHere`; `ThemeSync.tsx` (D-405 đã đổi, lý do ở design) gắn trong `AppShell` như **một component con không vẽ gì**: đặt hook thẳng trong `AppShell` làm test "phiên hết hạn" đỏ (một truy vấn chưa có dữ liệu trong `AppShell` làm nó render lại sau `forgetSession` mà trước khi chuyển trang, và các truy vấn khác của shell bị dựng lại, gọi API không có handler); thử từng phần thì chỉ một `useQuery` cục bộ cũng đủ đỏ, tách ra component con thì xanh. Test: backend giả `test/fixtures/settingsApi.ts` (giữ trạng thái trong một test, `resetSettingsBackend` trước mỗi test) luôn bật trong `msw/server.ts`, vì mọi màn đã đăng nhập đều đọc theme đã lưu. Lỗi theo hợp đồng mà phiên backend nói rõ: `400 VALIDATION_FAILED`, `errors[].field` là tên trường JSON hay `notifications.<tên>`.
  - **Bằng chứng (MSW):** `SettingsOnApi.test.tsx` 9 ca (giá trị đã lưu kể cả giá trị canvas không có; mỗi thay đổi một `PATCH` đúng phần đổi và còn sau khi mở lại; lỗi trả về và chỉ một câu báo; đọc lỗi thì khoá và "Thử lại"; số liệu và "Chưa tính được."; theme của máy chủ áp cho trình duyệt chưa chọn, nhường lựa chọn của máy và ghi nó, chọn trên màn thì ghi), `SettingsPage.test.tsx` cập nhật; `UserMenu.test.tsx` 6/6 ba lần liền. `tsc -b` 0, lint 0 lỗi, build 0, `pnpm test` 1315/1319 (4 ca `FormData` đỏ sẵn). **NOT VERIFIED trên backend thật và Chrome thật:** chờ SB-02, SB-03 của phiên `sino-api-e0`; trước lúc đó, trên `localhost:5173`, màn Cài đặt báo "Không tải được cài đặt đã lưu." và khoá các control (máy chủ chưa có `/api/settings`).

- [ ] 2.2 **SB-11 — "Dữ liệu Sino đang lưu" thật (D-406)**
  - **Acceptance criteria:** spec "Màn Cài đặt dùng cài đặt đã lưu" phần số liệu.
  - **Test:** Chrome thật khi SB-03 xong; rồi Vitest.

## 3. Nghiệm thu

- [ ] 3.1 **SB-20 — Chạy thật hai phía, tài liệu, kết thúc**: đổi từng cài đặt trên web, tải lại, đăng xuất / đăng nhập, xem DB; file kiến thức; `openspec validate settings-backend --strict`; archive sau `fe-ui-settings`.
