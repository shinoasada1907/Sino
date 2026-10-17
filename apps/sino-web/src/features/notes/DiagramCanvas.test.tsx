import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreReactFlow, stubReactFlow } from '@/test/reactFlow'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

// The canvas and React Flow load on their own (React.lazy). In a busy full run the first diagram of a file took over the
// 3 s wait of findBy: loading them here takes the module load out of the test, and OPEN gives the first render time.
beforeAll(() => import('./diagram/DiagramEditor'), 30_000)
const OPEN = { timeout: 8000 }

const list = () => within(screen.getByRole('region', { name: 'Danh sách ghi chú' }))
/** The open diagram, once React Flow has drawn its blocks. */
const open = async (path: string) => {
  renderApp(path)
  const main = within(await screen.findByRole('main', { name: 'Sơ đồ đang mở' }, OPEN))
  await main.findAllByText(/khối/)
  return main
}
const block = (text: string) => screen.getByText(text).closest<HTMLElement>('.react-flow__node')!
const pane = () => document.querySelector<HTMLElement>('.react-flow__pane')!
const foot = (text: string) => screen.findByText(text)
// Blocks, links and the ground are clicked with fireEvent: see stubReactFlow.

describe('Blocks of a diagram (DG-03, spec: Khối của sơ đồ)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('adds a yellow block where the ground is right-clicked, being written (spec: Thêm khối bằng chuột phải)', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.contextMenu(pane(), { clientX: 500, clientY: 300 })
    const menu = within(await screen.findByRole('menu', { name: 'Thêm ô' }))
    expect(menu.getAllByRole('menuitem')).toHaveLength(7)
    for (const name of ['Khối chữ', 'Khối chính', 'Khối vàng', 'Khối xanh lá', 'Khối đỏ', 'Khối xanh dương', 'Vừa màn hình']) {
      expect(menu.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    await user.click(menu.getByRole('menuitem', { name: 'Khối vàng' }))

    const text = await screen.findByRole('textbox', { name: 'Chữ của khối' })
    await vi.waitFor(() => expect(text).toHaveFocus())
    expect(text.closest('.react-flow__node')!.querySelector('[data-color]')).toHaveAttribute('data-color', 'YELLOW')
    await user.type(text, 'Mua áo mưa{Enter}')

    expect(block('Mua áo mưa')).toBeInTheDocument()
    expect(await foot('8 khối · 6 đường nối')).toBeInTheDocument()
    await vi.waitFor(() => expect(list().getByText('Sơ đồ · 8 khối · 6 nối')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('adds a main block from the menu, and a plain one on a double click on the ground', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.contextMenu(pane(), { clientX: 300, clientY: 200 })
    await user.click(await screen.findByRole('menuitem', { name: 'Khối chính' }))
    await user.type(await screen.findByRole('textbox', { name: 'Chữ của khối' }), 'Mục tiêu{Enter}')
    expect(block('Mục tiêu').querySelector('[data-color]')).toHaveClass('font-semibold')

    fireEvent.doubleClick(pane(), { clientX: 400, clientY: 400 })
    await user.type(await screen.findByRole('textbox', { name: 'Chữ của khối' }), 'Một ý nữa{Enter}')
    expect(await foot('9 khối · 6 đường nối')).toBeInTheDocument()
  })

  it('writes a new block from "+ Khối" at once, Shift Enter for a new line and Enter to finish', async () => {
    const user = userEvent.setup()
    const main = await open('/notes/new?kind=diagram')

    await user.click(main.getByRole('button', { name: 'Thêm khối' }))
    const text = await screen.findByRole('textbox', { name: 'Chữ của khối' })
    await vi.waitFor(() => expect(text).toHaveFocus())
    await user.type(text, 'Gọi điện{Shift>}{Enter}{/Shift}cho chú Ba{Enter}')

    expect(screen.queryByRole('textbox', { name: 'Chữ của khối' })).toBeNull()
    expect(screen.getByText(/Gọi điện/).textContent).toBe('Gọi điện\ncho chú Ba')
  })

  it('writes a block in place on a double click, and keeps the words when Esc is pressed', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.doubleClick(block('Đặt xe 16 chỗ'))
    const text = screen.getByRole('textbox', { name: 'Chữ của khối' })
    expect(text).toHaveValue('Đặt xe 16 chỗ')
    await user.clear(text)
    await user.type(text, 'Đặt xe 29 chỗ{Escape}')

    expect(block('Đặt xe 29 chỗ')).toBeInTheDocument()
    await user.type(list().getByRole('searchbox', { name: 'Tìm trong ghi chú' }), '29 chỗ')
    await vi.waitFor(() => expect(list().getByRole('link', { name: /^Kế hoạch chuyến đi/ })).toBeInTheDocument(), { timeout: 3000 })
  })

  it('colours a chosen block and removes it with its links (spec: Xóa một khối có nối)', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.click(block('Rủ cả nhóm chạy bộ'))
    const bar = within(await screen.findByRole('toolbar', { name: 'Khối đang chọn' }))
    expect(bar.getByRole('button', { name: 'Màu xanh lá' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(bar.getByRole('button', { name: 'Màu đỏ' }))
    expect(block('Rủ cả nhóm chạy bộ').querySelector('[data-color]')).toHaveAttribute('data-color', 'RED')

    await user.click(within(screen.getByRole('toolbar', { name: 'Khối đang chọn' })).getByRole('button', { name: 'Xóa khối' }))

    expect(screen.queryByText('Rủ cả nhóm chạy bộ')).toBeNull()
    expect(await foot('6 khối · 3 đường nối')).toBeInTheDocument()
  })

  it('removes the chosen block with Delete', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.click(block('Đặt xe 16 chỗ'))
    await user.keyboard('{Delete}')

    expect(await foot('6 khối · 5 đường nối')).toBeInTheDocument()
  })
})

describe('Links of a diagram (DG-03, spec: Đường nối của sơ đồ)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('writes the words of a link on a double click', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    await user.dblClick(screen.getByText('chỗ ở'))
    const words = screen.getByRole('textbox', { name: 'Chữ trên đường nối' })
    expect(words).toHaveValue('chỗ ở')
    await user.clear(words)
    await user.type(words, 'nhà ở{Enter}')

    expect(screen.getByText('nhà ở')).toBeInTheDocument()
    expect(screen.queryByText('chỗ ở')).toBeNull()
  })

  it('chooses a link by its words and removes it', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    await user.click(screen.getByText('tính vào'))
    await user.click(within(await screen.findByRole('toolbar', { name: 'Đường nối đang chọn' })).getByRole('button', { name: 'Xóa đường nối' }))

    expect(screen.queryByText('tính vào')).toBeNull()
    expect(await foot('7 khối · 5 đường nối')).toBeInTheDocument()
  })

  it('gives words to a link without any', async () => {
    const user = userEvent.setup()
    await open('/notes/note-plan')

    fireEvent.click(document.querySelector<HTMLElement>('.react-flow__edge[data-id="plan-l5"]')!)
    await user.click(within(await screen.findByRole('toolbar', { name: 'Đường nối đang chọn' })).getByRole('button', { name: 'Chữ trên đường' }))
    await user.type(screen.getByRole('textbox', { name: 'Chữ trên đường nối' }), 'rồi{Enter}')

    expect(screen.getByText('rồi')).toBeInTheDocument()
  })
})

describe('Viewing a diagram (DG-03, spec: Xem và tự lưu sơ đồ)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('zooms with the buttons and says how far', async () => {
    const user = userEvent.setup()
    const main = await open('/notes/note-plan')

    const zoom = within(main.getByRole('group', { name: 'Thu phóng' }))
    const level = () => Number.parseInt(zoom.getByRole('status').textContent ?? '', 10)
    const before = level()
    await user.click(zoom.getByRole('button', { name: 'Phóng to' }))
    await vi.waitFor(() => expect(level()).toBeGreaterThan(before))
    await user.click(zoom.getByRole('button', { name: 'Thu nhỏ' }))
    await user.click(zoom.getByRole('button', { name: 'Thu nhỏ' }))
    await vi.waitFor(() => expect(level()).toBeLessThan(before))
  })

  it('tells how to add and link on a near empty diagram, not on a full one', async () => {
    await open('/notes/new?kind=diagram')
    expect(screen.getByText(/bấm đúp vào chỗ trống để thêm khối/)).toBeInTheDocument()
  })

  it('does not tell it on a diagram with blocks enough', async () => {
    await open('/notes/note-plan')
    expect(screen.queryByText(/bấm đúp vào chỗ trống để thêm khối/)).toBeNull()
  })
})
