import { describe, expect, it } from 'vitest'
import { createNotesSample } from '../notes.sample'
import type { Diagram, DiagramBlock } from '../notes.types'
import {
  addBlock,
  connect,
  DIAGRAM_LIMITS,
  diagramSummary,
  moveBlock,
  nearestSide,
  newBlock,
  newDiagram,
  removeBlock,
  removeLink,
  setBlockColor,
  setBlockText,
  setLinkLabel,
} from './diagram'

const block = (id: string, extra: Partial<DiagramBlock> = {}): DiagramBlock => ({ id, x: 0, y: 0, text: id, color: 'DEFAULT', main: false, ...extra })
const diagram = (): Diagram => ({
  blocks: [block('a', { main: true }), block('b'), block('c')],
  links: [
    { id: 'ab', from: 'a', fromSide: 'RIGHT', to: 'b', toSide: 'LEFT', label: null },
    { id: 'bc', from: 'b', fromSide: 'BOTTOM', to: 'c', toSide: 'TOP', label: 'rồi' },
  ],
})
const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe('a diagram (DG-01, fe-ui-diagram-notes)', () => {
  it('starts with one main block "Ý chính" (D-209)', () => {
    const start = newDiagram()
    expect(start.links).toEqual([])
    expect(start.blocks).toEqual([expect.objectContaining({ text: 'Ý chính', main: true, color: 'DEFAULT' })])
    expect(start.blocks[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('adds a block centred on a point, with its colour and kind (D-207)', () => {
    const added = newBlock(400, 300, { color: 'YELLOW' })
    expect(added).toMatchObject({ text: '', color: 'YELLOW', main: false })
    // A new block is about 160 x 48 px: its top-left corner sits so that the point is its centre.
    expect({ x: added.x, y: added.y }).toEqual({ x: 320, y: 276 })
    expect(ids(addBlock(diagram(), added).blocks)).toEqual(['a', 'b', 'c', added.id])
    expect(newBlock(0, 0, { main: true })).toMatchObject({ main: true, color: 'DEFAULT' })
  })

  it('stops adding blocks at the limit (D-211)', () => {
    const full: Diagram = { blocks: Array.from({ length: DIAGRAM_LIMITS.blocks }, (_, i) => block(`b${i}`)), links: [] }
    expect(addBlock(full, block('one-more'))).toBe(full)
  })

  it('moves a block, and sets its text and colour, keeping the text within its limit', () => {
    expect(moveBlock(diagram(), 'b', 120.4, -35.6).blocks[1]).toMatchObject({ x: 120, y: -36 })
    expect(setBlockText(diagram(), 'b', 'Đặt xe 16 chỗ').blocks[1].text).toBe('Đặt xe 16 chỗ')
    expect(setBlockText(diagram(), 'b', 'x'.repeat(DIAGRAM_LIMITS.text + 5)).blocks[1].text).toHaveLength(DIAGRAM_LIMITS.text)
    expect(setBlockColor(diagram(), 'c', 'GREEN').blocks[2].color).toBe('GREEN')
  })

  it('removes a block with every link of it', () => {
    const left = removeBlock(diagram(), 'b')
    expect(ids(left.blocks)).toEqual(['a', 'c'])
    expect(left.links).toEqual([])
    expect(ids(removeBlock(diagram(), 'c').links)).toEqual(['ab'])
  })

  it('links two blocks once, never a block to itself (D-207)', () => {
    const linked = connect(diagram(), 'c', 'RIGHT', 'a', 'BOTTOM')
    expect(linked.links.at(-1)).toMatchObject({ from: 'c', fromSide: 'RIGHT', to: 'a', toSide: 'BOTTOM', label: null })
    expect(linked.links.at(-1)?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(connect(diagram(), 'a', 'TOP', 'a', 'LEFT')).toEqual(diagram())
    // The other way round is another link; the same way again is not.
    expect(connect(diagram(), 'a', 'TOP', 'b', 'TOP')).toEqual(diagram())
    expect(connect(diagram(), 'b', 'LEFT', 'a', 'RIGHT').links).toHaveLength(3)
  })

  it('links only blocks of the diagram, and stops at the limit (D-211)', () => {
    expect(connect(diagram(), 'a', 'RIGHT', 'gone', 'LEFT')).toEqual(diagram())
    expect(connect(diagram(), 'gone', 'RIGHT', 'a', 'LEFT')).toEqual(diagram())
    const full: Diagram = { ...diagram(), links: Array.from({ length: DIAGRAM_LIMITS.links }, (_, i) => ({ id: `l${i}`, from: 'x', fromSide: 'TOP', to: 'y', toSide: 'TOP', label: null })) }
    expect(connect(full, 'c', 'RIGHT', 'a', 'LEFT')).toBe(full)
  })

  it('labels a link, an empty label being none, and removes a link', () => {
    expect(setLinkLabel(diagram(), 'ab', '  vì  ').links[0].label).toBe('vì')
    expect(setLinkLabel(diagram(), 'bc', '   ').links[1].label).toBeNull()
    expect(setLinkLabel(diagram(), 'ab', 'x'.repeat(100)).links[0].label).toHaveLength(DIAGRAM_LIMITS.label)
    expect(ids(removeLink(diagram(), 'ab').links)).toEqual(['bc'])
  })

  it('picks the side of a block nearest to where a link was dropped', () => {
    const box = { x: 100, y: 100, width: 160, height: 60 }
    expect(nearestSide(box, { x: 180, y: 95 })).toBe('TOP')
    expect(nearestSide(box, { x: 270, y: 130 })).toBe('RIGHT')
    expect(nearestSide(box, { x: 180, y: 170 })).toBe('BOTTOM')
    expect(nearestSide(box, { x: 90, y: 128 })).toBe('LEFT')
    // Inside the block: still the nearest side.
    expect(nearestSide(box, { x: 110, y: 130 })).toBe('LEFT')
  })

  it('counts its blocks and links', () => {
    expect(diagramSummary(diagram())).toBe('3 khối · 2 nối')
  })
})

describe('the sample diagram, as the spec diagram-notes tells it (DG-01)', () => {
  const plan = () => createNotesSample(new Date('2026-10-02T07:05:00Z')).notes.find((note) => note.kind === 'DIAGRAM')!.diagram!
  const named = (text: string) => plan().blocks.find((entry) => entry.text === text)!

  it('gets a second block on a new diagram', () => {
    expect(addBlock(newDiagram(), newBlock(200, 120)).blocks).toHaveLength(2)
  })

  it('loses "Rủ cả nhóm chạy bộ" with its three links', () => {
    const left = removeBlock(plan(), named('Rủ cả nhóm chạy bộ').id)
    expect(diagramSummary(left)).toBe('6 khối · 3 nối')
  })

  it('links the right side of "Đặt xe 16 chỗ" to the top of "Chốt ngày trước 15/11", dropped near that top', () => {
    const bus = named('Đặt xe 16 chỗ')
    const date = named('Chốt ngày trước 15/11')
    const toSide = nearestSide({ x: date.x, y: date.y, width: 160, height: 48 }, { x: date.x + 70, y: date.y - 10 })
    expect(connect(plan(), bus.id, 'RIGHT', date.id, toSide).links.at(-1)).toMatchObject({ from: bus.id, fromSide: 'RIGHT', to: date.id, toSide: 'TOP' })
  })
})
