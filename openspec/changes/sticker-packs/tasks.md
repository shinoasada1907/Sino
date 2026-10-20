# Bộ sticker và bước chỉnh ảnh trước khi lưu · Implementation Plan

> **AUTO** cho change này (người dùng 2026-10-20: "AUTO: Claude tự làm"). Bắt đầu SP-01 khi người dùng đã chốt DN-1…DN-7 (`design.md`). Mỗi task: test viết trước (đỏ rồi xanh), kiểm chứng, ghi chú thực hiện ngay tại task, commit trên nhánh làm việc. Push chỉ khi người dùng bảo. Mỗi task còn phần **Hints** để người dùng nhận làm bất cứ lúc nào.
> **Lệnh kiểm tra.** Backend (`apps/sino-api`): `./mvnw -B -ntp test` (hoặc `-Dtest=<Lớp>`), cần Docker cho Testcontainers. Web (`apps/sino-web`): `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`. Chrome thật một lượt mỗi task giao diện ở cỡ màn task đó đụng tới; đủ ba cỡ × hai theme để dành cho SP-20.
> **Gợi ý** theo hai mức: **Level 1** (hướng nghĩ), **Level 2** (hướng làm, không có code hoàn chỉnh).

## 1. Backend

- [ ] 1.1 **SP-01 — Migration `V22`, `StickerPack`, `Sticker.packId` (D-340)**
  - **Goal:** dữ liệu của bộ sticker, với database tự chặn sticker nằm trong bộ của người khác.
  - **Files:** `db/migration/V22__sticker_create_sticker_pack.sql` (kiểm số kế tiếp trên `dev` trước khi viết); `sticker/domain/{StickerPack,Sticker}`; `sticker/infrastructure/StickerPackRepository`; test.
  - **Acceptance criteria:** spec `sticker-packs` phần dữ liệu (tên 1–50, không trùng không phân biệt hoa thường); `sticker.pack_id` cho phép `NULL`; khóa ngoại `(pack_id, user_id)`; xóa bộ để `pack_id` về `NULL` mà `user_id` giữ nguyên.
  - **Test:** Testcontainers: chèn thẳng bằng SQL các hàng sai (tên trống, tên trùng khác hoa thường, sticker trỏ bộ của người khác) và kiểm tên ràng buộc; xóa bộ thì sticker còn với `pack_id` `NULL`; `StickerPack.create` dạng bảng (cắt khoảng trắng, 50/51 ký tự).
  - **Depends on:** DN-1, DN-6.
  - **Hints:** **Level 1:** khóa ngoại nào bảo đảm "bộ và sticker cùng một chủ" mà không cần trigger? **Level 2:** `UNIQUE (id, user_id)` ở `sticker_pack` để khóa ngoại kép trỏ tới; `ON DELETE SET NULL (pack_id)` của PostgreSQL 15+; chỉ mục duy nhất trên biểu thức `lower(name)`.

- [ ] 1.2 **SP-02 — `StickerPackService`: tạo, đổi tên, xóa, liệt kê (D-341, D-343)**
  - **Goal:** mọi lệnh trên bộ, theo chủ, với lỗi rõ.
  - **Files:** `sticker/application/{StickerPackService,StickerPackSummary,StickerProperties}`, `sticker/domain/StickerErrorCode`; test.
  - **Acceptance criteria:** spec `sticker-packs` (liệt kê với `stickerCount`, `coverStickerId`; tạo, đổi tên, xóa; trùng tên `409`, đủ số bộ `409` kèm `maxPacks`; bộ của người khác `404`).
  - **Test:** Testcontainers + `Clock` cố định: thứ tự, đếm và bìa, hai lần tạo cùng tên cùng lúc ra đúng một `STICKER_PACK_NAME_TAKEN` (rào chắn hai luồng như `StickerServiceTests`), số bộ tối đa đọc từ cấu hình.
  - **Depends on:** SP-01.
  - **Hints:** **Level 1:** lỗi trùng tên chỉ lộ ra lúc commit; làm sao để nó vẫn thành `409` chứ không phải `500`? **Level 2:** như D-339: `TransactionTemplate`, bắt `DataIntegrityViolationException` ở ngoài, hỏi lại trong giao dịch mới.

- [ ] 1.3 **SP-03 — Sticker trong bộ: tải lên có `packId`, đổi tên, chuyển bộ**
  - **Goal:** `StickerService` biết bộ của sticker.
  - **Files:** `sticker/application/{StickerService,StickerChange}`; test.
  - **Acceptance criteria:** delta `custom-stickers` (tải lên vào bộ; bộ của người khác `404 STICKER_PACK_NOT_FOUND`, không ghi gì; đổi tên, chuyển bộ, bỏ khỏi bộ; danh sách có `packId`).
  - **Test:** Testcontainers: tải vào bộ, vào bộ của người khác, chuyển, bỏ khỏi bộ, đổi tên giữ nội dung (cùng `sha256`).
  - **Depends on:** SP-02.
  - **Hints:** **Level 1:** "không gửi `packId`" và "`packId: null`" khác nhau thế nào khi tới dịch vụ? **Level 2:** một kiểu riêng cho thay đổi (giữ nguyên / bỏ / bộ X) thay cho `UUID` có thể `null`.

- [ ] 1.4 **SP-04 — API `/api/sticker-packs`, `PATCH /api/stickers/{id}`, `packId` trong multipart (D-344)**
  - **Goal:** web gọi được mọi lệnh với đúng hợp đồng.
  - **Files:** `sticker/api/{StickerPacksController,StickerPackResponse,StickersController,StickerResponse}`; `apps/sino-api/README.md` (các hàng API); test.
  - **Acceptance criteria:** spec `sticker-packs`, delta `custom-stickers`; `ModularityTests` xanh.
  - **Test:** `MockMvc`: mỗi điểm cuối, mỗi mã lỗi, `400` cho tên trống hay `PATCH` rỗng, `packId` không phải UUID, `401`, thiếu CSRF `403`; `./mvnw -B -ntp test` toàn bộ.
  - **Depends on:** SP-03.
  - **Hints:** **Level 1:** vì sao `PATCH` đọc JSON thành cây mà không thành record? **Level 2:** `JsonNode.has("packId")` cho "có gửi", `isNull()` cho "bỏ khỏi bộ".

## 2. Web

- [ ] 2.1 **SP-05 — Lớp dữ liệu: bộ, chuyển bộ, tải lên có `packId`**
  - **Goal:** hook và request cho mọi lệnh mới, cache không bị lần đọc cũ ghi đè.
  - **Files:** `features/stickers/{stickers.types,stickers.api,useStickers,usePacks}.ts` (+ test), `test/fixtures/stickersApi.ts`, MSW.
  - **Acceptance criteria:** đọc được bộ và sticker có `packId`; tạo, đổi tên, xóa bộ; chuyển sticker; tải lên kèm `packId`; mọi thay đổi vá cache theo cách của `setStickers` (hủy lần đọc đang chạy trước khi vá).
  - **Test:** Vitest + MSW cho từng hook, cả ca lần đọc chạy chéo một thay đổi.
  - **Depends on:** SP-04 (hợp đồng; MSW đứng thay cho tới khi chạy thật).
  - **Hints:** **Level 1:** xóa một bộ thì cache nào phải đổi, ngoài danh sách bộ? **Level 2:** danh sách sticker cũng đổi (`packId` về `null`).

- [ ] 2.2 **SP-06 — Lưới theo bộ và quản lý bộ**
  - **Goal:** màn Sticker chia theo bộ; tạo, đổi tên, xóa bộ; chuyển sticker.
  - **Files:** `features/stickers/{StickersPage,PackSection,PackDialogs,MoveStickerMenu}.tsx` (+ test).
  - **Acceptance criteria:** delta `web-sticker-library` (lưới theo bộ, "Chưa xếp bộ" ở cuối, bộ trống, quản lý bộ, lỗi tiếng Việt, bàn phím).
  - **Test:** Vitest + MSW; Chrome thật 1440 và 390.
  - **Depends on:** SP-05, DN-7.
  - **Hints:** **Level 1:** sau khi xóa bộ, tiêu điểm bàn phím nên về đâu? **Level 2:** như ST-15: về nút của phần kế bên, hết thì về "Tạo bộ".

- [ ] 2.3 **SP-07 — `react-easy-crop`, xuất ảnh đã chỉnh, quyết ảnh nào được cắt (D-345, D-346)**
  - **Goal:** logic thuần của bước chỉnh, test được không cần trình duyệt.
  - **Files:** `package.json`, `pnpm-lock.yaml` (`react-easy-crop`); `features/stickers/editor/{exportSticker,editable}.ts` (+ test).
  - **Acceptance criteria:** spec `sticker-upload-editor` phần xuất (PNG, tối đa 512, không phóng to, thu dưới 1 MB) và phần ảnh động (GIF và WebP động không cắt; JPEG được cắt và thành PNG).
  - **Test:** Vitest với canvas giả: cỡ ra, xoay 90° đổi rộng và cao, thu từng bậc khi trên 1 MB; `editable` trên tệp mẫu thật (`sino-api/src/test/resources/sticker/*`).
  - **Depends on:** DN-2…DN-5.
  - **Hints:** **Level 1:** xoay 90° thì canvas phải rộng bao nhiêu? **Level 2:** đổi rộng và cao, `translate` về giữa rồi `rotate`, rồi mới cắt theo `croppedAreaPixels`.

- [ ] 2.4 **SP-08 — Bước "Thêm sticker": lượt nhiều ảnh, danh sách, thêm và bỏ**
  - **Goal:** chọn hay thả tệp mở bước này thay cho gửi ngay.
  - **Files:** `features/stickers/editor/{AddStickers,useBatch,BatchList}.tsx|ts` (+ test); `StickersPage.tsx`, `DropZone.tsx`, `UploadButton.tsx`.
  - **Acceptance criteria:** spec `sticker-upload-editor` (mở bước, danh sách, ảnh đang chọn, thêm và bỏ, chặn tệp sai loại hay quá lớn tại chỗ); hộp thoại từ 768 px, trang riêng dưới 768 px.
  - **Test:** Vitest; Chrome thật 1440 và 390.
  - **Depends on:** SP-07.
  - **Hints:** **Level 1:** URL xem trước của mỗi ảnh (`URL.createObjectURL`) phải thu hồi lúc nào? **Level 2:** khi ảnh rời lượt và khi đóng bước.

- [ ] 2.5 **SP-09 — Khung chỉnh của một ảnh: cắt, phóng to, xoay, tỉ lệ, tên**
  - **Goal:** chỉnh từng ảnh, giữ phần chỉnh khi chuyển qua lại.
  - **Files:** `features/stickers/editor/{ImageEditor,EditorControls}.tsx` (+ test).
  - **Acceptance criteria:** spec `sticker-upload-editor` (khung vuông mặc định ở giữa, phóng to 1–3, xoay 90°, "Vuông"/"Tự do", ảnh động có ghi chú lưu nguyên, phím mũi tên dời vùng cắt).
  - **Test:** Vitest (trạng thái chỉnh của từng ảnh, điều khiển có tên truy cập); Chrome thật: chuột, cảm ứng giả lập, bàn phím, một ảnh chụp dọc thật (EXIF).
  - **Depends on:** SP-08.
  - **Hints:** **Level 1:** phần chỉnh nên lưu theo gì để không lẫn giữa các ảnh? **Level 2:** theo id của mục trong lượt, không theo vị trí trong danh sách.

- [ ] 2.6 **SP-10 — Lưu lượt: bộ của lượt, bộ mới, gửi lần lượt, ảnh lỗi ở lại (D-347, D-348)**
  - **Goal:** "Lưu N sticker" gửi đúng phần đã chỉnh vào đúng bộ.
  - **Files:** `features/stickers/editor/{PackPicker,useSaveBatch}.tsx|ts`, `useUploadQueue.ts` (+ test).
  - **Acceptance criteria:** spec `sticker-upload-editor` (tên và bộ của lượt, "Bộ mới…" tạo trước, lưu lần lượt, trạng thái từng ảnh, ảnh lỗi ở lại, hỏi khi đóng còn ảnh).
  - **Test:** Vitest + MSW: thứ tự yêu cầu (`POST /api/sticker-packs` rồi các `POST /api/stickers` có `packId`), ảnh thứ hai bị `409`, đóng khi còn ảnh.
  - **Depends on:** SP-09.
  - **Hints:** **Level 1:** tạo bộ mới lỗi (trùng tên) thì có gửi ảnh nào không? **Level 2:** không: báo ở ô chọn bộ, lượt giữ nguyên.

- [ ] 2.7 **SP-11 — Trạng thái, bàn phím, máy tính bảng và điện thoại**
  - **Goal:** bước "Thêm sticker" và lưới theo bộ đúng ở mọi cỡ.
  - **Files:** `features/stickers/**` (kiểu dáng, bố cục).
  - **Acceptance criteria:** không cuộn ngang ở 390 px; vùng chạm 44 px; hộp thoại giữ tiêu điểm và trả tiêu điểm khi đóng.
  - **Test:** Chrome thật 1440 / 1024 / 390, sáng và tối.
  - **Depends on:** SP-06, SP-10.
  - **Hints:** **Level 1:** dưới 768 px, danh sách ảnh và khung chỉnh xếp thế nào? **Level 2:** dải ảnh nhỏ cuộn ngang ở trên, khung chỉnh bên dưới.

- [ ] 2.8 **SP-12 — Kiểm bằng lỗi gài cho logic thuần của màn**
  - **Goal:** test thật sự giữ `exportSticker`, `editable` và phần đổi lỗi mới.
  - **Files:** không đổi mã nếu không lộ hở; test bổ sung nếu có lỗi sống sót.
  - **Acceptance criteria:** mọi lỗi gài bị bắt, hoặc lỗi tương đương được ghi lý do.
  - **Test:** chạy trên bản sao của `apps/sino-web` với lượt đối chứng xanh trước (như ST-16).
  - **Depends on:** SP-11.
  - **Hints:** **Level 1:** lỗi gài nào dễ sống nhất ở hàm thu ảnh? **Level 2:** biên 512 (`>` hay `>=`) và biên 1 MB.

## 3. Nghiệm thu

- [ ] 3.1 **SP-20 — Chạy thật, tài liệu, kết thúc**
  - **Goal:** chứng minh cả luồng với backend thật, ghi lại, archive.
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới) và `.docx` sinh bằng GenOffice; `PROJECT_STATE.md`; `openspec/roadmap.md` (ghi chú ngắn); `tasks.md`.
  - **Acceptance criteria:** web với backend thật: tạo bộ, đổi tên, xóa (sticker về "Chưa xếp bộ"), chọn năm ảnh (PNG, JPEG chụp dọc, WebP tĩnh, GIF động, WebP động), chỉnh ba ảnh tĩnh, lưu vào bộ mới, ảnh trùng ở lại với câu đúng; tệp lưu ra đúng cỡ và đúng vùng; hai theme × ba cỡ; mọi lệnh kiểm tra xanh; `openspec validate sticker-packs --strict` hợp lệ; người dùng đã xem.
  - **Test:** như trên.
  - **Depends on:** SP-12.
  - **Hints:** **Level 1:** mục kiến thức nên trả lời "vì sao khóa ngoại kép", "vì sao cắt ở trình duyệt", "vì sao ảnh động lưu nguyên". **Level 2:** archive sau `custom-stickers` (hai delta sửa spec của change đó): `openspec archive sticker-packs -y`.
