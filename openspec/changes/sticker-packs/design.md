## Mode

**AUTO** cho change này (người dùng, 2026-10-20: "AUTO: Claude tự làm"; `project-mode.yaml` `task_overrides.sticker-packs`). Claude làm từng task nhỏ theo đủ quy trình (test viết trước, kiểm chứng, tài liệu, commit) và báo lại. Các mục **Decision Needed** (DN-1…DN-7) do người dùng chốt trước SP-01; D-340…D-348 do agent chốt, cần xem lại.

## Context

- **Hôm nay** (`custom-stickers`, ST-01…ST-20): bảng `sticker` + `sticker_content` (V21), API `/api/stickers` (tải lên, danh sách, một sticker, nội dung, xóa), màn `/stickers` là một lưới phẳng; chọn hay thả tệp là gửi ngay từng tệp (`useUploadQueue`), web chặn sẵn loại sai và tệp trên 1 MB. Máy chủ đọc loại và cỡ từ phần đầu tệp, không giải mã (D-332), nên mọi việc chỉnh ảnh phải làm ở trình duyệt.
- **Người dùng muốn** (2026-10-20): sticker theo **bộ** (như Zalo), và khi tải nhiều ảnh thì **xem trước, chỉnh từng ảnh** rồi mới lưu. Khung sticker trong chat Zalo là change `zalo-send-images`, đọc bộ của change này.
- **Canvas "Sino UI" không có màn Sticker** (như ST-00 của `custom-stickers`, người dùng đã cho dựng thẳng React). Màn mới dựng theo hộp thoại và lưới sẵn có (DN-7).
- **Thư viện cắt ảnh:** `react-easy-crop` 6.2.4, MIT, có kéo, phóng to, xoay, cảm ứng và `keyboardStep` (dời ảnh bằng phím mũi tên), trả vùng cắt bằng điểm ảnh của ảnh gốc (`croppedAreaPixels`).

## Goals / Non-Goals

**Goals:** bộ sticker có tên, tạo, đổi tên, xóa, chuyển sticker; lượt tải nhiều ảnh có xem trước và chỉnh riêng từng ảnh; không ảnh nào bị gửi khi người dùng chưa bấm lưu; không đổi gì ở cách máy chủ nhận và phục vụ ảnh (D-332…D-335 giữ nguyên).

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-340 — Bảng `sticker_pack`, cột `sticker.pack_id` · agent chốt
```text
sticker_pack
  id          uuid PK (UUIDv7)
  user_id     uuid NOT NULL FK app_user
  name        varchar(50) NOT NULL       CHECK btrim(name) <> ''
  created_at  timestamptz NOT NULL
  UNIQUE (id, user_id)                   -- đích của khóa ngoại kép bên dưới
  UNIQUE INDEX (user_id, lower(name))    -- tên không trùng, không phân biệt hoa thường (DN-6)

sticker
  + pack_id   uuid NULL
  FOREIGN KEY (pack_id, user_id) REFERENCES sticker_pack (id, user_id) ON DELETE SET NULL (pack_id)
  INDEX (user_id, pack_id)
```
**Vì sao khóa ngoại kép `(pack_id, user_id)`:** database tự chặn một sticker nằm trong bộ của người khác, không chỉ dựa vào kiểm tra của dịch vụ. `ON DELETE SET NULL (pack_id)` (PostgreSQL 15 trở lên có danh sách cột) chỉ xóa `pack_id` khi bộ bị xóa, giữ `user_id` (DN-1 = A). **Phương án bỏ:** bảng nối nhiều-nhiều (một sticker trong nhiều bộ: không ai cần, làm khó "chuyển bộ"); cột `pack_id` khóa ngoại đơn (không chặn được bộ của người khác ở database).

### D-341 — Đếm và bìa tính khi đọc, không lưu sẵn · agent chốt
`stickerCount` và `coverStickerId` của `GET /api/sticker-packs` tính bằng một câu truy vấn trên `sticker` (nhóm theo `pack_id`), không có cột đếm. Tối đa 300 sticker và 50 bộ mỗi người: rẻ, và không bao giờ lệch.

### D-342 — Thứ tự · agent chốt
Bộ: tạo trước đứng trước (`created_at`, `id`), như các tab sticker của Zalo. Sticker trong bộ: mới nhất trước, như danh sách hiện có. Sắp xếp tay là Non-goal.

### D-343 — Tên trùng: database quyết, dịch vụ đổi lỗi · agent chốt
Như D-338/D-339 của `custom-stickers`: dịch vụ kiểm tên trùng trước để có lỗi rõ, nhưng chỉ mục duy nhất `(user_id, lower(name))` mới là nơi chặn thật; lỗi toàn vẹn lúc ghi được hỏi lại xem có phải trùng tên không, phải thì `409 STICKER_PACK_NAME_TAKEN`. Số bộ tối đa (`sino.stickers.max-packs-per-owner`, mặc định 50) chỉ đếm, không khóa (như hạn mức sticker).

### D-344 — API · agent chốt
| Yêu cầu | Kết quả |
|---|---|
| `GET /api/sticker-packs` | `200 { items: [{ id, name, stickerCount, coverStickerId, createdAt }] }` |
| `POST /api/sticker-packs` `{ name }` | `201` + `Location`, bộ vừa tạo |
| `PATCH /api/sticker-packs/{id}` `{ name }` | `200`, bộ đã đổi |
| `DELETE /api/sticker-packs/{id}` | `204`; sticker của bộ về `packId: null` |
| `POST /api/stickers` + phần `packId` | như cũ, sticker vào bộ đó |
| `PATCH /api/stickers/{id}` `{ name?, packId? }` | `200`, sticker đã đổi; `packId: null` là bỏ khỏi bộ |

Lỗi mới: `404 STICKER_PACK_NOT_FOUND`, `409 STICKER_PACK_NAME_TAKEN`, `409 STICKER_PACK_LIMIT_REACHED` (thành viên `maxPacks`); tên trống hay quá dài, `PATCH` rỗng: `400 VALIDATION_FAILED`. `PATCH /api/stickers/{id}` phân biệt "không gửi `packId`" với "`packId: null`" bằng cách đọc JSON thành cây (`JsonNode`) thay cho record có trường `null`.

### D-345 — Xuất ảnh đã chỉnh bằng canvas của trình duyệt · agent chốt (theo DN-2 = A)
Vẽ ảnh gốc đã xoay lên canvas, lấy đúng `croppedAreaPixels` của `react-easy-crop`, thu về cạnh dài nhất 512 điểm ảnh khi vùng lớn hơn (không phóng to vùng nhỏ), `canvas.toBlob('image/png')`. Ảnh xuất ra mà vẫn trên 1 MB (ảnh chụp nhiều chi tiết) thì thu tiếp từng bậc 0,8 lần tới khi dưới 1 MB. Tên tệp gửi lên là tên người dùng đặt + `.png`. Hàm xuất là logic thuần (`editor/exportSticker.ts`), test bằng một canvas giả (vitest không có canvas thật) và lượt Chrome thật.

### D-346 — Ảnh nào được cắt · agent chốt (theo DN-3 = A)
PNG, JPEG và WebP tĩnh có khung cắt; **GIF luôn lưu nguyên** (kể cả GIF một khung, hiếm); WebP động nhận ra bằng cờ hoạt ảnh trong chunk `VP8X` (đọc 21 byte đầu của tệp, như `WebpHead` của máy chủ), và lưu nguyên. Đọc số khung của GIF ở trình duyệt chỉ để quyết có cắt hay không là không đáng.

### D-347 — Lượt tải dùng lại hàng đợi sẵn có · agent chốt
Bước "Thêm sticker" giữ trạng thái của lượt (danh sách ảnh, phần chỉnh của từng ảnh, tên, bộ). Bấm "Lưu" thì (nếu là "Bộ mới…") tạo bộ trước, rồi xuất từng ảnh và đưa vào `useUploadQueue` sẵn có (gửi từng tệp một, câu lỗi tiếng Việt của `format.ts`), thêm `packId`. Kết quả của hàng đợi quay về danh sách của lượt: ảnh đã lưu rời lượt, ảnh lỗi ở lại.

### D-348 — Bộ mặc định của một lượt · agent chốt
Mỗi phần bộ trên màn có nút "Thêm vào bộ này", mở lượt với bộ đó; nút "Tải lên" ở đầu màn mở lượt với bộ dùng ở lượt trước trong phiên này, hoặc "Chưa xếp bộ".

## Decision Needed (người dùng chốt trước SP-01)

### DN-1 — Xóa một bộ thì sticker của bộ ra sao
- **A (đề xuất): về "Chưa xếp bộ".** Không mất ảnh nào vì một cú bấm; muốn xóa hết thì xóa từng sticker.
- **B:** xóa luôn mọi sticker của bộ. Nhanh khi dọn dẹp, nhưng một lần bấm nhầm là mất cả bộ.
- **C:** hỏi mỗi lần (giữ hay xóa luôn). Đầy đủ nhất, hộp thoại phức tạp hơn.

*Câu hỏi:* A, B hay C?

### DN-2 — Ảnh đã chỉnh được lưu ra sao
- **A (đề xuất): PNG, cạnh dài nhất tối đa 512 điểm ảnh.** Giữ nền trong suốt, mọi trình duyệt xuất được, 512 đủ nét cho sticker (Zalo hiện sticker khoảng 130 điểm ảnh).
- **B:** WebP: tệp nhỏ hơn, nhưng Safari không xuất được WebP từ canvas (phải lùi về PNG).
- **C:** giữ độ phân giải gốc tới 1024: nét hơn khi phóng to, tệp lớn hơn, dễ chạm giới hạn 1 MB.

*Câu hỏi:* A, B hay C, hay một cỡ khác 512?

### DN-3 — Ảnh động
- **A (đề xuất): lưu nguyên, không cắt.** Không thêm thư viện.
- **B:** cắt được cả GIF: cần thư viện giải mã và mã hóa GIF trên trình duyệt (nặng, chậm với GIF dài), WebP động thì gần như không có thư viện tốt.

*Câu hỏi:* A hay B?

### DN-4 — Ảnh JPEG
- **A (đề xuất): nhận ở bước chỉnh và đổi sang PNG trên trình duyệt.** Ảnh chụp điện thoại thường là JPEG; API vẫn chỉ nhận PNG, GIF, WebP (D-329 giữ nguyên ở máy chủ).
- **B:** vẫn từ chối JPEG như hôm nay.

*Câu hỏi:* A hay B?

### DN-5 — Khung cắt
- **A (đề xuất): `react-easy-crop`** (MIT, có cảm ứng, xoay, phóng to, phím mũi tên). Thêm một phụ thuộc cho web.
- **B:** tự viết khung cắt bằng Pointer Events: không thêm phụ thuộc, nhiều code và nhiều ca biên hơn (cảm ứng hai ngón, xoay).

*Câu hỏi:* A hay B?

### DN-6 — Giới hạn và tên bộ
- **A (đề xuất): tối đa 50 bộ mỗi người, tên không trùng (không phân biệt hoa thường).**
- **B:** không giới hạn số bộ, cho trùng tên.

*Câu hỏi:* A, B, hay con số khác?

### DN-7 — Thiết kế màn
- **A (đề xuất): dựng thẳng bằng thành phần sẵn có** (hộp thoại, lưới, nút của màn Sticker), như người dùng đã chọn cho ST-00; đối chiếu khi canvas có khung.
- **B:** vẽ khung trong canvas "Sino UI" trước (agent không xuất bản được lên canvas đó; người dùng vẽ hoặc duyệt).

*Câu hỏi:* A hay B?

## Risks / Trade-offs

- [Ảnh xuất bằng canvas mất metadata xoay của JPEG (EXIF)] → trình duyệt hiện đại tự xoay ảnh theo EXIF khi vẽ (`image-orientation: from-image` là mặc định); kiểm bằng một ảnh chụp dọc thật ở lượt Chrome.
- [Ảnh rất lớn (ảnh chụp 48 MP) làm canvas chậm hoặc hết bộ nhớ trên điện thoại] → ảnh nguồn vào bước chỉnh tối đa 20 MB và 8192 điểm ảnh mỗi cạnh; vượt thì báo tại chỗ.
- [Khóa ngoại kép cần `UNIQUE (id, user_id)` trên `sticker_pack`] → thêm ràng buộc đó; chi phí một chỉ mục nhỏ.
- [Delta sửa spec của `custom-stickers` chưa archive] → archive sau `custom-stickers`.
- [Hai tab cùng đổi tên một bộ] → bản lưu sau thắng (tên bộ không phải nội dung dài, không cần kiểm phiên bản như ghi chú).

## Migration Plan

- `V22__sticker_create_sticker_pack.sql` (số kế tiếp trên `dev` lúc viết, kiểm lại trước khi làm): bảng mới, cột mới cho phép `NULL`, nên sticker có sẵn tự là "Chưa xếp bộ"; không cần backfill.
- Rollback: một migration bỏ cột và bảng; web cũ vẫn chạy vì chỉ bỏ qua trường `packId`.

## Testing

| Tầng | Nội dung |
|---|---|
| Domain, dịch vụ (Testcontainers PostgreSQL 18) | tên, trùng tên (cả hai lần ghi cùng lúc), số bộ tối đa, xóa bộ giữ sticker, khóa ngoại kép chặn bộ của người khác ngay ở database, chuyển bộ, đếm và bìa |
| API (`MockMvc`) | từng điểm cuối, từng mã lỗi, `PATCH` phân biệt không gửi và `null`, `packId` trong multipart, CSRF, `401` |
| Web (Vitest + MSW) | lưới theo bộ; quản lý bộ; bước "Thêm sticker": chọn nhiều, bỏ, chuyển ảnh giữ phần chỉnh, ảnh động không có khung, JPEG thành PNG, lưu lần lượt, ảnh lỗi ở lại, hỏi khi đóng; `exportSticker` (cỡ, không phóng to, thu dưới 1 MB) |
| Chrome thật | backend thật, 1440 / 1024 / 390, sáng và tối (task nghiệm thu), một ảnh chụp dọc thật, cảm ứng giả lập |
| Lỗi gài | một lần cho logic thuần của màn (`exportSticker`, phần quyết ảnh nào được cắt) ở task cuối trước nghiệm thu |

## Open Questions

- Zalo có giữ nền trong suốt của PNG khi gửi như ảnh không: trả lời ở `zalo-send-images`, không ảnh hưởng thiết kế ở đây.
