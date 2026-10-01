# F03 — Provider Contract · Technical Design

> Mode: **TRAINING**. Trạng thái: DRAFT chờ Human review. Tương ứng 04D §6 (Provider Contract), §7 (API — providers), §14 (DoD F03).
> Convention chung (module, error model, transaction, test) nằm ở `openspec/specs/` và design F01 đã archive (`openspec/changes/archive/2026-10-01-be-f01-project-foundation/design.md`).

## Context

- Nguồn: 02A §5 (SPI + danh sách capability), 02 (Provider Contract, Capability Model), 02B (enum conversation/message), 01 FR-06/FR-08, 04A §7–8.
- Conflict đã xử lý: **C2** (capability dạng enum theo 02A thay vì boolean fields của 02), **C3** (SPI có `getAccountProfile` theo 02A).
- Hiện trạng: chưa có module `provider`. F03 không cần database.
- Người dùng contract: `account` (F02 — định danh provider, capability hiển thị), `sync` (F07 — `fetchUpdates`), `messaging` (F10 — `sendMessage`), connector Gmail (F04) và provider thứ hai (F09).

## Goals / Non-Goals

**Goals:**
- Một SPI đủ để F04 viết connector Gmail mà không phải sửa core.
- Capability là dữ liệu khai báo, kiểm tra được trước khi gọi.
- Kiểu chuẩn hóa tự bảo vệ tính hợp lệ; một item hỏng không làm hỏng cả batch.
- Contract test dùng lại được cho mọi connector.

**Non-Goals:** xem `proposal.md` (không connector thật, không SPI auth/OAuth, không refresh token, không method cho mark-read/reaction/webhook/attachment download, không lưu dữ liệu, không capability theo account).

## Decisions

### D-01 — Thứ tự F02 / F03 · *Decision Needed (trước khi bắt đầu F02)*

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. F01 → F03 → F02** (đề xuất) | Theo đúng hướng phụ thuộc `account → provider` của 02A; F03 thuần Java, không DB → nhanh, luyện record/sealed type/contract test; F02 dùng ngay `ProviderType` + registry thật (kiểm tra provider khi đăng ký account, trả capability trong response) | Lệch thứ tự roadmap 03 (nguồn ưu tiên thấp nhất trong các tài liệu) |
| B. F01 → F02 → F03 (theo roadmap 03) | Giữ đúng roadmap | F02 phải biểu diễn provider tạm thời (chuỗi) hoặc kéo BE-19 sang làm trước; sau F03 cần thêm một task quay lại F02 để nối validation và capability |

Mã `BE-xx` chỉ là định danh; thứ tự thực hiện theo D-01.
*Câu hỏi cho bạn:* nếu chọn B, đoạn code nào của F02 bạn sẽ phải viết hai lần?

### Bố cục package

```
dev.sino.provider                    # public API cho module khác
├── ProviderType                     # định danh provider (D-16)
├── ProviderCapability               # enum 7 capability
├── ProviderCapabilities             # tập capability bất biến + supports()/require()
├── ProviderDescriptor               # type + displayName + capabilities
├── ProviderRegistry                 # interface: get / find / isSupported / descriptors
├── spi/                             # @NamedInterface("spi") — contract cho connector và cho sync/messaging
│   ├── MessageProvider              # SPI
│   ├── ProviderContext, ProviderCredentials (sealed)
│   ├── AccountProfile, SyncCursor, SyncBatch, SkippedItem
│   ├── NormalizedConversation, NormalizedParticipant, NormalizedMessage, NormalizedAttachment
│   ├── ConversationType, MessageType, MessageDirection, MessageStatus
│   ├── SendMessageCommand, SendMessageResult
│   └── ProviderException, ProviderErrorCode
├── application/                     # nội bộ: DefaultProviderRegistry
├── api/                             # nội bộ: ProvidersController (nếu D-18 = có)
└── infrastructure/                  # connector thật ở đây từ F04 (gmail/...), theo 02A
```

`provider` chỉ phụ thuộc `common` (error model). Không phụ thuộc `account`.

### D-16 — `ProviderType` là value object hay enum · *Decision Needed (trước BE-19)*

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Value object** (record bọc chuỗi, chuẩn hóa chữ thường, kiểm tra theo pattern `^[a-z][a-z0-9-]{1,31}$`) (đề xuất) | Tập mở: thêm provider = thêm connector, không sửa core (đúng Success Criteria của 00); test đăng ký được fake provider `fake` mà không đụng main code; DB lưu `varchar` tự nhiên | Không có kiểm tra đầy đủ tại compile time; phải dựa vào registry để biết type có được hỗ trợ không |
| B. Enum (`GMAIL`, ...) | Autocomplete, `switch` kiểm tra đủ nhánh | Mỗi provider mới phải sửa enum trong core; khai báo hằng cho provider chưa có connector là "fake"; test registry khó (không thêm hằng enum từ test được) |

Giữ tên `ProviderType` như 02A cho cả hai phương án.
*Câu hỏi cho bạn:* với phương án B, bạn test `ProviderRegistry` bằng fake provider thế nào?

### D-17 — Phạm vi SPI ở F03 · *Proposed default*

Chữ ký tham chiếu (theo 02A; đây là contract, không phải implementation):

```java
public interface MessageProvider {
    ProviderType type();
    ProviderCapabilities capabilities();
    AccountProfile getAccountProfile(ProviderContext context);
    SyncBatch fetchUpdates(ProviderContext context, SyncCursor cursor);
    SendMessageResult sendMessage(ProviderContext context, SendMessageCommand command);
}
```

- Chỉ 5 method của 02A. `sendMessage` có default implementation ném `ProviderException(CAPABILITY_NOT_SUPPORTED)` để connector chỉ-đọc không phải viết method rỗng. Bên gọi vẫn MUST kiểm tra capability trước (FR-06).
- Để sau, thiết kế cùng feature dùng tới: SPI kết nối/OAuth + refresh token (F04, D-15), mark-read/reaction (F06/F10), webhook (F07), tải attachment (F06), idempotency key khi gửi (F10), tùy chọn cửa sổ initial sync (F07).
- Phương án khác: thiết kế trước toàn bộ method → đoán trước nhu cầu của provider chưa làm, rủi ro sai cao hơn lợi ích.

*Câu hỏi cho bạn:* method nào ở trên bạn nghĩ sẽ đổi chữ ký nhiều nhất khi làm Gmail, và vì sao?

### Capability — ý nghĩa và ai dùng (D-19)

| Capability | Nghĩa | Feature dùng |
|---|---|---|
| `READ_MESSAGES` | Lấy conversation/message qua `fetchUpdates` | F07 Sync |
| `SEND_MESSAGES` | Gửi/trả lời qua `sendMessage` | F10 Send, composer FE |
| `ATTACHMENTS` | Message chuẩn hóa có metadata attachment (gửi attachment: sau) | F06, F10 |
| `MARK_READ` | Đồng bộ trạng thái đã đọc về provider (method thêm sau) | F06/F10 |
| `REACTIONS` | Reaction trên message | chưa có feature |
| `PUSH_WEBHOOK` | Provider chủ động đẩy thay đổi, không chỉ polling | F07 |
| `THREADS` | Provider có khái niệm thread/chuỗi trả lời | F05/F06 |

**D-19 — Capability tĩnh theo provider** · *Proposed default*: F03 chỉ có capability ở mức provider. Capability hiệu lực theo **account** (ví dụ Gmail chỉ cấp scope đọc) = capability của provider ∩ capability suy ra từ scope đã cấp — làm ở F04/F10 khi có scope thật (F02 đã lưu `scopes` trong credential).

### Kiểu dữ liệu trong `spi`

| Kiểu | Dạng | Trường chính | Bất biến |
|---|---|---|---|
| `ProviderContext` | record | `accountId` (UUID của Sino), `externalAccountId` (null trước khi biết profile), `credentials` | credentials khác null; `toString()` che secret |
| `ProviderCredentials` | sealed interface | `OAuth2Credentials(accessToken, expiresAt?, scopes)`, `TokenCredentials(token)` | secret không rỗng; `toString()` che; không bao giờ vào DTO/event |
| `AccountProfile` | record | `externalAccountId`, `displayName`, `avatarUrl?` | `externalAccountId` không rỗng |
| `SyncCursor` | record | `value` (opaque) + `initial()` / `isInitial()` | connector tự hiểu `value` |
| `SyncBatch` | record | `conversations`, `messages`, `skipped`, `nextCursor`, `hasMore` | list khác null và bất biến; `nextCursor` khác null |
| `SkippedItem` | record | `kind` (CONVERSATION/MESSAGE/ATTACHMENT), `externalId?`, `reason` (`ProviderErrorCode`), `detail` | `detail` không chứa payload thô hay dữ liệu cá nhân |
| `NormalizedConversation` | record | `externalConversationId`, `type`, `title?`, `avatarUrl?`, `participants`, `lastActivityAt?` | ID không rỗng; `type` mặc định `UNKNOWN` |
| `NormalizedParticipant` | record | `externalParticipantId`, `displayName?`, `avatarUrl?`, `self` | ID không rỗng |
| `NormalizedMessage` | record | `externalMessageId`, `externalConversationId`, `senderExternalParticipantId?`, `direction`, `type`, `textContent?`, `status`, `read`, `replyToExternalMessageId?`, `sentAt`, `attachments`, `metadata` | hai ID không rỗng; `direction`, `sentAt` khác null; `type`/`status` dùng `UNKNOWN` khi không map được |
| `NormalizedAttachment` | record | `externalAttachmentId`, `fileName?`, `mimeType?`, `sizeBytes?`, `remoteUrl?`, `thumbnailUrl?` | ID không rỗng |
| `SendMessageCommand` | record | `externalConversationId`, `textContent`, `replyToExternalMessageId?` | text không rỗng |
| `SendMessageResult` | record | `externalMessageId`, `status`, `sentAt?` | ID không rỗng |

Enum (02B): `ConversationType` = DIRECT, GROUP, THREAD, CHANNEL, UNKNOWN · `MessageType` = TEXT, IMAGE, FILE, AUDIO, VIDEO, SYSTEM, MIXED, UNKNOWN · `MessageDirection` = INBOUND, OUTBOUND · `MessageStatus` = PENDING, SENT, DELIVERED, READ, FAILED, UNKNOWN.

`metadata` (`Map<String, String>`) chỉ dành cho vài giá trị nhỏ khó chuẩn hóa (tương ứng cột `jsonb metadata` của 02B); không chứa payload thô, không chứa secret, key được liệt kê trong tài liệu của connector.

**D-20 — Enum chuẩn hóa nằm ở đâu** · *Proposed default*: trong `provider.spi` — đây là "từ vựng chung" giữa connector và core. Khi module `conversation`/`messaging` ra đời (F05/F06), domain của chúng dùng lại các enum này; nếu domain cần hành vi riêng thì map sang kiểu của mình. Phương án khác: một module shared-kernel riêng — thêm module khi chưa có nhu cầu thật.

### Phân loại lỗi provider

| `ProviderErrorCode` | Retryable | Khi nào | Phản ứng dự kiến (feature sau) |
|---|---|---|---|
| `AUTH_EXPIRED` | không | Token hết hạn/bị thu hồi, refresh thất bại | Account → `AUTH_EXPIRED`, UI "Needs login again" (F07) |
| `RATE_LIMITED` | có (+ `retryAfter` nếu biết) | 429 / hết quota | Backoff theo `retryAfter`; kéo dài → account `DEGRADED` |
| `PROVIDER_UNAVAILABLE` | có | 5xx, timeout, lỗi mạng | Retry có backoff |
| `REQUEST_REJECTED` | không | 4xx khác (không tìm thấy, request sai) | Ghi lỗi, không retry |
| `PAYLOAD_NORMALIZATION_FAILED` | không | Không chuẩn hóa được một item | Bỏ qua item, ghi vào `skipped` |
| `CAPABILITY_NOT_SUPPORTED` | không | Gọi thao tác không khai báo | Lỗi lập trình/UI — không được xảy ra nếu bên gọi kiểm tra capability |

`SYNC_FAILED`, `SEND_FAILED` của FR-08 là mã **ở mức thao tác**, do `sync` (F07) và `messaging` (F10) định nghĩa, mang `ProviderErrorCode` làm nguyên nhân. Cách map `ProviderException` ra HTTP được chốt khi có endpoint gọi provider (F10).

### Registry

- Interface `ProviderRegistry` ở base package; `DefaultProviderRegistry` (nội bộ, `application`) nhận `List<MessageProvider>` từ Spring khi khởi tạo.
- Dựng map bất biến theo `ProviderType`; trùng type → ném lỗi ngay khi khởi tạo (ứng dụng không start), thông báo có tên hai class.
- `get(type)` ném `SinoException` mã `UNKNOWN_PROVIDER` (category `NOT_FOUND` → 404 theo F01); `find(type)` trả `Optional`; `isSupported(type)`; `descriptors()` sắp theo `type`.
- Không cache ngoài map khởi tạo, không trạng thái thay đổi → thread-safe.

### Contract test kit

- Test sources: một abstract test class (ví dụ `MessageProviderContractTest`) mà mỗi connector kế thừa và chỉ cung cấp: instance connector, một `ProviderContext` mẫu, dữ liệu kỳ vọng.
- Kiểm tra chung: `type()` hợp lệ; `capabilities()` khác null; không có `SEND_MESSAGES` → gửi tin ném `CAPABILITY_NOT_SUPPORTED`; `fetchUpdates(initial)` trả batch có `nextCursor`, external ID của message không rỗng và không trùng trong batch; gọi lại cùng cursor cho cùng external ID; `toString()` của context không lộ token.
- `FakeMessageProvider` (test sources) cấu hình được type, capability và các batch dựng sẵn → dùng cho registry test, contract test, và test của F02.
- F04: connector Gmail kế thừa contract test, HTTP của Gmail được giả lập ở tầng client (công cụ chốt ở F04).

### D-18 — `GET /api/providers` ở F03 · *Decision Needed (trước BE-25)*

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Có, ở F03** (đề xuất) | Roadmap 03 ghi F03-FE là "Capability-aware UI primitives" → FE cần contract này; chi phí nhỏ vì descriptor đã có | Trước F04 endpoint luôn trả `[]` ở ứng dụng thật |
| B. Để F04 | Chỉ làm khi có provider thật | FE F03 phải tự giả lập contract mà không có nguồn chuẩn |

Response mẫu (minh họa — Gmail có ở F04):

```json
[
  { "type": "gmail", "displayName": "Gmail",
    "capabilities": ["READ_MESSAGES", "SEND_MESSAGES", "ATTACHMENTS", "MARK_READ", "THREADS"] }
]
```

*Câu hỏi cho bạn:* frontend cần capability ở mức provider hay mức account? Câu trả lời ảnh hưởng endpoint này và response account của F02 thế nào?

### Transaction & event

- F03 không mở transaction và không publish event.
- Quy tắc cho mọi nơi gọi SPI (F04+): **không gọi connector bên trong transaction DB** (F01 §10).

### Error code catalog — bổ sung của F03

| code | HTTP | Nguồn |
|---|---|---|
| `UNKNOWN_PROVIDER` | 404 | `ProviderRegistry.get` với type không có connector |

## Risks / Trade-offs

- [Contract được thiết kế trước khi có provider thật → sai khi làm Gmail] → Giữ tối thiểu; coi là v0; F04 sửa bằng delta spec `MODIFIED`; contract test kit giúp đổi an toàn.
- [Kiểu chuẩn hóa thiên về email] → Khi review, đối chiếu thêm với mô hình chat (Telegram: chat, message, sender); dùng `UNKNOWN` để degrade.
- [`metadata` biến thành chỗ đổ dữ liệu] → Quy tắc: nhỏ, không payload thô, không secret, key được liệt kê.
- [Credential lộ qua `toString()` mặc định của record hoặc do Jackson serialize record] → Override `toString()`, test che giá trị; không bao giờ đặt credential trong DTO hay event.
- [Bỏ qua item lỗi che giấu bug mapping có hệ thống] → `skipped` được đếm và log ở F07 (`sync_run.error_count`); contract test của connector kiểm tra dữ liệu mẫu không bị skip.

## Migration Plan

Không có migration. Không có dữ liệu.

## Open Questions

- D-01, D-16, D-18: Decision Needed (bảng tổng ở F01 design).
- Để lại cho F04 (ghi nhận, không chặn F03): SPI kết nối/OAuth; ai refresh token (D-15); công cụ giả lập HTTP cho contract test của Gmail; có cần `SyncOptions` (ví dụ giới hạn cửa sổ initial sync) không.

## Definition of Done — F03

- [ ] Module `provider` qua `ModularityTests`; `spi` là named interface; không phụ thuộc `account`.
- [ ] Unit test cho `ProviderType`, `ProviderCapabilities`, validation của mọi kiểu chuẩn hóa (bao gồm trường hợp `UNKNOWN`), `SyncBatch` với `skipped`, che secret trong `toString()`.
- [ ] Registry test: nhiều connector, không connector, trùng type (start fail), `UNKNOWN_PROVIDER`.
- [ ] `FakeMessageProvider` vượt contract test kit.
- [ ] (Nếu D-18 = có) web test cho `GET /api/providers`: 200 có dữ liệu, 200 rỗng, 401.
- [ ] `./mvnw verify` xanh; error catalog có `UNKNOWN_PROVIDER`.
- [ ] Learning gate: Human giải thích được vì sao capability là dữ liệu khai báo, vì sao connector không được gọi trong transaction, và một item lỗi đi qua batch như thế nào.
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có ghi lý do; `PROJECT_STATE.md` cập nhật.
