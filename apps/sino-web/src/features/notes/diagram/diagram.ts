// The changes a diagram can go through (fe-ui-diagram-notes), as pure functions: the canvas only calls them.
import type { BlockColor, Diagram, DiagramBlock, Side } from '../notes.types'

/** What one diagram may hold (D-211); the server checks the same. */
export const DIAGRAM_LIMITS = { blocks: 300, links: 600, text: 2_000, label: 80 }

/** About the size of a new block, to centre it on the point it is added at. */
const NEW_BLOCK = { width: 160, height: 48 }

/** A new diagram: one main block, "Ý chính" (D-209). */
export function newDiagram(): Diagram {
  return { blocks: [{ ...newBlock(0, 0, { main: true }), text: 'Ý chính' }], links: [] }
}

/** A block centred on (x, y) of the canvas, its text empty until typed. */
export function newBlock(x: number, y: number, { color = 'DEFAULT', main = false }: { color?: BlockColor; main?: boolean } = {}): DiagramBlock {
  return { id: crypto.randomUUID(), x: Math.round(x - NEW_BLOCK.width / 2), y: Math.round(y - NEW_BLOCK.height / 2), text: '', color, main }
}

export function addBlock(diagram: Diagram, block: DiagramBlock): Diagram {
  return diagram.blocks.length >= DIAGRAM_LIMITS.blocks ? diagram : { ...diagram, blocks: [...diagram.blocks, block] }
}

export function moveBlock(diagram: Diagram, id: string, x: number, y: number): Diagram {
  return changeBlock(diagram, id, { x: Math.round(x), y: Math.round(y) })
}

export function setBlockText(diagram: Diagram, id: string, text: string): Diagram {
  return changeBlock(diagram, id, { text: text.slice(0, DIAGRAM_LIMITS.text) })
}

export function setBlockColor(diagram: Diagram, id: string, color: BlockColor): Diagram {
  return changeBlock(diagram, id, { color })
}

/** Removes a block and every link to or from it. */
export function removeBlock(diagram: Diagram, id: string): Diagram {
  return { blocks: diagram.blocks.filter((block) => block.id !== id), links: diagram.links.filter((link) => link.from !== id && link.to !== id) }
}

/** A link from a side of one block to a side of another; never a block to itself, never twice the same way (D-207). */
export function connect(diagram: Diagram, from: string, fromSide: Side, to: string, toSide: Side): Diagram {
  const taken = diagram.links.some((link) => link.from === from && link.to === to)
  if (from === to || taken || diagram.links.length >= DIAGRAM_LIMITS.links) {
    return diagram
  }
  return { ...diagram, links: [...diagram.links, { id: crypto.randomUUID(), from, fromSide, to, toSide, label: null }] }
}

/** The words on a link; nothing but spaces is no label. */
export function setLinkLabel(diagram: Diagram, id: string, label: string): Diagram {
  const words = label.trim().slice(0, DIAGRAM_LIMITS.label)
  return { ...diagram, links: diagram.links.map((link) => (link.id === id ? { ...link, label: words || null } : link)) }
}

export function removeLink(diagram: Diagram, id: string): Diagram {
  return { ...diagram, links: diagram.links.filter((link) => link.id !== id) }
}

/** The side of a block whose middle is nearest to a point: where a link dropped there arrives. */
export function nearestSide(box: { x: number; y: number; width: number; height: number }, point: { x: number; y: number }): Side {
  const middles: [Side, number, number][] = [
    ['TOP', box.x + box.width / 2, box.y],
    ['RIGHT', box.x + box.width, box.y + box.height / 2],
    ['BOTTOM', box.x + box.width / 2, box.y + box.height],
    ['LEFT', box.x, box.y + box.height / 2],
  ]
  return middles.reduce((best, side) => (Math.hypot(side[1] - point.x, side[2] - point.y) < Math.hypot(best[1] - point.x, best[2] - point.y) ? side : best))[0]
}

/** "7 khối · 6 nối" */
export function diagramSummary(diagram: Diagram): string {
  return `${diagram.blocks.length} khối · ${diagram.links.length} nối`
}

function changeBlock(diagram: Diagram, id: string, change: Partial<DiagramBlock>): Diagram {
  return { ...diagram, blocks: diagram.blocks.map((block) => (block.id === id ? { ...block, ...change } : block)) }
}
