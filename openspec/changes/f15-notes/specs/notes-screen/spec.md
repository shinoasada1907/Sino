## MODIFIED Requirements

### Requirement: Danh sách ghi chú
Trang `/notes` MUST hiện mọi ghi chú theo hai nhóm "ĐÃ GHIM" và "GẦN ĐÂY", trong mỗi nhóm sửa gần nhất trước. Mỗi thẻ MUST có tiêu đề (trống thì dòng đầu của nội dung), giờ sửa (hôm nay "HH:mm", hôm qua "Hôm qua", cũ hơn "dd/MM"), đầu nội dung. Khi ít nhất một ghi chú có neo, mỗi thẻ MUST có nguồn: "Thư · tên", "Tin nhắn · tên", "Cuộc trò chuyện · tên", "Người · tên", "Tin nhắn gốc không còn" hoặc "Ghi chú độc lập"; khi không ghi chú nào có neo, thẻ MUST NOT có dòng nguồn. Thẻ đã ghim MUST có dấu ghim.

#### Scenario: Ghi chú lúc 14:05 thứ Sáu
- **WHEN** người dùng mở `/notes` với dữ liệu mẫu lúc 14:05 ngày 02/10/2026
- **THEN** "ĐÃ GHIM" có "Danh sách mua cho bà" (08:31) rồi "Mã khách hàng phòng khám" (Hôm qua); "GẦN ĐÂY" có "Điều khoản 4 — thời hạn thanh toán" (09:52, "Thư · Trần Minh Anh"), "Hoàng thích nhận file qua Drive" (29/09, "Người · Lê Hoàng"), "Số hợp đồng bảo hiểm" ("Tin nhắn gốc không còn"), "Ý tưởng chuyến đi Đà Lạt tháng 12" ("Ghi chú độc lập")

#### Scenario: Mọi ghi chú đều độc lập
- **WHEN** người dùng mở `/notes` và API trả các ghi chú đều có `anchor` là `null`
- **THEN** không thẻ nào có dòng "Ghi chú độc lập"

### Requirement: Lọc và tìm ghi chú
Trang MUST cho lọc Tất cả, Gắn tin nhắn (có neo), Đã ghim, mỗi chip kèm số ghi chú của nó trên mọi ghi chú; chip "Gắn tin nhắn" MUST chỉ hiện khi ít nhất một ghi chú có neo. Trang MUST cho tìm theo tiêu đề và nội dung, không phân biệt hoa thường và dấu, trong bộ lọc đang chọn. Bộ lọc và từ khóa MUST nằm trong URL (`filter`, `q`). Không có ghi chú nào khớp thì MUST báo "Không có ghi chú nào khớp".

#### Scenario: Tìm không dấu
- **WHEN** người dùng gõ "thanh toan" vào ô tìm
- **THEN** chỉ "Điều khoản 4 — thời hạn thanh toán" còn trong danh sách, và URL có `q=thanh+toan`

#### Scenario: Không ghi chú nào có neo
- **WHEN** API trả các ghi chú đều có `anchor` là `null`
- **THEN** chỉ có hai chip "Tất cả · N" và "Đã ghim · N"

### Requirement: Ô soạn một ghi chú
Chọn một thẻ MUST mở `/notes/{id}`: từ 768 px ở cột phải, dưới 768 px là trang riêng có nút quay lại "Ghi chú" và không có thanh dưới. Ô soạn MUST có: nguồn neo khi ghi chú có neo (chữ "Gắn với …" và chip mở cuộc trò chuyện trong Hộp thư, hoặc "Tin nhắn gốc không còn"), Ghim, Xóa, tiêu đề, đoạn trích chỉ đọc nếu có ("TRÍCH TỪ THƯ · giờ"), nội dung, chip việc liên quan mở `/tasks/{id}` nếu có, chân "Sửa lúc … · tự lưu" và "N / 20.000 ký tự". "Thêm thao tác" MUST NOT hiện khi chưa có thao tác nào. Từ 768 px, `/notes` chưa chọn ghi chú MUST ghi "Chọn một ghi chú để xem".

#### Scenario: Mở ghi chú điều khoản 4
- **WHEN** người dùng chọn "Điều khoản 4 — thời hạn thanh toán" trên dữ liệu mẫu
- **THEN** ô soạn có "Gắn với thư", chip "Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2" trỏ tới `/inbox/conv-1`, đoạn trích "TRÍCH TỪ THƯ · 09:41 HÔM NAY", chip việc "Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2"

#### Scenario: Mở một ghi chú độc lập trên API
- **WHEN** người dùng mở một ghi chú có `anchor` là `null`
- **THEN** ô soạn không có "Gắn với …", không có đoạn trích, không có chip việc, không có "Thêm thao tác"

## ADDED Requirements

### Requirement: Ghi chú lưu trên máy chủ
Danh sách MUST đọc từ `GET /api/notes`; tạo, tự lưu, ghim và xóa MUST gọi API (`POST`, `PATCH` kèm `version` của ghi chú đang mở, `DELETE`), cho cả ghi chú chữ lẫn ghi chú sơ đồ (sơ đồ gửi `kind: "DIAGRAM"` và `diagram`), và tải lại trang MUST thấy đúng những gì đã lưu. Khi danh sách được đọc lại, ô soạn và vùng vẽ MUST NOT thay chữ hay sơ đồ người dùng đang sửa mà chưa lưu.

#### Scenario: Tải lại sau khi sửa
- **WHEN** người dùng sửa nội dung một ghi chú, chân ô soạn đã ghi giờ sửa mới, rồi tải lại trang
- **THEN** ô soạn có nội dung đã sửa

#### Scenario: Tải lại sau khi sửa sơ đồ
- **WHEN** người dùng thêm một khối vào một sơ đồ, dòng tự lưu của sơ đồ báo đã lưu, rồi tải lại trang
- **THEN** vùng vẽ có đủ các khối và đường nối cũ và cả khối mới, mỗi khối ở đúng vị trí

#### Scenario: Sơ đồ mới còn lại sau khi tải lại
- **WHEN** người dùng tạo một sơ đồ mới, vẽ hai khối rồi nối chúng, đợi tự lưu xong và tải lại trang
- **THEN** danh sách có sơ đồ đó (thẻ sơ đồ) và mở ra thấy hai khối đã nối

### Requirement: Ghi chú vừa được sửa ở nơi khác
Khi lưu bị từ chối với `409 CONCURRENT_MODIFICATION`, ô soạn (hoặc vùng vẽ) MUST dừng tự lưu cho ghi chú đó, MUST giữ chữ đang gõ (hoặc sơ đồ đang vẽ), và MUST báo "Ghi chú này vừa được sửa ở nơi khác. Chữ bạn đang gõ chưa được lưu." (với sơ đồ: "Ghi chú này vừa được sửa ở nơi khác. Thay đổi bạn vừa vẽ chưa được lưu.") với "Tải bản mới" (nhận bản của máy chủ) và "Lưu bản của tôi" (lưu chữ đang gõ, hoặc sơ đồ đang vẽ, lên bản mới nhất). Khi lưu bị từ chối với `404 NOTE_NOT_FOUND`, ô soạn (hoặc vùng vẽ) MUST giữ chữ (hoặc sơ đồ) và báo "Ghi chú này đã bị xóa ở nơi khác." với "Lưu thành ghi chú mới".

#### Scenario: Hai tab cùng sửa
- **WHEN** người dùng sửa một ghi chú ở tab A, rồi gõ vào cùng ghi chú đó ở tab B chưa đọc lại
- **THEN** tab B báo "Ghi chú này vừa được sửa ở nơi khác", chữ vừa gõ ở tab B còn nguyên, và nội dung tab A đã lưu không bị ghi đè

#### Scenario: Giữ bản của mình
- **WHEN** ở tab B người dùng bấm "Lưu bản của tôi"
- **THEN** chữ của tab B được lưu, dòng báo biến mất và tự lưu chạy lại

#### Scenario: Hai tab cùng sửa một sơ đồ
- **WHEN** người dùng thêm một khối ở tab A (đã lưu), rồi kéo một khối ở tab B chưa đọc lại
- **THEN** tab B báo "Ghi chú này vừa được sửa ở nơi khác", vùng vẽ tab B giữ nguyên chỗ vừa kéo, và sơ đồ đã lưu của tab A không bị ghi đè

#### Scenario: Tải bản mới của sơ đồ
- **WHEN** ở tab B người dùng bấm "Tải bản mới"
- **THEN** vùng vẽ hiện sơ đồ của máy chủ (có khối mới của tab A), thay đổi chưa lưu của tab B bị bỏ và dòng báo biến mất

### Requirement: Không lưu được thay đổi
Khi tạo, lưu, ghim hay xóa thất bại vì lý do khác (mạng, lỗi máy chủ), màn MUST giữ chữ đang gõ (hoặc sơ đồ đang vẽ), MUST trả ghim / xóa về như cũ, và MUST báo tại chỗ ("Không lưu được thay đổi." kèm "Thử lại" ở ô soạn hoặc vùng vẽ); ghi chú mới không tạo được MUST ở lại `/notes/new` với chữ (hoặc sơ đồ) còn nguyên.

#### Scenario: Mất mạng khi tự lưu
- **WHEN** người dùng ngừng gõ trong lúc máy chủ không trả lời
- **THEN** ô soạn báo "Không lưu được thay đổi." với "Thử lại", chữ còn nguyên, và lần ngừng gõ sau thử lưu lại

#### Scenario: Mất mạng khi tự lưu sơ đồ
- **WHEN** người dùng kéo một khối trong lúc máy chủ không trả lời
- **THEN** vùng vẽ báo "Không lưu được thay đổi." với "Thử lại", sơ đồ trên màn còn nguyên, và "Thử lại" lưu sơ đồ đó lên máy chủ
