import { describe, expect, it } from 'vitest'
import type { Diagram } from '../notes.types'
import { edgesOf, nodesOf } from './flow'

const diagram = (): Diagram => ({
  blocks: [
    { id: 'a', x: 0, y: 10, text: 'Ý chính', color: 'YELLOW', main: true },
    { id: 'b', x: 240, y: 10, text: '', color: 'DEFAULT', main: false },
  ],
  links: [{ id: 'ab', from: 'a', fromSide: 'RIGHT', to: 'b', toSide: 'LEFT', label: 'rồi' }],
})

describe('a diagram on React Flow (DG-02, fe-ui-diagram-notes)', () => {
  it('turns blocks into nodes and links into edges between the handles of their sides', () => {
    expect(nodesOf(diagram()).map((node) => node.id)).toEqual(['a', 'b'])
    expect(nodesOf(diagram())[0]).toMatchObject({ id: 'a', type: 'block', position: { x: 0, y: 10 }, data: { text: 'Ý chính', color: 'YELLOW', main: true } })
    expect(edgesOf(diagram())).toEqual([
      expect.objectContaining({ id: 'ab', type: 'link', source: 'a', sourceHandle: 'RIGHT', target: 'b', targetHandle: 'LEFT', data: { label: 'rồi' } }),
    ])
  })

  it('keeps what React Flow knows of a node (its size, whether it is chosen) when the diagram changes', () => {
    const before = nodesOf(diagram()).map((node) => (node.id === 'a' ? { ...node, measured: { width: 160, height: 48 }, selected: true } : node))
    const moved: Diagram = { ...diagram(), blocks: diagram().blocks.map((block) => (block.id === 'a' ? { ...block, x: 50 } : block)) }

    const after = nodesOf(moved, before)

    expect(after[0]).toMatchObject({ position: { x: 50, y: 10 }, measured: { width: 160, height: 48 }, selected: true })
    const edges = edgesOf(diagram()).map((edge) => ({ ...edge, selected: true }))
    expect(edgesOf(diagram(), edges)[0].selected).toBe(true)
  })

  it('chooses only a new block it is told to, so that it can be written at once', () => {
    const before = nodesOf(diagram()).map((node) => ({ ...node, selected: node.id === 'b' }))
    const grown: Diagram = { ...diagram(), blocks: [...diagram().blocks, { id: 'c', x: 0, y: 200, text: '', color: 'DEFAULT', main: false }] }

    expect(nodesOf(grown, before, 'c').map((node) => [node.id, node.selected])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ])
  })
})
