package dev.sino.provider;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

// Giải thích:
// - record = class chỉ để chứa dữ liệu, không đổi được sau khi tạo. Java tự sinh constructor,
//   hàm values() để đọc field, và equals/hashCode/toString.
// - Set<ProviderCapability> = "tập hợp, mỗi phần tử là một ProviderCapability". Set không chứa phần tử trùng.
// - Class này trả lời câu hỏi "provider X làm được gì?", ví dụ Gmail = {READ_MESSAGES, SEND_MESSAGES, THREADS}.
/**
 * The capabilities one provider supports. Immutable: the set is copied on creation and cannot be changed
 * afterwards. Iteration follows the declaration order of {@link ProviderCapability}.
 */
public record ProviderCapabilities(Set<ProviderCapability> values) {

    // Compact constructor: chạy MỖI LẦN tạo object, TRƯỚC khi giá trị được lưu vào field.
    // Đây là chỗ kiểm tra và làm sạch dữ liệu, nhờ vậy không thể tạo ra một object sai.
    public ProviderCapabilities {
        // Truyền null → ném NullPointerException ngay, kèm thông báo rõ ràng.
        Objects.requireNonNull(values, "values must not be null");
        // Tạo một tập RỖNG của riêng mình. EnumSet là Set dành riêng cho enum:
        // nhanh, và luôn duyệt theo thứ tự khai báo trong ProviderCapability.
        // Không dùng EnumSet.copyOf(values): nó ném lỗi khi values rỗng.
        EnumSet<ProviderCapability> copy = EnumSet.noneOf(ProviderCapability.class);
        // Bản sao phòng thủ: chép mọi phần tử sang tập của mình, để người gọi sửa Set của họ
        // sau này cũng không làm object này đổi theo.
        copy.addAll(values);
        // Gói thành chỉ-đọc rồi gán lại THAM SỐ values (Java tự lưu vào field ở cuối constructor).
        // Nhờ vậy caps.values().add(...) sẽ ném UnsupportedOperationException.
        values = Collections.unmodifiableSet(copy);
    }

    // Static factory: cách tạo object ngắn gọn, ví dụ ProviderCapabilities.of(READ_MESSAGES, THREADS).
    // - static = gọi qua tên class, không cần có object trước.
    // - ProviderCapability... (varargs) = truyền 0, 1 hay nhiều giá trị; bên trong method là một mảng.
    public static ProviderCapabilities of(ProviderCapability... capabilities) {
        // Tạo tập rỗng rồi thêm mọi phần tử của mảng vào. Phần tử trùng tự bị bỏ, vì Set không chứa trùng.
        // Không dùng Set.of(...): nó ném lỗi khi có phần tử trùng.
        EnumSet<ProviderCapability> set = EnumSet.noneOf(ProviderCapability.class);
        Collections.addAll(set, capabilities);
        // Gọi constructor ở trên, nên mọi kiểm tra và bản sao đều đi qua một chỗ duy nhất.
        return new ProviderCapabilities(set);
    }

    // Provider có hỗ trợ capability này không? Trả về true/false.
    // Ví dụ: trước khi gửi tin, F10 sẽ gọi capabilities.supports(SEND_MESSAGES).
    public boolean supports(ProviderCapability capability) {
        return values.contains(capability);
    }

    // Giống supports, nhưng không hỗ trợ thì NÉM LỖI thay vì trả false.
    // Dùng ở chỗ "bắt buộc phải hỗ trợ mới được làm tiếp".
    public void require(ProviderCapability capability) {
        // "!" = phủ định: nếu KHÔNG hỗ trợ thì ném lỗi.
        if (!supports(capability)) {
            // Replaced by ProviderException(CAPABILITY_NOT_SUPPORTED) in BE-22.
            throw new UnsupportedOperationException("Provider does not support " + capability);
        }
    }

}
