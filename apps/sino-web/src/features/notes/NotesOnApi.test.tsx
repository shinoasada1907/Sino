import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { notesBackend } from '@/test/notesBackend'
import { restoreReactFlow, stubReactFlow } from '@/test/reactFlow'
import { renderApp } from '@/test/renderApp'
import { NOTES_QUERY_KEY } from './useNotes'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const backend = () => notesBackend({ now: NOW })

// The canvas and React Flow load on their own (React.lazy); loading them here takes the module load out of the tests.
beforeAll(() => import('./diagram/DiagramEditor'), 30_000)
const OPEN = { timeout: 8000 }
const SAVED = { timeout: 3000 }

const ready = () => screen.findByRole('region', { name: 'Danh sách ghi chú' })
const list = () => within(screen.getByRole('region', { name: 'Danh sách ghi chú' }))
const editor = () => within(screen.getByRole('main', { name: 'Ghi chú đang mở' }))
const text = () => screen.getByRole('textbox', { name: 'Nội dung ghi chú' })
const cardTitles = () => list().queryAllByRole('link').flatMap((link) => link.querySelector('[data-slot="note-title"]')?.textContent ?? [])
/** The open diagram; the canvas loads on its own, after the list. */
const diagram = async () => within(await screen.findByRole('main', { name: 'Sơ đồ đang mở' }, OPEN))

const GRAN = 'Bánh bông lan trứng muối (2 hộp), trà sen, một ít cam.'
const WARNING = 'Ghi chú này vừa được sửa ở nơi khác. Chữ bạn đang gõ chưa được lưu.'
/** A real wait, longer than the pause after which typing saves by itself. */
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Ghi chú on the F15 API (FE-90)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('reading, making, saving, pinning and deleting', () => {
    it('shows the notes of the server, none tied to a message: no chip "Gắn tin nhắn", no "Ghi chú độc lập" (D-177, D-178)', async () => {
      backend()
      renderApp('/notes')
      await ready()

      expect(cardTitles()).toEqual(['Danh sách mua cho bà', 'Kế hoạch chuyến đi Đà Lạt', 'Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm.'])
      expect(list().getByRole('button', { name: 'Tất cả · 3' })).toBeInTheDocument()
      expect(list().getByRole('button', { name: 'Đã ghim · 1' })).toBeInTheDocument()
      expect(list().getByRole('button', { name: 'Sơ đồ · 1' })).toBeInTheDocument()
      expect(list().queryByRole('button', { name: /Gắn tin nhắn/ })).toBeNull()
      expect(list().queryByText('Ghi chú độc lập')).toBeNull()
    })

    it('opens a note of the server without "Gắn với …", a quote or "Thêm thao tác"', async () => {
      backend()
      renderApp('/notes/note-gran')
      await ready()

      expect(text()).toHaveValue(GRAN)
      expect(screen.getByRole('textbox', { name: 'Tiêu đề ghi chú' })).toHaveValue('Danh sách mua cho bà')
      expect(editor().queryByText(/Gắn với/)).toBeNull()
      expect(editor().queryByText(/TRÍCH/)).toBeNull()
      expect(editor().queryByRole('button', { name: 'Thêm thao tác' })).toBeNull()
      expect(editor().getByText('Sửa lúc 08:31 hôm nay · tự lưu')).toBeInTheDocument()
    })

    it('makes a note on the server under its own address, and it is still there when the page is loaded again', async () => {
      const api = backend()
      const user = userEvent.setup()
      const first = renderApp('/notes/new')
      await ready()

      await user.type(text(), 'Gọi lại cho phòng khám')
      await user.tab()

      await vi.waitFor(() => expect(first.router.state.location.pathname).toBe('/notes/note-new-1'), SAVED)
      expect(api.created).toEqual([{ kind: 'TEXT', title: '', body: 'Gọi lại cho phòng khám' }])
      first.unmount()

      renderApp('/notes')
      await ready()
      expect(cardTitles()).toContain('Gọi lại cho phòng khám')
    })

    it('saves an edit over the version it read, then the next one over the version that came back', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()

      await user.type(text(), ' Thêm sữa.')
      await user.tab()
      await vi.waitFor(() => expect(api.patched).toHaveLength(1), SAVED)
      await user.type(text(), ' Thêm trứng.')
      await user.tab()
      await vi.waitFor(() => expect(api.patched).toHaveLength(2), SAVED)

      expect(api.patched).toEqual([
        ['note-gran', { version: 2, body: `${GRAN} Thêm sữa.` }],
        ['note-gran', { version: 3, body: `${GRAN} Thêm sữa. Thêm trứng.` }],
      ])
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('saves by itself once the typing stops (D-203)', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()

      await user.type(text(), ' Thêm sữa.')

      await vi.waitFor(() => expect(api.patched).toHaveLength(1), SAVED)
      expect(api.note('note-gran')?.body).toBe(`${GRAN} Thêm sữa.`)
    })

    it('never sends two saves over the same version: one made while the first is on its way waits for it', async () => {
      const api = backend()
      api.slowSaves(200)
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()

      await user.type(text(), ' Thêm sữa.')
      await user.tab()
      await user.type(text(), ' Thêm trứng.')
      await user.tab()

      await vi.waitFor(() => expect(api.patched).toHaveLength(2), { timeout: 3000 })
      expect(api.patched.map(([, change]) => change.version)).toEqual([2, 3])
      await pause(300)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(api.note('note-gran')?.body).toBe(`${GRAN} Thêm sữa. Thêm trứng.`)
    })

    it('does not save a text emptied out, and says the note needs text', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()

      await user.clear(text())
      await user.tab()
      await pause(800)

      expect(await screen.findByRole('alert')).toHaveTextContent('Ghi chú cần có nội dung')
      expect(api.patched).toEqual([])
    })

    it('pins on the server without moving the time of the edit', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-trip')
      await ready()

      await user.click(editor().getByRole('button', { name: 'Ghim' }))

      await vi.waitFor(() => expect(editor().getByRole('button', { name: 'Ghim' })).toHaveAttribute('aria-pressed', 'true'), SAVED)
      expect(api.patched).toEqual([['note-trip', { version: 0, pinned: true }]])
      expect(api.note('note-trip')?.updatedAt).toBe('2026-09-25T14:10:00Z')
      expect(list().getByRole('button', { name: 'Đã ghim · 2' })).toBeInTheDocument()
    })

    it('deletes on the server and goes back to the list', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { router } = renderApp('/notes/note-trip')
      await ready()

      await user.click(editor().getByRole('button', { name: 'Xóa ghi chú' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' })).getByRole('button', { name: 'Xóa' }))

      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes'), SAVED)
      expect(api.deleted).toEqual(['note-trip'])
      expect(cardTitles()).not.toContain('Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm.')
    })

    it('counts a note already deleted elsewhere as deleted', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { router } = renderApp('/notes/note-trip')
      await ready()
      api.removeElsewhere('note-trip')

      await user.click(editor().getByRole('button', { name: 'Xóa ghi chú' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' })).getByRole('button', { name: 'Xóa' }))

      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes'), SAVED)
      expect(cardTitles()).not.toContain('Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm.')
    })
  })

  describe('a note saved from another place (D-172, D-178)', () => {
    it('says so, keeps the typing and stops saving by itself', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()
      api.editElsewhere('note-gran', { body: 'Sửa ở điện thoại' })

      await user.type(text(), ' Thêm sữa.')
      await user.tab()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(WARNING)
      expect(within(alert).getByRole('button', { name: 'Tải bản mới' })).toBeInTheDocument()
      expect(within(alert).getByRole('button', { name: 'Lưu bản của tôi' })).toBeInTheDocument()
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
      await user.type(text(), ' Nữa.')
      await user.tab()
      await pause(800)
      expect(api.patched).toHaveLength(1)
      expect(api.note('note-gran')?.body).toBe('Sửa ở điện thoại')
    })

    it('"Tải bản mới" takes the text of the server, and the next save goes over its version', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()
      api.editElsewhere('note-gran', { body: 'Sửa ở điện thoại' })
      await user.type(text(), ' Thêm sữa.')
      await user.tab()

      await user.click(await screen.findByRole('button', { name: 'Tải bản mới' }))

      await vi.waitFor(() => expect(text()).toHaveValue('Sửa ở điện thoại'), SAVED)
      expect(screen.queryByRole('alert')).toBeNull()
      await user.type(text(), '!')
      await user.tab()
      await vi.waitFor(() => expect(api.patched).toHaveLength(2), SAVED)
      expect(api.patched[1]).toEqual(['note-gran', { version: 3, body: 'Sửa ở điện thoại!' }])
    })

    it('"Lưu bản của tôi" saves the typing over the newest version', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()
      api.editElsewhere('note-gran', { body: 'Sửa ở điện thoại' })
      await user.type(text(), ' Thêm sữa.')
      await user.tab()

      await user.click(await screen.findByRole('button', { name: 'Lưu bản của tôi' }))

      await vi.waitFor(() => expect(api.patched).toHaveLength(2), SAVED)
      expect(api.patched[1]).toEqual(['note-gran', { version: 3, body: `${GRAN} Thêm sữa.` }])
      expect(api.note('note-gran')?.body).toBe(`${GRAN} Thêm sữa.`)
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
    })

    it('does not take the typing away when the list is read again, and the save that follows is refused, not silent', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { queryClient } = renderApp('/notes/note-gran')
      await ready()
      await user.type(text(), ' Thêm sữa.')

      api.editElsewhere('note-gran', { body: 'Sửa ở điện thoại' })
      await act(() => queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY }))
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
      await user.tab()

      expect(await screen.findByRole('alert')).toHaveTextContent(WARNING)
      // The save went over the version the typing started from (2), not over the one just read (3).
      expect(api.patched).toEqual([['note-gran', { version: 2, body: `${GRAN} Thêm sữa.` }]])
      expect(api.note('note-gran')?.body).toBe('Sửa ở điện thoại')
    })

    it('takes the newer note of a list read again while nothing of the typing is unsaved', async () => {
      const api = backend()
      const { queryClient } = renderApp('/notes/note-gran')
      await ready()
      expect(text()).toHaveValue(GRAN)

      api.editElsewhere('note-gran', { body: 'Sửa ở điện thoại' })
      await act(() => queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY }))

      await vi.waitFor(() => expect(text()).toHaveValue('Sửa ở điện thoại'), SAVED)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('says a note was deleted elsewhere, keeps the text, and "Lưu thành ghi chú mới" makes it again', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { router } = renderApp('/notes/note-gran')
      await ready()
      api.removeElsewhere('note-gran')

      await user.type(text(), ' Thêm sữa.')
      await user.tab()

      expect(await screen.findByRole('alert')).toHaveTextContent('Ghi chú này đã bị xóa ở nơi khác.')
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
      await user.click(screen.getByRole('button', { name: 'Lưu thành ghi chú mới' }))

      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes/note-new-1'), SAVED)
      expect(api.created).toEqual([{ kind: 'TEXT', title: 'Danh sách mua cho bà', body: `${GRAN} Thêm sữa.` }])
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
    })
  })

  describe('when a change cannot be saved (D-178)', () => {
    it('says so, keeps the typing, and "Thử lại" saves it', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()
      api.setDown(true)

      await user.type(text(), ' Thêm sữa.')
      await user.tab()

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Không lưu được thay đổi.')
      expect(text()).toHaveValue(`${GRAN} Thêm sữa.`)
      api.setDown(false)
      await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

      await vi.waitFor(() => expect(api.note('note-gran')?.body).toBe(`${GRAN} Thêm sữa.`), SAVED)
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
      // The failed try and the one that worked went over the same version.
      expect(api.patched.map(([, change]) => change.version)).toEqual([2, 2])
    })

    it('tries again by itself when the typing stops again', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-gran')
      await ready()
      api.fail(1)
      await user.type(text(), ' Thêm sữa.')
      await user.tab()
      expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được thay đổi.')

      await user.type(text(), ' Thêm trứng.')

      await vi.waitFor(() => expect(api.note('note-gran')?.body).toBe(`${GRAN} Thêm sữa. Thêm trứng.`), SAVED)
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
    })

    it('stays on /notes/new with its text when a new note cannot be made, and "Thử lại" makes it', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { router } = renderApp('/notes/new')
      await ready()
      api.fail(1)

      await user.type(text(), 'Gọi lại cho phòng khám')
      await user.tab()

      expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được thay đổi.')
      expect(router.state.location.pathname).toBe('/notes/new')
      expect(text()).toHaveValue('Gọi lại cho phòng khám')
      await user.click(screen.getByRole('button', { name: 'Thử lại' }))

      await vi.waitFor(() => expect(router.state.location.pathname).toMatch(/^\/notes\/note-new-\d$/), SAVED)
      expect(text()).toHaveValue('Gọi lại cho phòng khám')
      expect(api.created).toHaveLength(2)
    })

    it('leaves the pin as it was and says so when a pin is refused', async () => {
      const api = backend()
      const user = userEvent.setup()
      renderApp('/notes/note-trip')
      await ready()
      api.fail(1)

      await user.click(editor().getByRole('button', { name: 'Ghim' }))

      expect(await screen.findByText('Không ghim được. Hãy thử lại.')).toBeInTheDocument()
      expect(editor().getByRole('button', { name: 'Ghim' })).toHaveAttribute('aria-pressed', 'false')
      await user.click(editor().getByRole('button', { name: 'Ghim' }))
      await vi.waitFor(() => expect(editor().getByRole('button', { name: 'Ghim' })).toHaveAttribute('aria-pressed', 'true'), SAVED)
      expect(screen.queryByText('Không ghim được. Hãy thử lại.')).toBeNull()
    })

    it('keeps the note and says so when a delete is refused', async () => {
      const api = backend()
      const user = userEvent.setup()
      const { router } = renderApp('/notes/note-trip')
      await ready()
      api.fail(1)

      await user.click(editor().getByRole('button', { name: 'Xóa ghi chú' }))
      const dialog = within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' }))
      await user.click(dialog.getByRole('button', { name: 'Xóa' }))

      expect(await dialog.findByRole('alert')).toHaveTextContent('Không xóa được ghi chú. Hãy thử lại.')
      expect(router.state.location.pathname).toBe('/notes/note-trip')
      await user.click(dialog.getByRole('button', { name: 'Xóa' }))
      await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes'), SAVED)
    })
  })
})

describe('Sơ đồ on the F15 API (FE-90)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('makes a diagram on the server at its first change, as one note with its whole diagram and no body', async () => {
    const api = backend()
    const user = userEvent.setup()
    const { router } = renderApp('/notes/new?kind=diagram')
    await ready()

    await user.click((await diagram()).getByRole('button', { name: 'Thêm khối' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes/note-new-1'), SAVED)
    expect(api.created).toHaveLength(1)
    const made = api.created[0] as { kind: string; title: string; body?: string; diagram: { blocks: unknown[]; links: unknown[] } }
    expect(made).toMatchObject({ kind: 'DIAGRAM', title: '' })
    expect(made).not.toHaveProperty('body')
    expect(made.diagram.blocks).toHaveLength(2)
    expect((await diagram()).getByText('2 khối · 0 đường nối')).toBeInTheDocument()
  })

  it('saves the whole diagram over the version it read', async () => {
    const api = backend()
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()

    const open = await diagram()
    expect(await open.findByText('Thuê homestay')).toBeInTheDocument()
    await user.click(open.getByRole('button', { name: 'Thêm khối' }))

    await vi.waitFor(() => expect(api.patched).toHaveLength(1), SAVED)
    const [id, change] = api.patched[0]
    expect(id).toBe('note-plan')
    expect(change.version).toBe(4)
    expect(change).not.toHaveProperty('title')
    expect(change.diagram?.blocks).toHaveLength(3)
    expect(change.diagram?.blocks.slice(0, 2).map((block) => block.id)).toEqual(['plan-trip', 'plan-stay'])
    expect(change.diagram?.links).toHaveLength(1)
  })

  it('saves a new name over the version it read', async () => {
    const api = backend()
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()

    const name = (await diagram()).getByRole('textbox', { name: 'Tên sơ đồ' })
    await user.clear(name)
    await user.type(name, 'Đà Lạt tháng 12')

    await vi.waitFor(() => expect(api.patched).toHaveLength(1), SAVED)
    expect(api.patched[0]).toEqual(['note-plan', { version: 4, title: 'Đà Lạt tháng 12' }])
  })

  it('says a diagram was saved elsewhere, keeps what was drawn, and "Tải bản mới" draws the server diagram again', async () => {
    const api = backend()
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()
    const open = await diagram()
    expect(await open.findByText('Thuê homestay')).toBeInTheDocument()
    api.editElsewhere('note-plan', { title: 'Đổi ở máy khác' })

    await user.click(open.getByRole('button', { name: 'Thêm khối' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ghi chú này vừa được sửa ở nơi khác. Thay đổi bạn vừa vẽ chưa được lưu.')
    expect(open.getByText('3 khối · 1 đường nối')).toBeInTheDocument()
    expect(api.patched).toHaveLength(1)
    await user.click(within(alert).getByRole('button', { name: 'Tải bản mới' }))

    await vi.waitFor(() => expect(open.getByRole('textbox', { name: 'Tên sơ đồ' })).toHaveValue('Đổi ở máy khác'), SAVED)
    expect(open.getByText('2 khối · 1 đường nối')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Lưu bản của tôi" saves the diagram as drawn over the newest version', async () => {
    const api = backend()
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()
    const open = await diagram()
    expect(await open.findByText('Thuê homestay')).toBeInTheDocument()
    api.editElsewhere('note-plan', { title: 'Đổi ở máy khác' })
    await user.click(open.getByRole('button', { name: 'Thêm khối' }))

    await user.click(await screen.findByRole('button', { name: 'Lưu bản của tôi' }))

    await vi.waitFor(() => expect(api.patched).toHaveLength(2), SAVED)
    expect(api.patched[1][1].version).toBe(5)
    expect(api.note('note-plan')?.diagram?.blocks).toHaveLength(3)
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
  })

  it('keeps the drawing and says so when the diagram cannot be saved, and "Thử lại" saves it', async () => {
    const api = backend()
    const user = userEvent.setup()
    renderApp('/notes/note-plan')
    await ready()
    const open = await diagram()
    expect(await open.findByText('Thuê homestay')).toBeInTheDocument()
    api.setDown(true)

    await user.click(open.getByRole('button', { name: 'Thêm khối' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không lưu được thay đổi.')
    expect(open.getByText('3 khối · 1 đường nối')).toBeInTheDocument()
    api.setDown(false)
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    await vi.waitFor(() => expect(api.note('note-plan')?.diagram?.blocks).toHaveLength(3), SAVED)
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), SAVED)
  })

  it('says a diagram was deleted elsewhere, and "Lưu thành ghi chú mới" makes it again', async () => {
    const api = backend()
    const user = userEvent.setup()
    const { router } = renderApp('/notes/note-plan')
    await ready()
    const open = await diagram()
    expect(await open.findByText('Thuê homestay')).toBeInTheDocument()
    api.removeElsewhere('note-plan')

    await user.click(open.getByRole('button', { name: 'Thêm khối' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ghi chú này đã bị xóa ở nơi khác.')
    await user.click(screen.getByRole('button', { name: 'Lưu thành ghi chú mới' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes/note-new-1'), SAVED)
    expect(api.created[0]).toMatchObject({ kind: 'DIAGRAM', title: 'Kế hoạch chuyến đi Đà Lạt' })
    expect((await diagram()).getByText('3 khối · 1 đường nối')).toBeInTheDocument()
  })
})
