## Why

Mọi thứ trong Sino Messages bắt đầu từ một **connected account**: một tài khoản cụ thể trên một provider (ví dụ "Gmail cá nhân #1") thuộc về người dùng Sino. FR-01 yêu cầu nhiều account, lưu provider/external ID/tên/trạng thái, reconnect/disable/remove, và không lưu token dạng plain text. 04A giới hạn F02 ở "domain, status, credential boundary, persistence/API contract đủ để provider auth gắn vào sau" — tức phải có chỗ lưu account và credential an toàn **trước** khi F04 làm luồng OAuth của Gmail.

## What Changes

- Người dùng sở hữu (`app_user`) và cách xác định "người dùng hiện tại" cho MVP một người dùng (vị trí module theo **Decision D-10**).
- Aggregate `ConnectedAccount` với vòng đời trạng thái rõ ràng (tập trạng thái theo **Decision D-12**) và ràng buộc duy nhất `(owner, provider, external_account_id)`.
- Credential tách bảng riêng (`account_credential`, 1–1 với account), **mã hóa ở tầng ứng dụng** (thuật toán và quản lý khóa theo **Decision D-11**), không bao giờ xuất hiện trong API, event hay log.
- Use case nội bộ "đăng ký kết nối" (tạo mới hoặc reconnect idempotent) để luồng connect của F04 gọi vào.
- REST API: `GET /api/accounts`, `GET /api/accounts/{id}`, `PATCH /api/accounts/{id}`, `DELETE /api/accounts/{id}` (ngữ nghĩa xóa theo **Decision D-13**).
- Event nội bộ: `AccountConnected`, `AccountStatusChanged`, `AccountRemoved` (chưa có listener; F07 dùng).
- Flyway V2–V4: `app_user`, `connected_account`, `account_credential` (bổ sung cột so với 02B theo **Decision D-14**).

## Capabilities

### New Capabilities
- `account-owner`: người dùng sở hữu account, cách xác định người dùng hiện tại và cô lập dữ liệu theo chủ sở hữu.
- `connected-accounts`: mô hình connected account, vòng đời trạng thái, đăng ký/reconnect, REST API xem/sửa/xóa và event.
- `account-credentials`: lưu credential tách biệt, mã hóa at rest, quản lý khóa, chống lộ secret.

### Modified Capabilities
<!-- Không có. F02 dùng convention của F01 (error model, security) và bổ sung code lỗi vào catalog. -->

## Impact

- Code: `apps/sino-api/src/main/java/dev/sino/account/**`, có thể thêm `dev/sino/identity/**` (D-10); test tương ứng.
- DB: migration V2, V3, V4.
- API: 4 endpoint dưới `/api/accounts`.
- Cấu hình: thêm biến môi trường cho owner và khóa mã hóa (`SINO_OWNER_*`, `SINO_CREDENTIAL_*`); key cho test nằm trong `application-test.yaml` (khóa giả, không phải secret).
- Phụ thuộc: F01; `ProviderType` + `ProviderRegistry` của F03 (thứ tự theo D-01).
- Không thêm dependency Maven (mã hóa dùng JCA có sẵn trong JDK).

## Non-goals

- Không có luồng connect/OAuth thật (authorization URL, callback, đổi code, kiểm tra `state`) — F04, cùng connector Gmail. Endpoint `POST /api/accounts/.../connect` chưa có.
- Không refresh/rotate token tự động và không có job mã hóa lại dữ liệu khi đổi khóa (D-15, F04+). F02 chỉ chuẩn bị `key_id` để rotation làm được.
- Không revoke token phía provider khi xóa account (cần connector — F04).
- Không sync, không `POST /api/accounts/{id}/sync`, không cập nhật `last_synced_at` (F07).
- Không login thật/đa người dùng; không phân quyền theo vai trò.
- Không có conversation/message nên chưa quyết định giữ hay xóa lịch sử tin nhắn khi xóa account (quyết định sản phẩm ở F05, 02B §12).
