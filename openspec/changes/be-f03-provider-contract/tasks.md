# F03 — Provider Contract · Implementation Plan

> **HYBRID mode (từ 2026-10-01):** mặc định AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào Human nhận ("để tôi làm BE-xx") thì chạy TRAINING: Human code theo **Hướng làm** (Level 2) và **Gợi ý** (Level 1), Claude review/test.
> Phụ thuộc: F01 hoàn tất. Thứ tự so với F02 theo **D-01**. Một task = một commit logic, `./mvnw verify` xanh trước khi sang task sau.
> Chặn: không bắt đầu trước `APPROVED TO IMPLEMENT`.

## 1. Định danh và capability

- [ ] 1.1 **BE-19 — Module `provider`: `ProviderType`, `ProviderCapability`, `ProviderCapabilities`**
  - **Goal / Why:** từ vựng cơ bản để mọi module nói về provider mà không biết provider cụ thể.
  - **Depends:** F01 · **D-16**, D-19.
  - **Files:** `src/main/java/dev/sino/provider/ProviderType.java`, `ProviderCapability.java`, `ProviderCapabilities.java`; test tương ứng trong `src/test/java/dev/sino/provider/`.
  - **Hướng làm:** `ProviderType` theo phương án D-16 (nếu value object: chuẩn hóa + kiểm tra pattern trong constructor, equals theo giá trị). `ProviderCapabilities` bọc một tập bất biến, có `supports(cap)` và `require(cap)` (ném `CAPABILITY_NOT_SUPPORTED` — có thể hoàn thiện sau BE-22).
  - **Test:** unit — type hợp lệ/không hợp lệ/khác hoa thường; tập capability không sửa được từ bên ngoài; `supports` đúng/sai.
  - **AC:** requirement *Tập capability chuẩn*; `ModularityTests` xanh với module mới.
  - **Gợi ý:** compact constructor của record; `EnumSet` và cách trả bản sao bất biến.

## 2. Contract dữ liệu

- [ ] 2.1 **BE-20 — Kiểu chuẩn hóa + enum + validation + `SkippedItem`**
  - **Goal / Why:** connector trả về dữ liệu của Sino, tự bảo vệ tính hợp lệ.
  - **Depends:** BE-19 · D-20.
  - **Files:** `src/main/java/dev/sino/provider/spi/package-info.java` (`@NamedInterface("spi")`), các record/enum trong bảng "Kiểu dữ liệu trong `spi`" (trừ context/credential/SPI).
  - **Hướng làm:** validation trong compact constructor; list được sao chép thành bất biến; `type`/`status` null → `UNKNOWN` hay từ chối? — chọn một và ghi vào design. Lỗi validation phải phân loại được là `PAYLOAD_NORMALIZATION_FAILED` (nối với BE-22).
  - **Test:** unit cho từng record: thiếu ID → lỗi; loại không map được → `UNKNOWN`; list truyền vào bị sửa sau đó không ảnh hưởng record.
  - **AC:** requirement *Dữ liệu chuẩn hóa tự kiểm tra tính hợp lệ*.
  - **Gợi ý:** defensive copy (`List.copyOf`); phân biệt "không biết" (UNKNOWN) với "thiếu dữ liệu bắt buộc".

- [ ] 2.2 **BE-21 — SPI `MessageProvider` + context/credential + profile/cursor/batch/send**
  - **Goal / Why:** chốt contract mà connector Gmail (F04) sẽ implement.
  - **Depends:** BE-20 · D-17.
  - **Files:** `spi/MessageProvider.java`, `spi/ProviderContext.java`, `spi/ProviderCredentials.java` (+ các record con), `spi/AccountProfile.java`, `spi/SyncCursor.java`, `spi/SyncBatch.java`, `spi/SendMessageCommand.java`, `spi/SendMessageResult.java`.
  - **Hướng làm:** chữ ký theo design D-17; `sendMessage` có default ném `CAPABILITY_NOT_SUPPORTED`; credential là sealed interface, `toString()` của context và credential che secret.
  - **Test:** unit — `toString()` không chứa token; `SyncCursor.initial().isInitial()`; `SyncBatch` từ chối `nextCursor` null; một connector ẩn danh chỉ-đọc gọi `sendMessage` → `CAPABILITY_NOT_SUPPORTED`.
  - **AC:** requirement *Contract lấy cập nhật (sync)*, *Contract gửi tin*, *Contract lấy hồ sơ account*, *Credential chỉ nằm trong bộ nhớ và luôn bị che*.
  - **Gợi ý:** sealed interface + `permits`; default method trong interface; `toString()` tự sinh của record in **mọi** component.

- [ ] 2.3 **BE-22 — `ProviderException` + `ProviderErrorCode`**
  - **Goal / Why:** mọi lỗi provider có cùng ngôn ngữ để sync/messaging phản ứng nhất quán (FR-08).
  - **Depends:** BE-21 · error model F01 (D-21).
  - **Files:** `spi/ProviderException.java`, `spi/ProviderErrorCode.java`; bổ sung `UNKNOWN_PROVIDER` vào error catalog (design F03).
  - **Hướng làm:** mã theo bảng "Phân loại lỗi provider", cờ retryable gắn với mã; `RATE_LIMITED` có `retryAfter` tùy chọn; message không chứa secret. Cân nhắc có nên để `ProviderException` là `SinoException` hay tách riêng — ghi lý do lựa chọn.
  - **Test:** unit — cờ retryable đúng theo bảng; `retryAfter` chỉ có ý nghĩa với `RATE_LIMITED`.
  - **AC:** requirement *Phân loại lỗi provider*.
  - **Gợi ý:** ai sẽ bắt exception này (sync F07, messaging F10) và họ cần thông tin gì để quyết định retry?

## 3. Registry và kiểm chứng contract

- [ ] 3.1 **BE-23 — `ProviderRegistry` + `ProviderDescriptor`**
  - **Goal / Why:** một nơi duy nhất resolve connector theo `ProviderType`.
  - **Depends:** BE-21, BE-22.
  - **Files:** `provider/ProviderRegistry.java`, `provider/ProviderDescriptor.java`, `provider/application/DefaultProviderRegistry.java`, test registry.
  - **Hướng làm:** theo design mục "Registry"; mã `UNKNOWN_PROVIDER` dùng `ErrorCode` của F01; trùng type → không start.
  - **Test:** unit với danh sách connector giả (0, 1, 2, trùng); một test Spring nhỏ chứng minh registry nhận bean connector và app vẫn start khi không có connector nào.
  - **AC:** toàn bộ requirement của `provider-registry`.
  - **Gợi ý:** constructor injection `List<T>` khi không có bean nào; vì sao fail-fast lúc khởi động tốt hơn lỗi lúc chạy.

- [ ] 3.2 **BE-24 — `FakeMessageProvider` + contract test kit**
  - **Goal / Why:** định nghĩa "một connector đúng" bằng test chạy được; F04 Gmail kế thừa.
  - **Depends:** BE-23.
  - **Files:** `src/test/java/dev/sino/provider/spi/MessageProviderContractTest.java` (abstract), `src/test/java/dev/sino/provider/FakeMessageProvider.java`, `FakeMessageProviderContractTest.java`.
  - **Hướng làm:** các kiểm tra chung theo design mục "Contract test kit"; fake cấu hình được capability và batch dựng sẵn (kể cả batch có item bị skip).
  - **Test:** fake vượt toàn bộ contract test; fake chỉ-đọc và fake có gửi tin đều được kiểm tra.
  - **AC:** requirement *Lỗi chuẩn hóa một item không làm hỏng cả batch*, *Connector khai báo định danh và capability*, *Contract không chứa kiểu riêng của provider* (thêm một kiểm tra kiến trúc: package `provider` và `provider.spi` không phụ thuộc `provider.infrastructure..`).
  - **Gợi ý:** abstract test class + JUnit kế thừa `@Test`; ArchUnit đã có sẵn qua Spring Modulith test.

- [ ] 3.3 **BE-25 — `GET /api/providers`** *(chỉ làm nếu D-18 = có)*
  - **Goal / Why:** frontend biết provider nào có và làm được gì, trước khi có account.
  - **Depends:** BE-23 · **D-18** · security + error model F01.
  - **Files:** `provider/api/ProvidersController.java` (+ response DTO), web test.
  - **Hướng làm:** controller chỉ đọc `ProviderRegistry.descriptors()` và map sang DTO; không đưa type nội bộ ra JSON trực tiếp.
  - **Test:** web test: 200 với 2 fake provider (đúng thứ tự, đúng field), 200 mảng rỗng, 401 khi không xác thực.
  - **AC:** toàn bộ requirement của `provider-catalog-api`.
  - **Gợi ý:** vì sao nên có DTO riêng thay vì trả `ProviderDescriptor`?

## 4. Nghiệm thu

- [ ] 4.1 **BE-26 — Nghiệm thu F03**
  - **Files:** `PROJECT_STATE.md`, file này, error catalog trong design.
  - **Test:** `./mvnw verify` xanh; review lại bảng kiểu dữ liệu so với code (lệch → sửa design hoặc code, ghi lý do).
  - **AC:** checklist *Definition of Done — F03* trong `design.md`.
  - **Learning gate:** (1) Thêm provider thứ hai cần sửa những file nào? (2) Vì sao `sendMessage` có default implementation mà bên gọi vẫn phải kiểm tra capability? (3) Một message lỗi trong batch đi đâu? (4) Điều gì trong contract bạn nghĩ sẽ đổi ở F04?
