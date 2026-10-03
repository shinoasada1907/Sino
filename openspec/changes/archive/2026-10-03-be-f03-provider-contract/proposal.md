## Why

Giá trị cốt lõi của Sino Messages là thêm provider mới "chủ yếu bằng connector + mapper + capability config" (00 — Main Success Criteria) mà core không phụ thuộc format riêng của Gmail/Telegram. Điều đó chỉ đúng nếu có một **Provider Contract** được chốt trước provider thật đầu tiên (F04 Gmail): SPI chung, mô hình capability, kiểu dữ liệu chuẩn hóa và registry để resolve connector. 04A yêu cầu F03 ở mức "chưa phụ thuộc Gmail implementation", và Notion cấm implement Gmail trước khi contract được review.

## What Changes

- Module `dev.sino.provider` với public API (base package) cho bên dùng và named interface `spi` cho connector.
- `ProviderType` định danh provider (dạng cụ thể theo **Decision D-16**).
- Mô hình capability theo 02A: `READ_MESSAGES`, `SEND_MESSAGES`, `ATTACHMENTS`, `MARK_READ`, `REACTIONS`, `PUSH_WEBHOOK`, `THREADS`; provider tự khai báo, không giả định.
- SPI `MessageProvider` theo 02A: `type()`, `capabilities()`, `getAccountProfile(...)`, `fetchUpdates(...)`, `sendMessage(...)`.
- `ProviderContext` + `ProviderCredentials` (chỉ tồn tại trong bộ nhớ, `toString()` che secret).
- Kiểu dữ liệu chuẩn hóa (conversation, participant, message, attachment) + enum theo 02B, có validation; lỗi chuẩn hóa từng item không làm hỏng cả batch.
- `SyncCursor` / `SyncBatch` cho sync, `SendMessageCommand` / `SendMessageResult` cho gửi tin.
- Phân loại lỗi provider (`ProviderException` + `ProviderErrorCode`) theo FR-08, có cờ retryable.
- `ProviderRegistry`: phát hiện connector lúc start, fail-fast khi trùng `ProviderType`, báo lỗi rõ khi provider không tồn tại, liệt kê descriptor.
- Bộ **contract test** dùng lại được + fake provider (test sources) để mọi connector tương lai (Gmail ở F04) phải vượt qua.
- (Chờ **Decision D-18**) `GET /api/providers` trả danh sách provider + capability cho frontend capability-aware.

## Capabilities

### New Capabilities
- `provider-contract`: SPI connector, mô hình capability, context/credential, kiểu dữ liệu chuẩn hóa, contract sync/send/profile và phân loại lỗi provider.
- `provider-registry`: phát hiện, đăng ký, resolve và mô tả các connector đang có trong ứng dụng.
- `provider-catalog-api`: REST endpoint liệt kê provider và capability (chỉ giữ lại nếu D-18 = có).

### Modified Capabilities
<!-- Không có. F03 không đổi requirement của F01; chỉ bổ sung code lỗi vào error catalog theo convention của F01. -->

## Impact

- Code: `apps/sino-api/src/main/java/dev/sino/provider/**`; test: `src/test/java/dev/sino/provider/**` (fake provider, contract test kit, registry test).
- Không migration, không bảng mới (F03 không lưu gì).
- API: có thể thêm `GET /api/providers` (D-18).
- Phụ thuộc: F01 (module convention, error model, security). F02 dùng `ProviderType` và registry (xem D-01).
- Không thêm dependency Maven.

## Non-goals

- Không có connector thật nào (Gmail là F04, provider thứ hai là F09).
- Không có SPI cho kết nối/OAuth (authorization URL, callback, đổi code lấy token) — thiết kế cùng Gmail ở F04.
- Không refresh/rotate token (D-15, F04).
- Không có method cho `MARK_READ`, `REACTIONS`, tải attachment, webhook — capability được khai báo trước, method thêm ở feature dùng tới (F06/F07/F10).
- Không lưu conversation/message, không sync engine, không scheduler (F05–F07).
- Không có capability theo từng account/scope đã cấp (D-19) và không bật/tắt provider qua cấu hình.
