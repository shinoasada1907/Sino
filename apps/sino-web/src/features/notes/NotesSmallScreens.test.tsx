import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fetchNotes } from './notes.api'

// The canvas sample, with every request a spy, so that a test can make it slow, fail or come back empty.
vi.mock('./notes.api', async (importOriginal) => (await import('@/test/notesSampleApi')).sampleNotesApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

const ready = () => screen.findByRole('region', { name: 'Danh sách ghi chú' })
/**
 * The page's own header on a phone (canvas `MobileNotes`, `MobileNoteEditor`), found by its back link: with a note open the
 * list's header is in the DOM too, hidden by CSS.
 */
const phoneHeader = (back: string) => within(screen.getByRole('link', { name: back }).closest('header')!)

describe('Ghi chú on a phone and a tablet, and its states (NT-03, fe-ui-notes)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('heads the list on a phone: back to "Thêm", the count, a new note and the search (canvas MobileNotes)', async () => {
    const user = userEvent.setup()
    renderApp('/notes?filter=pinned')
    await ready()

    expect(phoneHeader('Quay lại Thêm').getByRole('link', { name: 'Quay lại Thêm' })).toHaveAttribute('href', '/more')
    expect(phoneHeader('Quay lại Thêm').getByText('7 ghi chú')).toBeInTheDocument()
    // "Ghi chú mới" asks which kind (fe-ui-diagram-notes, D-206).
    await user.click(phoneHeader('Quay lại Thêm').getByRole('button', { name: 'Ghi chú mới' }))
    const menu = within(await screen.findByRole('menu'))
    expect(menu.getByRole('menuitem', { name: /Ghi chú chữ/ })).toHaveAttribute('href', '/notes/new?filter=pinned')
    expect(menu.getByRole('menuitem', { name: /Sơ đồ/ })).toHaveAttribute('href', '/notes/new?filter=pinned&kind=diagram')
    await user.keyboard('{Escape}')

    // The search stays out of the way on a phone until asked for.
    const box = screen.getByRole('searchbox', { name: 'Tìm trong ghi chú' }).closest('[data-slot="note-search"]')
    expect(box).toHaveClass('max-md:hidden')
    await user.click(phoneHeader('Quay lại Thêm').getByRole('button', { name: 'Tìm trong ghi chú' }))
    expect(box).not.toHaveClass('max-md:hidden')
    expect(screen.getByRole('searchbox', { name: 'Tìm trong ghi chú' })).toHaveFocus()
  })

  it('opens a note as a page of its own on a phone: back to the list, saved time, Ghim above, length and Xóa below (canvas MobileNoteEditor)', async () => {
    const user = userEvent.setup()
    renderApp('/notes/note-clause?filter=linked')
    await ready()

    expect(phoneHeader('Quay lại Ghi chú').getByRole('link', { name: 'Quay lại Ghi chú' })).toHaveAttribute('href', '/notes?filter=linked')
    expect(phoneHeader('Quay lại Ghi chú').getByText('TỰ LƯU · 09:52')).toBeInTheDocument()
    const pin = phoneHeader('Quay lại Ghi chú').getByRole('button', { name: 'Ghim' })
    await user.click(pin)
    expect(pin).toHaveAttribute('aria-pressed', 'true')

    const bar = within(screen.getByRole('group', { name: 'Ghi chú này' }))
    expect(bar.getByText('214 / 20.000 ký tự')).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Xóa' }))
    expect(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' })).toBeInTheDocument()
  })

  it('shows the list and the open note side by side from 768 px, the list alone on a phone (D-201)', async () => {
    renderApp('/notes/note-clause')
    await ready()

    expect(screen.getByRole('region', { name: 'Danh sách ghi chú' })).toHaveClass('hidden', 'md:flex')
    expect(screen.getByRole('main', { name: 'Ghi chú đang mở' }).parentElement).toHaveClass('flex')
  })

  it('shows the shape of the list while it loads', async () => {
    vi.mocked(fetchNotes).mockReturnValueOnce(new Promise(() => {}))
    renderApp('/notes')

    expect(await screen.findByRole('status', { name: 'Đang tải ghi chú' })).toBeInTheDocument()
    expect(phoneHeader('Quay lại Thêm').getByRole('link', { name: 'Quay lại Thêm' })).toBeInTheDocument()
  })

  it('says when the notes cannot load, and loads them on "Thử lại"', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchNotes).mockRejectedValueOnce(new Error('down'))
    renderApp('/notes')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Không tải được ghi chú' })).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await ready()).toBeInTheDocument()
  })

  it('says there is no note yet, with "+ Ghi chú"', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchNotes).mockResolvedValueOnce({ generatedAt: NOW.toISOString(), notes: [] })
    renderApp('/notes')

    const list = within(await ready())
    expect(list.getByText('Chưa có ghi chú nào')).toBeInTheDocument()
    // The title's "+ Ghi chú" and the empty state's.
    const buttons = list.getAllByRole('button', { name: 'Ghi chú' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /Ghi chú chữ/ })).toHaveAttribute('href', '/notes/new')
    expect(list.queryByText('Không có ghi chú nào khớp')).toBeNull()
  })
})
