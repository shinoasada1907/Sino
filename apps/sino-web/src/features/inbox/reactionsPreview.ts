import type { ReactionKind } from './reactions'

/**
 * Only on the dev server (`vite`, not the tests, not a build), until sino-api sends emoji (zalo-reactions RX-07): a chat
 * whose backend says nothing about emoji gets Zalo's set below, every message takes one, and a pick stays in this
 * browser (it is not sent, and goes with a reload). It lets the UI be seen and tried before the backend exists.
 */
export const REACTIONS_PREVIEW = import.meta.env.MODE === 'development'

const quick = (code: string, emoji: string, label: string): ReactionKind => ({ code, emoji, label, quick: true })
const more = (code: string, emoji: string, label: string): ReactionKind => ({ code, emoji, label, quick: false })

/** Zalo's codes (zca-js `Reactions`), the quick ones in the order of Zalo's own bar; the backend will send this (D-388). */
export const PREVIEW_SET: ReactionKind[] = [
  quick('/-heart', '❤️', 'Tim'),
  quick(':>', '😆', 'Haha'),
  quick(':o', '😮', 'Ngạc nhiên'),
  quick(':-((', '😢', 'Buồn'),
  quick(':-h', '😡', 'Giận'),
  quick('/-strong', '👍', 'Thích'),
  more(":')", '😂', 'Cười ra nước mắt'),
  more(';xx', '😍', 'Mê'),
  more(':-*', '😘', 'Hôn'),
  more(';-)', '😉', 'Nháy mắt'),
  more(';-d', '😁', 'Cười toe'),
  more(':))', '😄', 'Cười lớn'),
  more('x-)', '😎', 'Ngầu'),
  more('8-)', '🤓', 'Mọt sách'),
  more(';-/', '😕', 'Bối rối'),
  more(':--|', '😐', 'Bình thường'),
  more('p-(', '😟', 'Lo lắng'),
  more('--b', '😓', 'Toát mồ hôi'),
  more(':((', '😭', 'Khóc to'),
  more(':-<', '☹️', 'Buồn bã'),
  more('&-(', '😧', 'Đau khổ'),
  more('>-|', '😠', 'Bực'),
  more(':-o', '😯', 'Ồ'),
  more(';-s', '😳', 'Ngượng'),
  more(';-a', '😨', 'Sợ'),
  more(';-x', '🤐', 'Im lặng'),
  more('|-)', '😴', 'Buồn ngủ'),
  more('$-)', '🤑', 'Giàu'),
  more('/-weak', '👎', 'Không thích'),
  more('/-ok', '👌', 'OK'),
  more('/-v', '✌️', 'Chiến thắng'),
  more('/-punch', '👊', 'Đấm'),
  more(':handclap', '👏', 'Vỗ tay'),
  more('_()_', '🙏', 'Cầu xin'),
  more(':-bye', '👋', 'Tạm biệt'),
  more('/-rose', '🌹', 'Hoa hồng'),
  more('/-fade', '🥀', 'Hoa héo'),
  more('/-break', '💔', 'Tim vỡ'),
  more('/-li', '☀️', 'Mặt trời'),
  more('/-bd', '🎂', 'Sinh nhật'),
  more('/-beer', '🍺', 'Bia'),
  more('/-bome', '💣', 'Bom'),
  more('/-shit', '💩', 'Phân'),
]
