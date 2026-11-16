import type { BlockColor } from '../notes.types'

/** The five colours of a block, in the order the bar and the menu show them (D-207). */
export const BLOCK_COLORS: BlockColor[] = ['DEFAULT', 'YELLOW', 'GREEN', 'RED', 'BLUE']

/** "Màu vàng", "Khối vàng". */
export const COLOR_NAMES: Record<BlockColor, string> = { DEFAULT: 'mặc định', YELLOW: 'vàng', GREEN: 'xanh lá', RED: 'đỏ', BLUE: 'xanh dương' }

/** A block: a tint of a canvas token over the surface, and the token as its border; the blue is the canvas's own. */
export const BLOCK_FILL: Record<BlockColor, string> = {
  DEFAULT: 'border-border-strong bg-surface',
  YELLOW: 'border-warning bg-[color-mix(in_srgb,var(--warning)_var(--block-tint),var(--surface))]',
  GREEN: 'border-success bg-[color-mix(in_srgb,var(--success)_var(--block-tint),var(--surface))]',
  RED: 'border-danger bg-[color-mix(in_srgb,var(--danger)_var(--block-tint),var(--surface))]',
  BLUE: 'border-(--block-blue) bg-[color-mix(in_srgb,var(--block-blue)_var(--block-tint),var(--surface))]',
}

/** A colour dot of the bar, a swatch of the menu. */
export const SWATCH: Record<BlockColor, string> = {
  DEFAULT: 'bg-surface',
  YELLOW: 'bg-warning',
  GREEN: 'bg-success',
  RED: 'bg-danger',
  BLUE: 'bg-(--block-blue)',
}
