## ADDED Requirements

### Requirement: Batch sync mang biểu cảm
Batch của `fetchUpdates` MUST có danh sách biểu cảm, rỗng khi không có. Mỗi biểu cảm MUST mang external ID của conversation và của tin đích, external ID của người thả, có phải chính account không, mã biểu cảm của provider (rỗng là gỡ) và lúc thả. Connector không có `REACTIONS` MUST trả danh sách biểu cảm rỗng. Một biểu cảm có external ID rỗng hay mã quá 64 ký tự MUST bị từ chối khi tạo, như mọi dữ liệu chuẩn hóa.

#### Scenario: Batch chỉ có một biểu cảm
- **WHEN** sau cursor chỉ có một lần thả biểu cảm lên một tin
- **THEN** batch không có tin nào và có một biểu cảm mang external ID của tin đích

#### Scenario: Connector không có `REACTIONS`
- **WHEN** connector Gmail trả một batch
- **THEN** danh sách biểu cảm của batch rỗng

### Requirement: Contract thả biểu cảm
Connector có `REACTIONS` MUST trả từ `reactionSet()` ít nhất một biểu cảm (mã, emoji, nhãn, có thuộc nhóm nhanh không), và `react(context, command)` MUST thả biểu cảm có mã trong `command` lên tin đích, hoặc gỡ biểu cảm của account khi mã rỗng. `command` MUST mang external ID và loại của conversation, external ID và metadata của tin đích. Connector không có `REACTIONS` MUST trả `reactionSet()` rỗng và `react` MUST ném lỗi chuẩn hóa không hỗ trợ mà không gọi provider. Mã không có trong `reactionSet()` MUST bị từ chối trước mọi lời gọi ra ngoài.

#### Scenario: Thả qua connector có `REACTIONS`
- **WHEN** connector Zalo nhận lệnh thả `/-heart` lên một tin có `cliMsgId` trong metadata
- **THEN** connector gọi `sino-zalo` một lần và không ném lỗi

#### Scenario: Connector không có `REACTIONS`
- **WHEN** một lệnh thả biểu cảm tới connector Gmail
- **THEN** connector ném lỗi không hỗ trợ và provider không nhận yêu cầu nào
