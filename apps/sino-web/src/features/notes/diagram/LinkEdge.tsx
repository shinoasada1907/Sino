import { BaseEdge, EdgeLabelRenderer, EdgeToolbar, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { useDiagramActions } from './actions'
import { TOOLBAR, TOOLBAR_BUTTON } from './BlockNode'
import { DIAGRAM_LIMITS } from './diagram'
import type { LinkEdge as LinkEdgeType } from './flow'

/**
 * A link (D-207): a soft curve out of the side it leaves and into the side it reaches, an arrow at the end, and its
 * words on the middle of the curve. Clicking the words chooses the link, a double click writes them (Enter or Esc
 * finishes); chosen, a bar above it writes or removes it.
 */
export function LinkEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, selected }: EdgeProps<LinkEdgeType>) {
  const actions = useDiagramActions()
  const editing = actions.editingLink === id
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      field.current?.focus()
      field.current?.select()
    }
  }, [editing])
  const atMiddle = { transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={16} />
      <EdgeLabelRenderer>
        {editing ? (
          <input
            ref={field}
            type="text"
            aria-label="Chữ trên đường nối"
            placeholder="chữ"
            defaultValue={data?.label ?? ''}
            maxLength={DIAGRAM_LIMITS.label}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            onBlur={(event) => actions.finishLink(id, event.currentTarget.value)}
            style={atMiddle}
            className="nodrag nopan pointer-events-auto absolute w-32 rounded-xs border border-foreground bg-surface px-2 py-0.5 text-xs leading-4 text-foreground outline-none placeholder:text-subtle-foreground"
          />
        ) : (
          data?.label && (
            <button
              type="button"
              onClick={() => actions.chooseLink(id)}
              onDoubleClick={() => actions.writeLink(id)}
              style={atMiddle}
              className={cn(
                'nodrag nopan pointer-events-auto absolute cursor-pointer rounded-xs border bg-surface px-2 py-0.5 text-xs leading-4 whitespace-nowrap text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid',
                selected && 'border-border-strong text-foreground',
              )}
            >
              {data.label}
            </button>
          )
        )}
      </EdgeLabelRenderer>
      <EdgeToolbar edgeId={id} x={labelX} y={labelY} alignY="bottom" isVisible={editing ? false : undefined} style={{ marginTop: -16 }}>
        <div role="toolbar" aria-label="Đường nối đang chọn" className={TOOLBAR}>
          <button type="button" onClick={() => actions.writeLink(id)} className={TOOLBAR_BUTTON}>
            Chữ trên đường
          </button>
          <button type="button" onClick={() => actions.removeLink(id)} className={cn(TOOLBAR_BUTTON, 'text-danger-ink')}>
            Xóa đường nối
          </button>
        </div>
      </EdgeToolbar>
    </>
  )
}
