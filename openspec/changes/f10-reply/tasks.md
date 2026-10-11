# F10 — Trả lời trong cuộc trò chuyện · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng 2026-10-10 chọn "Trả lời trong thread" rồi giao toàn quyền chốt ("tự xử hết luôn đi"): D-130…D-134 trong design là agent chốt theo ủy quyền.
> Change dùng chung: phiên web (sino-web-33) làm mục 2; phiên backend (sino-api-ec) nhận mục 1 sau F06 và được sửa task của mình khi nhận.
> **Gửi thư thật thay người dùng chỉ khi người dùng cho phép rõ ràng**, tới địa chỉ người dùng chọn (BE-60, FE-63).

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, kiểm tra ngược, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [ ] 1.1 **BE-58 — Quyền gửi, capability theo account, trạng thái trả lời**
  - **Goal / Why:** account biết mình gửi được không; web biết hiện ô trả lời hay dòng báo, và thư sẽ tới ai (D-130, D-133).
  - **Depends on:** F06 BE-54 (người nhận lưu khi nhập; thêm `replyTo` ở task này nếu BE-54 chưa có).
  - **Files:** Gmail `OAuth2Connection` (+ `gmail.send`, scope gửi do connector khai báo), luồng kết nối (`include_granted_scopes=true`); `account` (capability theo scope đã cấp); `conversation` (`reply` trong `GET /api/conversations/{id}`, quy tắc người nhận); Gmail lưu `Reply-To`; test.
  - **Test:** kết nối có/không `gmail.send` → capability; kết nối lại cấp thêm; `reply.state` bốn giá trị; người nhận: `Reply-To`, `From`, chỉ có thư đi, thư cũ không có `Reply-To`.
  - **Acceptance criteria:** delta `connected-accounts`; spec `reply` (Trạng thái trả lời, Người nhận của thư trả lời).

- [ ] 1.2 **BE-59 — Gửi thư trả lời qua Gmail, chống trùng, kết quả không rõ, bỏ thư lỗi**
  - **Goal / Why:** trả lời từ Sino vào đúng thread, không bao giờ gửi trùng (D-131, D-132, D-133).
  - **Depends on:** BE-58.
  - **Files:** migration ~~V16~~ V17 (`message.client_message_id` + unique; V14–V16 là của F06); Gmail `sendMessage` (MIME, `threadId`, header thread), `findSentMessage` (contract, hàm tùy chọn); `conversation` `ReplyService`, `POST`/`DELETE /api/conversations/{id}/messages…`, ghép thư đã gửi khi đồng bộ nhập lại, đối chiếu `UNKNOWN` trong lượt đồng bộ; event cho `realtime` (`source: user`); mã lỗi `SEND_IN_PROGRESS`, `REPLY_NOT_ALLOWED`, `SEND_FAILED`, `SEND_OUTCOME_UNKNOWN`, `MESSAGE_NOT_DELETABLE`; test.
  - **Hướng làm:** design mục Backend design 4–6 và bảng kết quả của Contract API. Provider gọi ngoài transaction.
  - **Test:** design mục Testing (backend). **Kiểm trên Gmail thật** (cùng BE-60): Gmail có giữ `Message-ID` do Sino đặt không; ghi kết quả vào design D-132.
  - **Acceptance criteria:** spec `reply` (Gửi thư trả lời, Không gửi trùng, Gửi lỗi và kết quả không rõ, Bỏ thư gửi lỗi, Danh sách thư có `clientMessageId`).
  - **Hints:** Level 1 — "vì sao phải ghi dòng `PENDING` trước khi gọi Gmail, mà không ghi sau khi Gmail trả lời?".

- [ ] 1.3 **BE-60 — Chạy thật, README**
  - **Goal / Why:** bằng chứng một lần trả lời thật vào đúng thread ở cả hai phía.
  - **Depends on:** BE-58, BE-59; người dùng thêm `gmail.send` trong Google Cloud Console (nếu cần) và kết nối lại Gmail.
  - **Test:** **chỉ sau khi người dùng cho phép**, gửi một thư trả lời tới địa chỉ người dùng chọn; xác nhận thư nằm trong thread trên Gmail; gọi lại cùng `clientMessageId` không gửi lần hai.
  - **Acceptance criteria:** DoD (phần backend).

## 2. Web — phiên web (sino-web-33)

> Mode HYBRID, frontend AUTO. Mỗi task: test đỏ trước rồi xanh, `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`, Chrome một lượt ở cỡ màn task đụng tới, file kiến thức Phase 1 + `.docx`, commit riêng trên `dev`. Làm theo Contract API trong design (contract-first), sau FE-57 của F06.

- [x] 2.1 **FE-61 — Trạng thái trả lời và người nhận trên web**
  - **Thực hiện (2026-10-10, AUTO):** `fetchConversation` đọc `reply` (vắng ở backend trước F10): `canSend` (`READY` → `true`, `NEEDS_PERMISSION`/`ACCOUNT_UNAVAILABLE` → `false`, `NOT_SUPPORTED`/vắng → `null`), `replyTo`; `ConversationDetail.replyTo`, kiểu `Recipient`. `format.ts`: `recipientsText`, câu chữ mới của `sendBlockText` (D-134). `ThreadNotice`: nút "Cấp quyền gửi". `Composer`: prop `to`, dòng "Tới …" phía trên ô soạn ở mọi cỡ màn (điện thoại: hàng `flex-wrap`, dòng `w-full order-first`).
  - **Làm khác kế hoạch:** dòng "Tới" xuống dòng thay vì cắt. **LÝ DO:** Chrome ở 1440 và 390 cho thấy hai người nhận bị cắt mất người thứ hai. Giới hạn đã biết: `ACCOUNT_UNAVAILABLE` mà danh sách tài khoản trên web còn ghi `CONNECTED` (chưa kịp đọc lại) thì hiện dòng báo quyền gửi thay cho "Kết nối lại"; cả hai nút đều mở cùng luồng kết nối lại.
  - **Kiểm chứng (2026-10-10):** RED 11 (câu chữ cũ ở 4 test được đổi theo D-134; `recipientsText`; ánh xạ `reply`; 4/5 test màn), GREEN; test "Kết nối lại" xanh từ đầu (hành vi có sẵn). Test dòng "Tới" sửa một lần vì chữ nằm ở hai phần tử. `pnpm lint` 0, `tsc -b` 0, `vitest` 514/514, `pnpm build` 0. Chrome (API do CDP trả, hai người nhận): dòng "Tới" nằm trên ô soạn ở 1440 tối, 1024 sáng, 390 sáng (ở 390 nằm riêng một dòng), không cắt, không tràn ngang; `NEEDS_PERMISSION` ở 1440: dòng báo với "Trả lời trong Gmail" và "Cấp quyền gửi".
  - **Goal / Why:** ô trả lời chỉ hiện khi gửi được, hiện rõ thư tới ai; dòng báo đúng loại khi chưa gửi được (D-134).
  - **Depends on:** FE-57; Contract API (`reply` trong `GET /api/conversations/{id}`).
  - **Files:** `src/features/inbox/inbox.api.ts` (ánh xạ `reply`), `inbox.types.ts` (`replyTo`), `format.ts` (`sendBlockText`), `components/ThreadNotice.tsx` ("Cấp quyền gửi"), `components/Composer.tsx` (dòng "Tới"), `components/EmailThread.tsx`, test.
  - **Test:** bốn `reply.state` → ô trả lời / ba loại dòng báo; backend không có `reply` → `NOT_SUPPORTED`; dòng "Tới" ở 1440, 1024, 390.
  - **Acceptance criteria:** spec `inbox-reply` (Ô trả lời theo trạng thái trả lời, Ô trả lời hiện người nhận).

- [x] 2.2 **FE-62 — Gửi trên API: chống trùng, "Gửi lại", "Bỏ", không rõ kết quả**
  - **Thực hiện (2026-10-10, AUTO):** `inbox.api.ts`: `sendMessage(id, text, clientMessageId)` (`POST`), `discardMessage` (`DELETE`), `clientMessageId` và `UNKNOWN` trong ánh xạ thư. `useInbox.ts`: `outboxKey`; `useSendMessage` trả `send`, `resend` (cùng ID), `discard`; lỗi: `SEND_FAILED` → "Không gửi được" (ghi `messageId` của server, `local: false`), `SEND_OUTCOME_UNKNOWN` → `UNKNOWN`, `REPLY_NOT_ALLOWED` → đọc lại chi tiết (`exact`), `SEND_IN_PROGRESS` → giữ "Đang gửi" và đọc lại danh sách; xong → đọc lại danh sách. `useConversation` ghép hộp thư đi bằng `withOutbox` (`format.ts`). `EmailThread`: "Gửi lại", "Bỏ" trên thư lỗi; dòng "Chưa rõ đã gửi chưa · Sino đang kiểm tra với Gmail."; dòng gập của thư lỗi ghi "Không gửi được". Bản `sendMessage` giả cho dữ liệu mẫu chuyển vào `test/inboxSampleApi.ts`.
  - **Làm khác kế hoạch:**
    - ~~thêm thư "Đang gửi" vào cache danh sách thư (F06)~~ → hộp thư đi riêng `['outbox', id]`, ghép theo `clientMessageId`. **LÝ DO:** mỗi lần realtime đọc lại danh sách thư sẽ xóa thư chưa tới server cùng chữ đã gõ (spec: "Chữ của thư gửi lỗi MUST NOT mất"); test "giữ qua một lần đọc lại" chứng minh.
    - Trạng thái "Chưa rõ đã gửi chưa" nằm dưới nội dung, không nằm cạnh giờ; dòng gập của thư lỗi ghi "Không gửi được". **LÝ DO:** Chrome ở 1440 cho thấy nhãn dài ép tên người gửi còn một ký tự; thư lỗi bị thư mới gập lại thì mất dấu.
    - Không có test riêng cho mất mạng trên API: hook dùng chung với màn dữ liệu mẫu, test "giữ hộp thư khi ngoại tuyến rồi gửi khi có mạng" (`InboxStates.test.tsx`) đã phủ.
  - **Kiểm chứng (2026-10-10):** RED 14 (gọi `sendMessage` có thêm ID ở 3 test cũ; `withOutbox` 3; `sendState` `UNKNOWN`; hook 2; màn 6), GREEN. Kiểm tra lỗi gài (15 lỗi cho `withOutbox`, `sendState`, ánh xạ trạng thái, xử lý lỗi của `useSendMessage`): lần 1 bắt 11; 4 sống sót vì thiếu test (ánh xạ `PENDING`/`UNKNOWN`, `409 SEND_IN_PROGRESS`, gửi lại sinh bản thứ hai khi lần trước mất mạng, không đọc lại danh sách sau khi gửi) → thêm test, lần 2 bắt cả 4 (15/15). `pnpm lint` 0, `tsc -b` 0, `vitest` 527/527, `pnpm build` 0. Chrome (API do CDP trả) 1440 tối và 390 sáng: gửi xong; `502` → "Không gửi được" + "Gửi lại" + "Bỏ"; `504` → dòng "Chưa rõ…"; mỗi POST có UUID riêng; không tràn ngang; lỗi bố cục ở 1440 tìm được và sửa như trên.
  - **Goal / Why:** trả lời từ Sino trên API thật; thư lỗi không mất chữ; không gửi trùng (D-131, D-134).
  - **Depends on:** FE-61; Contract API (`POST`, `DELETE`, `clientMessageId` trong danh sách thư).
  - **Files:** `inbox.api.ts` (`sendMessage`, `discardMessage`), `inbox.types.ts` (`clientMessageId`, `UNKNOWN`), `useInbox.ts` (`useSendMessage`: cache danh sách thư, `resend`, `discard`), `format.ts` (`sendState`), `components/EmailThread.tsx` (nút trên thư lỗi, dòng "Chưa rõ"), test.
  - **Test:** design mục Test (web) của F10; kiểm tra lỗi gài một lần cho hàm thuần mới của màn (`sendState`, ánh xạ trạng thái) trước FE-63.
  - **Acceptance criteria:** spec `inbox-reply` (Thư gửi đi và các trạng thái).

  - **Sau review (2026-10-10, agent `senior-reviewer`):** HIGH đã sửa: `409 SEND_IN_PROGRESS` làm thư kẹt "Đang gửi" vì bản ở hộp thư đi luôn đứng thay bản của server → bản ở hộp thư đi chỉ đứng thay khi bản server là `FAILED` (đang gửi lại), và sau mỗi lần gửi (mọi kết quả) web đọc lại danh sách rồi bỏ thư khỏi hộp thư đi khi server đã có (chỉ với lần thử mới nhất của thư đó). MEDIUM đã sửa: (1) không đọc lại danh sách sau khi gửi lỗi → `onSettled` luôn đọc lại; (2) lỗi mạng giữa chừng bị coi là "Không gửi được", có thể làm người dùng gửi lại từ Gmail thành hai thư → "Chưa rõ đã gửi chưa · Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần." kèm "Gửi lại" (cùng ID) và "Bỏ"; (3) danh sách thư lỗi mà ô soạn vẫn hiện thì thư gửi đi không hiện ở đâu → ẩn ô soạn khi danh sách lỗi; (4) "Bỏ" bị server từ chối thì im lặng → `useMutation` riêng, hủy lần đọc đang chạy trước, báo "Không bỏ được thư này. Hãy thử lại." trên thư đó. LOW đã sửa: trạng thái `reply` lạ → `canSend` `null`; dòng gập ghi cả "Chưa rõ đã gửi chưa". LOW ghi nhận, chưa sửa: mỗi sự kiện đọc lại tuần tự mọi trang thư đã tải, trong lúc đó "Xem thư cũ hơn" bị bỏ qua (`cancelRefetch: false`). Test: 7 mới, 3 đổi (lỗi mạng giờ là "Chưa rõ"). `pnpm lint` 0, `tsc -b` 0, `vitest` 538/538, `pnpm build` 0.

- [ ] 2.3 **FE-63 — Chạy với backend thật (sau BE-60)**
  - **Goal / Why:** bằng chứng trả lời từ web vào đúng thread; dòng báo quyền gửi với account cũ; "Cấp quyền gửi" → kết nối lại → ô trả lời hiện.
  - **Depends on:** FE-61, FE-62, BE-58…BE-60.
  - **Test:** **chỉ sau khi người dùng cho phép gửi**; Chrome 1440 và 390; ghi kết quả, không ghi nội dung thư.
  - **Acceptance criteria:** spec `inbox-reply` toàn bộ; DoD (phần web).

## 3. Hoàn tất

- [ ] 3.1 Dồn delta vào `openspec/specs/` và archive (`openspec archive f10-reply -y`), sau `f06-message-history`.
