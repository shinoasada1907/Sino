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

/**
 * Where a block added by "+ Khối" goes: the point asked for (the middle of the view), or lower down until it covers no
 * block of about the size of a new one, so that it never lands on the main block of a new diagram.
 */
export function freeSpot(diagram: Diagram, x: number, y: number): { x: number; y: number } {
  const gap = 16
  const covers = (spotY: number) =>
    diagram.blocks.some(
      (block) =>
        Math.abs(block.x + NEW_BLOCK.width / 2 - x) < NEW_BLOCK.width && Math.abs(block.y + NEW_BLOCK.height / 2 - spotY) < NEW_BLOCK.height + gap,
    )
  let spotY = y
  while (covers(spotY)) {
    spotY += NEW_BLOCK.height + gap
  }
  return { x, y: spotY }
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

/**
 * A link from a side of one block to a side of another of the diagram; never a block to itself, never twice the same way
 * (D-207), since the server refuses such a diagram (D-211).
 */
export function connect(diagram: Diagram, from: string, fromSide: Side, to: string, toSide: Side): Diagram {
  const has = (id: string) => diagram.blocks.some((block) => block.id === id)
  const taken = diagram.links.some((link) => link.from === from && link.to === to)
  if (from === to || !has(from) || !has(to) || taken || diagram.links.length >= DIAGRAM_LIMITS.links) {
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

/** "7 khối · 6 đường nối", at the foot of the canvas (D-207). */
export function diagramFootLine(diagram: Diagram): string {
  return `${diagram.blocks.length} khối · ${diagram.links.length} đường nối`
}

function changeBlock(diagram: Diagram, id: string, change: Partial<DiagramBlock>): Diagram {
  return { ...diagram, blocks: diagram.blocks.map((block) => (block.id === id ? { ...block, ...change } : block)) }
}

/**
 * Whether two diagrams hold the same blocks and links in the same order, whatever the objects they are and the order of
 * their fields. A save answers with its own copy of the diagram, so the editor, which holds the one it drew, compares by
 * content to tell a change from a diagram that is only the server's copy of what it already has (FE-90).
 */
export function sameDiagram(a: Diagram | null | undefined, b: Diagram | null | undefined): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.blocks.length !== b.blocks.length || a.links.length !== b.links.length) {
    return false
  }
  return (
    a.blocks.every((x, index) => {
      const y = b.blocks[index]
      return x.id === y.id && x.x === y.x && x.y === y.y && x.text === y.text && x.color === y.color && x.main === y.main
    }) &&
    a.links.every((x, index) => {
      const y = b.links[index]
      return x.id === y.id && x.from === y.from && x.fromSide === y.fromSide && x.to === y.to && x.toSide === y.toSide && x.label === y.label
    })
  )
}
