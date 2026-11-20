## Mode

**AUTO** (người dùng 2026-11-20: "Duyệt, AUTO", hỏi vì `new_features: TRAINING`; `project-mode.yaml` `task_overrides.zalo-location-card`). **Đề án được duyệt 2026-11-20:** DN-1, DN-2, DN-3, DN-4 đều chọn A. Người dùng nghiệm thu từng task trước khi commit.

## Context

Đọc code ngày 2026-11-20, chưa chạy với Zalo thật.

- **Tin tới được tới đâu.** Listener của zca-js 2.2.0 giao mọi tin, kể cả `chat.location.new` và `chat.recommended`. `sino-zalo` chuyển tiếp cho `sino-api` mà không đọc nội dung. `sino-api` rơi vào nhánh `default` của `ZaloMessageNormalizer.bodyOf`: tin `UNKNOWN`, chữ `[Tin Zalo chưa hỗ trợ]`, `metadata.zaloType` giữ tên loại.
- **Zalo dùng chung một loại tin cho link và danh thiếp.** `chat.recommended` mang cả thẻ link lẫn danh thiếp; zca-js gửi danh thiếp bằng `sendCard` (`msgType: 6`). Phải đo tin thật để biết khóa nào tách được hai trường hợp (thường là `action` trong nội dung, chưa kiểm).
- **Hình dạng chưa từng thấy.** Sino chưa nhận tin vị trí hay danh thiếp nào. Từ zca-js chỉ biết `chat.location.new` có mã client 43. Toạ độ, địa chỉ, tên, avatar, số điện thoại nằm ở khóa nào thì phải đo.
- **Đo đã có sẵn một nửa.** ML-01 của `zalo-media-library` đã thêm log `mediaShape` (chỉ khóa, loại giá trị, host, không có giá trị) cho `chat.recommended`. `chat.location.new` chưa nằm trong `MEASURED_TYPES`.
- **`message.type` có ràng buộc trong DB** (`V8`, `CHECK (type IN (...))`). Thêm loại mới phải có migration.

## Goals / Non-Goals

**Goals:** người khác gửi vị trí hay danh thiếp qua Zalo thì khung chat Sino hiện đúng nội dung, mở được bản đồ; danh sách hội thoại có chữ tóm tắt dễ hiểu thay vì `[Tin Zalo chưa hỗ trợ]`.

**Non-Goals:** xem `proposal.md`.

## Decisions

### DN-1 — Thẻ vị trí hiện thế nào · ~~người dùng chốt A~~ → **người dùng đổi sang C** (2026-11-20)

**Đổi (người dùng 2026-11-20, kèm ảnh Zalo desktop `zalo-desktop-location.png` trong thư mục change: "làm như này đi cho nhanh … đính vị trí và link gg map"):** thẻ vị trí làm như Zalo desktop: **bản đồ Google nhúng** ở trên, nút **"Maps"** mở Google Maps ở tab mới, bên dưới là tên địa điểm (đậm) và địa chỉ, hoặc "Vị trí hiện tại" khi người gửi chia sẻ vị trí của chính họ. **LÝ DO:** người dùng muốn giống Zalo và nhanh; ảnh Zalo desktop thay canvas cho thẻ vị trí. **Đánh đổi chấp nhận:** mỗi lần thẻ hiện ra, trình duyệt gửi toạ độ của tin tới Google, và trang nặng thêm một iframe. Nhúng bằng địa chỉ không cần key (`output=embed`), không phải Maps Embed API chính thức; nếu Google bỏ kiểu nhúng này thì thẻ vẫn còn tên, địa chỉ và nút "Maps" (D-531). Trang Privacy phải nói việc này (ZC-20).

Bảng gốc, giữ để biết vì sao lúc đầu chọn A:

| | A. Địa chỉ + nút "Mở bản đồ" (đề xuất) | B. Ảnh bản đồ tĩnh + nút | C. Bản đồ nhúng (iframe) |
|---|---|---|---|
| Trông ra sao | Icon ghim, tên địa điểm hoặc địa chỉ, toạ độ nhỏ bên dưới; bấm mở Google Maps ở tab mới | Như Zalo điện thoại: ảnh bản đồ nhỏ có ghim | Bản đồ kéo được ngay trong bong bóng |
| Gửi toạ độ ra ngoài | Chỉ khi người dùng bấm | Mỗi lần vẽ tin, tới nhà cung cấp bản đồ (cần API key, có phí) | Mỗi lần vẽ tin, nặng trang |
| Làm | Nhỏ | Thêm key, chính sách quyền riêng tư, giới hạn gọi | Nặng, khó trên điện thoại |

**Đề xuất A:** không gửi vị trí của người khác tới bên thứ ba khi chưa bấm, không cần key. Nếu Zalo giao sẵn ảnh bản đồ trên tên miền của Zalo (ZC-01 đo) thì hiện ảnh đó, vẫn không gọi bên thứ ba.

### DN-2 — Lưu ở `sino-api` thế nào · **người dùng chốt A** (2026-11-20)

| | A. Tin `TEXT` + `metadata` (đề xuất) | B. Thêm `LOCATION`, `CONTACT` vào `MessageType` |
|---|---|---|
| Cách làm | Chữ tóm tắt trong `text_content`; dữ liệu trong `metadata` với khóa trung lập (`locationLat`…, `contactName`…) | Migration sửa `CHECK` của `message.type`, enum mới, xử lý ở mọi chỗ đang `switch` theo loại |
| Được | Không migration; giống cách `zalo-media-library` lưu thẻ link (D-469); tìm kiếm, xem trước, đếm chưa đọc chạy như tin chữ | Loại tin rõ ràng, lọc theo loại dễ |
| Mất | Muốn biết là vị trí phải nhìn `metadata` | Migration và nhiều chỗ phải sửa cho hai loại tin hiếm |

**Đề xuất A.** Gmail không đổi gì.

### DN-3 — Chia `chat.recommended` với `zalo-media-library` · **người dùng chốt A** (2026-11-20)

| | A. Change riêng, cùng buổi đo (đề xuất) | B. Gộp vào `zalo-media-library` |
|---|---|---|
| Cách làm | Change này đọc nhánh danh thiếp, `zalo-media-library` (ML-02) đọc nhánh link. Một buổi quét QR đo được cả hai (ZC-01 cùng ML-01) | Thêm task vào change kia, chưa làm task nào trừ phần log |
| Được | Làm và nghiệm thu được ngay, không chờ kho phương tiện | Một chỗ đọc `chat.recommended` |
| Mất | Hai change cùng sửa `ZcaGateway.ts` và `ZaloMessageNormalizer.java`: phải giao lần lượt, không song song | Change kia vốn đã lớn (7 task, cả canvas); vị trí, danh thiếp phải chờ cùng |

**Đề xuất A.** Kỹ sư làm ML-02 sau phải giữ nhánh danh thiếp của change này.

### DN-4 — Số điện thoại trong danh thiếp · **người dùng chốt A** (2026-11-20)

| | A. Lưu và hiện nếu Zalo giao (đề xuất) | B. Không lưu số điện thoại |
|---|---|---|
| Được | Như Zalo điện thoại; người gửi chủ ý chia sẻ số đó | Ít dữ liệu cá nhân hơn trong DB |
| Mất | Thêm một dữ liệu cá nhân của bên thứ ba trong `metadata` | Danh thiếp chỉ còn tên và avatar |

**Đề xuất A**, với điều kiện: không ghi số điện thoại, toạ độ hay địa chỉ vào log (D-532), và đối chiếu trang Privacy ở ZC-20.

### D-529 — Hợp đồng `sino-zalo` → `sino-api` · agent chốt, ZC-01 xác nhận

`ZaloMessage` có thêm hai trường tùy chọn, theo mẫu `photo`, `file`:

```text
location:    { latitude, longitude, title|null, address|null, previewUrl|null, current }
contactCard: { userId|null, name, avatarUrl|null, phone|null }
```

- Khóa Zalo nào đổ vào trường nào thì ZC-01 đo rồi ghi ở `tasks.md`.
- `latitude` trong [-90, 90], `longitude` trong [-180, 180], đều là số. Sai hay thiếu thì không gửi `location`, tin ở lại dạng giữ chỗ, có log hình dạng.
- `current` (boolean): người gửi chia sẻ vị trí hiện tại của chính họ, không phải một địa điểm, lấy từ `params.isUserLocation` (khác 0). Thêm 2026-11-20 sau khi thấy Zalo desktop hiện "Vị trí của bạn" cho loại này và tên + địa chỉ cho địa điểm (DN-1 đổi sang C). ZC-02 kiểm trên tin thật: tên địa điểm có thể nằm trong `description` cùng địa chỉ (vì `title` trống ở cả hai tin đo được).
- `avatarUrl`, `previewUrl` chỉ giữ khi nằm trên tên miền ảnh của Zalo (`PICTURE_DOMAINS`).
- `chat.recommended` là danh thiếp thì gửi `contactCard`; là link thì giữ nguyên như hôm nay (phần của ML-02).

### D-530 — Lưu ở `sino-api` · agent chốt (theo DN-2 = A)

- Vị trí: `TEXT`, chữ `[Vị trí] <title hoặc address>`, hoặc `[Vị trí]` khi không có cả hai. `metadata`: `locationLat`, `locationLng`, `locationTitle`, `locationAddress`, `locationPreviewUrl`, `locationCurrent`.
- Danh thiếp: `TEXT`, chữ `[Danh thiếp] <name>`. `metadata`: `contactName`, `contactAvatarUrl`, `contactPhone`, `contactUserId`.
- Khóa đặt trong `NormalizedMessage` như `IMAGE_URL`; tên của Zalo không lọt vào lõi.
- `MessageResponse` có thêm `location` và `contactCard`, `null` với mọi tin khác. Thư Gmail không đổi.

### D-531 — Khung chat · agent chốt; thẻ vị trí theo ảnh Zalo desktop (DN-1 = C), thẻ danh thiếp theo canvas (ZC-05)

- ~~Thẻ vị trí: icon ghim, tiêu đề hoặc địa chỉ, toạ độ 5 chữ số thập phân; nút "Mở bản đồ"~~ (**LÝ DO:** DN-1 đổi sang C, người dùng 2026-11-20).
- Thẻ vị trí, theo `zalo-desktop-location.png`:
  - Trên: `<iframe>` bản đồ `https://maps.google.com/maps?q=<lat>,<lng>&z=16&output=embed`, `loading="lazy"`, `referrerpolicy="no-referrer"`, có `title` cho trình đọc màn hình, khung tỉ lệ cố định (khoảng 16:10), bo góc như ảnh trong chat.
  - Góc trên trái của bản đồ: nút "Maps" kèm icon mở tab mới, là link `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, `target="_blank"`, `rel="noopener noreferrer"`.
  - Dưới: tên địa điểm (đậm) và địa chỉ; `current` mà không có tên thì "Vị trí hiện tại"; không có gì thì "Vị trí".
  - iframe không tải được thì tên, địa chỉ và nút "Maps" vẫn dùng được.
  - Màu theo theme Sino (Sunset), không chép màu của Zalo.
- Thẻ danh thiếp: avatar (chữ cái đầu khi không có), tên, số điện thoại nếu có; số điện thoại là link `tel:`. Không có nút "Nhắn tin" trong change này.
- Tên, địa chỉ là chữ của người khác: chỉ hiện dạng chữ.
- Danh sách hội thoại và thông báo dùng chữ tóm tắt của D-530, không cần sửa.

### D-532 — Log · agent chốt

Log của `sino-zalo` và `sino-api` về hai loại tin này MUST NOT chứa toạ độ, địa chỉ, tên, số điện thoại hay địa chỉ ảnh đầy đủ. Được ghi loại tin, tên khóa, loại giá trị, host.

## Risks / Trade-offs

- **Hình dạng tin khác dự đoán** (ví dụ toạ độ là chữ, nằm trong `params` dạng JSON): ZC-01 đo trước, D-529 sửa theo, ghi **LÝ DO** ở task.
- **Zalo không tách được danh thiếp và link một cách chắc chắn**: khi không chắc, giữ chữ giữ chỗ và log hình dạng, không đoán.
- **Hai change cùng sửa một file** (DN-3): giao lần lượt; người làm sau đọc diff của người làm trước.
