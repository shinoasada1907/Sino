import { Handle, NodeToolbar, Position, useConnection, useInternalNode, type NodeProps } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import type { Side } from '../notes.types'
import { useDiagramActions } from './actions'
import { BLOCK_COLORS, BLOCK_FILL, COLOR_NAMES, SWATCH } from './blockColors'
import { DIAGRAM_LIMITS } from './diagram'
import type { BlockNode as BlockNodeType } from './flow'

const SIDES: [Side, Position, string][] = [
  ['TOP', Position.Top, 'trên'],
  ['RIGHT', Position.Right, 'phải'],
  ['BOTTOM', Position.Bottom, 'dưới'],
  ['LEFT', Position.Left, 'trái'],
]

export const TOOLBAR = 'nodrag nopan flex items-center gap-1 rounded-sm bg-surface p-1 shadow-popover'
export const TOOLBAR_BUTTON =
  'h-6.5 pointer-coarse:h-9 cursor-pointer rounded-xs px-2 text-xs leading-4 font-medium text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid'

/**
 * A block of the diagram (the prototype's `.block`): its words, or "Khối mới" while it has none; bold for a main block;
 * a dot on each side to draw a link from, shown on hover, on the chosen block and while a link is being drawn (D-207).
 * Written in place: Enter or Esc finishes, Shift Enter starts a new line. Chosen alone, a bar above it sets its colour,
 * writes it or removes it.
 */
export function BlockNode({ id, data, selected, dragging }: NodeProps<BlockNodeType>) {
  const actions = useDiagramActions()
  const connecting = useConnection((connection) => connection.inProgress)
  const editing = actions.editing === id
  // React Flow hides a block until it has measured it, and a hidden field cannot take the cursor.
  const shown = useInternalNode(id)?.measured.width !== undefined
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing && shown) {
      field.current?.focus()
      field.current?.select()
    }
  }, [editing, shown])

  return (
    <div
      data-color={data.color}
      className={cn(
        'group relative w-max max-w-55 min-w-30 rounded-xl border px-3.5 py-3 text-sm leading-5 whitespace-pre-wrap text-foreground shadow-[0_1px_0_var(--border)] wrap-anywhere',
        BLOCK_FILL[data.color],
        data.main && 'font-semibold',
        (selected || editing) && 'outline-2 outline-offset-2 outline-ring outline-solid',
      )}
    >
      {editing ? (
        <textarea
          ref={field}
          aria-label="Chữ của khối"
          placeholder="Khối mới"
          defaultValue={data.text}
          maxLength={DIAGRAM_LIMITS.text}
          rows={1}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => actions.finishBlock(id, event.currentTarget.value)}
          className="nodrag nopan nowheel block max-w-48 min-w-23 resize-none bg-transparent p-0 [font:inherit] text-foreground outline-none field-sizing-content placeholder:text-subtle-foreground"
        />
      ) : (
        data.text || <span className="text-subtle-foreground">Khối mới</span>
      )}
      {SIDES.map(([side, position, name]) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={position}
          aria-label={`Nối từ cạnh ${name}`}
          className={cn(
            'size-3.5 pointer-coarse:size-5 min-h-0 min-w-0 rounded-full border-2 border-surface bg-foreground opacity-0 transition-[opacity,scale] duration-(--dur-fast) ease-out group-hover:opacity-100 hover:scale-125',
            (selected || connecting) && 'opacity-100',
          )}
        />
      ))}
      <NodeToolbar isVisible={editing || dragging ? false : undefined} role="toolbar" aria-label="Khối đang chọn" className={TOOLBAR}>
        {BLOCK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Màu ${COLOR_NAMES[color]}`}
            aria-pressed={data.color === color}
            onClick={() => actions.colorBlock(id, color)}
            className={cn(
              'size-4.5 pointer-coarse:size-7 cursor-pointer rounded-full border border-border-strong outline-none aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ring aria-pressed:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid',
              SWATCH[color],
            )}
          />
        ))}
        <span aria-hidden="true" className="mx-0.5 h-4.5 w-px bg-border" />
        <button type="button" onClick={() => actions.writeBlock(id)} className={TOOLBAR_BUTTON}>
          Sửa chữ
        </button>
        <button type="button" onClick={() => actions.removeBlock(id)} className={cn(TOOLBAR_BUTTON, 'text-danger-ink')}>
          Xóa khối
        </button>
      </NodeToolbar>
    </div>
  )
}
