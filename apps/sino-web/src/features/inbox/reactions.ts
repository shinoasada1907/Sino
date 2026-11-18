/**
 * Emoji reactions on chat messages (zalo-reactions, D-387): what a message carries, what the provider lets the user
 * drop, and the pure steps the bubble and its optimistic update need.
 */

/** One emoji on a message: who dropped it, `mine` when the user did; the user is named "Bạn" in `names`. */
export interface Reaction {
  /** The provider's own code, such as Zalo's `/-heart`; what the API is sent back. */
  code: string
  emoji: string
  count: number
  mine: boolean
  names: string[]
}

/** An emoji the provider lets the user drop; `quick` ones are on the bar, the rest behind "+". */
export interface ReactionKind {
  code: string
  emoji: string
  label: string
  quick: boolean
}

export const SELF_NAME = 'Bạn'

/**
 * Standard Zalo reaction set (zalo-reactions, D-388): 6 quick reactions in Zalo's order, followed by extended set.
 */
export const DEFAULT_REACTION_SET: ReactionKind[] = [
  { code: '/-heart', emoji: '❤️', label: 'Tim', quick: true },
  { code: ':>', emoji: '😆', label: 'Haha', quick: true },
  { code: ':o', emoji: '😮', label: 'Ngạc nhiên', quick: true },
  { code: ':-((', emoji: '😢', label: 'Buồn', quick: true },
  { code: ':-h', emoji: '😡', label: 'Giận', quick: true },
  { code: '/-strong', emoji: '👍', label: 'Thích', quick: true },
  { code: '/-weak', emoji: '👎', label: 'Không thích', quick: false },
  { code: ':-*', emoji: '😘', label: 'Hôn', quick: false },
  { code: ":')", emoji: '😂', label: 'Cười ra nước mắt', quick: false },
  { code: ':))', emoji: '🤣', label: 'Cười lớn', quick: false },
  { code: ';-d', emoji: '😁', label: 'Cười tươi', quick: false },
  { code: ';-)', emoji: '😉', label: 'Nháy mắt', quick: false },
  { code: ';xx', emoji: '🥰', label: 'Yêu thích', quick: false },
  { code: '/-loveu', emoji: '🤟', label: 'Yêu bạn', quick: false },
  { code: '/-break', emoji: '💔', label: 'Tim vỡ', quick: false },
  { code: ':((', emoji: '😭', label: 'Khóc', quick: false },
  { code: 'p-(', emoji: '😔', label: 'Buồn bã', quick: false },
  { code: '>-|', emoji: '😠', label: 'Bực', quick: false },
  { code: ';-/', emoji: '😕', label: 'Bối rối', quick: false },
  { code: ':--|', emoji: '😐', label: 'Bình thường', quick: false },
  { code: '|-)', emoji: '😴', label: 'Buồn ngủ', quick: false },
  { code: ':wipe', emoji: '😅', label: 'Lau mồ hôi', quick: false },
  { code: 'b-)', emoji: '😎', label: 'Kính râm', quick: false },
  { code: '8-)', emoji: '🤓', label: 'Mọt sách', quick: false },
  { code: '$-)', emoji: '🤑', label: 'Tiền', quick: false },
  { code: ':handclap', emoji: '👏', label: 'Vỗ tay', quick: false },
  { code: '/-ok', emoji: '👌', label: 'OK', quick: false },
  { code: '/-v', emoji: '✌️', label: 'Chiến thắng', quick: false },
  { code: '_()_', emoji: '🙏', label: 'Cầu nguyện', quick: false },
  { code: '/-punch', emoji: '👊', label: 'Đấm', quick: false },
  { code: '/-no', emoji: '🙅', label: 'Không', quick: false },
  { code: ':-bye', emoji: '👋', label: 'Tạm biệt', quick: false },
  { code: '/-rose', emoji: '🌹', label: 'Hoa hồng', quick: false },
  { code: '/-li', emoji: '☀️', label: 'Mặt trời', quick: false },
  { code: '/-bd', emoji: '🎂', label: 'Sinh nhật', quick: false },
  { code: '/-bome', emoji: '💣', label: 'Bom', quick: false },
  { code: '/-beer', emoji: '🍺', label: 'Bia', quick: false },
  { code: '/-shit', emoji: '💩', label: 'Phân', quick: false },
]

/** At most this many different emoji show on the chip; the count is of every person. */
export const CHIP_EMOJI = 3

/** The user's own emoji on a message, or null. */
export const mineOf = (reactions: readonly Reaction[]): string | null => reactions.find((reaction) => reaction.mine)?.code ?? null

/** The reactions without the user's own one. */
export function withoutMine(reactions: readonly Reaction[]): Reaction[] {
  return reactions
    .map((reaction) =>
      reaction.mine ? { ...reaction, count: reaction.count - 1, mine: false, names: reaction.names.filter((name) => name !== SELF_NAME) } : reaction,
    )
    .filter((reaction) => reaction.count > 0)
}

/**
 * The reactions as they will be once the user picks `kind` (D-391): the user's emoji becomes `kind`, or goes when it
 * already was `kind`. Most people first, as the server orders them; a tie keeps its place.
 */
export function afterPick(reactions: readonly Reaction[], kind: ReactionKind): Reaction[] {
  const removing = mineOf(reactions) === kind.code
  const rest = withoutMine(reactions)
  if (removing) {
    return rest
  }
  const existing = rest.find((reaction) => reaction.code === kind.code)
  const next = existing
    ? rest.map((reaction) => (reaction === existing ? { ...reaction, count: reaction.count + 1, mine: true, names: [...reaction.names, SELF_NAME] } : reaction))
    : [...rest, { code: kind.code, emoji: kind.emoji, count: 1, mine: true, names: [SELF_NAME] }]
  return next.map((reaction, at) => ({ reaction, at })).sort((a, b) => b.reaction.count - a.reaction.count || a.at - b.at).map(({ reaction }) => reaction)
}

/** Everyone who reacted, once each. */
export const peopleOf = (reactions: readonly Reaction[]) => reactions.reduce((total, reaction) => total + reaction.count, 0)

/** What a screen reader says of the chip: "3 người đã thả biểu cảm: Tim 2, Haha 1". */
export function chipLabel(reactions: readonly Reaction[], kinds: readonly ReactionKind[]): string {
  const parts = reactions.map((reaction) => `${kinds.find((kind) => kind.code === reaction.code)?.label ?? reaction.emoji} ${reaction.count}`)
  return `${peopleOf(reactions)} người đã thả biểu cảm: ${parts.join(', ')}`
}
