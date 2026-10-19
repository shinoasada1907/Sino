## Mode

**AUTO** cho riêng change này từ 2026-10-19 (người dùng: "oke triển khai đi", sau khi kế hoạch ghi rõ tính năng mới chạy TRAINING và người dùng là người code; `project-mode.yaml` `task_overrides.custom-stickers`). `new_features` vẫn là TRAINING cho các tính năng khác. Claude làm từng task nhỏ theo đủ quy trình (test viết trước, kiểm chứng, tài liệu, commit trên `dev`), báo lại ở các điểm dừng. Ngoại lệ vẫn cần người dùng: ST-00 (khung canvas) là bản thiết kế cuối cùng của giao diện, người dùng duyệt trước khi dựng màn.

Quyết định kiến trúc do người dùng chốt. **Đã chốt 2026-10-19:** D-328 (phạm vi), D-329 (định dạng), D-330 (kho lưu), và DN-1…DN-4 theo đúng đề xuất ("oke triển khai đi" trả lời bản kế hoạch nêu đề xuất của từng mục). **Agent chốt, cần xem lại:** D-331…D-337.

## Context

- **Hôm nay chỉ có phía nhận.** Sticker của Zalo tới Sino được chuẩn hóa (`ZaloMessageNormalizer`, metadata `stickerUrl`, `stickerSpriteUrl`…), web hiện bằng `StickerPicture`. Đó là ảnh nằm ở máy chủ Zalo; Sino không giữ byte nào.
- **Chưa có nhận tệp:** không có `MultipartFile` hay cấu hình `spring.servlet.multipart` nào trong `sino-api` (đã tìm). Spring Boot mặc định `max-file-size` 1 MB, `max-request-size` 10 MB.
- **Tệp đính kèm thư không lưu** (D-125 của `f06-message-history`): chỉ tải qua Sino lúc bấm. Sticker tự tạo là dữ liệu của người dùng, không lấy lại được từ đâu, nên khác: phải lưu và sao lưu cùng database.
- **Mẫu module có sẵn:** `planner` (`TasksController` → `TaskService` → repository, người gọi lấy từ `identity.CurrentUser.requireOwnerId()`), `notes` (migration `V20__notes_create_note.sql`, khóa ngoại `user_id → app_user(id)`, ràng buộc `CHECK` làm sàn dưới kiểm tra của ứng dụng). Migration mới nhất khi viết kế hoạch là `V20`.
- **Web:** `shared/api/client.ts` luôn đặt `Content-Type: application/json` và `JSON.stringify(body)` khi có body; CSRF qua cookie `XSRF-TOKEN` và header `X-XSRF-TOKEN` đã có sẵn trong `request`. Điều hướng ở `app/shell/navItems.ts` (`NAV_ITEMS`, `MORE_PATHS`) và trang Thêm (`OTHER_SCREENS` trong `MorePage.tsx`).
- **Canvas "Sino UI" không có màn Sticker** (tìm `sticker` trong `design/sino-ui/project/` không ra gì). Theo `CLAUDE.md`, mọi màn đối chiếu canvas trước khi dựng.
- **Ngữ cảnh Zalo:** kết nối không chính thức (`zca-js`), một người dùng gửi nhiều tin liên tiếp có thể bị nhà cung cấp giới hạn; đây là lý do gửi sticker bị tách khỏi change này (Non-goals).

## Decisions

### D-328 — Chia làm hai: thư viện trước, gửi qua Zalo sau · người dùng chốt 2026-10-19
Phương án đã chọn: **thư viện (tải lên, danh sách, xem, xóa) là change này; gửi qua Zalo là change `custom-stickers-send`, mở bằng một spike đo.** Phương án bỏ: làm cả hai trong một change (đụng cả `sino-web`, `sino-api` và `sino-zalo`, và rủi ro lớn nhất, Zalo không giữ GIF động hay không nhận ảnh từ kết nối không chính thức, chỉ lộ ra ở cuối); thêm cả công cụ tạo trong app (rất lớn). Cái giá: sau change này sticker nằm trong thư viện mà **chưa gửi được ở đâu**; đó là chủ ý, và là lý do mô tả của change nói rõ điều đó.

### D-329 — Định dạng nhận vào: PNG, GIF, WebP; SVG để sau · người dùng chốt 2026-10-19
Người dùng viết "csv"; tôi đọc là SVG (CSV không phải định dạng ảnh); người dùng đã chọn phương án "PNG + GIF (+ WebP), SVG để sau". Ba định dạng nhận: `image/png`, `image/gif`, `image/webp`. Ảnh động là GIF (và WebP/APNG động nếu có), ảnh tĩnh là PNG hoặc WebP.

- **Vì sao hoãn SVG:** SVG là XML có thể mang `<script>` và liên kết ngoài; phục vụ nó từ cùng origin với app là một lỗ XSS nếu thiếu làm sạch. Zalo cũng có thể không nhận SVG làm ảnh. Khi làm: làm sạch rồi **đổi sang PNG ở server** trước khi lưu; không bao giờ phục vụ SVG gốc.
- **Đổi định dạng cho người dùng không làm:** nếu người dùng đưa JPEG, ta từ chối (415) với thông báo nói rõ ba loại được nhận, không tự chuyển (thêm thư viện, mất chất lượng, chưa có yêu cầu).

### D-330 — Lưu nội dung trong PostgreSQL, cột `bytea` · người dùng chốt 2026-10-19
Phương án đã chọn: **PostgreSQL, `bytea`**: sao lưu cùng database, một giao dịch cho metadata và nội dung, không thêm hạ tầng. Phương án bỏ: thư mục trên đĩa hoặc object storage (S3): hợp khi tệp lớn hoặc nhiều, nhưng thêm hạ tầng và một lịch sao lưu riêng. Object storage không nằm trong danh sách kỹ thuật bị cấm của dự án (`openspec/config.yaml`), nhưng tinh thần của danh sách đó là không thêm hạ tầng khi chưa có yêu cầu thật. Điều kiện của lựa chọn này: tệp **nhỏ và bị chặn cứng** (DN-1); nếu sau này cần tệp lớn thì đổi chỗ lưu nội dung mà API giữ nguyên (nội dung đã nằm sau `GET …/content`).

### D-331 — Hai bảng: `sticker` (metadata) và `sticker_content` (byte) · agent chốt
`sticker(id, user_id, name, media_type, kind, width, height, size_bytes, sha256, created_at)` và `sticker_content(sticker_id PK/FK, content bytea)`. **Vì sao tách:** danh sách chỉ cần metadata; nếu byte nằm cùng dòng, một câu `SELECT` danh sách (hoặc một entity JPA nạp theo mặc định) kéo cả byte của mọi sticker vào bộ nhớ. Tách ra thì danh sách chạy trên bảng nhỏ và byte chỉ được đọc khi có đúng một yêu cầu `…/content`. Cái giá: một `JOIN` hay một lần đọc thứ hai khi lấy nội dung, và xóa phải xóa cả hai (`ON DELETE CASCADE` ở khóa ngoại).

### D-332 — Nhận ra loại bằng nội dung, đo từ phần đầu tệp, không giải mã ảnh · agent chốt
- **Loại:** đọc vài byte đầu (`89 50 4E 47 0D 0A 1A 0A` cho PNG; `GIF87a` hoặc `GIF89a` cho GIF; `RIFF` + 4 byte + `WEBP` cho WebP). **Không** tin đuôi tên tệp và không tin `Content-Type` của phần multipart: cả hai do client khai, nên một tệp bất kỳ đổi tên thành `.png` không vào được.
- **Kích thước:** đọc chiều rộng, chiều cao ngay từ phần đầu (PNG: chunk `IHDR`; GIF: logical screen descriptor; WebP: `VP8 `, `VP8L` hoặc `VP8X`) mà **không giải mã điểm ảnh**. Lý do: một PNG dưới 1 MB có thể khai 60.000 × 60.000 điểm ảnh và làm máy chủ hết bộ nhớ khi giải mã (decompression bomb). Đo từ phần đầu thì chặn được trước khi tốn bộ nhớ. JDK không có bộ đọc WebP mặc định, nên một cách thống nhất cho cả ba là tự đọc phần đầu.
- **Tĩnh hay động (`kind`):** máy chủ tự tính, người dùng không khai. PNG động (APNG) có chunk `acTL` trước `IDAT` đầu tiên; GIF có hơn một khối ảnh; WebP động có cờ animation trong `VP8X`. Một GIF chỉ có một khung vẫn là `STATIC`.
- **Hệ quả:** một tệp có phần đầu hợp lệ mà thân hỏng vẫn có thể lọt vào (ta không giải mã). Chấp nhận: trình duyệt sẽ không vẽ được nó, nhưng không có cách nào để nó gây hại, vì ta phục vụ đúng loại đã nhận ra với `nosniff` (D-335). Nếu sau này gửi qua Zalo cần ảnh chắc chắn giải mã được thì kiểm ở change gửi.

### D-333 — Giới hạn là kiểm tra chính xác trong ứng dụng; multipart chỉ là hàng rào · agent chốt
`StickerService` kiểm dung lượng, chiều rộng/cao và hạn mức bằng con số của DN-1 và trả lỗi có mã riêng. Cấu hình `spring.servlet.multipart.max-file-size` và `max-request-size` được đặt **tường minh** ở mức nhỉnh hơn giới hạn của ứng dụng chút, chỉ để Tomcat không phải đệm tệp khổng lồ; việc vượt hàng rào ném `MaxUploadSizeExceededException`, phải được ánh xạ ra cùng `413 STICKER_TOO_LARGE` thay vì lỗi 500 hay trang lỗi mặc định. Vì sao đặt tường minh: mặc định 1 MB của Spring có thể đổi giữa các bản và là một con số ngầm.

### D-334 — Hình dạng API · agent chốt
| Yêu cầu | Kết quả |
|---|---|
| `POST /api/stickers` (`multipart/form-data`: `file` bắt buộc, `name` tùy chọn) | `201`, `Location: /api/stickers/{id}`, thân `StickerResponse` |
| `GET /api/stickers` | `200 { items: [StickerResponse…] }`, mới nhất trước, không phân trang (số lượng bị chặn bởi hạn mức) |
| `GET /api/stickers/{id}/content` | `200` byte của ảnh, `Content-Type` là loại đã nhận ra |
| `DELETE /api/stickers/{id}` | `204`; sau đó `GET` cả hai đều `404` |

`StickerResponse`: `id`, `name`, `mediaType`, `kind` (`STATIC` hoặc `ANIMATED`), `width`, `height`, `sizeBytes`, `createdAt`, không kèm byte. Tên: nếu không gửi thì lấy tên tệp bỏ đuôi, cắt về tối đa 50 ký tự (đếm theo code point), bỏ khoảng trắng đầu cuối; nếu rỗng thì `Sticker`.
Mã lỗi (RFC 9457 theo cách các module khác trả): `STICKER_FILE_MISSING` 422 (không gửi tệp, hoặc tệp rỗng; **không phải 400 như bản đầu**: `ErrorCategory` không có chỗ cho 400 và thêm một category chỉ cho một mã là không đáng, nên là `INVALID` như `STICKER_INVALID_IMAGE`; web đọc theo mã chứ không theo trạng thái), `STICKER_TOO_LARGE` 413 (cần category `PAYLOAD_TOO_LARGE`, thêm ở ST-01a), `STICKER_TYPE_UNSUPPORTED` 415 (category `UNSUPPORTED_MEDIA_TYPE`, ST-01a), `STICKER_INVALID_IMAGE` 422 (đúng loại nhưng phần đầu hỏng, hoặc vượt chiều rộng/cao), `STICKER_DUPLICATE` 409 (thêm thành viên `stickerId` của sticker đã có), `STICKER_LIMIT_REACHED` 409. Lỗi của `StickerService` còn có các giới hạn trong thành viên của problem (`maxBytes`, `maxSide`, `maxPerOwner`).

### D-338 — Hạn mức được đếm, không khóa; "trùng" thì do chỉ mục quyết · agent chốt (ST-06)
`StickerService.upload` kiểm "đã đủ số sticker" bằng một phép đếm rồi ghi: hai lần tải cùng lúc khi chủ đang ở hạn mức trừ một có thể cùng qua, và chủ có hơn hạn mức đúng số lần tải đồng thời. **Chấp nhận:** hạn mức là rào bảo vệ dung lượng, không phải ràng buộc toàn vẹn; chỉ có một chủ, và vượt một hay hai sticker không gây hại. **Khác với "trùng":** đó là chỗ phải đúng, nên do chỉ mục duy nhất `(user_id, sha256)` quyết, không do phép kiểm trước. Phương án bỏ: khóa dòng của chủ (hoặc khóa tư vấn của PostgreSQL) cho mỗi lần tải: thêm một điểm chặn cho cả đường thường để chặn một chuyện không gây hại. Nếu sau này hạn mức thành ràng buộc thật (tính tiền, nhiều chủ) thì khóa ở đây.

### D-339 — Ghi hai bảng trong một giao dịch viết tay để bắt được lỗi lúc ghi · agent chốt (ST-06)
`@Transactional` trên phương thức không cho phép bắt lỗi chỉ lộ ra lúc commit (nằm ngoài phương thức). Hai lần tải cùng một tệp đồng thời cùng qua phép kiểm trùng rồi một lần bị chỉ mục duy nhất từ chối: nếu để lỗi này đi thẳng ra thì người dùng nhận `500`. `StickerService` dùng `TransactionTemplate`, bắt `DataIntegrityViolationException` ở ngoài, rồi **hỏi lại** (trong giao dịch mới, vì giao dịch cũ đã hỏng) xem chủ có sticker này chưa: có thì là `STICKER_DUPLICATE` kèm `stickerId`, không thì lỗi gốc đi tiếp (một ràng buộc khác không bị gọi nhầm là "trùng"). Có test chạy hai luồng với một rào chắn ép cả hai cùng qua phép kiểm trước khi ai ghi.

### D-335 — Phục vụ nội dung: `nosniff`, cache lâu, riêng tư · agent chốt
`GET …/content` trả `Content-Type` đúng loại đã nhận ra (lưu ở `media_type`, không đoán lại), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private, max-age=31536000, immutable`. Nội dung của một `id` không bao giờ đổi (không có sửa; thay là xóa rồi tạo mới, id khác), nên cache vĩnh viễn an toàn và cho `<img>` không phải tải lại. `private` vì có cookie phiên. Vì chỉ có PNG, GIF, WebP, không có đường nào cho nội dung chạy script.

### D-336 — Phạm vi theo chủ tài khoản; id của người khác là 404 · agent chốt
Mọi câu lệnh đều có `user_id = CurrentUser.requireOwnerId()`. Sticker của người khác (hoặc không tồn tại) đều trả `404 STICKER_NOT_FOUND`, không phân biệt, để không lộ id nào tồn tại. Hôm nay Sino có một chủ duy nhất (D-02, D-10); ràng buộc này giữ cho thiết kế không phải sửa khi có nhiều người dùng.

### D-337 — Web: thêm `api.upload`, không sửa `post` · agent chốt
`api.post` luôn đặt `Content-Type: application/json` và `JSON.stringify`. Tải tệp cần `FormData` **không** tự đặt `Content-Type` (trình duyệt tự thêm `boundary`; đặt tay là gãy). Thêm `api.upload(path, formData)` dùng chung phần CSRF, lỗi và phiên của `request`, và `request` nhận body đã dựng sẵn. Phương án bỏ: nhánh `if (body instanceof FormData)` trong `post` (một hàm hai việc) và `fetch` riêng cho sticker (nhân đôi xử lý CSRF và 401).

## Decision Needed: DN-1…DN-4 chốt theo đề xuất (người dùng, 2026-10-19: "oke triển khai đi")

Các phương án được giữ lại để biết đã bỏ gì. **Chốt:** DN-1 = A (1 MiB, 1024 điểm ảnh mỗi cạnh, 300 sticker mỗi người), DN-2 = A (từ chối trùng, `409 STICKER_DUPLICATE`), DN-3 = A (mục "Sticker" ở cột bên và dải icon, một dòng ở trang Thêm; nhóm của mục ở cột bên do khung canvas ST-00 chốt), DN-4 = A (GIF luôn chạy).

### DN-1 — Giới hạn mỗi sticker và mỗi người
| | Dung lượng mỗi tệp | Chiều rộng/cao tối đa | Số sticker mỗi người | Trần dung lượng |
|---|---|---|---|---|
| A | **1 MiB** | **1024 điểm ảnh** mỗi cạnh | **300** | 300 MiB (lý thuyết) |
| B | 512 KiB | 512 | 200 | 100 MiB |
| C | 2 MiB | 2048 | 500 | 1 GiB |

**Đề xuất: A.** 1 MiB khớp mặc định cũ của Spring, đủ cho GIF vài chục khung ở 512 × 512, và 300 sticker đủ cho một người dùng; tối đa lý thuyết 300 MiB trong `bytea` vẫn nhỏ. B làm GIF động khó vừa. C làm bộ nhớ tăng khi ghi một lần (JDBC đọc cả `bytea` vào bộ nhớ). *Câu hỏi:* anh chọn mức nào, hay một con số khác?

### DN-2 — Tải một ảnh đã có (cùng nội dung)
- **A (đề xuất): từ chối `409 STICKER_DUPLICATE`**, kèm id của sticker đã có; mỗi chủ một chỉ mục duy nhất `(user_id, sha256)`. Người dùng thấy rõ "đã có rồi", không có hai bản giống hệt.
- **B:** cho tải và lưu hai bản (khác tên). Đơn giản hơn, nhưng thư viện đầy bản trùng và tốn chỗ.
- **C:** tự trả về sticker đã có như thể vừa tạo (`200`/`201`). Mượt, nhưng giấu việc đã có và tên mới bị bỏ.

*Câu hỏi:* anh chọn A, B hay C?

### DN-3 — Màn Sticker nằm ở đâu trong điều hướng
- **A (đề xuất): một mục "Sticker" ở cột bên và dải icon, cộng một dòng ở trang Thêm** (như Ghi chú, Lịch). Có mặt ngay, dễ thấy.
- **B:** một dòng trong màn Cài đặt. Nhưng `/settings` chưa dựng (đang là trang "đang được dựng"), nên bị chặn.
- **C:** chưa có mục điều hướng, chỉ vào từ khung soạn tin ở change gửi. Thư viện không dùng được ngay.

Cả ba đều cần khung canvas trước (ST-00). *Câu hỏi:* anh chọn A, B hay C? Và mục đặt ở nhóm nào của cột bên (`KẾ HOẠCH` cạnh Ghi chú, hay nhóm riêng)?

### DN-4 — GIF động trong lưới: luôn chạy hay chạy khi rê chuột
- **A (đề xuất cho bước 1): luôn chạy.** Không thêm việc; CSS không dừng được GIF, nên `prefers-reduced-motion` không áp dụng được (ghi ở Non-goals).
- **B:** ảnh tĩnh (khung đầu) trong lưới, chạy khi rê chuột/focus. Cần ảnh thu nhỏ do server tạo; GIF dùng `ImageIO` được, **WebP thì JDK không đọc được**, nên cần thêm thư viện hoặc chỉ làm cho GIF. Tôn trọng `prefers-reduced-motion`, nhẹ cho trang nhiều GIF.

*Câu hỏi:* anh chọn A hay B? (B nên làm sau, khi có thư viện ảnh và biết nhu cầu thật.)

## Risks / Trade-offs

- **Kết quả không gửi được ở đâu:** sau change này sticker chỉ nằm trong thư viện. Chủ ý (D-328), nhưng người dùng cần biết để khỏi mong đợi.
- **Zalo có thể không giữ GIF động hoặc không nhận ảnh qua kết nối không chính thức.** Chỉ biết sau spike của change gửi. Nếu kết quả xấu, thư viện vẫn có giá trị cho các nhà cung cấp sau (Telegram…), nhưng cần nói rõ với người dùng.
- **`bytea` trong bộ nhớ:** JDBC đọc cả giá trị vào bộ nhớ khi ghi và đọc; an toàn ở 1 MiB, không an toàn ở tệp vài chục MiB. Giới hạn cứng (D-333, DN-1) là điều kiện của D-330.
- **Dung lượng database và sao lưu:** tối đa 300 MiB mỗi người ở mức đề xuất. Đủ nhỏ cho một người dùng; cần nhìn lại nếu có nhiều chủ.
- **Phần đầu hợp lệ, thân hỏng (D-332):** lọt qua, vô hại về an ninh, chỉ làm một ảnh không vẽ được. Chấp nhận ở bước 1.
- **Quy trình canvas (ST-00):** nếu người dùng đổi ý về DN-3/DN-4 sau khi canvas đã dựng thì phải sửa khung; vì vậy ST-00 chờ người dùng chốt DN-3 và DN-4.
