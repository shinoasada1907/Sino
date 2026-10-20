import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreReactFlow, stubReactFlow } from '@/test/reactFlow'
import { renderApp } from '@/test/renderApp'

// The canvas sample answers the requests of these tests (NT-01 to DG-04); the real API is tested in NotesOnApi.test.tsx (FE-90).
vi.mock('./notes.api', async (importOriginal) => (await import('@/test/notesSampleApi')).sampleNotesApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

// The canvas and React Flow load on their own (React.lazy). In a busy full run the first diagram of a file took over the
// 3 s wait of findBy: loading them here takes the module load out of the test, and OPEN gives the first render time.
beforeAll(() => import('./diagram/DiagramEditor'), 30_000)
const OPEN = { timeout: 8000 }

const ready = () => screen.findByRole('region', { name: 'Danh sách ghi chú' })
const list = () => within(screen.getByRole('region', { name: 'Danh sách ghi chú' }))
const card = (title: RegExp) => list().getByRole('link', { name: title })
const cardTitles = () => list().queryAllByRole('link').flatMap((link) => link.querySelector('[data-slot="note-title"]')?.textContent ?? [])
/** The open diagram; the canvas loads on its own, after the list. */
const diagram = async () => within(await screen.findByRole('main', { name: 'Sơ đồ đang mở' }, OPEN))

describe('Sơ đồ in the list of notes (DG-02, fe-ui-diagram-notes)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('shows the sample diagram as a card with its mark, size and first blocks, and filters on "Sơ đồ"', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes')
    await ready()

    const plan = within(card(/^Kế hoạch chuyến đi Đà Lạt/))
    expect(plan.getByText('Sơ đồ · 7 khối · 6 nối')).toBeInTheDocument()
    expect(plan.getByText('Chuyến đi Đà Lạt tháng 12 · Thuê homestay gần hồ Tuyền Lâm · Rủ cả nhóm chạy bộ')).toBeInTheDocument()
    expect(card(/^Kế hoạch chuyến đi Đà Lạt/).querySelector('[data-slot="diagram-mark"]')).not.toBeNull()
    expect(card(/Ý tưởng chuyến đi/).querySelector('[data-slot="diagram-mark"]')).toBeNull()

    await user.click(list().getByRole('button', { name: 'Sơ đồ · 1' }))
    expect(router.state.location.search).toBe('?filter=diagram')
    expect(cardTitles()).toEqual(['Kế hoạch chuyến đi Đà Lạt'])
  })

  it('keeps the "Sơ đồ" filter of the address on a reload', async () => {
    renderApp('/notes?filter=diagram')
    await ready()

    expect(list().getByRole('button', { name: 'Sơ đồ · 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(cardTitles()).toEqual(['Kế hoạch chuyến đi Đà Lạt'])
  })

  it('finds a diagram by the words of its blocks (spec: Tìm trong khối)', async () => {
    const user = userEvent.setup()
    renderApp('/notes')
    await ready()

    await user.type(list().getByRole('searchbox', { name: 'Tìm trong ghi chú' }), 'homestay')

    expect(cardTitles()).toEqual(['Ý tưởng chuyến đi Đà Lạt tháng 12', 'Kế hoạch chuyến đi Đà Lạt'])
  })

  it('asks "Ghi chú chữ" or "Sơ đồ" on "+ Ghi chú", keeping the filter', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes?filter=pinned')
    await ready()

    // The list's own button, from 768 px; the phone header has its own.
    await user.click(list().getByRole('button', { name: 'Ghi chú' }))
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getByRole('menuitem', { name: /Ghi chú chữ/ })).toHaveAttribute('href', '/notes/new?filter=pinned')
    await user.click(menu.getByRole('menuitem', { name: /Sơ đồ/ }))

    expect(router.state.location.pathname).toBe('/notes/new')
    expect(router.state.location.search).toBe('?filter=pinned&kind=diagram')
    expect(await diagram()).toBeDefined()
  })
})

describe('A new diagram (DG-02, spec: Sơ đồ mới)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('opens with one main block "Ý chính" and makes nothing yet', async () => {
    renderApp('/notes/new?kind=diagram')
    await ready()

    const open = await diagram()
    expect(open.getByRole('textbox', { name: 'Tên sơ đồ' })).toHaveValue('')
    expect(await open.findByText('Ý chính')).toBeInTheDocument()
    expect(open.getByText('1 khối · 0 đường nối')).toBeInTheDocument()
    expect(open.getByText('Sơ đồ mới · lưu khi có thay đổi')).toBeInTheDocument()
    expect(list().getByRole('button', { name: 'Tất cả · 7' })).toBeInTheDocument()
  })

  it('makes the diagram on its first change, under its own address (spec: Thêm khối vào sơ đồ mới)', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes/new?kind=diagram')
    await ready()

    await user.click((await diagram()).getByRole('button', { name: 'Thêm khối' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toMatch(/^\/notes\/[0-9a-f-]{36}$/), { timeout: 3000 })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('')
    // The list hears of the new note a tick after the address changes (TanStack Query batches with setTimeout).
    expect(within(await list().findByRole('link', { name: /Ý chính/ })).getByText('Sơ đồ · 2 khối · 0 nối')).toBeInTheDocument()
    expect(list().getByRole('button', { name: 'Tất cả · 8' })).toBeInTheDocument()
    // The same canvas stays, the new block chosen and being written (DG-03).
    expect((await diagram()).getByText('2 khối · 0 đường nối')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Chữ của khối' }).closest('.react-flow__node')).toHaveClass('selected')
  })

  it('makes the diagram once it is named', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes/new?kind=diagram')
    await ready()

    await user.type((await diagram()).getByRole('textbox', { name: 'Tên sơ đồ' }), 'Kế hoạch tết')

    await vi.waitFor(() => expect(router.state.location.pathname).toMatch(/^\/notes\/[0-9a-f-]{36}$/), { timeout: 3000 })
    expect(within(await list().findByRole('link', { name: /Kế hoạch tết/ })).getByText('Sơ đồ · 1 khối · 0 nối')).toBeInTheDocument()
    expect((await diagram()).getByRole('textbox', { name: 'Tên sơ đồ' })).toHaveFocus()
  })

  it('leaves nothing behind when it is left unchanged', async () => {
    const user = userEvent.setup()
    renderApp('/notes/new?kind=diagram')
    await ready()
    await diagram()

    await user.click(list().getByRole('link', { name: /Ý tưởng chuyến đi/ }))

    expect(list().getByRole('button', { name: 'Tất cả · 7' })).toBeInTheDocument()
    expect(cardTitles()).not.toContain('Ý chính')
  })

  it('stays a diagram when the filter changes', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes/new?kind=diagram')
    await ready()
    await diagram()

    await user.click(list().getByRole('button', { name: 'Đã ghim · 2' }))

    expect(router.state.location.search).toBe('?filter=pinned&kind=diagram')
    expect(await diagram()).toBeDefined()
  })
})

describe('An open diagram (DG-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('opens the sample diagram on the canvas with its name, blocks, link words and foot', async () => {
    renderApp('/notes/note-plan')
    await ready()

    const open = await diagram()
    expect(open.getByRole('textbox', { name: 'Tên sơ đồ' })).toHaveValue('Kế hoạch chuyến đi Đà Lạt')
    expect(await open.findByText('Thuê homestay gần hồ Tuyền Lâm')).toBeInTheDocument()
    expect(open.getByText('Chuyến đi Đà Lạt tháng 12')).toBeInTheDocument()
    expect(await open.findByText('đủ người thì')).toBeInTheDocument()
    expect(open.getByText('7 khối · 6 đường nối')).toBeInTheDocument()
    expect(open.getByText('Sửa lúc 24/09 · 21:30 · tự lưu')).toBeInTheDocument()
    expect(card(/^Kế hoạch chuyến đi Đà Lạt/)).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('textbox', { name: 'Nội dung ghi chú' })).toBeNull()
  })

  it('saves a new name by itself', async () => {
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()

    const name = (await diagram()).getByRole('textbox', { name: 'Tên sơ đồ' })
    await user.clear(name)
    await user.type(name, 'Đà Lạt tháng 12')

    await vi.waitFor(() => expect(cardTitles()).toContain('Đà Lạt tháng 12'), { timeout: 3000 })
    expect((await diagram()).getByText('Sửa lúc 14:05 hôm nay · tự lưu')).toBeInTheDocument()
  })

  it('pins the diagram and asks before deleting it', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/notes/note-plan')
    await ready()

    const open = await diagram()
    await user.click(open.getByRole('button', { name: 'Ghim' }))
    expect(list().getByRole('button', { name: 'Đã ghim · 3' })).toBeInTheDocument()

    await user.click(open.getByRole('button', { name: 'Xóa ghi chú' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' }))
    expect(dialog.getByText('“Kế hoạch chuyến đi Đà Lạt” sẽ bị xóa.')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Xóa' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes'))
    expect(cardTitles()).not.toContain('Kế hoạch chuyến đi Đà Lạt')
  })
})
