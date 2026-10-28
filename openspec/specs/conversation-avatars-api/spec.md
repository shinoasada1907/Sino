# conversation-avatars-api Specification

## Purpose
`sino-api` lưu ảnh của người tham gia và trả `avatarUrl` của cuộc trò chuyện ở danh sách và chi tiết (D-410, D-411); thư luôn `null`, không cần migration. Thiết kế ở `openspec/changes/archive/2026-10-27-zalo-avatars/design.md`.
## Requirements
### Requirement: Lưu ảnh của người tham gia Zalo
`sino-api` MUST lưu `avatarUrl` của mỗi người tham gia mà `sino-zalo` đưa. Khi một trang sau đưa `null` cho người đã có ảnh, ảnh đã lưu MUST được giữ.

#### Scenario: Trang sau không có ảnh
- **WHEN** một người tham gia đã có ảnh, và trang tin sau đưa người đó với `avatarUrl: null`
- **THEN** `GET /api/conversations/{id}` vẫn trả ảnh cũ của người đó trong `participants`

### Requirement: Ảnh của cuộc trò chuyện trong API
Mỗi cuộc trò chuyện trong `GET /api/conversations` và đầu `GET /api/conversations/{id}` MUST có `avatarUrl`: với chat là ảnh đã lưu của cuộc trò chuyện hoặc `null`; với thư MUST là `null`.

#### Scenario: Chat Zalo có ảnh
- **WHEN** một chat Zalo đã có ảnh lưu từ Zalo
- **THEN** mục của nó trong `GET /api/conversations` có `avatarUrl` là địa chỉ đó

#### Scenario: Thư Gmail
- **WHEN** người dùng mở danh sách có một thư Gmail
- **THEN** mục của thư có `avatarUrl: null`

