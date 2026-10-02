# F03 — Provider Contract · Implementation Plan

> **HYBRID mode (từ 2026-10-01):** mặc định AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào Human nhận ("để tôi làm BE-xx") thì chạy TRAINING: Human code theo **Hướng làm** (Level 2) và **Gợi ý** (Level 1), Claude review/test.
> Phụ thuộc: F01 hoàn tất. Thứ tự so với F02 theo **D-01**. Một task = một commit logic, `./mvnw verify` xanh trước khi sang task sau.
> Chặn: không bắt đầu trước `APPROVED TO IMPLEMENT`.

## 1. Định danh và capability

- [x] 1.1 **BE-19 — Module `provider`: `ProviderType`, `ProviderCapability`, `ProviderCapabilities`**
  - **Thực hiện (2026-10-01):** Human gõ 3 class (TRAINING, code tham khảo Level 4), rồi chuyển F03 sang AUTO; Claude dọn, thêm Javadoc và 2 file test (`ProviderTypeTests` 17, `ProviderCapabilitiesTests` 9, gồm giá trị biên 2/32/33 ký tự). `ProviderCapabilities` là record bọc `EnumSet` chỉ-đọc (bản sao phòng thủ, duyệt theo thứ tự khai báo); `require` tạm ném `UnsupportedOperationException`, BE-22 đổi sang `ProviderException(CAPABILITY_NOT_SUPPORTED)` (đúng ghi chú "hoàn thiện sau BE-22"). Comment giải thích tiếng Việt thêm lúc học đã bỏ theo yêu cầu người dùng ("hạn chế comment quá nhiều"); code chỉ giữ Javadoc và comment lý do.
  - **Kiểm chứng:** `./mvnw -B -ntp verify` → 56/56, BUILD SUCCESS; `ModularityTests` 2/2, Modulith nhận module `provider` (`target/spring-modulith-docs/module-provider.*`). Bỏ 2 dòng bản sao/chỉ-đọc → đúng 2 test đỏ (`copiesTheSetItWasGiven`, `cannotBeChangedFromOutside`).
  - **Goal / Why:** từ vựng cơ bản để mọi module nói về provider mà không biết provider cụ thể.
  - **Depends:** F01 · **D-16**, D-19.
  - **Files:** `src/main/java/dev/sino/provider/ProviderType.java`, `ProviderCapability.java`, `ProviderCapabilities.java`; test tương ứng trong `src/test/java/dev/sino/provider/`.
  - **Hướng làm:** `ProviderType` theo phương án D-16 (nếu value object: chuẩn hóa + kiểm tra pattern trong constructor, equals theo giá trị). `ProviderCapabilities` bọc một tập bất biến, có `supports(cap)` và `require(cap)` (ném `CAPABILITY_NOT_SUPPORTED` — có thể hoàn thiện sau BE-22).
  - **Test:** unit — type hợp lệ/không hợp lệ/khác hoa thường; tập capability không sửa được từ bên ngoài; `supports` đúng/sai.
  - **AC:** requirement *Tập capability chuẩn*; `ModularityTests` xanh với module mới.
  - **Gợi ý:** compact constructor của record; `EnumSet` và cách trả bản sao bất biến.

## 2. Contract dữ liệu

- [x] 2.1 **BE-20 — Kiểu chuẩn hóa + enum + validation + `SkippedItem`**
  - **Thực hiện (2026-10-01, AUTO):** `spi/package-info.java` (`@NamedInterface("spi")`), 4 enum, 4 record `Normalized*`, `SkippedItem` (+ `Kind`), helper nội bộ `PayloadChecks`. Quy tắc validation ghi ở design ("Quy tắc validation"): `type`/`status` null → `UNKNOWN`; thiếu dữ liệu bắt buộc → `ProviderException(PAYLOAD_NORMALIZATION_FAILED)`.
  - **Làm khác kế hoạch:** ~~`ProviderErrorCode`, `ProviderException` thuộc BE-22~~ → tạo bản tối thiểu ngay ở BE-20. **LÝ DO:** `SkippedItem.reason` có kiểu `ProviderErrorCode`, và lỗi validation phải phân loại được là `PAYLOAD_NORMALIZATION_FAILED` ngay khi record bị tạo sai; không có hai kiểu này thì BE-20 không làm đúng AC được.
  - **Kiểm chứng:** `./mvnw -B -ntp verify` → 96/96, BUILD SUCCESS (40 test mới trong `provider.spi`). Modulith thấy named interface `spi` của module `provider`. Kiểm tra ngược trên bản sao: bỏ kiểm tra `sentAt`, bỏ sao chép `participants`, bỏ mặc định `UNKNOWN`, bỏ vòng kiểm tra phần tử null → đúng 6 test tương ứng đỏ.
  - **Goal / Why:** connector trả về dữ liệu của Sino, tự bảo vệ tính hợp lệ.
  - **Depends:** BE-19 · D-20.
  - **Files:** `src/main/java/dev/sino/provider/spi/package-info.java` (`@NamedInterface("spi")`), các record/enum trong bảng "Kiểu dữ liệu trong `spi`" (trừ context/credential/SPI).
  - **Hướng làm:** validation trong compact constructor; list được sao chép thành bất biến; `type`/`status` null → `UNKNOWN` hay từ chối? — chọn một và ghi vào design. Lỗi validation phải phân loại được là `PAYLOAD_NORMALIZATION_FAILED` (nối với BE-22).
  - **Test:** unit cho từng record: thiếu ID → lỗi; loại không map được → `UNKNOWN`; list truyền vào bị sửa sau đó không ảnh hưởng record.
  - **AC:** requirement *Dữ liệu chuẩn hóa tự kiểm tra tính hợp lệ*.
  - **Gợi ý:** defensive copy (`List.copyOf`); phân biệt "không biết" (UNKNOWN) với "thiếu dữ liệu bắt buộc".

- [x] 2.2 **BE-21 — SPI `MessageProvider` + context/credential + profile/cursor/batch/send**
  - **Thực hiện (2026-10-01, AUTO):** đúng danh sách file; `OAuth2Credentials` và `TokenCredentials` là file riêng. `sendMessage` mặc định ném luôn `ProviderException(CAPABILITY_NOT_SUPPORTED)` vì `ProviderException` đã có từ BE-20. Quy tắc chọn loại lỗi theo nguồn dữ liệu ghi ở design ("Loại lỗi theo nguồn dữ liệu").
  - **Kiểm chứng:** `./mvnw -B -ntp verify` → 133/133, BUILD SUCCESS (37 test mới). Kiểm tra ngược trên bản sao: bỏ `toString()` che secret, cho `sendMessage` mặc định trả `null`, bỏ kiểm tra `nextCursor` → đúng 7 test tương ứng đỏ.
  - **Goal / Why:** chốt contract mà connector Gmail (F04) sẽ implement.
  - **Depends:** BE-20 · D-17.
  - **Files:** `spi/MessageProvider.java`, `spi/ProviderContext.java`, `spi/ProviderCredentials.java` (+ các record con), `spi/AccountProfile.java`, `spi/SyncCursor.java`, `spi/SyncBatch.java`, `spi/SendMessageCommand.java`, `spi/SendMessageResult.java`.
  - **Hướng làm:** chữ ký theo design D-17; `sendMessage` có default ném `CAPABILITY_NOT_SUPPORTED`; credential là sealed interface, `toString()` của context và credential che secret.
  - **Test:** unit — `toString()` không chứa token; `SyncCursor.initial().isInitial()`; `SyncBatch` từ chối `nextCursor` null; một connector ẩn danh chỉ-đọc gọi `sendMessage` → `CAPABILITY_NOT_SUPPORTED`.
  - **AC:** requirement *Contract lấy cập nhật (sync)*, *Contract gửi tin*, *Contract lấy hồ sơ account*, *Credential chỉ nằm trong bộ nhớ và luôn bị che*.
  - **Gợi ý:** sealed interface + `permits`; default method trong interface; `toString()` tự sinh của record in **mọi** component.

- [x] 2.3 **BE-22 — `ProviderException` + `ProviderErrorCode`**
  - **Thực hiện (2026-10-01, TRAINING):** Human code `ProviderException` (`retryAfter`, factory `rateLimited`, constructor 3 tham số `private` sau review) và đổi `ProviderCapabilities.require`; Claude viết test theo yêu cầu (`ProviderExceptionTests` mới, `ProviderErrorCodeTests` chỉ còn cờ retryable, `ProviderCapabilitiesTests.requireFailsWhenNotSupported`), thêm Javadoc và format theo yêu cầu. Quyết định **D-24 = B** (không kế thừa `SinoException`) ghi ở design. `UNKNOWN_PROVIDER` đã có trong catalog của design; mã trong code tạo ở BE-23, nơi dùng nó. Ba câu tự kiểm tra (constructor `private`, `Optional`, lỗi lọt lên web) chưa được trả lời.
  - **Kiểm chứng:** `./mvnw -B -ntp verify` → 138/138, BUILD SUCCESS.
  - **Goal / Why:** mọi lỗi provider có cùng ngôn ngữ để sync/messaging phản ứng nhất quán (FR-08).
  - **Depends:** BE-21 · error model F01 (D-21).
  - **Files:** `spi/ProviderException.java`, `spi/ProviderErrorCode.java`; bổ sung `UNKNOWN_PROVIDER` vào error catalog (design F03).
  - **Đổi phạm vi (2026-10-01):** ~~tạo `ProviderErrorCode` + `ProviderException`~~ đã có từ BE-20 (LÝ DO ở BE-20); cờ retryable đã có test (`ProviderErrorCodeTests`). BE-22 còn: `retryAfter` cho `RATE_LIMITED`, quyết định kế thừa `SinoException` hay không, đổi `ProviderCapabilities.require` (và test của nó) sang `ProviderException(CAPABILITY_NOT_SUPPORTED)`, `UNKNOWN_PROVIDER` vào catalog.
  - **Hướng làm:** mã theo bảng "Phân loại lỗi provider", cờ retryable gắn với mã; `RATE_LIMITED` có `retryAfter` tùy chọn; message không chứa secret. Cân nhắc có nên để `ProviderException` là `SinoException` hay tách riêng — ghi lý do lựa chọn.
  - **Test:** unit — cờ retryable đúng theo bảng; `retryAfter` chỉ có ý nghĩa với `RATE_LIMITED`.
  - **AC:** requirement *Phân loại lỗi provider*.
  - **Gợi ý:** ai sẽ bắt exception này (sync F07, messaging F10) và họ cần thông tin gì để quyết định retry?

## 3. Registry và kiểm chứng contract

- [ ] 3.1 **BE-23 — `ProviderRegistry` + `ProviderDescriptor`**
  - **Thực hiện (2026-10-02, AUTO, chưa kiểm chứng):** code + test đã viết, chưa chạy `./mvnw verify` (người dùng yêu cầu dừng sau khi code, tự quyết bước tiếp).
  - **Làm khác kế hoạch:** ngoài danh sách Files có thêm `spi/MessageProvider.java` (`default displayName()`), `ProviderRegistryErrorCode.java`, `ProviderDescriptorTests.java`. **LÝ DO:** descriptor cần tên hiển thị mà SPI chưa có (người dùng chọn default method, ghi ở D-17); `UNKNOWN_PROVIDER` cần một enum `ErrorCode` và tên `ProviderErrorCode` đã thuộc `spi`.
  - **Goal / Why:** một nơi duy nhất resolve connector theo `ProviderType`.
  - **Depends:** BE-21, BE-22.
  - **Files:** `provider/ProviderRegistry.java`, `provider/ProviderDescriptor.java`, `provider/application/DefaultProviderRegistry.java`, test registry.
  - **Hướng làm:** theo design mục "Registry"; mã `UNKNOWN_PROVIDER` dùng `ErrorCode` của F01; trùng type → không start.
  - **Test:** unit với danh sách connector giả (0, 1, 2, trùng); một test Spring nhỏ chứng minh registry nhận bean connector và app vẫn start khi không có connector nào.
  - **AC:** toàn bộ requirement của `provider-registry`.
  - **Gợi ý:** constructor injection `List<T>` khi không có bean nào; vì sao fail-fast lúc khởi động tốt hơn lỗi lúc chạy.

- [ ] 3.2 **BE-24 — `FakeMessageProvider` + contract test kit**
  - **Thực hiện (2026-10-02, AUTO, chưa kiểm chứng):** code test đã viết, chưa chạy `./mvnw verify` (người dùng tự quyết bước kiểm chứng). Kit có 7 kiểm tra; connector con cung cấp `provider()`, `providerWithOneBrokenMessage()`, `context()`, `expectedMessageIds()`. `FakeMessageProviderContractTest` chạy kit cho fake chỉ-đọc và fake có gửi tin (`@Nested`), thêm test lật trang của fake.
  - **Làm khác kế hoạch:** ~~fake trả các batch dựng sẵn~~ → fake nhận các trang message "thô" (`RawMessage`) và tự chuẩn hóa lúc `fetchUpdates`, message lỗi thành `SkippedItem`. **LÝ DO:** batch dựng sẵn chỉ chứng minh `SyncBatch` chứa được item bị skip (đã có `SyncBatchTests`), không chứng minh connector bỏ qua item lỗi rồi làm tiếp (AC *Lỗi chuẩn hóa một item không làm hỏng cả batch*); đây cũng là mẫu connector F04 làm theo. Thêm file `ProviderContractArchitectureTests.java` cho kiểm tra kiến trúc của AC (không nằm trong danh sách Files).
  - **Goal / Why:** định nghĩa "một connector đúng" bằng test chạy được; F04 Gmail kế thừa.
  - **Depends:** BE-23.
  - **Files:** `src/test/java/dev/sino/provider/spi/MessageProviderContractTest.java` (abstract), `src/test/java/dev/sino/provider/FakeMessageProvider.java`, `FakeMessageProviderContractTest.java`.
  - **Hướng làm:** các kiểm tra chung theo design mục "Contract test kit"; fake cấu hình được capability và batch dựng sẵn (kể cả batch có item bị skip).
  - **Test:** fake vượt toàn bộ contract test; fake chỉ-đọc và fake có gửi tin đều được kiểm tra.
  - **AC:** requirement *Lỗi chuẩn hóa một item không làm hỏng cả batch*, *Connector khai báo định danh và capability*, *Contract không chứa kiểu riêng của provider* (thêm một kiểm tra kiến trúc: package `provider` và `provider.spi` không phụ thuộc `provider.infrastructure..`).
  - **Gợi ý:** abstract test class + JUnit kế thừa `@Test`; ArchUnit đã có sẵn qua Spring Modulith test.

- [ ] 3.3 **BE-25 — `GET /api/providers`** *(chỉ làm nếu D-18 = có)*
  - **Thực hiện (2026-10-02, AUTO, chưa kiểm chứng):** `ProvidersController` + DTO `ProviderResponse` (capability là chuỗi tên enum, giữ thứ tự registry trả về); `ProvidersControllerTests` (`@WebMvcTest` + security thật qua `ApiSecurityTestConfiguration`, `ProviderRegistry` giả bằng `@MockitoBean` — lần đầu repo dùng Mockito, có sẵn qua `spring-boot-starter-webmvc-test`). Chưa chạy `./mvnw verify`.
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
