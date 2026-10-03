# Kiến thức Phase 0 — Nền móng backend

> **Dành cho:** người học Java qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F01 Project Foundation và F03 Provider Contract. F02 Connected Accounts sẽ được bổ sung vào file này khi làm.
> **Cập nhật:** 2026-10-03. Đường dẫn code tính từ `apps/sino-api/`.

---

## 0. Bức tranh lớn

Backend Sino là **một** ứng dụng Spring Boot (modular monolith), chia thành module theo nghiệp vụ: `common`, `provider`, sau này có `account`, `conversation`, `messaging`, `sync`…

Một request `GET /api/providers` đi qua các lớp như sau:

```text
Client (curl / web)
  |  HTTP + Basic auth
  v
+------------------------+                  +------------------------+
| Security filter chain  | ---------------> | GlobalExceptionHandler |
| (SecurityConfig)       |   401 / 403      | -> Problem Details     |
+------------------------+                  +------------------------+
  |                                                      ^
  v                                                      |
+------------------------+                               |
| DispatcherServlet      |                               |
| (Spring MVC)           |                               |
+------------------------+                               |
  |                                                      |
  v                                                      |
+------------------------+     exception                 |
| ProvidersController    | ------------------------------+
| (DTO -> JSON)          |
+------------------------+
  |
  v
+------------------------+
| ProviderRegistry       |
+------------------------+
  |
  v
+------------------------+
| MessageProvider        |
| (connector)            |
+------------------------+
```

Kết quả đi ngược lên: connector trả dữ liệu cho registry, controller đổi nó sang DTO rồi JSON và gửi về client.

Ba ý cần nhớ:
- Mỗi lớp chỉ làm một việc: security chặn cửa, controller đổi dữ liệu sang JSON, registry tìm connector, connector nói chuyện với provider bên ngoài.
- Lỗi ở bất kỳ đâu cũng đổ về **một chỗ** (`GlobalExceptionHandler`) để client luôn nhận cùng một dạng lỗi.
- Module chỉ được dùng **public API** của module khác (mục 4).

---

## 1. Nền tảng

### 1.1 Java 25
- **Ở đâu:** `pom.xml` (`<java.version>25</java.version>`), CI (`java-version: "25"`).
- **Là gì:** phiên bản Java LTS (hỗ trợ dài hạn) mới nhất.
- **Vì sao:** F03 dùng nhiều tính năng mới: `record`, `sealed interface`, pattern matching trong `switch` (mục 8). LTS nghĩa là được vá lỗi lâu dài.
- **Bẫy:** máy có nhiều JDK. Từng có lúc terminal IntelliJ chạy Java 26. Kiểm tra bằng `.\mvnw.cmd -v`.

### 1.2 Spring Boot 4
- **Ở đâu:** `pom.xml` (các `spring-boot-starter-*`), `SinoApiApplication.java`.
- **Là gì:** framework dựng ứng dụng Java. Có server web nhúng (không cần cài Tomcat riêng) và **auto-configuration**: thấy thư viện nào trên classpath thì tự cấu hình thứ đó (có driver PostgreSQL thì tự tạo kết nối DB).
- **Để làm gì:** chỉ cần `@SpringBootApplication` cộng hàm `main` là có app chạy được. "Starter" là gói gom sẵn các thư viện hay đi cùng nhau.
- **Bẫy:** auto-configuration "tự làm" nên dễ không hiểu chuyện gì xảy ra. Ví dụ: chỉ cần thêm Spring Security là mọi endpoint bị khóa ngay (đã ghi ở Known issues trong `PROJECT_STATE.md`).

### 1.3 Bean và Dependency Injection (DI) — khái niệm quan trọng nhất của Spring
- **Ở đâu:** `DefaultProviderRegistry` (có `@Component`), `ProvidersController` (có `@RestController`).
- **Là gì:**
  - **Bean** là object do Spring tạo và quản lý. Bạn không tự gọi `new`.
  - **DI:** class khai báo "tôi cần cái gì" trong constructor, Spring tìm bean phù hợp và truyền vào.

  ```java
  ProvidersController(ProviderRegistry registry) { this.registry = registry; }
  ```

  Controller không biết registry được tạo thế nào, nó chỉ biết interface `ProviderRegistry`.
- **Vì sao:**
  - Dễ thay thế: trong test, `ProvidersControllerTests` thay registry thật bằng bản giả.
  - Class không phụ thuộc vào cách dựng các phụ thuộc của nó.
- **Bẫy:**
  - Dùng **constructor injection** (như repo này) thay vì `@Autowired` trên field: field injection làm phụ thuộc bị ẩn và khó test.
  - Khi constructor nhận `List<MessageProvider>` mà chưa có bean nào, Spring truyền **list rỗng** chứ không báo lỗi. Đây chính là lý do app vẫn start khi chưa có connector.

### 1.4 Maven và Maven Wrapper
- **Ở đâu:** `pom.xml`, `mvnw` / `mvnw.cmd`.
- **Là gì:** công cụ build. `pom.xml` khai báo thư viện và cách build. Wrapper (`mvnw`) cố định phiên bản Maven, để máy bạn và CI build giống hệt nhau.
- **Lệnh hay dùng:**
  - `test`: biên dịch rồi chạy test.
  - `verify`: chạy hết các bước tới kiểm tra cuối. Đây là lệnh CI dùng.
  - `spring-boot:run`: chạy app.
- **Bẫy:** trên PowerShell, tham số `-D…` phải đặt trong ngoặc kép: `.\mvnw.cmd test "-Dtest=…"`.

---

## 2. Cấu hình

### 2.1 `application.yaml` và profile
- **Ở đâu:** `src/main/resources/application.yaml`, `application-local.yaml`, `src/test/resources/application-test.yaml`.
- **Là gì:** cấu hình của app. **Profile** là một bộ cấu hình bật thêm theo môi trường:
  - `local`: máy dev, đọc giá trị từ `.env`.
  - `test`: giá trị giả cho test.
- **Vì sao:**
  - `url: ${SINO_DB_URL}` cố ý không có giá trị mặc định: thiếu biến môi trường thì app **không start** (fail-fast), thay vì chạy với cấu hình sai.
  - `management.endpoints.web.exposure.include: health,info` chỉ mở hai endpoint actuator an toàn.
- **Bẫy:** đừng tạo `src/test/resources/application.yaml`, vì nó sẽ **che** file của main.

### 2.2 `@ConfigurationProperties` + `@Validated`
- **Ở đâu:** `common/security/ApiUserProperties.java`.
- **Là gì:** gắn một nhóm cấu hình (`sino.security.api-user.*`) vào một record Java có kiểu rõ ràng.
- **Để làm gì:** có `@NotBlank` nên thiếu username/password thì app dừng ngay lúc khởi động, kèm thông báo rõ ràng.
- **Bẫy:** record tự in mọi field trong `toString()`. Vì vậy class này override `toString()` để che mật khẩu (`password=****`).

### 2.3 Secret: `.env` và `.env.example`
- **Ở đâu:** `apps/sino-api/.env` (git bỏ qua), `.env.example` (mẫu được commit).
- **Vì sao:** secret không bao giờ được vào git. File mẫu cho người khác biết cần những biến nào.

### 2.4 Server chạy giờ UTC (D-23)
- **Ở đâu:** `SinoApiApplication.main` (`TimeZone.setDefault(UTC)`), `pom.xml` (`-Duser.timezone=UTC` cho test).
- **Vì sao:** Windows đặt vùng Việt Nam trả về mã múi giờ cũ `Asia/Saigon`, và PostgreSQL 18 từ chối mã này khi kết nối. Quy ước chung: server luôn lưu và tính giờ theo UTC, frontend đổi sang giờ địa phương khi hiển thị.

---

## 3. Database

### 3.1 PostgreSQL 18 chạy bằng Docker Compose
- **Ở đâu:** `compose.yaml`.
- **Các chi tiết đáng học:**
  - Port gắn vào `127.0.0.1`: chỉ máy bạn kết nối được, máy khác trong mạng thì không.
  - **Named volume** `pgdata`: dữ liệu còn nguyên khi xóa container.
  - `healthcheck` dùng `pg_isready`: biết lúc nào DB thật sự sẵn sàng.
  - `${POSTGRES_DB:?…}`: thiếu biến thì Compose dừng kèm thông báo.
- **Bẫy:** image tag (`postgres:18`) phải trùng với Testcontainers trong test. Cả hai file đều có comment nhắc điều này.

### 3.2 Flyway — quản lý thay đổi schema
- **Ở đâu:** `src/main/resources/db/migration/V1__modulith_create_event_publication.sql`.
- **Là gì:** mỗi thay đổi DB là một file SQL đánh số (`V1__…`, `V2__…`). Khi khởi động, Flyway chạy các file chưa chạy và ghi lại vào bảng `flyway_schema_history`.
- **Vì sao:** mọi máy và mọi môi trường có cùng một schema, và lịch sử thay đổi nằm trong git.
- **Bẫy:** **không bao giờ sửa** file migration đã chạy, vì checksum sẽ lệch và app không start. Muốn đổi thì thêm file `V{n+1}`.

### 3.3 JPA/Hibernate: `ddl-auto: validate`, `open-in-view: false`
- **`validate`:**
  - Hibernate chỉ **kiểm tra** entity Java có khớp với bảng không; nó không tự tạo hay sửa bảng.
  - Flyway là nơi duy nhất sở hữu schema.
  - Sai lệch thì app không start. Điều này từng xảy ra ở BE-02: thiếu bảng `event_publication`.
- **`open-in-view: false`:** giao dịch DB kết thúc trong service, không kéo dài sang tầng web. Nhờ vậy không có truy vấn "lén" khi controller đọc dữ liệu lazy.

---

## 4. Kiến trúc module — Spring Modulith

### 4.1 Modular monolith
- **Là gì:** chỉ một ứng dụng duy nhất, nhưng bên trong chia module với ranh giới rõ ràng, như thể chúng là các service riêng.
- **Vì sao:** vẫn đơn giản như một app (một lần deploy, một DB), mà vẫn giữ được kỷ luật: sau này muốn tách một module ra service riêng thì ít đau.

### 4.2 Public API và internal
- **Ở đâu:** quy ước ghi ở `README.md` mục "Module conventions"; `provider/spi/package-info.java` có `@NamedInterface("spi")`.
- **Quy tắc:**
  - Module khác **chỉ** được dùng các class ở package gốc của module (ví dụ `dev.sino.provider`) và các package có đánh dấu `@NamedInterface`.
  - Các package `application`, `api`, `infrastructure` là **nội bộ**.
- **Ví dụ:** module khác dùng `ProviderRegistry` (interface ở package gốc), không được đụng vào `DefaultProviderRegistry` (nằm trong `application`).

### 4.3 `ModularityTests` — kiến trúc được kiểm tra bằng test
- **Ở đâu:** `src/test/java/dev/sino/ModularityTests.java`.
- **Để làm gì:** `ApplicationModules.of(…).verify()` làm **test đỏ** khi có module dùng lén phần nội bộ của module khác. Quy tắc kiến trúc được máy kiểm tra, không chỉ nằm trên giấy.
- Test này còn sinh sơ đồ module ở `target/spring-modulith-docs`.

---

## 5. Security

### 5.1 `SecurityFilterChain`
- **Ở đâu:** `common/security/SecurityConfig.java`.
- **Luật hiện tại:**
  - `/actuator/health` và `/actuator/info` công khai.
  - `/api/**` cần đăng nhập.
  - **Mọi đường dẫn khác bị chặn (`denyAll`)**. Đây là nguyên tắc "đóng mặc định": quên khai báo thì bị khóa, chứ không bị lộ.
- **HTTP Basic:** mỗi request gửi kèm username và mật khẩu (D-02). Cách này đơn giản, đủ cho giai đoạn chỉ có backend; sẽ thay bằng đăng nhập trình duyệt ở D-22.
- **`STATELESS`, tắt CSRF:**
  - Không có session cookie nên mỗi request tự mang thông tin xác thực.
  - CSRF là kiểu tấn công lợi dụng cookie mà trình duyệt tự gửi đi. Không có cookie thì không có rủi ro này, nên tắt CSRF.
- **`{noop}`:** mật khẩu API user đến từ biến môi trường và chỉ nằm trong bộ nhớ, nên không băm. Mật khẩu của người dùng thật thì **luôn phải băm** (BCrypt…).

### 5.2 401/403 cũng là Problem Details
- **Ở đâu:** `SecurityProblemHandler.java`.
- **Vì sao:** lỗi bảo mật xảy ra trong filter, **trước khi** tới Spring MVC. Class này chuyển chúng sang cơ chế xử lý lỗi của MVC, để 401/403 có cùng định dạng JSON với mọi lỗi khác.

---

## 6. Mô hình lỗi

### 6.1 `SinoException` + `ErrorCode` + `ErrorCategory`
- **Ở đâu:** `common/error/`.
- **Là gì:**
  - Module báo lỗi bằng `SinoException` kèm một mã ổn định, ví dụ `UNKNOWN_PROVIDER`.
  - Mỗi mã thuộc một **category** (`NOT_FOUND`, `CONFLICT`…).
  - **Chỉ tầng web** đổi category sang mã HTTP (`NOT_FOUND` → 404).
- **Vì sao:** code nghiệp vụ không biết gì về HTTP. Sau này có gọi nghiệp vụ từ job nền hay từ event thì vẫn dùng lại được.

### 6.2 Problem Details (RFC 9457) và `GlobalExceptionHandler`
- **Ở đâu:** `common/web/GlobalExceptionHandler.java` (`@RestControllerAdvice` cộng các `@ExceptionHandler`).
- **Là gì:** chuẩn quốc tế cho JSON lỗi: `title`, `status`, `detail`, `instance`, cộng thêm `code` riêng của Sino.
- **Vì sao:** frontend chỉ cần đọc `code`, không phải đoán từ câu chữ.
- **Bẫy và cách xử lý:** lỗi không lường trước được trả `500` kèm một câu chung chung; stack trace chỉ nằm trong log server. Client không bao giờ thấy SQL hay thông tin nội bộ.

### 6.3 `ProviderException` không phải `SinoException` (D-24)
- Lỗi của provider (token hết hạn, bị giới hạn tần suất…) là chuyện giữa Sino và provider. F07 (sync) và F10 (gửi tin) phải tự đổi nó thành lỗi của mình.
- Nếu lỡ lọt ra web, client chỉ thấy `500` chung chung, không bao giờ thấy chi tiết từ Gmail.

---

## 7. Health check — Spring Boot Actuator

- **Ở đâu:** `application.yaml` (`management.*`), `ReadinessWhenDatabaseIsDownTests.java`.
- **Liveness và readiness:**
  - **Liveness** hỏi "process còn sống không?". Nếu không, hệ thống chạy app sẽ khởi động lại nó.
  - **Readiness** hỏi "đã nhận request được chưa?". Câu này có tính DB.
- **Vì sao liveness không tính DB:** DB sập mà liveness báo DOWN thì app bị khởi động lại liên tục, vô ích, vì DB vẫn sập. Đúng ra chỉ nên **tạm ngừng nhận request** (readiness DOWN) và chờ DB lên lại.

---

## 8. Ngôn ngữ Java dùng trong F03

### 8.1 `record` và compact constructor
- **Ở đâu:** `ProviderType`, `ProviderDescriptor`, các `Normalized*`, `SyncBatch`…
- **Là gì:** class chỉ để chứa dữ liệu và **không đổi được** (immutable). Java tự sinh constructor, getter (`type()`), `equals`, `hashCode`, `toString`.
- **Compact constructor:** chỗ kiểm tra và chuẩn hóa dữ liệu trước khi gán vào field.

  ```java
  public ProviderType {
      value = value.trim().toLowerCase(Locale.ROOT);   // chuẩn hóa
      if (!PATTERN.matcher(value).matches()) throw ...; // kiểm tra
  }
  ```

- **Vì sao:** một object đã tạo xong thì **luôn hợp lệ**. Nơi dùng nó không phải kiểm tra lại.
- **Bẫy:** `toString()` tự sinh in **mọi** field, kể cả token. `TokenCredentials` và `OAuth2Credentials` vì vậy phải override để che secret.

### 8.2 Value object thay cho enum (D-16)
- **Ở đâu:** `ProviderType` là record bọc một chuỗi.
- **Vì sao:** enum là danh sách **đóng**, thêm provider mới phải sửa core. Value object là tập **mở**: thêm provider chỉ cần thêm connector, core không đổi.

### 8.3 Enum có field
- **Ở đâu:** `ProviderErrorCode(boolean retryable)`, `ProviderRegistryErrorCode(ErrorCategory category)`.
- **Vì sao:** thông tin đi kèm được **gắn chặt** vào từng hằng số (`RATE_LIMITED` thì retryable), không nằm rải rác trong các `if/else`.

### 8.4 `EnumSet`, bản sao phòng thủ (defensive copy), tập chỉ-đọc
- **Ở đâu:** `ProviderCapabilities`.
- **Là gì:**
  - `EnumSet` là `Set` chuyên dùng cho enum: nhanh, và duyệt theo đúng thứ tự khai báo.
  - Constructor **sao chép** tập được truyền vào, rồi bọc bản sao trong `Collections.unmodifiableSet`.
- **Vì sao:** người gọi sửa tập gốc sau khi đã tạo object thì object vẫn không đổi. Đây chính là điều test `copiesTheSetItWasGiven` kiểm tra.

### 8.5 Collection bất biến: `List.of`, `List.copyOf`, `Map.copyOf`
- **Ở đâu:** khắp `spi`, `DefaultProviderRegistry`.
- **Bẫy:** các hàm này **từ chối phần tử `null`**, và gọi `add`/`clear` sẽ ném `UnsupportedOperationException`. Đó là cố ý: muốn đổi dữ liệu thì phải tạo object mới.

### 8.6 Interface có `default` method
- **Ở đâu:** `MessageProvider.sendMessage` (mặc định ném `CAPABILITY_NOT_SUPPORTED`), `MessageProvider.displayName` (mặc định bằng `type`).
- **Vì sao:** connector chỉ-đọc không phải viết một method rỗng. Thêm method mới vào interface cũng không làm hỏng các connector đã có.
- **Bẫy:** default chỉ là lưới an toàn. Bên gọi vẫn phải kiểm tra capability trước khi gọi.

### 8.7 `sealed interface` và pattern matching trong `switch`
- **Ở đâu:** `ProviderCredentials permits OAuth2Credentials, TokenCredentials`; hàm `secretOf` trong `MessageProviderContractTest`; `codeFor` trong `GlobalExceptionHandler`.
- **Là gì:** `sealed` liệt kê **đủ và đúng** các lớp con được phép. Vì vậy `switch` biết đã xét hết mọi trường hợp; thêm một loại credential mà quên xử lý thì **lỗi ngay lúc biên dịch**.

  ```java
  return switch (credentials) {
      case OAuth2Credentials oauth -> oauth.accessToken();
      case TokenCredentials token -> token.token();
  };
  ```

### 8.8 `Optional`
- **Ở đâu:** `ProviderRegistry.find`, `ProviderException.retryAfter`.
- **Vì sao:** kiểu trả về nói thẳng "có thể không có". Người gọi buộc phải xử lý trường hợp rỗng, thay vì quên kiểm tra `null`.

### 8.9 Exception
- **Unchecked (`RuntimeException`):** dùng cho lỗi không tự xử lý ngay tại chỗ được. `ProviderException` và `SinoException` đều thuộc loại này.
- **Lỗi lập trình và lỗi dữ liệu khác nhau:**
  - Truyền `null` vào chỗ bắt buộc là **lỗi lập trình** → `NullPointerException` hoặc `IllegalArgumentException`.
  - Dữ liệu provider gửi về thiếu trường là **lỗi dữ liệu** → `ProviderException(PAYLOAD_NORMALIZATION_FAILED)`.
- **Constructor `private` cộng static factory:** `ProviderException.rateLimited(…)` là cách duy nhất để có `retryAfter`. Nhờ vậy không ai gắn nhầm thời gian chờ vào một mã lỗi khác (rút ra từ review BE-22).

### 8.10 Stream API và `Comparator`
- **Ở đâu:** `ProvidersController.list()`, `DefaultProviderRegistry`.

  ```java
  registry.descriptors().stream().map(ProviderResponse::from).toList();
  ```

- **Đọc là:** lấy từng descriptor, đổi mỗi cái sang DTO, gom thành list.
- `Comparator.comparing(d -> d.type().value())` nghĩa là sắp xếp theo chuỗi `type`.

### 8.11 Static factory và Builder
- **Static factory:** `ProviderType.of("gmail")`, `ProviderCapabilities.of(READ_MESSAGES)`. Tên hàm đọc tự nhiên hơn `new`.
- **Builder:** `FakeMessageProvider.builder("fake").capabilities(…).page(…).build()`. Dùng khi object có nhiều tùy chọn: ghép từng phần, không cần một constructor dài 6 tham số.

### 8.12 Phạm vi truy cập: package-private
- **Ở đâu:** `DefaultProviderRegistry`, `ProvidersController`, `ProviderResponse` không có `public`.
- **Vì sao:** chỉ code cùng package nhìn thấy chúng. Spring vẫn tạo được bean, còn module khác thì không thể dùng nhầm. Đây là đóng gói (encapsulation) ở mức ngôn ngữ, hỗ trợ cho mục 4.

---

## 9. Cách thiết kế (pattern) trong F03

### 9.1 SPI — Service Provider Interface (còn gọi là ports & adapters)
- **Ở đâu:** `provider/spi/MessageProvider.java`. Connector thật sẽ nằm ở `provider/infrastructure/<tên>/` từ F04.
- **Ý tưởng:**
  - Core **định nghĩa** interface.
  - Mỗi provider **cài đặt** interface đó.
  - Core chỉ biết interface, không biết Gmail hay Telegram.
- **Thêm provider thứ hai:**
  - Tạo connector mới `implements MessageProvider`, cộng một class test kế thừa `MessageProviderContractTest`.
  - Core không đổi, **miễn là** provider đó vừa với contract. Nếu cần capability mới, kiểu kết nối mới hay dữ liệu không khớp thì contract phải mở rộng.

### 9.2 Registry và fail-fast
- **Ở đâu:** `DefaultProviderRegistry`.
- Nhận mọi connector từ Spring, dựng một map theo `ProviderType` **một lần duy nhất** lúc khởi động.
- Hai connector trùng type thì app **không start**, kèm thông báo nêu tên hai class.
- **Vì sao fail-fast:** lỗi cấu hình lộ ra ngay lúc deploy, thay vì nổ lúc 2 giờ sáng khi có người dùng gọi tới.

### 9.3 Capability là dữ liệu khai báo
- Không viết `if (provider == gmail) …`. Mỗi connector tự khai báo nó làm được gì (`READ_MESSAGES`, `SEND_MESSAGES`…).
- Mọi nơi đều hỏi tập capability đó: backend kiểm tra trước khi gọi, frontend ẩn nút qua `GET /api/providers`.

### 9.4 Chuẩn hóa dữ liệu và bỏ qua item lỗi
- Connector đổi dữ liệu thô sang kiểu chuẩn của Sino (`Normalized*`).
- Một item hỏng thì thành `SkippedItem`, phần còn lại của batch vẫn được giữ (xem `FakeMessageProvider.fetchUpdates`).
- Chỉ bỏ qua lỗi **của từng item** (`PAYLOAD_NORMALIZATION_FAILED`). Lỗi của cả kết nối, như `AUTH_EXPIRED`, phải làm cả lời gọi thất bại.

### 9.5 DTO tách khỏi kiểu nội bộ
- **Ở đâu:** `ProviderResponse` thay vì trả thẳng `ProviderDescriptor`.
- **Vì sao:** JSON là hợp đồng với frontend. Bên trong đổi thoải mái, JSON chỉ đổi khi chính DTO được sửa.

### 9.6 Composition hơn inheritance
- Connector Telegram **không** kế thừa class Gmail. Hai provider giống nhau ở hình dạng (interface), khác nhau ở ruột.
- Phần dùng chung thật sự (HTTP, retry) thì tách thành class riêng rồi **dùng** nó.

---

## 10. Test

| Loại | Dùng gì | Ví dụ trong repo | Khi nào |
|---|---|---|---|
| Unit | `new` object, JUnit + AssertJ | `ProviderTypeTests`, `DefaultProviderRegistryTests` (phần đầu) | Logic thuần, nhanh nhất |
| Spring nhỏ | `ApplicationContextRunner` | `DefaultProviderRegistryTests` (3 test cuối) | Kiểm tra cách Spring lắp bean mà không cần cả app |
| Web slice | `@WebMvcTest` + `MockMvc` | `ProvidersControllerTests`, `SecurityConfigTests` | Controller, JSON, security; không DB |
| Toàn app | `@SpringBootTest` + Testcontainers | `SinoApiApplicationTests`, `ReadinessWhenDatabaseIsDownTests` | Cần DB thật; chậm, cần Docker |
| Kiến trúc | Spring Modulith, ArchUnit | `ModularityTests`, `ProviderContractArchitectureTests` | Ranh giới module, phụ thuộc package |
| Contract | Lớp test abstract | `MessageProviderContractTest` | Mọi connector phải qua cùng một bộ kiểm tra |

Các công cụ đáng nhớ:
- **AssertJ** (`assertThat(x).isEqualTo(y)`): đọc gần như câu tiếng Anh, và báo lỗi rõ ràng.
- **`@ParameterizedTest`:** một test chạy với nhiều giá trị đầu vào (`""`, `"   "`).
- **`@Nested`:** gom test thành nhóm. `FakeMessageProviderContractTest` dùng nó để chạy cùng một bộ kiểm tra cho fake chỉ-đọc và fake có gửi tin.
- **Assumption (`assumeTrue`/`assumeFalse`):** điều kiện không đúng thì test được **bỏ qua** (skipped), không tính là đỏ. Vì vậy mỗi fake có một test skipped.
- **Testcontainers** cộng `@ServiceConnection`: chạy PostgreSQL thật trong Docker cho test và tự nối datasource vào nó.
- **Mockito `@MockitoBean`:** thay một bean bằng bản giả và quy định giá trị nó trả về (`given(registry.descriptors()).willReturn(…)`).
- **Kiểm tra ngược (mutation check):** cố ý làm hỏng code để xem test có đỏ không. Test không đỏ nghĩa là test đó không bảo vệ được gì. Kỹ thuật này đã dùng ở BE-19…BE-21.

---

## 11. CI — GitHub Actions

- **Ở đâu:** `.github/workflows/backend-ci.yml`.
- **Làm gì:** mỗi lần push hoặc mở PR có đụng tới `apps/sino-api/**`, máy của GitHub cài Java 25 rồi chạy `./mvnw -B -ntp verify`. Máy đó có sẵn Docker cho Testcontainers.
- **Vì sao:** "chạy được trên máy tôi" chưa đủ. CI là trọng tài chung; nhánh đỏ thì không merge.
- **Chi tiết:**
  - `-B` là chế độ không tương tác.
  - `-ntp` tắt log tiến trình tải thư viện.
  - `concurrency` hủy lần chạy cũ khi có push mới.

---

## 12. Tự kiểm tra

Trả lời được hết thì bạn đã nắm Phase 0:

1. Vì sao `application.yaml` cố ý không có giá trị mặc định cho URL của database?
2. `ddl-auto: validate` khác `update` ở đâu, và vì sao dự án này chọn `validate`?
3. Một module khác có được dùng `DefaultProviderRegistry` không? Cái gì sẽ chặn nếu bạn cố dùng?
4. Vì sao tắt CSRF mà vẫn an toàn ở thời điểm này? Khi nào phải bật lại?
5. Liveness và readiness khác nhau thế nào? Vì sao liveness không tính database?
6. `record` tự sinh những gì? Cái nào trong số đó nguy hiểm với dữ liệu nhạy cảm?
7. Vì sao `ProviderType` là value object chứ không phải enum?
8. Thêm một loại credential mới mà quên xử lý trong `switch`: chuyện gì xảy ra, và vì sao?
9. Một message lỗi trong batch đi đâu? Lỗi `AUTH_EXPIRED` thì sao?
10. Khi nào dùng `@WebMvcTest`, khi nào dùng `@SpringBootTest`?

---

## Bổ sung khi làm F02

*(Chưa làm. Theo design F02, dự kiến có: JPA entity và repository; mã hóa credential (design đề xuất AES-256-GCM, chưa chốt); optimistic locking bằng cột `version`; event của module `account` qua Spring Modulith.)*
