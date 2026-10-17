import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { LinkEdge as LinkEdgeType } from './flow'

/** A link (D-207): a soft curve out of the side it leaves and into the side it reaches, an arrow at the end, and its words. */
export function LinkEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd }: EdgeProps<LinkEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={16} />
      {data?.label && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan absolute rounded-xs border bg-surface px-2 py-0.5 text-xs leading-4 whitespace-nowrap text-muted-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
