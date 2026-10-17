import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useState, type CSSProperties, type Ref } from 'react'
import type { Diagram } from '../notes.types'
import { BlockNode } from './BlockNode'
import { moveBlock } from './diagram'
import { edgesOf, nodesOf, type BlockNode as BlockNodeType, type LinkEdge as LinkEdgeType } from './flow'
import { LinkEdge } from './LinkEdge'
import './diagram.css'

const NODE_TYPES = { block: BlockNode }
const EDGE_TYPES = { link: LinkEdge }

/** React Flow's colours, pointed at the canvas tokens (both themes). */
const FLOW_COLORS = {
  '--xy-edge-stroke': 'var(--text-muted)',
  '--xy-edge-stroke-width': 1.6,
  '--xy-edge-stroke-selected': 'var(--text)',
  '--xy-connectionline-stroke': 'var(--text)',
  '--xy-connectionline-stroke-width': 1.6,
  '--xy-background-pattern-color': 'var(--grid-dot)',
  '--xy-attribution-background-color': 'transparent',
} as CSSProperties

/**
 * The canvas of a diagram (D-208): the diagram is the one truth, React Flow only draws it. Every change the canvas
 * makes goes out through `onChange`, and the nodes and edges follow the diagram that comes back. A dragged block moves
 * on its own and becomes a change once it is dropped (D-210). Opening a diagram fits it on the screen.
 */
export function DiagramCanvas({
  diagram,
  fresh,
  onChange,
  ref,
}: {
  diagram: Diagram
  /** A block just added from outside the canvas, chosen alone once it shows. */
  fresh?: string
  onChange: (diagram: Diagram) => void
  ref?: Ref<HTMLDivElement>
}) {
  const [nodes, setNodes] = useState(() => nodesOf(diagram))
  const [edges, setEdges] = useState(() => edgesOf(diagram))
  const [shown, setShown] = useState(diagram)
  if (shown !== diagram) {
    setShown(diagram)
    setNodes(nodesOf(diagram, nodes, fresh))
    setEdges(edgesOf(diagram, edges))
  }

  // A removal is a change of the diagram, made by the canvas itself; React Flow only reports sizes, choices and drags.
  const onNodesChange = (changes: NodeChange<BlockNodeType>[]) =>
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== 'remove'), current))
  const onEdgesChange = (changes: EdgeChange<LinkEdgeType>[]) =>
    setEdges((current) => applyEdgeChanges(changes.filter((change) => change.type !== 'remove'), current))

  return (
    <div ref={ref} role="group" aria-label="Vùng vẽ sơ đồ" className="relative min-h-0 flex-1 [--block-blue:#6E8BEF] [--block-tint:20%] dark:[--block-tint:12%]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, __, moved) => onChange(moved.reduce((next, node) => moveBlock(next, node.id, node.position.x, node.position.y), diagram))}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={2.5}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        style={FLOW_COLORS}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      </ReactFlow>
    </div>
  )
}
