# Vị trí và danh thiếp trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-11-20: "Duyệt, AUTO"). **Đề án được duyệt 2026-11-20:** DN-1…DN-4 đều chọn A. Đội Sino (`CLAUDE.md`, *Đội Sino*): mỗi task ghi kỹ sư phụ trách; kỹ sư không commit; quản lý nghiệm thu nội bộ, người dùng nghiệm thu, rồi quản lý commit (mỗi task một commit trên `dev`).
> **Thứ tự:** ZC-01 (phần log) trước, rồi người dùng quét QR và gửi thử, cùng buổi với ML-01 của `zalo-media-library` nếu được. Đo xong mới giao ZC-02, rồi ZC-03. ZC-05 (canvas) chạy song song; người dùng duyệt hình trước khi giao ZC-04. ZC-04 sau ZC-03. ZC-20 sau tất cả, có người dùng.
> **File chung với `zalo-media-library`** (DN-3): `ZcaGateway.ts`, `ZaloMessageNormalizer.java`, `MessageResponse`, `ChatThread.tsx`. Không giao hai change cùng lúc cho cùng một app.
> **Mỗi task:** viết code, **test tay trước** cho tới khi chạy đúng, rồi mới viết test tự động kiểm lại đúng hành vi đó. Bằng chứng ghi ngắn ở task: test tay đã làm gì, thấy gì; lệnh và kết quả.
> **Lệnh kiểm tra.** `apps/sino-zalo`: `pnpm lint`, `pnpm typecheck`, `pnpm test`. `apps/sino-api`: `./mvnw test -Dtest=…` cho phần đụng tới, kèm `ModularityTests`, trong worktree riêng khi người dùng đang chạy app. `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.

> **Đổi thứ tự (người dùng 2026-11-20: "trước tiên là với cái vị trí đi xong cái này rồi làm danh thiếp sau"):** ~~ZC-02…ZC-04 làm một lượt cho cả vị trí và danh thiếp~~ → mỗi task làm **phần vị trí** trước, đi hết ZC-02 → ZC-03 → ZC-05 → ZC-04 cho vị trí, rồi mới quay lại làm phần danh thiếp. **LÝ DO:** vị trí đã đo xong, danh thiếp chưa có tin thật; người dùng muốn có vị trí trước. Hợp đồng `contactCard` của D-529 giữ nguyên, chỉ chưa làm.

## 1. Đo trên Zalo thật

- [ ] 1.1 **ZC-01 — `sino-zalo`: log hình dạng, đo tin vị trí và danh thiếp (D-529, D-532)** · `sino-zalo`, có người dùng
  - **Goal:** biết Zalo giao tin vị trí và danh thiếp qua listener thế nào, và khóa nào tách danh thiếp khỏi thẻ link, trước khi viết phần đọc.
  - **Files:** `src/gateway/ZcaGateway.ts` (thêm `chat.location.new` vào `MEASURED_TYPES`; `chat.recommended` đã có từ ML-01); test.
  - **Acceptance criteria:** `tasks.md` ghi cho mỗi loại: `zaloType`, các khóa kể cả trong `params`, loại giá trị, host; bảng khóa Zalo → trường của D-529; khóa nào cho biết `chat.recommended` là danh thiếp; Zalo có giao ảnh bản đồ không (DN-1). Log không có toạ độ, tên, số điện thoại, địa chỉ đầy đủ.
  - **Test:** Vitest cho log với nội dung mẫu, kiểm không có giá trị trong dòng log. Rồi chạy thật: người dùng quét QR; từ nick khác gửi một vị trí có địa chỉ, một vị trí ghim trên bản đồ, một danh thiếp có số điện thoại, một danh thiếp không có, và một link (để so với danh thiếp), ở chat 1-1 và một nhóm nếu được. Người dùng đưa các dòng log "Zalo message" vì agent không đọc được terminal của người dùng. Không mở `chat.zalo.me`.
  - **Đo thật, vị trí (2026-11-20, người dùng quét QR, 2 tin `chat.location.new` ở chat 1-1, 15:01 và 15:03; log do người dùng dán):** `mediaShape` = `title:string(0), description:string(57), href:string(0), thumb:string(0), childnumber:number, action:string(0), params:string(83), type:string(0), params.longitude:string(11), params.latitude:string(10), params.placeId:string(0), params.isUserLocation:number`. Tin tới cả qua listener lẫn catch-up với cùng hình dạng. Bảng khóa cho D-529:
    | Trường `location` | Khóa Zalo | Ghi chú |
    |---|---|---|
    | `latitude`, `longitude` | `params.latitude`, `params.longitude` | **Là chữ, không phải số**: ZC-02 phải đổi sang số rồi mới kiểm khoảng |
    | `address` | `description` | 57 ký tự, có lẽ là địa chỉ; ZC-02 kiểm bằng mắt trên tin thật |
    | `title` | `title` | Trống ở cả hai tin; `params.placeId` cũng trống |
    | `previewUrl` | `thumb` | Trống: **Zalo không giao ảnh bản đồ**, nên thẻ chỉ có chữ và nút (DN-1 = A, không có ảnh) |
    Chưa rõ: `params.isUserLocation` (số) có lẽ phân biệt "vị trí hiện tại" với "địa điểm ghim"; chưa ảnh hưởng tới hợp đồng. **Còn thiếu:** danh thiếp (`chat.recommended`) và một tin trong nhóm, nên ZC-01 chưa tick.
  - **Depends on:** đề án được duyệt; người dùng quét QR.
  - **Thực hiện (phần code, `sino-zalo`, 2026-11-20):** thêm `chat.location.new` vào `MEASURED_TYPES` ở `ZcaGateway.ts` (cập nhật comment). `photoShapeOf` giữ nguyên, đủ dùng: chỉ in tên khóa (kể cả `params.` và một cấp sâu hơn), `number`, `string(độ dài)`, `url(host)`; toạ độ số là `number`, toạ độ chuỗi là `string(n)`, không in giá trị. Tin vị trí còn có `contentShape` (khóa cấp 1, cũng không giá trị) vì không nằm trong `KNOWN_TYPES`. README không liệt kê các loại được đo nên không sửa. Phần đo thật còn chờ người dùng quét QR; chưa tick.
  - **Kiểm chứng (phần code):** test tay bằng script tạm (đã xóa) qua `toZaloMessage` + `SessionManager` + `FakeZaloGateway`: vị trí cá nhân ra `mediaShape: title:string(10),description:string(9),href:url(maps.google.com),params:string(34),params.latitude:number,params.lng:string(5)`; danh thiếp trong nhóm ra `…,params.phone:string(10)`; không có toạ độ, tên, số điện thoại hay địa chỉ trong cả dòng log. Vitest: thêm 5 test vào `test/mediaShape.test.ts` (khóa và loại giá trị, một cấp sâu, không lộ giá trị, nhóm, cả dòng log); `pnpm test` 433/433, `pnpm typecheck` sạch, `pnpm lint` chỉ còn cảnh báo cũ ở `photoSticker.test.ts`. Hai lần sửa test là do tôi: host `zalo.me` được phép hiện, và đếm sai độ dài chuỗi.

## 2. Đọc và lưu tin

- [ ] 2.1 **ZC-02 — `sino-zalo`: đọc vị trí và danh thiếp (D-529)** · `sino-zalo`
  - **Goal:** `ZaloMessage` mang `location`, `contactCard` theo bảng khóa ZC-01.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, README *API so far*; test.
  - **Acceptance criteria:** spec `zalo-location-card-messages`; toạ độ sai hoặc thiếu thì không gửi `location` và có log hình dạng; avatar, ảnh bản đồ ngoài tên miền ảnh của Zalo bị bỏ; thẻ link không có `contactCard`; loại tin khác không đổi. Bỏ `mediaShape` khỏi tin đã đọc được.
  - **Test:** test tay với `buildApp` và `FakeZaloGateway`: tin mẫu đúng từ ZC-01 đi qua `GET /accounts/:id/messages` có đủ trường. Rồi Vitest: đủ khóa, toạ độ là chữ, toạ độ ngoài khoảng, avatar ngoài tên miền, thẻ link.
  - **Depends on:** ZC-01.
  - **Thực hiện (phần vị trí, `sino-zalo`, 2026-11-20):** `ZaloLocation` và trường `location?` ở `ZaloGateway.ts`; `locationOf`, `coordinateOf`, `textOf` ở `ZcaGateway.ts`; README *API so far* có đoạn mới. Hợp đồng chốt: `location: { latitude: number, longitude: number, title: string|null (≤200 ký tự), address: string|null (≤300, từ `description`), previewUrl: string|null (từ `thumb`) }`, chỉ có trên `chat.location.new` đọc được. Toạ độ nhận số hoặc chữ thập phân thuần (`^-?\d{1,3}(\.\d{1,15})?$` sau khi trim), nằm trong [-90,90] / [-180,180]; chữ rỗng, `1e2`, `10,7`, `NaN`, thiếu, `params` hỏng thì không có `location`, tin giữ `text: null` và `mediaShape` (đã bỏ `contentShape` và `mediaShape` khi đọc được). `previewUrl` chỉ kiểm là địa chỉ `http(s)://` (như ảnh); **tên miền do sino-api lọc theo `PICTURE_DOMAINS`** vì danh sách chỉ có ở `ZaloMessageNormalizer` (ZC-03), sino-zalo không chép lại. `params.isUserLocation` bỏ. `rawContent` (có sẵn từ zalo-quote-reply) vẫn mang nguyên nội dung, gồm toạ độ, trong dữ liệu trả cho sino-api; không vào log. Đổi mẫu `LOCATION` của test ZC-01 sang vĩ độ ngoài khoảng để nó vẫn là tin chưa đọc được.
  - **Bổ sung (quản lý, 2026-11-20): `current`.** `location` có thêm `current: boolean` = `params.isUserLocation` là số khác 0 (thiếu, bằng 0, chữ, null, boolean thì `false`). `title` trống thì `null` và `address` = `description` nguyên văn (cắt 300), không đoán tách tên và địa chỉ. **Cần kiểm trên tin thật ở ZC-03:** ảnh Zalo desktop hiện "Heyman Coffee" + địa chỉ trong khi `title` trống ở log đo, nên tên có thể nằm trong `description` (có thể cách bằng xuống dòng) hoặc ở khóa khác. Test thêm: `isUserLocation` 1, 2, 0, thiếu, chữ, null, true; `description` nhiều dòng. `pnpm test` 446/446, typecheck và lint sạch.
  - **Kiểm chứng (phần vị trí):** test tay qua `buildApp` + `FakeZaloGateway`, tin mẫu đúng hình dạng đo thật (`latitude` "10.7769", `longitude` "106.70098", `description` có chữ, `title` và `thumb` trống): `GET /accounts/a1/messages` ra `location: {"latitude":10.7769,"longitude":106.70098,"title":null,"address":"Số 1 Đường A, Quận 1, TP.HCM","previewUrl":null}`, không có `mediaShape`. Vitest: `test/location.test.ts` (đọc đủ khóa, số và chữ, biên ±90/±180, cắt chữ, thumb không phải web, 15 kiểu toạ độ sai, params hỏng, nhóm, loại tin khác, qua GET, log không lộ giá trị); `pnpm test` 444/444, `pnpm typecheck` sạch, `pnpm lint` không cảnh báo ở file đã đổi. **CHƯA KIỂM CHỨNG:** tin vị trí thật qua code mới (cần người dùng gửi lại); `title` khi Zalo có giao tên chỗ; phần danh thiếp chưa làm nên chưa tick.

- [ ] 2.2 **ZC-03 — `sino-api`: lưu và trả vị trí, danh thiếp (D-530)** · `sino-api`
  - **Goal:** tin vị trí và danh thiếp lưu đúng chữ tóm tắt và `metadata`; lịch sử tin trả `location`, `contactCard`.
  - **Files:** `provider/spi/NormalizedMessage.java`, `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`, `conversation/{InboxMessage,MessageHistory}.java`, `conversation/api/MessageResponse.java`, README *Endpoints available today*; test, `ModularityTests`.
  - **Acceptance criteria:** spec `zalo-location-card-messages`; không có migration; thư Gmail và các loại tin Zalo khác trả như cũ (`location`, `contactCard` là `null`); log không có giá trị (D-532).
  - **Test:** test tay: gọi webhook của `sino-zalo` vào `sino-api` với tin mẫu từ ZC-01 (trên bản sao DB, không phải DB `sino` của người dùng), rồi `GET /api/conversations/{id}/messages` thấy đủ trường, danh sách hội thoại thấy chữ tóm tắt. Rồi test tự động cho chuẩn hóa và API.
  - **Depends on:** ZC-02 (hợp đồng chốt).
  - **Thực hiện (phần vị trí, `sino-api`, 2026-11-20):** `ZaloClient.Location` + trường `location` ở `Message` (giữ constructor 18 tham số cũ); `ZaloMessageNormalizer.locationBody` cho `chat.location.new`: kiểm lại vĩ độ/kinh độ hữu hạn và trong khoảng, sai/thiếu thì giữ `UNKNOWN` `[Tin Zalo chưa hỗ trợ]`; ngược lại `TEXT` `[Vị trí] <title hoặc address>` (khoảng trắng và xuống dòng gộp thành một dấu cách trong chữ, `metadata` giữ nguyên), cắt title 200 / address 300; `previewUrl` chỉ giữ trên `PICTURE_DOMAINS`. Khóa `locationLat/Lng/Title/Address/PreviewUrl/Current` ở `NormalizedMessage`. `InboxMessage.Location` (đặt sau `image`), `MessageHistory` đọc 6 khóa từ `metadata` (tọa độ không đọc được thành số thì `location` null), `MessageResponse.location`. Không migration. Quyết định nhỏ (agent): tin vị trí vẫn lưu `rawContent` dù là `TEXT`, để không mất khả năng trích dẫn mà tin này có trước đây (khi còn `UNKNOWN`). Log chỉ nói "tọa độ không được chấp nhận" và host của ảnh, không giá trị (D-532). README *Endpoints available today*: trường `location`.
  - **Kiểm chứng (phần vị trí):** test tay trên bản sao DB `sino_zc03` (pg_dump của `sino`, Gmail để `AUTH_EXPIRED`, không Google), sino-api từ worktree ở 8091, dịch vụ sino-zalo giả (node, 8190) trả 6 tin: `POST /api/accounts/{id}/sync` kéo tin vào; `GET /api/conversations/{id}/messages` ra `"[Vị trí] Heyman Coffee"` + `location {"latitude":10.7769,"longitude":106.70098,"title":"Heyman Coffee","address":"12 Nguyễn Huệ,\nQuận 1, TP.HCM","previewUrl":"https://zalo-api.zadn.vn/map.png","current":false}`; tin chỉ có địa chỉ ra `[Vị trí] Hồ Hoàn Kiếm, Hà Nội`, `current:true`, `previewUrl:null` (ảnh `evil.example.com` bị bỏ); không có title/address ra `[Vị trí]`; vĩ độ 95 và tin không có `location` ra `[Tin Zalo chưa hỗ trợ]` + `location:null`; tin chữ thường `location:null`. Log chỉ có hai dòng cảnh báo không giá trị. Test tự động: `./mvnw test -Dtest=ZaloLocationTests,ConversationMessagesApiTests,ConversationsApiTests,ZaloMessageNormalizerTests,ZaloPhotoTests,ZaloQuoteTests,ZaloErrorMappingTests,ModularityTests` xanh, 209 test (mới: 14 ở `ZaloLocationTests`, 2 ở `ConversationMessagesApiTests`, 1 ở `ConversationsApiTests` cho snippet). **Lệch brief:** phải dùng khóa mã hóa thật `SINO_CREDENTIAL_KEY_K1` cho bản sao (khóa giả thì sync dừng ở giải mã token); Zalo chỉ nối tới server giả. **CHƯA KIỂM CHỨNG:** tin vị trí thật của Zalo qua sino-zalo ZC-02 thật; phần danh thiếp chưa làm nên không tick.

## 3. Giao diện

- [ ] 3.1 **ZC-05 — Canvas: thẻ vị trí và thẻ danh thiếp (DN-1, D-531)** · quản lý
  - ~~Thẻ vị trí vẽ trên canvas trước khi giao ZC-04~~ → **phần vị trí không chờ canvas**: hình mẫu là `zalo-desktop-location.png` (bản đồ nhúng, nút "Maps", tên và địa chỉ), màu theo theme Sino. **LÝ DO:** người dùng 2026-11-20 chọn làm giống Zalo desktop "cho nhanh" (DN-1 đổi sang C). Canvas chỉ còn vẽ thẻ danh thiếp; thẻ vị trí đưa vào canvas sau khi ZC-04 xong để canvas vẫn khớp với web.
  - **Goal:** hình của hai thẻ trong khung chat, cả tin đến và tin trong nhóm, desktop và 390, sáng và tối.
  - **Files:** canvas "Sino UI", bản sao `design/sino-ui/project/`.
  - **Acceptance criteria:** người dùng duyệt trên link.
  - **Depends on:** DN-1 chốt.

- [ ] 3.2 **ZC-04 — Web: vẽ thẻ vị trí và danh thiếp trong khung chat (D-531)** · `sino-web`
  - **Goal:** khung chat hiện hai thẻ theo canvas.
  - **Files:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/ChatThread.tsx`, `components/LocationCard.tsx`, `components/ContactCard.tsx`; test.
  - **Acceptance criteria:** spec `chat-location-card-ui`; link bản đồ có `rel="noopener noreferrer"`; không gọi dịch vụ bản đồ khi chưa bấm; khớp canvas.
  - **Test:** test tay trên Chrome thật ở desktop và 390, với dữ liệu thật từ ZC-03. Rồi Vitest: đủ trường, thiếu địa chỉ, thiếu avatar, tên có HTML.
  - **Depends on:** ZC-03, ZC-05; không có thay đổi chưa commit của người khác trong `ChatThread.tsx` hoặc người dùng đã quyết.

## 4. Kết thúc

- [ ] 4.1 **ZC-20 — Chạy thật với Zalo, tài liệu, kết thúc** · quản lý, có người dùng
  - **Goal:** chứng minh trên Zalo thật, ghi lại, archive.
  - **Acceptance criteria:** từ nick khác gửi vị trí và danh thiếp tới tài khoản của người dùng: khung chat hiện đúng, "Mở bản đồ" mở đúng chỗ, danh sách hội thoại có chữ tóm tắt; thẻ link vẫn như trước. Đối chiếu trang Privacy về số điện thoại và vị trí (DN-4).
  - **Files:** `docs/knowledge/` (mục mới từ phần Kiến thức của các kỹ sư) và `.docx` sinh lại, `genoffice docs check`; `PROJECT_STATE.md`; `openspec archive zalo-location-card -y`.
  - **Test:** mọi lệnh kiểm tra của ba app xanh; `openspec validate zalo-location-card --strict` hợp lệ; người dùng đã xem.
  - **Depends on:** ZC-01…ZC-05.
