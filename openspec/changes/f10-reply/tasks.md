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
  - **Files:** migration V16 (`message.client_message_id` + unique); Gmail `sendMessage` (MIME, `threadId`, header thread), `findSentMessage` (contract, hàm tùy chọn); `conversation` `ReplyService`, `POST`/`DELETE /api/conversations/{id}/messages…`, ghép thư đã gửi khi đồng bộ nhập lại, đối chiếu `UNKNOWN` trong lượt đồng bộ; event cho `realtime` (`source: user`); mã lỗi `SEND_IN_PROGRESS`, `REPLY_NOT_ALLOWED`, `SEND_FAILED`, `SEND_OUTCOME_UNKNOWN`, `MESSAGE_NOT_DELETABLE`; test.
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

- [ ] 2.1 **FE-61 — Trạng thái trả lời và người nhận trên web**
  - **Goal / Why:** ô trả lời chỉ hiện khi gửi được, hiện rõ thư tới ai; dòng báo đúng loại khi chưa gửi được (D-134).
  - **Depends on:** FE-57; Contract API (`reply` trong `GET /api/conversations/{id}`).
  - **Files:** `src/features/inbox/inbox.api.ts` (ánh xạ `reply`), `inbox.types.ts` (`replyTo`), `format.ts` (`sendBlockText`), `components/ThreadNotice.tsx` ("Cấp quyền gửi"), `components/Composer.tsx` (dòng "Tới"), `components/EmailThread.tsx`, test.
  - **Test:** bốn `reply.state` → ô trả lời / ba loại dòng báo; backend không có `reply` → `NOT_SUPPORTED`; dòng "Tới" ở 1440, 1024, 390.
  - **Acceptance criteria:** spec `inbox-reply` (Ô trả lời theo trạng thái trả lời, Ô trả lời hiện người nhận).

- [ ] 2.2 **FE-62 — Gửi trên API: chống trùng, "Gửi lại", "Bỏ", không rõ kết quả**
  - **Goal / Why:** trả lời từ Sino trên API thật; thư lỗi không mất chữ; không gửi trùng (D-131, D-134).
  - **Depends on:** FE-61; Contract API (`POST`, `DELETE`, `clientMessageId` trong danh sách thư).
  - **Files:** `inbox.api.ts` (`sendMessage`, `discardMessage`), `inbox.types.ts` (`clientMessageId`, `UNKNOWN`), `useInbox.ts` (`useSendMessage`: cache danh sách thư, `resend`, `discard`), `format.ts` (`sendState`), `components/EmailThread.tsx` (nút trên thư lỗi, dòng "Chưa rõ"), test.
  - **Test:** design mục Test (web) của F10; kiểm tra lỗi gài một lần cho hàm thuần mới của màn (`sendState`, ánh xạ trạng thái) trước FE-63.
  - **Acceptance criteria:** spec `inbox-reply` (Thư gửi đi và các trạng thái).

- [ ] 2.3 **FE-63 — Chạy với backend thật (sau BE-60)**
  - **Goal / Why:** bằng chứng trả lời từ web vào đúng thread; dòng báo quyền gửi với account cũ; "Cấp quyền gửi" → kết nối lại → ô trả lời hiện.
  - **Depends on:** FE-61, FE-62, BE-58…BE-60.
  - **Test:** **chỉ sau khi người dùng cho phép gửi**; Chrome 1440 và 390; ghi kết quả, không ghi nội dung thư.
  - **Acceptance criteria:** spec `inbox-reply` toàn bộ; DoD (phần web).

## 3. Hoàn tất

- [ ] 3.1 Dồn delta vào `openspec/specs/` và archive (`openspec archive f10-reply -y`), sau `f06-message-history`.
