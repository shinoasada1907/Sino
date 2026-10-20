# Gửi sticker trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-20). Bắt đầu ZS-01 khi người dùng đã chốt DN-1…DN-5 (`design.md`). Mỗi task: test viết trước (đỏ rồi xanh), kiểm chứng, ghi chú thực hiện tại task, commit. Push chỉ khi người dùng bảo.
> **Lệnh kiểm tra.** `apps/sino-zalo`: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`. `apps/sino-api`: `./mvnw -B -ntp test` (Docker cho Testcontainers). `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`.
> **Thứ tự:** phần 1 và 2 không chờ `sticker-packs`; phần 3 cần lớp dữ liệu bộ (`sticker-packs` SP-05).
> **Gợi ý** theo hai mức: **Level 1** (hướng nghĩ), **Level 2** (hướng làm).

## 1. `sino-zalo`

- [x] 1.1 **ZS-01 — `ZaloConnection.sendImage` (D-353)**
  - **Goal:** gửi một ảnh vào chat đôi hoặc nhóm bằng `zca-js`.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `src/sessions/SessionManager.ts`; `test/sendImage.test.ts` (mới).
  - **Acceptance criteria:** spec `zalo-image-send` (gửi vào `USER` và `GROUP`, trả `msgId` của tin ảnh); lỗi của Zalo đổi như `sendText` (bị từ chối / không rõ).
  - **Test:** gateway giả kiểm thân gửi (`attachments` từ buffer, `metadata`), GIF đi đúng nhánh, `msgId` lấy từ `attachment[0]`.
  - **Depends on:** DN-2, DN-3.
  - **Hints:** **Level 1:** `zca-js` trả `msgId` ở đâu khi tin chỉ có ảnh? **Level 2:** `SendMessageResponse.attachment[]`, không phải `message`.
  - **Thực hiện:** `ZaloImage` (`data` là `Buffer`, `fileName` kiểu `${string}.${string}`, rộng, cao) và `ZaloConnection.sendImage`. `ZcaGateway.sendImage` gọi `sendMessage({ msg: "", attachments: [{ data, filename, metadata: { totalSize, width, height } }] })` và lấy `msgId` từ `attachment[0]`. Đã đọc `sendMessage.js` của `zca-js` 2.2.0 thay vì tin vào thiết kế: tin chỉ có ảnh thì `message` là `null`; nhánh GIF được chọn theo **đuôi tên tệp** và đọc cỡ từ `metadata`, nên tên `.gif` và cả ba số phải đi cùng. `sendText` và `sendImage` dùng chung hàm `deliver`: chỉ mã lỗi của Zalo là từ chối (`ZaloRejectedError`), mọi lỗi khác để là chưa rõ, nên "lỗi đổi như `sendText`" là một luật ở một chỗ (sửa nhỏ này không đổi hành vi của `sendText`, các test cũ vẫn xanh). `FakeZaloGateway` ghi ảnh vào `sentImages` riêng và dùng chung `nextSend` với chữ, để ZS-02 thử được từ chối, đứt giữa chừng và giữ chờ. `SessionManager.sendImage` như `sendText`: ném đồng bộ khi không có phiên hay phiên đã chết.
  - **Bằng chứng:** `test/sendImage.test.ts` 11 test viết trước, đỏ cả 11 (chưa có `sendImage`), xanh sau khi cài. `pnpm test` 18 tệp / 270 test, `pnpm lint` thoát 0, `pnpm exec tsc --noEmit` thoát 0; không tệp nào lẫn CRLF/LF. **Chưa kiểm:** gửi thật qua Zalo (ZS-20), kiểm bằng lỗi gài (chưa làm ở task này).

- [x] 1.2 **ZS-02 — Route gửi nhận `image`**
  - **Goal:** `sino-api` gửi được ảnh qua route sẵn có, với mọi bảo đảm của tin chữ.
  - **Files:** `src/messages/sendRoutes.ts`; `test/send.test.ts`.
  - **Acceptance criteria:** spec `zalo-image-send` (base64 sai hay quá 1 MiB là `400`; `SentLog`, 1 tin/giây, thời gian chờ như chữ; không có byte nào trong log).
  - **Test:** Fastify `inject`: các ca trên; log bắt được không chứa `data`.
  - **Depends on:** ZS-01.
  - **Hints:** **Level 1:** `bodyLimit` mặc định của Fastify là bao nhiêu? **Level 2:** 1 MiB; đặt riêng cho route này.
  - **Thực hiện:** `POST /accounts/:accountId/messages` nhận `image { data, fileName, width, height }`; `text` hết bắt buộc. `contentOf` quyết định đây là chữ hay ảnh trước mọi việc khác (nên một yêu cầu hỏng là `400` dù phiên đang ra sao): `INVALID_MESSAGE` khi không có cái nào hoặc có cả hai; `INVALID_IMAGE` khi `data` không phải base64 (chỉ nhận chuỗi mã hoá lại ra đúng chính nó, vì `Buffer.from(..., "base64")` bỏ qua ký tự lạ); `IMAGE_TOO_LARGE` khi quá 1 MiB sau khi giải (chuỗi base64 dài hơn mức tối đa thì không giải). Tên tệp phải khớp `^[^/\\]{1,100}\.(png|gif|webp)$` (không có đường dẫn), rộng và cao là số nguyên 1…16384. Sau đó cùng đường với chữ: `SentLog`, 1 tin/giây, thời gian chờ, `410`/`404`, `422`, `504`. Log chỉ ghi mã, `imageType` và `imageBytes`.
  - **Làm khác kế hoạch (lý do):** (1) **Chữ cùng ảnh bị `400`**, spec chỉ nói chữ được phép rỗng: `zca-js` gửi chữ kèm GIF thành hai tin và trả hai `msgId`, mà không ai cần gửi chữ kèm sticker, nên bỏ cho khỏi mơ hồ. (2) **`413` đổi thành `400`**: spec đòi ảnh 2 MiB giải ra là `400`, nhưng body của nó (khoảng 2,8 MiB) vượt `bodyLimit` 2 MiB của D-353 nên Fastify trả `413` trước khi route đọc được; một `errorHandler` riêng của route đổi `FST_ERR_CTP_BODY_TOO_LARGE` thành `400 PAYLOAD_TOO_LARGE`, lỗi khác chuyển lại cho Fastify (`reply.send(error)`). Giữ `bodyLimit` 2 MiB như D-353 thay vì nâng lên để vừa. (3) **Không ghi tên tệp vào log**: tên có thể là chữ người dùng gõ (spec chỉ cho ghi mã, loại và kích thước). (4) Test nằm ở tệp mới `test/sendPictureRoute.test.ts`, không chèn vào `test/send.test.ts`, để không đụng 300 dòng test chữ đang xanh. **Cho ZS-03:** client Java phải coi `400` của route này là yêu cầu hỏng (không thử lại), với các mã `INVALID_MESSAGE`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `PAYLOAD_TOO_LARGE`.
  - **Bằng chứng:** `test/sendPictureRoute.test.ts` 16 test viết trước, 15 đỏ (test còn lại là chốt chặn "không log gì về ảnh bị từ chối", đúng ngay cả khi chưa cài), xanh sau khi cài; test tên tệp có phép đối chứng (yêu cầu hợp lệ phải `201`) để không xanh vì lý do sai. `pnpm test` 19 tệp / 286 test, `pnpm exec oxlint` thoát 0, `pnpm exec tsc --noEmit` thoát 0, không tệp nào lẫn CRLF/LF. **Kiểm bằng lỗi gài** trên bản sao (không đụng cây thật): baseline 0 đỏ trước và sau, **10/10 lỗi gài bị bắt** (bỏ ánh xạ 413, base64 lỏng, 1 MiB đúng bị từ chối, nhận chữ cùng ảnh, log tên tệp, log byte, gửi ảnh như chữ, bỏ `bodyLimit`, không kiểm tên tệp, không bắt buộc cỡ). Lần chạy đầu của harness báo "10/10" sai vì bản sao hỏng `node_modules` (baseline cũng `-1`); đã thêm chốt baseline và chạy lại. **Chưa kiểm:** Zalo thật (ZS-20).

## 2. `sino-api`

- [x] 2.1 **ZS-03 — `OutgoingImage`, `SEND_IMAGES`, `ZaloProvider` gửi ảnh (D-349)**
  - **Goal:** contract gửi tin mang được ảnh; Zalo gửi được, Gmail từ chối.
  - **Files:** `provider/ProviderCapability`, `provider/spi/{SendMessageCommand,OutgoingImage}`, `provider/infrastructure/zalo/{ZaloProvider,ZaloClient}`, `provider/infrastructure/gmail/GmailProvider` (từ chối ảnh), contract test kit; bảng capability trong design của change.
  - **Acceptance criteria:** delta `provider-contract`.
  - **Test:** `OutgoingImage` tự kiểm (loại, cỡ, rộng/cao dương); WireMock: thân gửi tới `sino-zalo` có `image` base64 đúng; Gmail ném không hỗ trợ; contract test kit có ca ảnh.
  - **Depends on:** ZS-02 (hợp đồng), DN-1.
  - **Hints:** **Level 1:** vì sao không thêm `sendImage` vào `MessageProvider`? **Level 2:** D-349: đường gửi, đối chiếu và lỗi giữ một.
  - **Thực hiện:** `SEND_IMAGES` khai báo ngay sau `SEND_MESSAGES` (thứ tự khai báo là thứ tự lặp, có test). `OutgoingImage` tự kiểm loại, cỡ, rộng và cao, tên tệp phải kết thúc đúng đuôi của loại, sao chép byte vào và ra, `toString` không lộ byte. `SendMessageCommand` thêm `image` (chữ rỗng được khi có ảnh, khi đó thành `null`); hai constructor cũ giữ nguyên nên không chỗ gọi nào phải sửa. `GmailProvider` từ chối lệnh có ảnh trước mọi lời gọi ra ngoài. `ZaloProvider` khai `SEND_IMAGES`, từ chối lệnh có cả chữ lẫn ảnh, và gửi `ImageRequest` (base64 chuẩn, `toString` che `data`) qua đúng route chữ; `SendRequest` và thân đối chiếu bỏ hẳn trường `null` khỏi JSON. Bộ test chung `MessageProviderContractTest` có ba ca ảnh (từ chối khi thiếu capability, gửi được khi có, có `SEND_IMAGES` thì phải có `SEND_MESSAGES`) chạy trên mọi connector; connector giả cũng từ chối ảnh khi thiếu capability.
  - **Làm khác kế hoạch (lý do):** (1) **Đối chiếu một ảnh cần `sino-zalo` sửa thêm**, việc này không nằm ở ZS-03 trong kế hoạch: SPI nói `findSentMessages` nhận *cùng lệnh*, mà lệnh ảnh không có chữ, trong khi route đối chiếu bắt buộc `text`. `text` của `/sent/lookup` thành tuỳ chọn (thiếu thì chỉ `SentLog` nói được), test ở `apps/sino-zalo/test/lookupPicture.test.ts`; `ReplyService.reconcile` thì vẫn dựng lệnh chữ `[Sticker]` từ hàng đã lưu nên không đổi. (2) **Bảng ý nghĩa capability** nằm trong thiết kế F03 đã lưu trữ, nên dòng `SEND_IMAGES` ghi vào `design.md` của change này (D-358, cùng D-357 cho ba chỗ `sino-zalo` chặt hơn D-353). (3) **Từ chối ở connector, không ở chỗ gọi**, đúng chữ của delta `provider-contract`; bộ test chung là thứ giữ cho connector mới không quên. Client Java không cần đổi gì cho mã `400` của `sino-zalo`: nó vốn thành `REQUEST_REJECTED` (chắc chắn chưa gửi), có test cho `INVALID_IMAGE`.
  - **Bằng chứng:** Test viết cùng lượt với mã nên **chưa quan sát được trạng thái đỏ riêng** cho task này; bù bằng **kiểm bằng lỗi gài trên bản sao: 14/14 bị bắt** (bỏ `SEND_IMAGES` khỏi Zalo, Gmail gửi ảnh, `null` trong JSON của gửi và của đối chiếu, chữ cùng ảnh được nhận, byte không sao chép vào và ra, `toString` lộ byte, base64url thay base64, chữ trắng giữ lại, lệnh rỗng được nhận, đúng 1 MiB bị từ chối, tên tệp không kiểm loại, connector giả gửi ảnh khi không có quyền), baseline xanh trước và sau. Byte thử có `+` và `/` sau khi thấy byte `{1,2,3,4}` để lọt base64url. `./mvnw -B -ntp test -Dtest='dev/sino/provider/**/*'` trong bản sao ở scratchpad (không build trong `target` thật): **886 test, 0 lỗi, 11 bỏ qua** (các ca `assume` của bộ test chung). `apps/sino-zalo`: 20 tệp / 292 test, `oxlint` 0, `tsc --noEmit` 0. **Chưa kiểm:** gửi ảnh thật qua Zalo (ZS-20).

- [ ] 2.2 **ZS-04 — Cổng `StickerPictures` của module `sticker` (D-350)**
  - **Goal:** `conversation` đọc được ảnh của một sticker của chủ mà không đụng bảng của module khác.
  - **Files:** `sticker/StickerPictures.java` (+ `package-info` named interface nếu cần), `sticker/application/StickerService`; test; `ModularityTests`.
  - **Acceptance criteria:** sticker của chủ khác hay không có thì rỗng; `ModularityTests` xanh với phụ thuộc `conversation → sticker` qua cổng.
  - **Test:** Testcontainers; `ModularityTests`.
  - **Depends on:** —.
  - **Hints:** **Level 1:** Spring Modulith cho module khác dùng kiểu nào của một module? **Level 2:** kiểu ở package gốc của module, hoặc một named interface.

- [ ] 2.3 **ZS-05 — Gửi sticker qua `POST …/messages` (D-351, D-352, D-356)**
  - **Goal:** gửi sticker như gửi chữ, lưu tin đi đúng, tin vọng lại không thành hai tin.
  - **Files:** `conversation/api/ConversationMessagesController`, `conversation/application/{ReplyService,Replies}`, `conversation/infrastructure/JdbcConversationStore` (nếu cần giữ metadata), `ConversationDetailResponse` (`canSendImages`); test.
  - **Acceptance criteria:** spec `sticker-send`.
  - **Test:** Testcontainers + connector giả: gửi, có cả chữ và sticker `400`, sticker của người khác `404`, Gmail từ chối, gửi lại cùng mã `200` không gửi lần hai, kết quả chưa rõ, tin vọng lại cùng mã giữ `stickerId`.
  - **Depends on:** ZS-03, ZS-04.
  - **Hints:** **Level 1:** khi Zalo đẩy lại tin ảnh của chính mình, dòng nào trong `message` được cập nhật? **Level 2:** tìm theo mã tin ngoài; đọc cách gộp metadata của `JdbcConversationStore` trước khi viết.

- [ ] 2.4 **ZS-06 — README, toàn bộ test backend**
  - **Goal:** tài liệu API và cổng kiểm tra.
  - **Files:** `apps/sino-api/README.md` (hàng `POST …/messages` với `stickerId`), README của `sino-zalo` (route).
  - **Acceptance criteria:** `./mvnw -B -ntp test` xanh; `sino-zalo` `pnpm test` xanh.
  - **Test:** như trên.
  - **Depends on:** ZS-05.
  - **Hints:** **Level 1:** README nói gì về giới hạn 1 MiB và 1 tin/giây? **Level 2:** cả hai, cạnh hàng route.

## 3. Web

- [ ] 3.1 **ZS-07 — Gửi sticker: request, hàng chờ, hiện tin đi (D-352, D-355)**
  - **Goal:** gửi sticker với `clientMessageId`, hiện ngay, gửi lần lượt.
  - **Files:** `features/inbox/**` (api, hook gửi, hàng chờ, hiện tin có `stickerId`), test.
  - **Acceptance criteria:** spec `chat-sticker-picker` phần "Bấm là gửi, tin hiện ngay".
  - **Test:** Vitest + MSW: hiện ngay, đã gửi, lỗi có "Gửi lại" cùng mã và "Bỏ", ba sticker bấm liên tiếp gửi đúng thứ tự từng cái một.
  - **Depends on:** ZS-05 (hợp đồng; MSW đứng thay tới khi chạy thật).
  - **Hints:** **Level 1:** hàng chờ tin chữ hiện có dùng lại được tới đâu? **Level 2:** cùng `clientMessageId` và trạng thái; khác ở thân gửi và cách vẽ tin.

- [ ] 3.2 **ZS-08 — Nút và khung chọn sticker (D-354, D-356)**
  - **Goal:** chọn sticker theo bộ ngay trong khung soạn tin.
  - **Files:** `features/inbox/components/{Composer,StickerPicker}.tsx` (+ test).
  - **Acceptance criteria:** spec `chat-sticker-picker` (nút chỉ khi `canSendImages`, tab theo bộ, thư viện trống, lỗi tải, bàn phím, khung nổi / tấm dưới 768 px).
  - **Test:** Vitest + MSW; Chrome thật 1440 và 390 với MSW đứng thay `sino-api`.
  - **Depends on:** ZS-07, `sticker-packs` SP-05, DN-5.
  - **Hints:** **Level 1:** đi giữa các sticker bằng mũi tên nên dùng mẫu truy cập nào? **Level 2:** roving `tabIndex` trên lưới.

## 4. Nghiệm thu

- [ ] 4.1 **ZS-20 — Chạy thật trên máy người dùng, tài liệu, kết thúc**
  - **Goal:** chứng minh gửi sticker qua Zalo thật, trả lời các câu hỏi của spike.
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới) và `.docx`; `PROJECT_STATE.md`; `tasks.md`.
  - **Acceptance criteria:** từ Sino gửi tới nick Zalo phụ: PNG trong suốt, GIF động, WebP động, vào chat đôi và một nhóm; ghi lại Zalo hiện ra sao (nền, chuyển động, cỡ); tin vọng lại không thành hai tin; gửi lại sau mạng chập chờn không gửi hai lần; mọi lệnh kiểm tra xanh; `openspec validate zalo-send-images --strict` hợp lệ; người dùng đã xem.
  - **Test:** như trên.
  - **Depends on:** ZS-08, DN-4.
  - **Hints:** **Level 1:** làm sao biết Zalo có giữ chuyển động mà không cần đoán? **Level 2:** mở tin trên ứng dụng Zalo của nick nhận và trên `chat.zalo.me`, ghi lại cả hai. Archive sau `custom-stickers`, `sticker-packs` và `zalo-personal`.
