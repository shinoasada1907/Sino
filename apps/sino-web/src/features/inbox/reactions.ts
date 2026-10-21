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
