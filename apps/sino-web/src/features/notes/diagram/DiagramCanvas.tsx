import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  useReactFlow,
  useStore,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
  type XYPosition,
} from '@xyflow/react'
import { useState, type CSSProperties, type MouseEvent } from 'react'
import type { BlockColor, Diagram, Side } from '../notes.types'
import { DiagramActionsContext, type DiagramActions } from './actions'
import { AddMenu, type MenuSpot } from './AddMenu'
import { BlockNode } from './BlockNode'
import { addBlock, connect, moveBlock, nearestSide, newBlock, removeBlock, removeLink, setBlockColor, setBlockText, setLinkLabel } from './diagram'
import { edgesOf, FIT_VIEW, nodesOf, type BlockNode as BlockNodeType, type LinkEdge as LinkEdgeType } from './flow'
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

/** A diagram with this many blocks or fewer says how to add and link (the prototype's hint). */
const HINT_UP_TO = 2

/**
 * The canvas of a diagram (D-207, D-208): the diagram is the one truth, React Flow only draws it. Every change goes out
 * through `onChange`, and the nodes and edges follow the diagram that comes back. A block is added by a double click
 * or the menu "THÊM Ô" (right click) on empty ground, then written at once (`editing`, shared with "+ Khối" above the
 * canvas); a link is drawn from a dot to anywhere on another block and arrives at the side nearest the drop; Delete or
 * Backspace removes what is chosen. A dragged block moves on its own and becomes a change once it is dropped (D-210).
 */
export function DiagramCanvas({
  diagram,
  editing,
  onEditing,
  onChange,
}: {
  diagram: Diagram
  editing: string | null
  onEditing: (id: string | null) => void
  onChange: (diagram: Diagram) => void
}) {
  const { screenToFlowPosition, getIntersectingNodes, getInternalNode, fitView } = useReactFlow<BlockNodeType, LinkEdgeType>()
  const domNode = useStore((state) => state.domNode)
  const [nodes, setNodes] = useState(() => nodesOf(diagram, [], editing ?? undefined))
  const [edges, setEdges] = useState(() => edgesOf(diagram))
  const [shown, setShown] = useState(diagram)
  if (shown !== diagram) {
    setShown(diagram)
    setNodes(nodesOf(diagram, nodes, editing ?? undefined))
    setEdges(edgesOf(diagram, edges))
  }
  const [editingLink, setEditingLink] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ open: boolean; spot: MenuSpot; at: XYPosition }>({ open: false, spot: { left: 0, top: 0 }, at: { x: 0, y: 0 } })

  // A removal is a change of the diagram, made by the canvas itself; React Flow only reports sizes, choices and drags.
  const onNodesChange = (changes: NodeChange<BlockNodeType>[]) =>
    setNodes((current) => applyNodeChanges(changes.filter((change) => change.type !== 'remove'), current))
  const onEdgesChange = (changes: EdgeChange<LinkEdgeType>[]) =>
    setEdges((current) => applyEdgeChanges(changes.filter((change) => change.type !== 'remove'), current))

  const addAt = (at: XYPosition, look: { color?: BlockColor; main?: boolean }) => {
    const block = newBlock(at.x, at.y, look)
    onEditing(block.id)
    onChange(addBlock(diagram, block))
  }
  // A link dropped on a dot goes to that side; dropped anywhere else on a block, to the side nearest the drop (D-207).
  const onConnectEnd: OnConnectEnd = (event, connection) => {
    const fromSide = connection.fromHandle?.id as Side | undefined
    if (!connection.fromNode || !fromSide) {
      return
    }
    const from = connection.fromNode.id
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event
    const drop = screenToFlowPosition({ x: clientX, y: clientY })
    const targetId = connection.toNode?.id ?? getIntersectingNodes({ ...drop, width: 1, height: 1 }).find((node) => node.id !== from)?.id
    const target = targetId === undefined ? undefined : getInternalNode(targetId)
    if (!target) {
      return
    }
    const box = { ...target.internals.positionAbsolute, width: target.measured.width ?? 0, height: target.measured.height ?? 0 }
    const toSide = (connection.toHandle?.id as Side | undefined) ?? nearestSide(box, drop)
    onChange(connect(diagram, from, fromSide, target.id, toSide))
  }
  const openMenu = (event: MouseEvent | globalThis.MouseEvent) => {
    event.preventDefault()
    const corner = domNode?.getBoundingClientRect() ?? { left: 0, top: 0 }
    setMenu({
      open: true,
      spot: { left: event.clientX - corner.left, top: event.clientY - corner.top },
      at: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    })
  }
  const onPaneDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).classList.contains('react-flow__pane')) {
      addAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }), {})
    }
  }

  const actions: DiagramActions = {
    editing,
    editingLink,
    writeBlock: (id) => onEditing(id),
    finishBlock: (id, text) => {
      onEditing(null)
      const words = text.trim()
      if (diagram.blocks.some((block) => block.id === id && block.text !== words)) {
        onChange(setBlockText(diagram, id, words))
      }
    },
    colorBlock: (id, color) => onChange(setBlockColor(diagram, id, color)),
    removeBlock: (id) => onChange(removeBlock(diagram, id)),
    chooseLink: (id) => {
      setNodes((current) => current.map((node) => (node.selected ? { ...node, selected: false } : node)))
      setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === id })))
    },
    writeLink: (id) => setEditingLink(id),
    finishLink: (id, label) => {
      setEditingLink(null)
      if (diagram.links.some((link) => link.id === id && (link.label ?? '') !== label.trim())) {
        onChange(setLinkLabel(diagram, id, label))
      }
    },
    removeLink: (id) => onChange(removeLink(diagram, id)),
  }

  return (
    <DiagramActionsContext value={actions}>
      <div role="group" aria-label="Vùng vẽ sơ đồ" className="relative min-h-0 flex-1" onDoubleClick={onPaneDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_, __, moved) => onChange(moved.reduce((next, node) => moveBlock(next, node.id, node.position.x, node.position.y), diagram))}
          onNodeDoubleClick={(_, node) => onEditing(node.id)}
          onEdgeDoubleClick={(_, edge) => setEditingLink(edge.id)}
          onDelete={({ nodes: gone, edges: cut }) =>
            onChange(
              cut.reduce(
                (next, edge) => removeLink(next, edge.id),
                gone.reduce((next, node) => removeBlock(next, node.id), diagram),
              ),
            )
          }
          onConnectEnd={onConnectEnd}
          onPaneContextMenu={openMenu}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ strokeDasharray: '5 4' }}
          deleteKeyCode={['Delete', 'Backspace']}
          fitView
          fitViewOptions={FIT_VIEW}
          minZoom={0.3}
          maxZoom={2.5}
          zoomOnDoubleClick={false}
          style={FLOW_COLORS}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        </ReactFlow>
        <AddMenu
          open={menu.open}
          spot={menu.spot}
          onClose={() => setMenu((current) => ({ ...current, open: false }))}
          onAdd={(look) => addAt(menu.at, look)}
          onFit={() => void fitView({ ...FIT_VIEW, duration: 200 })}
        />
        {diagram.blocks.length <= HINT_UP_TO && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 z-1 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-sm bg-surface px-3 py-2 text-center text-xs leading-4 text-muted-foreground shadow-popover">
            Chuột phải hoặc bấm đúp vào chỗ trống để thêm khối · kéo một chấm ở cạnh khối sang khối khác để nối · chọn rồi bấm Delete để xóa
          </p>
        )}
      </div>
    </DiagramActionsContext>
  )
}
