## ADDED Requirements

### Requirement: Account đã tắt không được gọi
`ProviderAccess` MUST NOT gọi connector cho một account `DISABLED` (D-12: người dùng tắt account, không đồng bộ) và MUST ném lỗi mã `ACCOUNT_DISABLED`; account vẫn giữ nguyên trạng thái và credential.

#### Scenario: Gọi một account đã tắt
- **WHEN** một module gọi `ProviderAccess.call` cho một account `DISABLED`
- **THEN** lời gọi thất bại với mã `ACCOUNT_DISABLED` và connector không được gọi
