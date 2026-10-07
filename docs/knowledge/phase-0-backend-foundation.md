# Kiến thức Phase 0 — Nền móng backend

> **Dành cho:** người học Java qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** F01 Project Foundation và F03 Provider Contract (mục 0–12); F02 Connected Accounts (mục 13–21, đang làm: xong BE-09…BE-15).
> **Cập nhật:** 2026-10-07. Đường dẫn code tính từ `apps/sino-api/`.

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

Ba bài học có thật từ F03:
- **`@WebMvcTest` luôn ghi rõ controller**, ví dụ `@WebMvcTest(ProvidersController.class)`. Viết trần `@WebMvcTest` thì Spring nạp **mọi** controller. Ở BE-25, `ProvidersController` cần `ProviderRegistry`, mà bean này không có trong web slice, nên 18 test cũ của F01 đỏ dù không ai đụng vào chúng.
- **Chạy cả bộ test trước khi nói "xanh".** Chạy một phần chỉ chứng minh phần đó. Lỗi ở trên nằm trong test cũ, nên lệnh chỉ chạy test mới không thấy được.
- **Đếm test khi có `@Nested`:** dòng tổng của Surefire có thể đếm thiếu (F03: ghi 172, thực tế 174). Muốn con số chính xác thì cộng các dòng `Tests run` theo từng lớp.

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

## 13. F02 — Bức tranh: người dùng Sino và tài khoản provider

F02 lưu các tài khoản bạn kết nối vào Sino. Có hai khái niệm "tài khoản" khác nhau, nằm ở hai module khác nhau:

```text
app_user  (module identity)
  "bạn" - người dùng Sino: email, tên hiển thị
     |
     |  một user có nhiều account
     v
connected_account  (module account)
  "Gmail cá nhân", "Gmail công việc"
  provider, ID bên provider, trạng thái
     |
     |  mỗi account có một credential
     v
account_credential  (BE-13)
  token đã mã hóa: access/refresh token, ID khóa
```

| Task | Đã làm | Trạng thái |
|---|---|---|
| BE-09 | Module `identity`: bảng `app_user`, tạo owner lúc khởi động, `CurrentUser` | xong |
| BE-10 | Aggregate `ConnectedAccount` và máy trạng thái | xong |
| BE-11 | Bảng `connected_account`, ánh xạ JPA, repository | xong |
| BE-12 | Mã hóa credential AES-256-GCM, kiểm tra khóa lúc khởi động, review bảo mật | xong |
| BE-13 | Bảng `account_credential`, `CredentialStore` (mã hóa khi ghi, giải mã khi đọc) | xong |
| BE-14 | Use case đăng ký kết nối (tạo mới / reconnect) và event `AccountConnected` | xong |
| BE-15 | API đọc: `GET /api/accounts`, `GET /api/accounts/{id}` | xong |
| BE-16…BE-18 | Sửa account (PATCH), xóa, nghiệm thu | chưa làm |

Quyết định đã chốt: **D-10 = A** (module `identity` riêng), **D-11 = A** (AES-256-GCM bằng thư viện có sẵn của JDK, khóa có ID), **D-12 = A** (5 trạng thái, không lưu `SYNCING`), **D-14** (thêm 4 cột cho bảng credential), quy tắc "luôn ghi cả credential". Lần đầu áp dụng D-08 (UUIDv7) và D-09 (enum lưu chữ + `CHECK`).

---

## 14. Module `identity`: owner và người dùng hiện tại (BE-09)

### 14.1 Vì sao có module riêng (D-10)
- **Ở đâu:** `src/main/java/dev/sino/identity/`.
- **Vì sao:** "người dùng Sino" khác "tài khoản Gmail". Khi có đăng nhập thật cho nhiều người (D-22), mọi thứ về đăng nhập vào `identity`; module `account` chỉ biết `ownerId` (một UUID) nên không phải sửa.

### 14.2 Tạo owner lúc khởi động: `ApplicationRunner`
- **Ở đâu:** `identity/application/OwnerProvisioner.java`.
- **Là gì:** class `implements ApplicationRunner`; Spring gọi method `run(...)` **một lần**, ngay sau khi khởi động xong.
- **Vì sao dùng nó:** lúc runner chạy, Flyway đã tạo xong bảng `app_user`, nên ghi vào bảng là an toàn. Runner ném lỗi thì app dừng (fail-fast).
- **Upsert theo email:** tìm owner theo email; chưa có thì tạo, có rồi thì cập nhật tên. Chạy bao nhiêu lần cũng chỉ có một dòng (idempotent). Đổi **email** thì thành owner mới.
- **Bẫy `@Transactional`:** annotation chỉ có tác dụng khi method được gọi **qua bean Spring** (Spring bọc bean trong một "proxy" mở và đóng transaction). Tự `new OwnerProvisioner(...)` rồi gọi thì không có transaction.

### 14.3 `CurrentUser`: "ai đang gọi API?"
- **Ở đâu:** `identity/CurrentUser.java` (public), `identity/application/OwnerCurrentUser.java` (cài đặt).
- **Để làm gì:** code nghiệp vụ hỏi `currentUser.requireOwnerId()` thay vì tự đọc Spring Security. Ở MVP, mọi người đã đăng nhập (HTTP Basic) đều là owner.
- **Chi tiết:** đọc `SecurityContextHolder`, nơi Spring Security để thông tin người đang đăng nhập. Khách vô danh (`AnonymousAuthenticationToken`) bị từ chối. ID owner tra DB **một lần** rồi giữ trong field `volatile` (an toàn khi nhiều luồng cùng đọc).

### 14.4 Cấu hình bắt buộc
- `SINO_OWNER_EMAIL`, `SINO_OWNER_DISPLAY_NAME` vào record `OwnerProperties` có `@NotBlank`, `@Email`. Thiếu thì app không start. Compact constructor của record trim và đổi email về chữ thường **trước** khi kiểm tra.

---

## 15. JPA entity và repository (BE-09, BE-11)

### 15.1 Entity
- **Ở đâu:** `identity/infrastructure/AppUser.java`, `account/domain/ConnectedAccount.java`.
- **Các annotation:**
  - `@Entity` + `@Table(name = "...")`: class ứng với bảng nào.
  - `@Id` + `@UuidGenerator(style = VERSION_7)`: Hibernate tự sinh UUIDv7 khi lưu lần đầu. UUIDv7 bắt đầu bằng thời gian nên tăng dần, index của PostgreSQL chèn vào cuối thay vì rải lung tung (D-08).
  - `@Column(name = "user_id")`: tên field Java khác tên cột thì ghi rõ. `updatable = false`: cột không bao giờ bị `UPDATE`.
  - `@Enumerated(EnumType.STRING)`: lưu `"CONNECTED"`, không lưu số thứ tự. Lưu số thì chèn thêm giá trị vào giữa enum là dữ liệu cũ sai nghĩa. DB có thêm `CHECK (status IN (...))` (D-09).
  - `@PrePersist` / `@PreUpdate`: Hibernate gọi ngay trước `INSERT` / `UPDATE` để điền `created_at`, `updated_at`.
  - Constructor rỗng `protected`: JPA cần nó để tạo object bằng reflection; `protected` để code của mình không dùng nhầm.
- **Không có setter:** muốn đổi dữ liệu phải gọi hành động có tên (`rename`, `disable`…).

### 15.2 Map thẳng lên aggregate (lựa chọn của BE-11)
- `ConnectedAccount` vừa là domain vừa là entity: một model, không cần class mapper. Cái giá là domain biết annotation JPA; ở quy mô này, đơn giản thắng.

### 15.3 `AttributeConverter`
- **Ở đâu:** `account/infrastructure/ProviderTypeConverter.java`.
- **Là gì:** dạy Hibernate cách lưu một kiểu nó không biết, ở đây `ProviderType` ↔ chuỗi `"gmail"`.
- **`autoApply = true`:** tự áp cho mọi field kiểu `ProviderType`, nên domain không phải nhắc tới class hạ tầng này.

### 15.4 `@Version` — optimistic locking
- Mỗi lần `UPDATE`, Hibernate tăng `version` và chỉ ghi khi DB vẫn đúng version nó đã đọc. Hai request cùng sửa một account: request chậm hơn bị từ chối, thay vì âm thầm ghi đè.
- **Bẫy:** import `jakarta.persistence.Version`, **không phải** `org.springframework.data.annotation.Version`.

### 15.5 Repository
- **Ở đâu:** `AppUserRepository`, `ConnectedAccountRepository`.
- Chỉ là interface `extends JpaRepository<Entity, KieuId>`; Spring tự sinh phần cài đặt.
- **Tên method là câu truy vấn:** `findByOwnerIdOrderByCreatedAtAscIdAsc` = `WHERE user_id = ? ORDER BY created_at, id`. Tên dùng **field Java**, không dùng tên cột.
- `@Query("select u.id from AppUser u where u.email = :email")`: viết JPQL (truy vấn theo entity) khi chỉ cần một cột.

### 15.6 Ràng buộc ở database là lớp bảo vệ cuối
- `UNIQUE (user_id, provider, external_account_id)`: dù code tìm trước rồi mới tạo, hai request đến cùng lúc vẫn có thể cùng "không thấy" rồi cùng tạo. Chỉ DB chặn được chắc chắn.
- `FOREIGN KEY ... REFERENCES app_user`: account phải thuộc một user có thật.

---

## 16. Aggregate và máy trạng thái (BE-10)

### 16.1 "Tell, don't ask"
- **Ở đâu:** `account/domain/ConnectedAccount.java`.
- Không có `setStatus`. Bên ngoài **ra lệnh** (`disable()`, `markAuthExpired()`), aggregate tự quyết có đổi hay không. Luật nằm một chỗ; không service nào có thể quên luật.

### 16.2 Máy trạng thái viết gọn
- Mỗi hành động khai báo "đích đến" và "được đi từ đâu":

  ```java
  public Optional<StatusChange> markAuthExpired() {
      return moveTo(AUTH_EXPIRED, EnumSet.of(CONNECTED, DEGRADED, ERROR));
  }
  ```

- Trạng thái hiện tại không nằm trong tập cho phép thì không làm gì và trả `Optional.empty()`. Vì vậy `DISABLED` (người dùng tắt) không bao giờ bị hệ thống tự đổi, và `AUTH_EXPIRED` chỉ reconnect mới gỡ.
- Trả `Optional<StatusChange>` thay vì tự tạo event: service có ID và đồng hồ nên service tạo event `AccountStatusChanged`; domain giữ là Java thuần.

### 16.3 Bảng trong tài liệu = bảng trong test
- 35 ô của bảng chuyển trạng thái (design F02) được chép nguyên vào `@CsvSource`; `@ParameterizedTest` chạy mỗi ô thành một test. Sửa luật mà quên sửa bảng thì test đỏ.

### 16.4 Bẫy emoji: `char` khác "ký tự"
- Java lưu chuỗi theo UTF-16: một emoji (ví dụ hình mặt cười) chiếm **2** `char`. Hằng `EMOJI` trong `ConnectedAccountTests` chứa đúng một emoji, và `EMOJI.length() == 2`. PostgreSQL thì đếm `varchar(100)` theo ký tự thật (code point), nên emoji đó chỉ là 1 ký tự.
- Vì vậy dùng `codePointCount` để đếm và `offsetByCodePoints` để cắt; `substring` thường có thể chặt đôi emoji thành ký tự hỏng.

---

## 17. Mã hóa credential (BE-12, D-11)

### 17.1 Vì sao
- Token Gmail là chìa khóa vào hộp thư. Nếu lưu dạng chữ, một bản backup DB bị lộ là lộ mọi hộp thư. Vì vậy token được **mã hóa trong app trước khi ghi DB**, còn **khóa nằm ngoài DB** (biến môi trường).

### 17.2 AES-256-GCM, giải thích từng phần
- **Ở đâu:** `account/infrastructure/crypto/CredentialCipher.java`.
- **AES-256:** mã hóa đối xứng: một khóa 32 byte (256 bit) dùng cho cả mã hóa và giải mã.
- **GCM:** chế độ "mã hóa có xác thực". Ngoài việc giấu nội dung, nó gắn thêm một **con dấu (tag 128 bit)**. Sửa dù một byte thì giải mã báo lỗi, không bao giờ trả dữ liệu sai.
- **IV 12 byte, ngẫu nhiên, mới cho mỗi lần:** cùng token mã hóa hai lần ra hai kết quả khác nhau. **Không bao giờ dùng lại IV với cùng khóa:** với GCM, lặp IV làm lộ dữ liệu và cho phép giả mạo con dấu. Kiểm tra ngược đã chứng minh test bắt được lỗi này: cho IV cố định thì test "hai lần phải khác nhau" đỏ.
- **AAD (associated data) = `sino:account_credential:v1:<accountId>:<tên cột>`:** phần này không được mã hóa nhưng được "đóng dấu" cùng. Chép giá trị mã hóa của account A sang account B, hay từ cột `access_token` sang `refresh_token`, thì giải mã thất bại. Tiền tố `account_credential:v1` gắn giá trị với đúng bảng và phiên bản định dạng.
- **Định dạng lưu:** `base64(IV ‖ ciphertext ‖ tag)` trong cột `*_enc`; **ID khóa** (`k1`) ở cột riêng.
- **Các class của JDK:** `Cipher.getInstance("AES/GCM/NoPadding")`, `GCMParameterSpec`, `SecretKeySpec`, `SecureRandom`. Không thêm thư viện ngoài.
- **Thread-safety:** `Cipher` không an toàn khi dùng chung giữa các luồng, nên mỗi lần mã hóa tạo `Cipher` mới; `SecureRandom` thì dùng chung được.

### 17.3 Khóa và xoay khóa
- **Cấu hình:** `SINO_CREDENTIAL_ACTIVE_KEY_ID=k1`, `SINO_CREDENTIAL_KEY_K1=<base64 của 32 byte>`; tạo khóa bằng `openssl rand -base64 32`.
- **Kiểm tra lúc khởi động:**
  - ID khóa phải khớp `[a-z0-9_-]{1,32}`, không tự cắt khoảng trắng: `k1 ` lỡ có dấu cách trong `.env` sẽ báo lỗi thay vì âm thầm thành một ID khác.
  - Khóa active phải có, và mọi khóa phải là base64 của đúng 32 byte; sai thì app không start.
  - Thông báo lỗi chỉ nêu **tên** cấu hình (`sino.credentials.encryption.keys.k1`), không bao giờ in giá trị khóa.
- **Vì sao không dùng `@Size` để kiểm khóa:** thông báo lỗi của Spring Boot in kèm giá trị bị từ chối, tức là in luôn khóa. Vì vậy cipher tự kiểm và tự viết thông báo.
- **Xoay khóa:** thêm ô `k2` trong `application.yaml` và biến `SINO_CREDENTIAL_KEY_K2`, rồi đặt active = `k2`. Dữ liệu cũ vẫn đọc được bằng `k1`, vì ID khóa được lưu cạnh dữ liệu; dữ liệu ghi mới dùng `k2`. Khi không còn dòng nào dùng `k1` thì gỡ `k1`.
- **Bẫy:** mất khóa là mất toàn bộ token (người dùng phải kết nối lại). Backup khóa ở ngoài repo; không bao giờ commit khóa thật.

### 17.4 Lỗi giải mã
- `CredentialDecryptionException` là lỗi phía server (500). Thông báo nêu account, cột và ID khóa để điều tra, **không bao giờ** chứa token hay dữ liệu mã hóa.

### 17.5 Review bảo mật riêng
- Code mã hóa tự viết nên được một agent reviewer độc lập đọc trước khi commit. Kết quả: không có lỗi nghiêm trọng (CRITICAL/HIGH).
- Đã sửa theo góp ý: AAD có tiền tố phạm vi và phiên bản; kiểm tra ID khóa; xóa mảng byte của khóa khỏi bộ nhớ sau khi dùng; thêm test ghim độ dài IV và tag, giá trị bị cắt cụt, giá trị bị gắn sai ID khóa.
- Một điểm chuyển sang BE-13: bảng chỉ có **một** ID khóa cho cả dòng. Khi đã xoay khóa, ghi lại access token mà quên refresh token thì refresh token không đọc được nữa. BE-13 giải quyết bằng quy tắc ở mục 17.6.

### 17.6 Lưu credential: `CredentialStore` (BE-13, D-14)
- **Ở đâu:** `account/infrastructure/CredentialStore.java`, entity `AccountCredential`, migration `V4__account_create_account_credential.sql`.
- **Là gì:** "cửa duy nhất" để ghi và đọc credential:
  - `save(accountId, credential, refreshToken)`: mã hóa rồi ghi.
  - `load(accountId)`: đọc rồi giải mã, trả `ProviderCredentials` của F03, chỉ nằm trong bộ nhớ.
  - `delete(accountId)`: xóa.
- **Bảng `account_credential`:** một dòng cho mỗi account (`UNIQUE (account_id)`). Khóa ngoại tới `connected_account` có `ON DELETE CASCADE`: xóa account thì credential tự biến mất trong cùng câu lệnh. Bốn cột thêm so với tài liệu 02B (D-14):
  - `credential_type`: `OAUTH2` (Gmail) hoặc `TOKEN` (ví dụ bot Telegram).
  - `encryption_key_id`: khóa đã mã hóa dòng này.
  - `created_at`, `version`: theo quy ước F01.
- **Quy tắc "luôn ghi cả credential":** store **không có** hàm sửa riêng một token. Mỗi lần `save`, mọi trường bí mật được mã hóa lại bằng khóa active, và `encryption_key_id` của dòng là khóa đó. Vì vậy sau khi xoay khóa, không thể có chuyện access token dùng `k2` mà refresh token còn `k1`. Entity còn tự kiểm thêm: hai giá trị mã hóa khác khóa sẽ bị từ chối.
- **Switch trên sealed interface:** `OAuth2Credentials` ứng với `OAUTH2`, `TokenCredentials` ứng với `TOKEN`. Thêm một loại credential mới mà quên xử lý thì code không biên dịch được.
- **Cột `jsonb`:** `scopes` (danh sách quyền Gmail đã cấp) lưu dạng mảng JSON nhờ `@JdbcTypeCode(SqlTypes.JSON)`; Hibernate 7 tự dùng Jackson để chuyển `List<String>` sang JSON.
- **Phạm vi truy cập:** entity và repository là package-private; chỉ `CredentialStore` là public, và nằm trong package nội bộ `infrastructure`, nên Spring Modulith chặn mọi module khác dùng nó.
- **Refresh token:** `load` chưa trả refresh token (F03 cố ý để `OAuth2Credentials` không có trường này). F04 sẽ thêm cách đọc nó khi làm luồng refresh, theo đúng quy tắc trên: đọc cả hai, rồi ghi lại cả hai.

---

## 18. Use case đăng ký kết nối (BE-14)

### 18.1 Nó nằm ở đâu trong luồng kết nối
- **Ở đâu:** `account/application/AccountRegistrationService.java`, `account/application/RegisterAccountCommand.java`, event `account/AccountConnected.java`.
- **Là gì:** "điểm vào" duy nhất để đưa một tài khoản đã được provider xác nhận vào Sino. Luồng kết nối của F04 sẽ gọi nó:

```text
F04 (làm sau)                           BE-14 (đã làm)
-------------                           --------------
người dùng bấm "Kết nối Gmail"
  -> Google cho đăng nhập, trả "code"
  -> đổi code lấy token     (gọi Google, NGOÀI transaction)
  -> lấy profile tài khoản  (gọi Google, NGOÀI transaction)
  -> register(command)  ------------->  MỘT transaction:
                                          1. kiểm tra provider (registry)
                                          2. tìm account theo
                                             (owner, provider, externalAccountId)
                                          3. chưa có: tạo mới / có rồi: reconnect
                                          4. lưu credential (mã hóa)
                                          5. publish AccountConnected
                                        commit: cả ba thứ cùng được lưu
                                        rollback: không còn gì
```

- **Vì sao service không gọi provider:** gọi mạng có thể mất vài giây hoặc treo. Nếu gọi bên trong transaction thì suốt thời gian đó app giữ một kết nối DB và khóa các dòng đang ghi. Vì vậy gọi provider trước, xong mới mở một transaction ngắn chỉ để ghi.

### 18.2 `@Transactional`: tất cả hoặc không gì cả
- **Là gì:** Spring mở transaction khi vào method, commit khi method trả về bình thường, rollback khi method ném `RuntimeException`.
- **Không có nó thì sao:** `accounts.save(...)` tự có transaction riêng nên account được commit ngay; nếu bước lưu credential lỗi thì còn lại một account không có credential. Kiểm tra ngược đã chứng minh: bỏ `@Transactional` thì test "lưu credential lỗi" đỏ.
- **Bẫy thứ hai, cùng lần kiểm tra ngược đó:** test reconnect cũng đỏ. Lý do: object đọc ra **trong** transaction được Hibernate theo dõi ("managed"). Đổi field của nó thì Hibernate tự ghi xuống DB lúc commit ("dirty checking"), không cần gọi `save`. Ra **ngoài** transaction thì không ai theo dõi, nên `reconnect()` đổi tên và trạng thái trong bộ nhớ mà không được ghi.

### 18.3 Idempotent: gọi lại không tạo bản sao
- Service tìm theo bộ khóa trước. Có rồi thì `reconnect()`: cập nhật tên và ảnh từ provider, trạng thái về `CONNECTED` (kể cả từ `AUTH_EXPIRED`), thay **toàn bộ** credential (quy tắc ở mục 17.6), và event có `reconnected = true`.
- Hai request đến cùng lúc vẫn có thể cùng "không thấy" rồi cùng tạo. Khi đó `UNIQUE` của DB chặn request thứ hai (mục 15.6); request đó báo lỗi, và lần thử lại sẽ thành reconnect.

### 18.4 Kiểm tra provider trước khi ghi
- `providers.get(type)` ném `SinoException` mã `UNKNOWN_PROVIDER` khi không có connector cho loại đó. Dòng này đứng đầu method để lỗi xảy ra **trước** khi ghi bất cứ thứ gì. Giá trị trả về không dùng: ở đây chỉ cần biết provider có hay không.

### 18.5 Domain event và `ApplicationEventPublisher`
- **Là gì:** một thông báo rằng một việc **đã xảy ra** (tên ở thì quá khứ: `AccountConnected`). Module khác nghe để làm việc của mình; ví dụ F07 sẽ bắt đầu đồng bộ lần đầu. Module `account` không cần biết ai nghe, nên các module ít phụ thuộc nhau.
- **Cách gửi:** `events.publishEvent(new AccountConnected(...))`; `ApplicationEventPublisher` là bean có sẵn của Spring.
- **Ở đâu:** record public ở package gốc `dev.sino.account`, tức phần API của module, nên Spring Modulith cho module khác dùng.
- **Payload chỉ có ID, provider, cờ reconnect và thời điểm.** Không có token, email hay tên: Spring Modulith có thể lưu event vào bảng `event_publication` và log có thể in ra, nên mọi thứ trong event coi như có thể bị người khác đọc.
- **Publish ở bước cuối, bên trong transaction:** listener loại "chạy sau khi commit" (F07 sẽ dùng `@ApplicationModuleListener`) chỉ nhận event khi mọi thứ đã được lưu thật. Transaction rollback thì event bị bỏ.
- **Chưa làm:** khi reconnect đổi trạng thái thật (ví dụ `AUTH_EXPIRED` sang `CONNECTED`), design muốn có thêm event `AccountStatusChanged`. Việc này dời sang BE-16, nơi event đó được tạo. Lý do: event mang `from`/`to` kiểu `AccountStatus`, mà `AccountStatus` đang nằm trong package nội bộ `account.domain`; module khác đọc event sẽ vi phạm luật Modulith. Vì vậy chỗ đặt `AccountStatus` phải chốt cùng lúc tạo event.

### 18.6 Command object và che secret trong `toString()`
- **Là gì:** `RegisterAccountCommand` là một record gom mọi dữ liệu đầu vào. Method nhận một tham số thay vì bảy; sau này thêm trường thì không phải sửa chữ ký của method.
- **Dùng lại `AccountProfile` của F03:** đây đúng là thứ `getAccountProfile` của connector trả về, nên F04 truyền thẳng vào.
- **Bẫy:** `toString()` tự sinh của record in **mọi** field. Command có `refreshToken`, nên chỉ cần một dòng log in command là token bị lộ. Lúc chạy test RED, kết quả có đúng chuỗi `refreshToken=1//sample-refresh-token`; bây giờ chỗ đó in `****`. Access token thì đã được `OAuth2Credentials.toString()` che sẵn.
- **Một chỗ kiểm tra duy nhất:** quy tắc "refresh token chỉ đi với OAuth2" để `CredentialStore` kiểm, không chép thêm vào command. Hai chỗ cùng kiểm một luật thì sớm muộn sẽ lệch nhau.

---

## 19. API đọc account (BE-15)

### 19.1 Đường đi của một request
- **Ở đâu:** `account/api/AccountsController.java`, `account/api/AccountResponse.java`, `account/application/AccountQueryService.java`, `account/application/AccountErrorCode.java`.

```text
GET /api/accounts/{id}   (HTTP Basic)
  |
  v
Security filter chain             chưa đăng nhập -> 401 UNAUTHORIZED
  |
  v
AccountsController.get(id)        id không phải UUID -> 400 MALFORMED_REQUEST
  |   ownerId = currentUser.requireOwnerId()
  v
AccountQueryService.get(ownerId, id)        @Transactional(readOnly = true)
  |   repository.findByIdAndOwnerId(id, ownerId)
  |   không thấy -> SinoException(ACCOUNT_NOT_FOUND) -> 404
  v
AccountResponse.from(account, capabilities)  -> JSON
```

### 19.2 Lọc theo owner ngay trong chữ ký method
- Mọi method của `AccountQueryService` nhận `ownerId`; không có method "lấy account theo ID" mà không cần owner. Vì vậy không thể quên lọc: thiếu owner thì code không biên dịch.
- Controller lấy owner từ `CurrentUser` (module `identity`) rồi truyền xuống. Service không tự đọc Spring Security, nên dễ dùng lại và dễ test.
- Repository: `findByIdAndOwnerId(id, ownerId)` là `WHERE id = ? AND user_id = ?`, Spring Data tự sinh từ tên method.

### 19.3 404 chứ không phải 403 cho account của người khác
- Trả 403 ("bị cấm") tức là xác nhận "ID này có thật, chỉ là không phải của bạn"; người dò ID sẽ biết ID nào tồn tại. Trả 404 với **cùng** nội dung (detail cố định "Account not found.") thì không phân biệt được hai trường hợp.
- Test so nguyên body của hai response: một cho account của người khác, một cho ID không tồn tại. Chỉ được khác đường dẫn trong `instance`.

### 19.4 DTO map tường minh
- `AccountResponse` là record riêng cho JSON, chép từng trường từ entity. Không trả thẳng entity vì entity có `ownerId` và `version` không dành cho client, và một trường thêm vào entity sau này (có thể nhạy cảm) sẽ tự lọt ra JSON. Với DTO, muốn trả trường nào thì phải viết ra.
- Enum thành chuỗi (`status().name()`). `Instant` thành chuỗi ISO-8601 kết thúc bằng `Z`, theo quy ước JSON của F01; Jackson của Spring Boot 4 làm sẵn việc này, test ghim lại kết quả.
- Test kiểm **đúng tập tên trường** (11 tên), không chỉ kiểm "không có trường token". Thêm bất kỳ trường nào cũng phải sửa test, tức là phải có người cố ý làm.

### 19.5 `find` chứ không phải `get` khi lấy capabilities
- Connector có thể bị gỡ khỏi ứng dụng trong khi account vẫn còn trong DB. `ProviderRegistry.get` sẽ ném `UNKNOWN_PROVIDER`, và một account làm hỏng cả danh sách. `find` trả `Optional` rỗng: account vẫn hiện, chỉ có `capabilities: []`.

### 19.6 `@Transactional(readOnly = true)`
- Đặt ở class: mọi method chạy trong transaction chỉ đọc. Ý định của code rõ ràng, và Hibernate bỏ bước dò thay đổi lúc kết thúc vì không có gì để ghi.
- Ứng dụng tắt `open-in-view` (F01): phiên Hibernate kết thúc khi service trả về. Controller chỉ đọc field thường của entity nên không gặp lỗi lazy loading.

---

## 20. Kỹ thuật test mới trong F02

- **`@DataJpaTest` + `@AutoConfigureTestDatabase(replace = NONE)`:** slice chỉ nạp JPA và Flyway, chạy trên PostgreSQL thật (Testcontainers) để `CHECK`, `UNIQUE`, khóa ngoại hoạt động như production. Mỗi test tự rollback.
- **`entityManager.clear()`:** xóa bộ nhớ đệm của Hibernate để lần đọc sau thật sự đi xuống DB. Không có nó, test chỉ đọc lại object trong bộ nhớ.
- **`JdbcTemplate`:** chạy SQL thô để nhìn đúng cái nằm trong DB, hoặc để thử ràng buộc mà Java không tạo ra được (ví dụ ghi `status = 'SYNCING'`).
- **`ApplicationContextRunner` cho kiểm tra khởi động:** dựng một context nhỏ với cấu hình sai để chứng minh app **không** start và thông báo không lộ secret.
- **Mockito `mock(...)` trong unit test:** `OwnerCurrentUserTests` giả repository để test `CurrentUser` mà không cần DB.
- **Kiểm tra ngược ở mọi task:**
  - BE-09: bỏ bước tìm theo email → 2 test idempotent đỏ.
  - BE-10: cho `markHealthy` gỡ `AUTH_EXPIRED` → đúng ô đó đỏ.
  - BE-12: IV cố định → 1 test đỏ; bỏ AAD → 3 test đỏ; tag 96 bit → 2 test đỏ.
  - BE-13: store "quên" ghi refresh token → test xoay khóa đỏ.
  - BE-14: bỏ `@Transactional` → test rollback và test reconnect đỏ; không tìm account cũ → test reconnect đỏ (lỗi `UNIQUE`); bỏ kiểm tra provider → test provider lạ đỏ; `reconnected` luôn `false` → test reconnect đỏ; publish trước khi lưu credential → test rollback đỏ; thêm một trường vào event → test payload đỏ.
  - BE-15: danh sách không lọc owner → 2 test đỏ; `get` không lọc owner → test cô lập đỏ; mới nhất trước → test thứ tự đỏ; `ProviderRegistry.get` thay `find` → test connector đã gỡ đỏ; `ownerId` lọt vào response → test tập trường đỏ; detail nói "của người khác" → test cô lập đỏ.
- **Chạy cả ứng dụng thay cho web slice (BE-15):** `@SpringBootTest` + `@AutoConfigureMockMvc` gửi request HTTP giả qua đúng các lớp thật: security, `CurrentUser`, service, PostgreSQL, error handler, Jackson. Chọn thay cho `@WebMvcTest` với service giả vì test cô lập dữ liệu phải chạy trên dữ liệu thật; với service giả, test chỉ kiểm tra cái mock.
- **Ghim thời điểm bằng SQL:** `@PrePersist` điền `created_at` bằng giờ thật nên không biết trước. Test ghi đè bằng `UPDATE connected_account SET created_at = ?` để biết chắc thứ tự và chuỗi JSON mong đợi (`2026-10-05T03:15:00Z`). Account "mới hơn" được tạo **trước**, để test thứ tự không thể xanh chỉ nhờ thứ tự chèn.
- **`JsonPath.read(body, "$")`:** đọc JSON thành `Map` để so tập tên trường.
- **`@ApplicationModuleTest(mode = DIRECT_DEPENDENCIES)` (Spring Modulith, BE-14):** chỉ khởi động module `account` cộng các module nó dùng trực tiếp, không phải cả ứng dụng. Lúc làm BE-14 đó chỉ là `provider`; từ BE-15, `account` dùng thêm `CurrentUser` (module `identity`) và mã lỗi của `common`, nên hai module này cũng được nạp. Test vẫn tự dọn bảng và tự chèn owner của nó vào `app_user` bằng `JdbcTemplate`, nên không phụ thuộc owner được tạo lúc khởi động.
- **Test không có `@Transactional`:** để service tự commit hoặc rollback như khi chạy thật. Cái giá là dữ liệu ở lại sau mỗi test, nên `@BeforeEach` tự dọn bảng bằng `JdbcTestUtils.deleteFromTables`.
- **`AssertablePublishedEvents` làm tham số của method test:** Spring Modulith ghi lại mọi event được publish trong test đó; `events.ofType(AccountConnected.class)` lấy ra để kiểm tra số lượng và nội dung.
- **`@MockitoSpyBean`:** bọc bean thật. Bình thường nó chạy code thật; riêng một test bảo nó ném lỗi bằng `doThrow(...).when(credentials).save(any(), any(), any())`, để giả lập "lưu credential thất bại" mà không sửa code production. Assertion vẫn kiểm tra DB thật, không kiểm tra mock.
- **Bean riêng cho test:** một class `@TestConfiguration` lồng trong class test tạo `FakeMessageProvider` loại `fake` làm bean, để `ProviderRegistry` thấy provider này.
- **`row_to_json(c)::text` của PostgreSQL:** biến cả một dòng thành chuỗi JSON để kiểm tra bằng một lệnh rằng **không cột nào** chứa token dạng chữ.
- **`entityManager.flush()` để lộ lỗi:** trong `@DataJpaTest`, lệnh ghi chỉ thật sự xuống DB khi flush. Muốn thấy lỗi khóa ngoại thì phải flush ngay trong đoạn code đang chờ lỗi; test còn kiểm tra cả stack trace của lỗi đó không chứa token.

---

## 21. Tự kiểm tra F02 (phần đã làm)

1. Vì sao người dùng Sino và tài khoản Gmail nằm ở hai module khác nhau?
2. `ApplicationRunner` chạy trước hay sau Flyway? Vì sao điều đó quan trọng với việc tạo owner?
3. Đổi `SINO_OWNER_EMAIL` thì chuyện gì xảy ra với các account đã kết nối?
4. Vì sao `ConnectedAccount` không có `setStatus`?
5. Vì sao `AUTH_EXPIRED` không tự về `CONNECTED` khi một lần sync thành công?
6. `@Version` chặn được tình huống gì?
7. Vì sao vẫn cần `UNIQUE` ở DB dù code đã tìm trước rồi mới tạo?
8. IV và AAD trong AES-GCM mỗi cái chống lại điều gì?
9. Đổi khóa mã hóa khi đã có dữ liệu thì làm theo những bước nào?
10. Vì sao không kiểm tra khóa bằng `@Size` của Bean Validation?
11. Vì sao `CredentialStore` không có hàm `updateAccessToken`?
12. Xóa một `connected_account` thì credential của nó đi đâu, và nhờ đâu?
13. Vì sao service đăng ký không gọi Google bên trong transaction?
14. Bỏ `@Transactional` khỏi `register` thì hai lỗi nào xuất hiện, và vì sao lỗi thứ hai liên quan đến "dirty checking"?
15. Vì sao event `AccountConnected` không chứa email hay tên account?
16. Vì sao `RegisterAccountCommand` phải tự viết `toString()`?
17. Vì sao `AccountQueryService` không có method `get(accountId)` chỉ nhận ID?
18. Vì sao account của người khác trả 404 mà không phải 403?
19. Vì sao không trả thẳng entity `ConnectedAccount` ra JSON?
20. Connector Gmail bị gỡ khỏi ứng dụng thì `GET /api/accounts` trả gì cho account Gmail cũ?

*(Phần BE-16…BE-18 — sửa account, xóa account, nghiệm thu — sẽ được bổ sung khi làm.)*
