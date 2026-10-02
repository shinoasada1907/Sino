# Kế hoạch từ tin nhắn · Implementation Plan (cấp sản phẩm)

> **HYBRID mode.** Change này là hồ sơ phạm vi và quyết định; **không có task code**. Mỗi feature (F13–F17, tạm ẩn trong F05, hẹn giờ gửi trong F10) mở một change OpenSpec riêng khi bắt đầu, với task chi tiết theo mẫu của F03. Các mục dưới đây là việc cần làm để đưa phạm vi này vào lộ trình và giữ hồ sơ đúng.
> **Không archive change này theo cách thường.** Spec ở đây mô tả đích đến, còn `openspec/specs/` mô tả hệ thống *đang chạy*. Mỗi feature change mang delta của chính nó vào `openspec/specs/` khi xong; change này archive bằng `--skip-specs` ở bước cuối (mục 4.1).

## 1. Hồ sơ và lộ trình

- [x] 1.1 **Cập nhật `openspec/roadmap.md`**
  - **Goal:** lộ trình phản ánh phạm vi mới: Phase 3 thêm F13, F14; Phase 4 mới "Kế hoạch từ tin nhắn" (F15, F16, F17, tạm ẩn); phase cũ 4 thành 5 (thêm hẹn giờ gửi vào F10), phase cũ 5 thành 6; bảng điểm quyết định có D-30/D-31.
  - **Acceptance criteria:** sơ đồ, bảng tổng quan, chi tiết từng feature và bảng quyết định khớp với `proposal.md` và `design.md`.
  - **Test:** đọc chéo; `openspec validate planner-from-messages` không lỗi.
  - **Depends on:** `proposal.md`, `design.md`.
  - **Hints:** Level 1 — giữ nguyên định dạng bảng sẵn có; chỉ thêm, không viết lại phần của F01–F12.
- [ ] 1.2 **Bổ sung Notion 01 (yêu cầu chức năng) và 03 (roadmap)** · *Human — chủ sản phẩm*
  - **Goal:** xử lý Conflict C9: nguồn ưu tiên cao nhất cũng có các tính năng này.
  - **Acceptance criteria:** Notion 01 có yêu cầu cho ghi chú, task, lịch, nhắc nhở, thông báo, hẹn giờ gửi, tạm ẩn; Notion 03 có F13–F17.
  - **Test:** đối chiếu với các capability trong `proposal.md`.
  - **Depends on:** 1.1.
  - **Hints:** Level 1 — có thể chép phần "What Changes" của proposal làm khung.

## 2. Giao diện

- [ ] 2.1 **Canvas "Sino UI" đợt 6**
  - **Thực hiện (2026-10-02):** đã publish (artifact Version 13): trang mới "02 · Desktop · Kế hoạch" gồm Lịch (Tuần/Tháng/Lịch trình), Việc cần làm, Ghi chú, Trung tâm thông báo (kèm ví dụ Web Push) và 6 lớp phủ trên Hộp thư (Nhắc tôi, Tạo task, Lịch hẹn, Ghi chú từ đoạn trích, Tạm ẩn, Gửi lúc…), đủ Dark/Light; sửa Sidebar (nhóm KẾ HOẠCH/DANH TÍNH), Rail, TabBar mobile (Tổng quan · Hộp thư · Lịch · Việc · Thêm), Topbar (chuông mở trung tâm thông báo), Hộp thư, Tổng quan (khối "Hôm nay", lối tắt Tạo task), Hội thoại (mục "Việc và ghi chú"), Cài đặt (thông báo, thiết bị, Lịch và nhắc nhở); mobile thêm Lịch, Việc cần làm. Kiểm tra tĩnh: thẻ HTML cân bằng, mọi `{{…}}` có giá trị, `renderVals` và mọi handler chạy được trên Node với mọi giá trị prop. **Chưa kiểm tra hiển thị**; chờ người dùng duyệt.
  - **Goal:** xem được giao diện trước khi code: Lịch (Tuần/Tháng/Lịch trình), Việc cần làm, Ghi chú, trung tâm thông báo; Hộp thư có thao tác trên tin, Tạm ẩn, Gửi lúc…, bộ lọc Đã hẹn giờ/Đang tạm ẩn, chip, panel "Việc và ghi chú"; Tổng quan thêm "Hôm nay"; sidebar chia nhóm; tabbar mobile mới; Cài đặt thêm thông báo và thiết bị.
  - **Acceptance criteria:** đủ bản Dark và Light; màn mới có trong trang Desktop/Responsive của canvas; sidebar và tabbar mới dùng chung cho mọi màn.
  - **Test:** người dùng xem canvas và duyệt.
  - **Depends on:** `design.md` (mục Giao diện).
  - **Hints:** Level 2 — thêm prop nhóm vào component Sidebar thay vì sửa từng màn.
- [ ] 2.2 **Chốt UI và ghi spec UI**
  - **Goal:** khi người dùng chốt UI, các quy tắc hiển thị (nhóm task, chip, bộ lọc, hành động trên thông báo) được ghi vào OpenSpec để FE làm theo.
  - **Acceptance criteria:** spec UI nằm trong change của feature tương ứng (hoặc một change UI riêng nếu dùng chung).
  - **Test:** `openspec validate` không lỗi.
  - **Depends on:** 2.1 được duyệt.
  - **Hints:** Level 1 — spec ghi hành vi ("Quá hạn hiện trước"), không ghi pixel.

## 3. Mở các feature (mỗi mục = một change OpenSpec riêng khi bắt đầu)

- [ ] 3.1 **F13 — Scheduler** · ~M · Phase 3
  - **Goal:** hạ tầng `scheduled_job` theo spec `scheduled-jobs`.
  - **Acceptance criteria:** change `be-f13-scheduler` có proposal/specs/design/tasks; D-30 và D-31 được chốt; thứ tự với F07 được chốt.
  - **Test (của feature):** integration test chạy song song, hồi phục sau lease, thử lại 1/5/15 và `retryAfter`, hủy; `ModularityTests` thấy module `scheduler`.
  - **Depends on:** F01 (không cần provider thật).
  - **Hints:** Level 2 — `FOR UPDATE SKIP LOCKED` trong subquery; giờ lấy từ `Clock`; đổi giờ = việc mới.
- [ ] 3.2 **F14 — Thông báo** · ~M · Phase 3
  - **Goal:** spec `notifications`: thông báo trong app, Web Push, danh sách thiết bị.
  - **Acceptance criteria:** change riêng; chọn thư viện Web Push; khóa VAPID trong `.env` và `.env.example`.
  - **Test (của feature):** dedup theo `dedup_key`; push giả kiểm tra payload không có nội dung tin nhắn; 410 → xóa thiết bị; SSE nhận `NotificationCreated` (sau F08).
  - **Depends on:** F13, F08, D-22.
  - **Hints:** Level 2 — gửi push trong listener sau commit, không trong transaction tạo thông báo.
- [ ] 3.3 **F15 — Ghi chú** · ~S · Phase 4
  - **Goal:** spec `notes`.
  - **Acceptance criteria:** change riêng; ghi chú theo ngữ cảnh và độc lập; FE: trang Ghi chú + panel trong cuộc trò chuyện.
  - **Test (của feature):** giới hạn 20.000 ký tự; lọc theo cuộc trò chuyện gồm cả ghi chú của tin bên trong; neo mất → `anchor_missing`.
  - **Depends on:** F05, F06 (để neo vào tin và cuộc trò chuyện).
  - **Hints:** Level 1 — `context_conversation_id` để truy vấn một lần.
- [ ] 3.4 **F16 — Việc cần làm + nhắc nhở** · ~L · Phase 4
  - **Goal:** spec `tasks` và `reminders`.
  - **Acceptance criteria:** change riêng; "Nhắc tôi" từ tin nhắn; task lặp; nhắc nhở qua F13/F14.
  - **Test (của feature):** test dạng bảng cho `RecurrenceCalculator` (ngày 31, 29/02, hoàn thành trễ, `count`/`until`); Xong hủy nhắc nhở; nhắc lại sau 1 giờ tạo việc mới.
  - **Depends on:** F13, F14, F06.
  - **Hints:** Level 2 — lặp hằng tháng tính từ ngày gốc, không từ lần trước.
- [ ] 3.5 **F17 — Lịch** · ~M · Phase 4
  - **Goal:** spec `calendar`.
  - **Acceptance criteria:** change riêng; lịch hẹn có lặp; `GET /api/calendar` gộp lịch hẹn, task có hạn, nhắc nhở; FE: Tuần/Tháng/Lịch trình.
  - **Test (của feature):** lần lặp được tính khi xem, không lưu sẵn; khoảng thời gian giao nhau đúng ở biên; giờ địa phương ổn định.
  - **Depends on:** F16 (dùng lại `recurrence` và `reminder`).
  - **Hints:** Level 1 — sinh lần lặp trong khoảng [từ, đến) thay vì sinh hết rồi lọc.
- [ ] 3.6 **Tạm ẩn cuộc trò chuyện** · ~S · Phase 4 (mở rộng F05)
  - **Goal:** spec `conversation-snooze`.
  - **Acceptance criteria:** delta cho capability của F05; bộ lọc "Đang tạm ẩn"; tin mới bỏ tạm ẩn.
  - **Test (của feature):** tới giờ hiện lại ở đầu danh sách; tin mới hủy việc `UNSNOOZE`.
  - **Depends on:** F05, F13.
  - **Hints:** Level 1 — sắp xếp theo `greatest(last_message_at, resurfaced_at)`.
- [ ] 3.7 **Hẹn giờ gửi** · Phase 5 (gộp vào F10)
  - **Goal:** spec `scheduled-send`.
  - **Acceptance criteria:** change của F10 có thêm phần hẹn giờ gửi; trạng thái `SCHEDULED`/`SENDING`; bộ lọc "Đã hẹn giờ".
  - **Test (của feature):** chạy lại khi thư đang `SENDING` không gửi trùng; `AUTH_EXPIRED` → `FAILED` + thông báo; sửa/hủy bị chặn khi đang gửi (409).
  - **Depends on:** F10, F13, F14.
  - **Hints:** Level 2 — gọi provider ngoài transaction; trạng thái `SENDING` được commit *trước* khi gọi.

## 4. Đóng change

- [ ] 4.1 **Archive hồ sơ cấp sản phẩm**
  - **Goal:** đóng change mà không đẩy spec "đích đến" vào `openspec/specs/`.
  - **Acceptance criteria:** mọi mục 3.x đã archive change riêng của nó (delta đã vào `openspec/specs/`); chạy `openspec archive planner-from-messages -y --skip-specs`.
  - **Test:** `openspec/specs/` chỉ chứa capability đã có code; `openspec list` không còn change này.
  - **Depends on:** 3.1–3.7.
  - **Hints:** Level 1 — nếu một feature bị bỏ, gạch mục đó và ghi **LÝ DO** tại chỗ trước khi archive.
