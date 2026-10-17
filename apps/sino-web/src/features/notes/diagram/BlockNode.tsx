import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { BlockColor, Side } from '../notes.types'
import type { BlockNode as BlockNodeType } from './flow'

const SIDES: [Side, Position][] = [
  ['TOP', Position.Top],
  ['RIGHT', Position.Right],
  ['BOTTOM', Position.Bottom],
  ['LEFT', Position.Left],
]

/** The five colours of a block (D-207): a tint of the canvas tokens, and a blue of its own (`--block-blue`). */
const COLORS: Record<BlockColor, string> = {
  DEFAULT: 'border-border-strong bg-surface',
  YELLOW: 'border-warning bg-[color-mix(in_srgb,var(--warning)_var(--block-tint),var(--surface))]',
  GREEN: 'border-success bg-[color-mix(in_srgb,var(--success)_var(--block-tint),var(--surface))]',
  RED: 'border-danger bg-[color-mix(in_srgb,var(--danger)_var(--block-tint),var(--surface))]',
  BLUE: 'border-(--block-blue) bg-[color-mix(in_srgb,var(--block-blue)_var(--block-tint),var(--surface))]',
}

/**
 * A block of the diagram (the prototype's `.block`): its words, or "Khối mới" while it has none; bold for a main block;
 * a dot on each side to draw a link from, shown on hover, on the chosen block and while a link is being drawn.
 */
export function BlockNode({ data, selected }: NodeProps<BlockNodeType>) {
  const connecting = useConnection((connection) => connection.inProgress)
  return (
    <div
      data-color={data.color}
      className={cn(
        'group relative w-max max-w-55 min-w-30 rounded-xl border px-3.5 py-3 text-sm leading-5 whitespace-pre-wrap text-foreground shadow-[0_1px_0_var(--border)] [overflow-wrap:anywhere]',
        COLORS[data.color],
        data.main && 'font-semibold',
        selected && 'outline-2 outline-offset-2 outline-ring outline-solid',
      )}
    >
      {data.text || <span className="text-subtle-foreground">Khối mới</span>}
      {SIDES.map(([side, position]) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={position}
          aria-label={`Nối từ cạnh ${SIDE_NAMES[side]}`}
          className={cn(
            'size-3.5 min-h-0 min-w-0 rounded-full border-2 border-surface bg-foreground opacity-0 transition-[opacity,scale] duration-(--dur-fast) ease-out group-hover:opacity-100 hover:scale-125',
            (selected || connecting) && 'opacity-100',
          )}
        />
      ))}
    </div>
  )
}

const SIDE_NAMES: Record<Side, string> = { TOP: 'trên', RIGHT: 'phải', BOTTOM: 'dưới', LEFT: 'trái' }
