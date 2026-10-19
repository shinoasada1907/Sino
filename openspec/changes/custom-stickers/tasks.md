# Thư viện sticker tự tạo · Implementation Plan

> **TRAINING** (`new_features: TRAINING`): người dùng tự code, tự test, tự debug; Claude hướng dẫn từng bước nhỏ (chỉ phần code mới kèm chỗ chèn chính xác, giải thích, hướng dẫn test). D-328…D-330 người dùng chốt 2026-10-19; D-331…D-337 do agent chốt, cần xem lại; DN-1…DN-4 chờ người dùng (xem `design.md`). Mọi task nhỏ đủ để làm và thử riêng.
> **Lệnh kiểm tra.** Backend (trong `apps/sino-api`): `./mvnw -B -ntp test` (hoặc `-Dtest=<Lớp>`); cần Docker cho Testcontainers. Web (trong `apps/sino-web`): `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`. Test viết trước, thấy đỏ rồi mới viết code cho xanh.
> **Gợi ý** theo hai mức: **Level 1** (hướng nghĩ, chưa nói cách), **Level 2** (hướng làm, vẫn không có code hoàn chỉnh). Số migration `V21` là số còn trống lúc lập kế hoạch; kiểm lại trước khi làm.

## 0. Thiết kế

- [ ] 0.1 **ST-00 — Khung canvas màn Sticker**
  - **Goal:** canvas "Sino UI" có màn Sticker để dựng theo (CLAUDE.md: canvas là thiết kế cuối cùng; màn này chưa có).
  - **Files:** `design/sino-ui/project/**` (khung mới, sáng và tối, máy tính, máy tính bảng, điện thoại) và bản trên https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB, như `CV-01` và `CV-02` của `f05c-messages-inbox-split`.
  - **Acceptance criteria:** có khung cho: lưới có sticker (cả GIF và ảnh tĩnh), trạng thái trống, nút tải lên và vùng kéo thả, tệp đang tải, từng loại lỗi (sai loại, quá cỡ, trùng, đầy), hộp xác nhận xóa; bản sao trong repo khớp bản đã xuất bản; người dùng duyệt.
  - **Test:** không có test tự động; người dùng xem và duyệt.
  - **Depends on:** DN-3 (đặt ở đâu trong điều hướng) và DN-4 (GIF luôn chạy hay chạy khi rê chuột).
  - **Hints:** **Level 1:** lưới ô vuông đều như màn Ghi chú; ghi chú trên khung số liệu của DN-1 (1 MiB, 300) để lời nhắn trong màn đúng. **Level 2:** đây là việc thiết kế, Claude dựng khung khi người dùng cho phép; ST-12 trở đi chờ task này.

## 1. Backend

- [ ] 1.1 **ST-01 — Migration: bảng `sticker` và `sticker_content` (D-331)**
  - **Goal:** hai bảng đúng D-331, có ràng buộc làm sàn dưới kiểm tra của ứng dụng.
  - **Files:** `apps/sino-api/src/main/resources/db/migration/V21__sticker_create_sticker.sql`.
  - **Acceptance criteria:** `sticker(id uuid PK, user_id → app_user, name, media_type, kind, width, height, size_bytes, sha256, created_at)` với `kind IN ('STATIC','ANIMATED')`, `media_type IN ('image/png','image/gif','image/webp')`, kích thước và dung lượng dương, chỉ mục duy nhất `(user_id, sha256)` và chỉ mục `(user_id, created_at DESC)`; `sticker_content(sticker_id PK/FK ON DELETE CASCADE, content bytea NOT NULL)`; chạy lại Flyway trên database rỗng không lỗi.
  - **Test:** `./mvnw -B -ntp test -Dtest=<test migration/khởi động có sẵn>` (một test khởi động ứng dụng với Testcontainers đủ để Flyway chạy); thêm một test SQL nhỏ chèn dòng sai (`kind = 'X'`, `size_bytes = 0`) và kỳ vọng bị từ chối.
  - **Depends on:** không.
  - **Hints:** **Level 1:** `V20__notes_create_note.sql` là mẫu: khóa ngoại tới `app_user`, `CHECK` đặt tên `<bảng>_<cột>_ck`, ghi chú đầu file nói mỗi ràng buộc để làm gì. **Level 2:** `sha256` lưu dạng `bytea` 32 byte hay `char(64)` hex? Chọn một, ghi lý do ở ghi chú đầu file; `CHECK` độ dài đúng 32 hoặc 64.

- [ ] 1.2 **ST-02 — Đọc ảnh: khung `StickerImage` và PNG (D-332)**
  - **Goal:** một hàm thuần nhận byte của ảnh và trả loại, tĩnh/động, chiều rộng và cao, hoặc từ chối đúng loại lỗi; làm trọn cho PNG.
  - **Files:** `apps/sino-api/src/main/java/dev/sino/sticker/domain/StickerImage.java` (+ record kết quả, hai ngoại lệ hoặc một `StickerErrorCode`), test cạnh nó.
  - **Acceptance criteria:** nhận ra PNG bằng chữ ký 8 byte; đọc `IHDR` lấy rộng, cao (big-endian); `APNG` (chunk `acTL` trước `IDAT` đầu tiên) là `ANIMATED`, còn lại `STATIC`; chữ ký lạ → "loại không hỗ trợ"; chữ ký đúng mà phần đầu hỏng (cụt, `IHDR` không đứng đầu, rộng hoặc cao bằng 0) → "ảnh không hợp lệ"; không bao giờ giải mã điểm ảnh.
  - **Test:** JUnit thuần (không Spring, không database); byte tự dựng trong test (một PNG 1×1 hợp lệ dài vài chục byte); các ca: hợp lệ, cụt giữa `IHDR`, chữ ký đúng + `IHDR` khai 60.000 rộng (vẫn đọc ra con số, việc từ chối giới hạn ở ST-06), tệp văn bản, mảng rỗng, APNG.
  - **Depends on:** không.
  - **Hints:** **Level 1:** PNG = 8 byte chữ ký, rồi các chunk; mỗi chunk gồm 4 byte độ dài, 4 byte tên, dữ liệu, 4 byte CRC; dữ liệu của `IHDR` có 13 byte, 4 byte đầu là rộng, 4 byte sau là cao. **Level 2:** viết một bộ đọc nhỏ có kiểm tra "còn đủ byte không" trước mỗi lần đọc (đọc quá cuối mảng là ca lỗi hay gặp nhất); tách "nhận loại" khỏi "đọc phần đầu của loại đó" để ST-03 và ST-04 thêm vào mà không sửa phần này.

- [ ] 1.3 **ST-03 — Đọc ảnh: GIF**
  - **Goal:** `StickerImage` đọc GIF, phân biệt tĩnh và động.
  - **Files:** `StickerImage.java` và test của nó.
  - **Acceptance criteria:** `GIF87a` và `GIF89a` đều nhận; rộng và cao từ "logical screen descriptor" (little-endian); hơn một khối ảnh là `ANIMATED`, một khối ảnh là `STATIC`; GIF không có khối ảnh hoặc cụt giữa chừng là "ảnh không hợp lệ".
  - **Test:** JUnit thuần với byte dựng tay: GIF 1 khung, GIF 2 khung, cụt sau header, chữ ký `GIF89a` nhưng thiếu descriptor; ít nhất một GIF thật vài chục khung đặt trong `src/test/resources` (đủ nhỏ) để thấy hàm chạy trên dữ liệu thật.
  - **Depends on:** ST-02.
  - **Hints:** **Level 1:** GIF little-endian, khác PNG; sau descriptor có thể có bảng màu toàn cục (cờ ở byte flags cho biết có không và bao lớn), rồi lần lượt các khối. **Level 2:** để biết "động" chỉ cần đếm tới khối ảnh thứ hai rồi dừng; duyệt khối: `0x21` là phần mở rộng (nhãn + chuỗi sub-block kết thúc bằng một khối dài 0), `0x2C` là mô tả ảnh (9 byte, có thể kèm bảng màu cục bộ, một byte LZW, chuỗi sub-block), `0x3B` là kết thúc. Giới hạn số khối duyệt để một tệp xấu không làm vòng lặp quá lâu.

- [ ] 1.4 **ST-04 — Đọc ảnh: WebP**
  - **Goal:** `StickerImage` đọc WebP (tĩnh và động).
  - **Files:** `StickerImage.java` và test của nó.
  - **Acceptance criteria:** nhận `RIFF` + `WEBP`; rộng và cao đúng cho ba kiểu chunk đầu (`VP8 ` lossy, `VP8L` lossless, `VP8X` mở rộng); `VP8X` có cờ animation là `ANIMATED`, còn lại `STATIC`; phần đầu cụt hoặc chunk lạ ở đầu là "ảnh không hợp lệ".
  - **Test:** JUnit thuần; mỗi kiểu một tệp WebP thật rất nhỏ đặt trong `src/test/resources` (tạo bằng công cụ có sẵn, ví dụ `cwebp`) và đối chiếu rộng cao với kích thước đã biết, cộng ca cụt và ca RIFF nhưng không phải WebP.
  - **Depends on:** ST-02.
  - **Hints:** **Level 1:** đọc đặc tả định dạng container WebP (RIFF) của Google; mỗi kiểu chunk lưu kích thước theo một cách khác nhau, có kiểu trừ 1, có kiểu gói trong số bit không tròn byte. **Level 2:** kiểm lại từng offset trên một tệp thật trước khi tin vào ghi chú; sai một bit ở đây cho kích thước sai mà không báo lỗi, nên ca test dùng tệp thật quan trọng hơn ca dựng tay.

- [ ] 1.5 **ST-05 — Lưu trữ: entity, repository, truy vấn không kéo byte (D-331)**
  - **Goal:** đọc và ghi hai bảng; danh sách không bao giờ nạp cột `content`.
  - **Files:** `apps/sino-api/src/main/java/dev/sino/sticker/domain/Sticker.java`, `infrastructure/StickerRepository.java` và phần nội dung (một entity hoặc `JdbcTemplate`), test.
  - **Acceptance criteria:** lưu một sticker cùng nội dung trong một giao dịch; liệt kê theo chủ, mới nhất trước, chỉ metadata; kiểm tồn tại theo `(user_id, sha256)`; đếm theo chủ; xóa một sticker kéo theo xóa nội dung; mọi truy vấn có `user_id`.
  - **Test:** test repository với Testcontainers (như test của `notes`/`planner`), gồm một test chứng minh danh sách không đọc `content` (ví dụ đếm câu SQL hoặc dùng một chiếu chỉ gồm cột metadata và kiểm kiểu trả).
  - **Depends on:** ST-01.
  - **Hints:** **Level 1:** `NoteRepository` là mẫu cho truy vấn theo chủ; câu hỏi chính của task là "làm sao một `SELECT` danh sách không kéo byte". **Level 2:** hai bảng riêng đã giải quyết một nửa; nửa còn lại là không để entity metadata có quan hệ nạp sớm tới nội dung. Với kiểu cột, xem cách Hibernate 7 ánh xạ `byte[]` sang `bytea` (cần chú thích kiểu rõ ràng).

- [ ] 1.6 **ST-06 — `StickerService`: tải lên (giới hạn, trùng, hạn mức)**
  - **Goal:** luồng tải lên đầy đủ, mọi kiểm tra theo thứ tự.
  - **Files:** `apps/sino-api/src/main/java/dev/sino/sticker/application/StickerService.java` (+ `StickerProperties` giữ giới hạn từ cấu hình), `domain/StickerErrorCode.java`, test.
  - **Acceptance criteria:** spec `custom-stickers`: *Tải một sticker lên…*, *Chỉ nhận ảnh hợp lệ trong giới hạn*, *Không trùng nội dung và có hạn mức*: tệp rỗng, quá dung lượng, loại lạ, ảnh hỏng hoặc quá cỡ, trùng, đầy; tên theo D-334; `kind` do `StickerImage` tính; thứ tự kiểm rẻ trước đắt (rỗng, dung lượng, đọc ảnh, rồi mới chạm database).
  - **Test:** test đơn vị cho từng nhánh lỗi (kho giả hoặc Testcontainers) và một test tích hợp ghi thật; ca hai yêu cầu cùng lúc tải cùng ảnh (một thành công, một `STICKER_DUPLICATE`, không bao giờ lỗi 500).
  - **Depends on:** ST-02, ST-03, ST-04, ST-05, DN-1, DN-2 (chốt các con số và cách xử lý trùng).
  - **Hints:** **Level 1:** chỉ mục duy nhất `(user_id, sha256)` mới là người gác cổng thật sự của "trùng"; kiểm `exists` trước chỉ để báo lỗi sớm và thân thiện. **Level 2:** hai yêu cầu cùng lúc sát hạn mức thì sao? Kiểm đếm rồi ghi không nguyên tử. Quyết một cách xử lý (khóa dòng của chủ như cách `ConversationSummaries.lockAll` làm, hay chấp nhận sai lệch nhỏ vì chỉ có một chủ) và ghi quyết định vào `design.md`.

- [ ] 1.7 **ST-07 — `StickerService`: danh sách, nội dung, xóa; phạm vi theo chủ (D-336)**
  - **Goal:** ba thao tác còn lại, an toàn theo chủ.
  - **Files:** `StickerService.java` và test.
  - **Acceptance criteria:** spec: *Liệt kê…*, *Phục vụ nội dung…* (phần dữ liệu), *Xóa sticker*: mới nhất trước; id của chủ khác hoặc không tồn tại đều là `STICKER_NOT_FOUND` và không lộ khác biệt; xóa của người khác không xóa gì.
  - **Test:** Testcontainers, hai chủ giả (hai dòng `app_user`); ca: danh sách riêng từng chủ, lấy nội dung của người khác = không tìm thấy, xóa của người khác = không tìm thấy và sticker còn nguyên.
  - **Depends on:** ST-05.
  - **Hints:** **Level 1:** mọi câu lệnh dính `user_id`; không bao giờ tìm theo id rồi mới so chủ. **Level 2:** để `findByIdAndUser` (một câu) thay vì `findById` rồi `if`; giảm một lớp lỗi quên kiểm.

- [ ] 1.8 **ST-08 — API: controller, lỗi, header, cấu hình multipart (D-333, D-334, D-335)**
  - **Goal:** bốn điểm cuối đúng spec, lỗi đúng mã.
  - **Files:** `apps/sino-api/src/main/java/dev/sino/sticker/api/{StickersController,StickerResponse,...}.java`, xử lý lỗi theo cách các module khác, `apps/sino-api/src/main/resources/application.yaml` (multipart tường minh), test API.
  - **Acceptance criteria:** toàn bộ spec `custom-stickers` (các scenario của cả bảy requirement): `POST` multipart `201` + `Location`; `GET` danh sách; `GET …/content` đúng header (`Content-Type`, `nosniff`, `inline`, `Cache-Control`); `DELETE` `204`; mã lỗi 400/413/415/422/409/404 đúng; tệp vượt hàng rào multipart cũng ra `413 STICKER_TOO_LARGE`, không `500`; `401` khi chưa đăng nhập và `403 CSRF_TOKEN_INVALID` khi thiếu CSRF.
  - **Test:** `StickersApiTests` (MockMvc hoặc kiểu test API đang dùng cho `TasksController`), gồm test byte-nguyên-vẹn (tải rồi tải lại, so từng byte) và test hai chủ.
  - **Depends on:** ST-06, ST-07.
  - **Hints:** **Level 1:** xem `TasksController` và `planner` để theo cách lấy chủ, đặt `@RequestMapping`, trả `ResponseEntity`; phần mới là `MultipartFile` và trả byte. **Level 2:** giới hạn multipart cấu hình ở `application.yaml` nhỉnh hơn giới hạn của ứng dụng chút (D-333) và ném `MaxUploadSizeExceededException` thì phải có chỗ bắt (xem cách module khác bắt lỗi chung); đừng để lỗi này rơi về trang lỗi mặc định.

- [ ] 1.9 **ST-09 — Kiểm tra module, README, chạy thật bằng tệp thật**
  - **Goal:** chứng minh backend chạy với tệp thật, và kiến trúc vẫn sạch.
  - **Files:** `apps/sino-api/README.md` (bảng API `/api/stickers`, biến cấu hình giới hạn).
  - **Acceptance criteria:** `ModularityTests` xanh; `./mvnw -B -ntp test` xanh toàn bộ; chạy thật: đăng nhập, `curl` tải một PNG, một GIF động, một WebP, một JPEG (bị từ chối), một tệp văn bản đổi tên `.png` (bị từ chối); `GET` danh sách có ba sticker đúng `kind`; tải về `…/content` và so sánh `sha256sum` với tệp gốc bằng nhau; xóa một sticker thì bảng `sticker_content` không còn dòng của nó (xem bằng `psql`).
  - **Test:** như trên (kiểm bằng tay có ghi lệnh và kết quả vào ghi chú thực hiện).
  - **Depends on:** ST-08.
  - **Hints:** **Level 1:** chạy backend như thường lệ với Postgres ở `compose.yaml`; session và CSRF qua `curl -c jar -b jar` và header `X-XSRF-TOKEN` (đoạn mẫu ở `apps/sino-api/README.md`, mục admin: lấy cookie bằng `GET /api/auth/me`, rồi `POST /api/auth/login`). **Level 2:** ghi lại trong ghi chú thực hiện đúng tên tệp và kích thước đã thử để người sau lặp lại được.

## 2. Frontend

- [ ] 2.1 **ST-10 — `api.upload` cho client (D-337)**
  - **Goal:** gửi được `FormData` qua client chung mà vẫn có CSRF, lỗi và phiên.
  - **Files:** `apps/sino-web/src/shared/api/client.ts`, `client.test.ts`.
  - **Acceptance criteria:** `api.upload<T>(path, formData)` là một `POST` mà `Content-Type` **không** do ta đặt (trình duyệt tự thêm boundary), body là chính `FormData`, vẫn thêm `X-XSRF-TOKEN`, vẫn thử lại một lần khi `CSRF_TOKEN_INVALID`, vẫn báo `401` cho phiên hết hạn; `post`, `put`, `patch` không đổi hành vi.
  - **Test:** test `client.test.ts` có sẵn là mẫu: header `Content-Type` không có trong yêu cầu, body bằng đúng `FormData` đã đưa, thử lại sau CSRF gửi lại cùng `FormData`; test cũ vẫn xanh.
  - **Depends on:** không.
  - **Hints:** **Level 1:** `request` hiện nhận `body: unknown` và luôn `JSON.stringify` + đặt `Content-Type`; câu hỏi là làm sao một nhánh nhận body đã dựng sẵn mà không nhân đôi phần CSRF. **Level 2:** để `request` nhận "body đã đóng gói" (chuỗi JSON kèm kiểu, hoặc `FormData`), thay vì kiểm `instanceof` ở nhiều chỗ.

- [ ] 2.2 **ST-11 — Lớp dữ liệu: kiểu, request, hook, MSW**
  - **Goal:** web nói chuyện được với `/api/stickers`.
  - **Files:** `apps/sino-web/src/features/stickers/{stickers.types.ts,stickers.api.ts,useStickers.ts}` và test; handler MSW cho test.
  - **Acceptance criteria:** `fetchStickers`, `uploadSticker(file, name?)`, `deleteSticker(id)`, `stickerContentUrl(id)`; `useStickers` (danh sách), `useUploadSticker`, `useDeleteSticker`; sau tải lên thành công danh sách có sticker mới mà không tải lại trang; sau xóa thì sticker biến; lỗi giữ nguyên `ApiError` (mã `STICKER_*`).
  - **Test:** Vitest + MSW như `accounts`/`tasks`: ca thành công và từng mã lỗi; kiểm khóa cache.
  - **Depends on:** ST-10.
  - **Hints:** **Level 1:** xem `features/tasks` và `features/accounts` (`useAccounts.ts`) cho cách đặt khóa cache và cập nhật sau mutation. **Level 2:** sau upload/xóa có hai cách (ghi thẳng vào cache hay `invalidateQueries`): chọn một, ghi lý do; với danh sách nhỏ, đọc lại thường đủ và ít chỗ sai hơn.

- [ ] 2.3 **ST-12 — Route, điều hướng, trang và các trạng thái danh sách**
  - **Goal:** `/stickers` có mặt trong điều hướng và hiện được các trạng thái của danh sách.
  - **Files:** `apps/sino-web/src/features/stickers/StickersPage.tsx` (+ test), `src/app/router.tsx`, `src/app/shell/navItems.ts` (`NAV_ITEMS`, `MORE_PATHS`), `src/app/shell/MorePage.tsx` (`OTHER_SCREENS`).
  - **Acceptance criteria:** spec `web-sticker-library`: *Màn Sticker liệt kê…* (có sticker, trống, đang tải, lỗi + thử lại, `alt`, `loading="lazy"`, GIF tự chạy) và *Vào màn Sticker từ điều hướng* (cột bên, dải icon, trang Thêm, tên trang, tab Thêm hiện hành); dựng theo khung ST-00.
  - **Test:** Vitest + `renderApp` (dữ liệu mẫu gieo vào cache) và MSW cho trạng thái lỗi; test điều hướng ở cả ba bộ phận của khung (`shellPart('sidebar')`, `rail`, `tabbar`/Thêm).
  - **Depends on:** ST-00, ST-11, DN-3.
  - **Hints:** **Level 1:** thêm màn mới trước hết là thêm một dòng cho từng nơi biết danh sách màn; `AppShell.test.tsx` có sẵn mẫu kiểm liên kết. **Level 2:** trang đang dựng của các màn chưa làm là `PAGES`/`NotFound` của khung; kiểm `MORE_PATHS` để tab Thêm sáng đúng.

- [ ] 2.4 **ST-13 — Tải lên bằng nút, kiểm sơ bộ phía web**
  - **Goal:** chọn một hoặc nhiều tệp bằng nút, kiểm sơ bộ rồi gửi.
  - **Files:** `apps/sino-web/src/features/stickers/{format.ts (checkStickerFile), UploadButton.tsx}` và test.
  - **Acceptance criteria:** spec *Tải sticker lên…* (phần chọn tệp, sai loại bị chặn tại chỗ, đang tải, vào lưới không tải lại trang) và phần bàn phím của *dùng được bằng bàn phím…*; `checkStickerFile` thuần: nhận PNG/GIF/WebP theo `type` (và theo đuôi khi `type` rỗng), từ chối loại khác và tệp quá dung lượng, trả lý do để hiển thị.
  - **Test:** test đơn vị thuần cho `checkStickerFile` (đủ các ca biên: đúng giới hạn, hơn 1 byte, `type` rỗng); test giao diện: chọn tệp bằng `userEvent.upload`, kiểm `POST` multipart tới MSW và lưới có sticker mới; chọn `.jpg` thì không có yêu cầu nào.
  - **Depends on:** ST-12, DN-1 (số giới hạn).
  - **Hints:** **Level 1:** `<input type="file" hidden>` + một nút gọi `click()` của nó, hoặc `<label>` bọc; thuộc tính `accept` chỉ gợi ý, không phải hàng rào. **Level 2:** giới hạn dung lượng ở web trùng với backend là số bị nhân đôi: đặt một hằng có tên, ghi chú nguồn (DN-1, `design.md`), và nhớ rằng máy chủ vẫn là bên quyết định cuối.

- [ ] 2.5 **ST-14 — Kéo thả, nhiều tệp, lỗi bằng tiếng Việt**
  - **Goal:** kéo thả, nhiều tệp một lúc, mỗi tệp một trạng thái, lỗi nói rõ.
  - **Files:** `apps/sino-web/src/features/stickers/{DropZone.tsx,format.ts (uploadErrorMessage),UploadList.tsx}` và test.
  - **Acceptance criteria:** spec: kéo thả, nhiều tệp một tệp lỗi không làm hỏng các tệp còn lại, và *Lỗi của máy chủ khi tải lên được nói bằng tiếng Việt* (mọi mã, lỗi mạng, lỗi lạ); thông báo kết quả đọc được bởi trình đọc màn hình (`role="status"`/`role="alert"`); kéo thả không là cách duy nhất.
  - **Test:** `uploadErrorMessage` là hàm thuần, một test mỗi mã; giao diện: thả một tệp, thả ba tệp trong đó một lỗi, lỗi mạng.
  - **Depends on:** ST-13.
  - **Hints:** **Level 1:** sự kiện `dragover` phải `preventDefault()` thì mới thả được; `dataTransfer.files` là danh sách tệp. **Level 2:** tải tuần tự (từng tệp một) nhẹ cho máy chủ và dễ nói "tệp nào lỗi"; tải song song nhanh hơn nhưng khó nói trạng thái; chọn một cách và ghi lý do.

- [ ] 2.6 **ST-15 — Xóa có xác nhận**
  - **Goal:** hộp xác nhận xóa, đúng tiêu điểm, đúng trạng thái.
  - **Files:** `apps/sino-web/src/features/stickers/{DeleteStickerDialog.tsx,StickerCard.tsx}` và test.
  - **Acceptance criteria:** spec *Xóa sticker có xác nhận* (xóa, hủy, xóa lỗi) và phần tiêu điểm của *dùng được bằng bàn phím…* (giữ tiêu điểm trong hộp, trả về nơi mở).
  - **Test:** như spec; `DELETE` qua MSW; kiểm tiêu điểm sau khi đóng bằng `document.activeElement`.
  - **Depends on:** ST-12.
  - **Hints:** **Level 1:** hộp xác nhận ngắt kết nối tài khoản ở `features/accounts` là mẫu (cùng `Dialog` của shadcn/ui). **Level 2:** khi ô vừa xóa biến khỏi lưới thì nút đã mở hộp không còn; quyết tiêu điểm về đâu (ô kế, hoặc nút tải lên khi hết ô) và viết test cho quyết định đó.

- [ ] 2.7 **ST-16 — Máy tính bảng, điện thoại, theme**
  - **Goal:** màn đúng khung ở ba cỡ và hai theme.
  - **Files:** `apps/sino-web/src/features/stickers/**` (kiểu dáng, bố cục lưới theo cỡ).
  - **Acceptance criteria:** spec *Vào màn Sticker…* (ba cỡ, hai theme, theo canvas); không cuộn ngang ở 390 px; vùng chạm đủ lớn trên điện thoại.
  - **Test:** Vitest cho phần có logic (số cột nếu tính bằng JS); Chrome thật: một lượt ở 1440, 1024, 390, sáng và tối, đối chiếu canvas.
  - **Depends on:** ST-13, ST-14, ST-15.
  - **Hints:** **Level 1:** lưới CSS `grid-template-columns: repeat(auto-fill, minmax(...))` cho số cột tự co. **Level 2:** trang Thêm và `MobilePageHeader` ở mobile: xem cách `AccountsPage` làm tiêu đề trang con.

## 3. Nghiệm thu

- [ ] 3.1 **ST-20 — Chạy thật, tài liệu, kết thúc**
  - **Goal:** chứng minh cả luồng với backend thật, ghi lại, archive.
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới) và `.docx` sinh lại bằng GenOffice; `openspec/roadmap.md` (ghi chú ngắn); `PROJECT_STATE.md`; `openspec/changes/custom-stickers/tasks.md` (ghi chú thực hiện).
  - **Acceptance criteria:** web chạy với backend thật: tải PNG, GIF động, WebP; GIF chạy trong lưới; tải ảnh trùng, JPEG, tệp quá lớn và đủ hạn mức đều ra đúng câu tiếng Việt; xóa xong không còn dòng trong database; hai theme × ba cỡ đã xem; `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`, `./mvnw -B -ntp test` xanh; `openspec validate custom-stickers --strict` hợp lệ; người dùng đã xem.
  - **Test:** như trên.
  - **Depends on:** ST-09, ST-16.
  - **Hints:** **Level 1:** mục kiến thức nên trả lời "vì sao nhận loại bằng nội dung", "vì sao đo từ phần đầu", "vì sao hai bảng", "vì sao id của người khác là 404". **Level 2:** xong thì `openspec archive custom-stickers -y`; mở change tiếp theo `custom-stickers-send` (spike trước) khi người dùng bảo.

## Sau change này (không nằm trong tasks của change)

`custom-stickers-send`: **spike trước**, trên nick Zalo phụ, đo: `zca-js` gửi ảnh PNG/GIF như tệp đính kèm có được không; GIF có còn động khi tới Zalo không; giới hạn dung lượng và kích thước; `msgId` của tin gửi (dùng cho `findSentMessages`, ZL-09); nhịp gửi; gửi vào chat nhóm so với chat đôi. Kết quả mới quyết định thiết kế: mở rộng contract (một `ProviderCapability` cho tệp đính kèm, `SendMessageCommand` mang tệp và chữ có thể rỗng), `ZaloGateway.sendAttachment`, và picker trong khung soạn tin.
