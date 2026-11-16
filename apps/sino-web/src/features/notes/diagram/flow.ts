// A diagram as React Flow draws it (D-208): a block is a node, a link an edge between the handles named by its sides.
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { BlockColor, Diagram } from '../notes.types'

export type BlockNodeData = { text: string; color: BlockColor; main: boolean }
export type BlockNode = Node<BlockNodeData, 'block'>
export type LinkEdgeData = { label: string | null }
export type LinkEdge = Edge<LinkEdgeData, 'link'>

/** "Vừa màn hình", and how a diagram opens (D-210): every block in view, never larger than 100 %. */
export const FIT_VIEW = { padding: 0.2, maxZoom: 1 }

/**
 * The nodes of a diagram. What React Flow knows of a node it already drew (its size, whether it is chosen) is kept, so
 * the diagram stays the one truth without React Flow measuring every block again; `select` chooses a new block alone.
 */
export function nodesOf(diagram: Diagram, previous: BlockNode[] = [], select?: string): BlockNode[] {
  const known = new Map(previous.map((node) => [node.id, node]))
  const chooseNew = select !== undefined && !known.has(select)
  return diagram.blocks.map((block) => {
    const node = known.get(block.id)
    return {
      ...node,
      id: block.id,
      type: 'block',
      position: { x: block.x, y: block.y },
      data: { text: block.text, color: block.color, main: block.main },
      ...(chooseNew ? { selected: block.id === select } : {}),
    }
  })
}

export function edgesOf(diagram: Diagram, previous: LinkEdge[] = []): LinkEdge[] {
  const known = new Map(previous.map((edge) => [edge.id, edge]))
  return diagram.links.map((link) => ({
    ...known.get(link.id),
    id: link.id,
    type: 'link',
    source: link.from,
    sourceHandle: link.fromSide,
    target: link.to,
    targetHandle: link.toSide,
    data: { label: link.label },
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  }))
}
