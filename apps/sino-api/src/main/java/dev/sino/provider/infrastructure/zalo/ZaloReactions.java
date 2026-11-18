package dev.sino.provider.infrastructure.zalo;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import dev.sino.provider.spi.ReactionKind;

/**
 * The reactions Zalo offers, as codes of zca-js's {@code Reactions} enum with the emoji and the Vietnamese label Sino
 * shows (zalo-reactions, D-388). The first six are the quick ones, in the order of Zalo's own bar. Only codes with a
 * clear emoji are here; a code Zalo sends that is not listed still shows on a message, but cannot be chosen. The
 * pictures are to be checked against Zalo's own on a real run (RX-20).
 */
final class ZaloReactions {

    static final List<ReactionKind> SET = List.of(
            kind("/-heart", "❤️", "Tim", true),
            kind(":>", "😆", "Haha", true),
            kind(":o", "😮", "Ngạc nhiên", true),
            kind(":-((", "😢", "Buồn", true),
            kind(":-h", "😡", "Giận", true),
            kind("/-strong", "👍", "Thích", true),
            kind("/-weak", "👎", "Không thích", false),
            kind(":-*", "😘", "Hôn", false),
            kind(":')", "😂", "Cười ra nước mắt", false),
            kind(":))", "🤣", "Cười lớn", false),
            kind(";-d", "😁", "Cười tươi", false),
            kind(";-)", "😉", "Nháy mắt", false),
            kind(";xx", "🥰", "Yêu thích", false),
            kind("/-loveu", "🤟", "Yêu bạn", false),
            kind("/-break", "💔", "Tim vỡ", false),
            kind(":((", "😭", "Khóc", false),
            kind("p-(", "😔", "Buồn bã", false),
            kind(">-|", "😠", "Bực", false),
            kind(";-/", "😕", "Bối rối", false),
            kind(":--|", "😐", "Bình thường", false),
            kind("|-)", "😴", "Buồn ngủ", false),
            kind(":wipe", "😅", "Lắu mồ hôi", false),
            kind("b-)", "😎", "Kính râm", false),
            kind("8-)", "🤓", "Mọt sách", false),
            kind("$-)", "🤑", "Tiền", false),
            kind(":handclap", "👏", "Vỗ tay", false),
            kind("/-ok", "👌", "OK", false),
            kind("/-v", "✌️", "Chiến thắng", false),
            kind("_()_", "🙏", "Cầu nguyện", false),
            kind("/-punch", "👊", "Đấm", false),
            kind("/-no", "🙅", "Không", false),
            kind(":-bye", "👋", "Tạm biệt", false),
            kind("/-rose", "🌹", "Hoa hồng", false),
            kind("/-li", "☀️", "Mặt trời", false),
            kind("/-bd", "🎂", "Sinh nhật", false),
            kind("/-bome", "💣", "Bom", false),
            kind("/-beer", "🍺", "Bia", false),
            kind("/-shit", "💩", "Phân", false));

    private static final Set<String> CODES = codesOf(SET);

    private ZaloReactions() {
    }

    /** True when {@code code} is one the user can choose. */
    static boolean offers(String code) {
        return CODES.contains(code);
    }

    private static ReactionKind kind(String code, String emoji, String label, boolean quick) {
        return new ReactionKind(code, emoji, label, quick);
    }

    private static Set<String> codesOf(List<ReactionKind> kinds) {
        Set<String> codes = new HashSet<>();
        for (ReactionKind kind : kinds) {
            if (!codes.add(kind.code())) {
                throw new IllegalStateException("Reaction code listed twice: " + kind.code());
            }
        }
        return Set.copyOf(codes);
    }

}
