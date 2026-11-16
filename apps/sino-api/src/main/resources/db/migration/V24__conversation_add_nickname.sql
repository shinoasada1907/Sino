-- Biệt danh của một chat 1-1 (zalo-nicknames, D-414, D-416): tách khỏi title, vì title chỉ đổi khi có tin mới hơn và
-- việc xóa biệt danh không được mất tên gốc (DN-2). NULL nghĩa là không có biệt danh. Độ dài được kiểm ở application
-- (D-414): không CHECK ở đây, vì giới hạn thật của Zalo có thể đổi khi NK-01 đọc lại mã zca-js.
ALTER TABLE conversation ADD COLUMN nickname text;
