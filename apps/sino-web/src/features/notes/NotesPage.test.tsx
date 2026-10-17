import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

const open = (path: string) => renderApp(path)
/** The list is there: the sample has loaded. */
const ready = () => screen.findByRole('region', { name: 'Danh sách ghi chú' })
const list = () => within(screen.getByRole('region', { name: 'Danh sách ghi chú' }))
const editor = () => within(screen.getByRole('main', { name: 'Ghi chú đang mở' }))
const card = (title: RegExp) => list().getByRole('link', { name: title })
const cardTitles = () => list().queryAllByRole('link').flatMap((link) => link.querySelector('[data-slot="note-title"]')?.textContent ?? [])

describe('Ghi chú on desktop (NT-02, fe-ui-notes)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the notes as the canvas: pinned first, each with its time, start and source', async () => {
    open('/notes')
    await ready()

    // Two in the DOM: the phone header's and the title of 768 px up; CSS shows one.
    expect(list().getAllByRole('heading', { level: 1, name: 'Ghi chú' })).toHaveLength(2)
    expect(list().getByText('ĐÃ GHIM')).toBeInTheDocument()
    expect(list().getByText('GẦN ĐÂY')).toBeInTheDocument()
    expect(cardTitles()).toEqual([
      'Danh sách mua cho bà',
      'Mã khách hàng phòng khám',
      'Điều khoản 4 — thời hạn thanh toán',
      'Hoàng thích nhận file qua Drive',
      'Số hợp đồng bảo hiểm',
      'Ý tưởng chuyến đi Đà Lạt tháng 12',
      'Kế hoạch chuyến đi Đà Lạt',
    ])
    const clause = within(card(/Điều khoản 4/))
    expect(clause.getByText('09:52')).toBeInTheDocument()
    expect(clause.getByText('Thư · Trần Minh Anh')).toBeInTheDocument()
    expect(within(card(/Mã khách hàng/)).getByRole('img', { name: 'Đã ghim' })).toBeInTheDocument()
    expect(within(card(/Mã khách hàng/)).getByText('Hôm qua')).toBeInTheDocument()
    expect(within(card(/Số hợp đồng/)).getByText('Tin nhắn gốc không còn')).toBeInTheDocument()
    expect(within(card(/Ý tưởng chuyến đi/)).getByText('Ghi chú độc lập')).toBeInTheDocument()
    // The sample diagram (spec diagram-notes); its card is checked in DiagramNotes.test.
    expect(within(card(/Kế hoạch chuyến đi/)).getByText('Sơ đồ · 7 khối · 6 nối')).toBeInTheDocument()
    expect(screen.getByText('Chọn một ghi chú để xem')).toBeInTheDocument()
  })

  it('filters and searches, keeping both in the address (D-205)', async () => {
    const user = userEvent.setup()
    const { router } = open('/notes')
    await ready()

    await user.click(await list().findByRole('button', { name: 'Đã ghim · 2' }))
    expect(router.state.location.search).toBe('?filter=pinned')
    expect(cardTitles()).toEqual(['Danh sách mua cho bà', 'Mã khách hàng phòng khám'])

    await user.click(list().getByRole('button', { name: 'Tất cả · 7' }))
    await user.type(list().getByRole('searchbox', { name: 'Tìm trong ghi chú' }), 'thanh toan')
    expect(router.state.location.search).toBe('?q=thanh+toan')
    expect(cardTitles()).toEqual(['Điều khoản 4 — thời hạn thanh toán'])

    await user.type(list().getByRole('searchbox', { name: 'Tìm trong ghi chú' }), ' xyz')
    expect(list().getByText('Không có ghi chú nào khớp')).toBeInTheDocument()
  })

  it('opens a note in the right column with its anchor, quote, related task and foot (D-204)', async () => {
    const user = userEvent.setup()
    const { router } = open('/notes?filter=linked')
    await ready()

    await user.click(await list().findByRole('link', { name: /Điều khoản 4/ }))

    expect(router.state.location.pathname).toBe('/notes/note-clause')
    expect(router.state.location.search).toBe('?filter=linked')
    expect(card(/Điều khoản 4/)).toHaveAttribute('aria-current', 'page')
    expect(editor().getByText('Gắn với thư')).toBeInTheDocument()
    expect(editor().getByRole('link', { name: 'Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2' })).toHaveAttribute('href', '/inbox/conv-1')
    expect(editor().getByRole('textbox', { name: 'Tiêu đề ghi chú' })).toHaveValue('Điều khoản 4 — thời hạn thanh toán')
    expect(editor().getByText('TRÍCH TỪ THƯ · 09:41 HÔM NAY')).toBeInTheDocument()
    expect((editor().getByRole('textbox', { name: 'Nội dung ghi chú' }) as HTMLTextAreaElement).value).toContain('- Hỏi lại kế toán')
    expect(editor().getByRole('link', { name: /Trả lời: Hợp đồng thuê văn phòng/ })).toHaveAttribute('href', '/tasks/task-contract')
    expect(editor().getByText('hạn T4 07/10')).toBeInTheDocument()
    expect(editor().getByText('Sửa lúc 09:52 hôm nay · tự lưu')).toBeInTheDocument()
  })

  it('saves an edit by itself once the typing stops, and keeps a note that lost all its text as it was (D-203)', async () => {
    const user = userEvent.setup()
    open('/notes/note-trip')
    await ready()

    const body = await editor().findByRole('textbox', { name: 'Nội dung ghi chú' })
    await user.clear(body)
    await user.type(body, 'Đi tháng 11 thay vì 12.')

    // The save waits 600 ms after the typing; a busy test run needs more than the default second.
    await vi.waitFor(() => expect(within(card(/Ý tưởng chuyến đi/)).getByText('Đi tháng 11 thay vì 12.')).toBeInTheDocument(), { timeout: 3000 })
    expect(within(card(/Ý tưởng chuyến đi/)).getByText('14:05')).toBeInTheDocument()
    // The newest edit tops its group.
    expect(cardTitles()[2]).toBe('Ý tưởng chuyến đi Đà Lạt tháng 12')
    expect(editor().getByText('Sửa lúc 14:05 hôm nay · tự lưu')).toBeInTheDocument()

    await user.clear(body)
    expect(editor().getByText('Ghi chú cần có nội dung')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(within(card(/Ý tưởng chuyến đi/)).getByText('Đi tháng 11 thay vì 12.')).toBeInTheDocument()
  })

  it('makes a new note once it has text, under its own address, keeping the typing going (D-203)', async () => {
    const user = userEvent.setup()
    const { router } = open('/notes')
    await ready()

    // "+ Ghi chú" asks which kind (fe-ui-diagram-notes, D-206).
    await user.click(await list().findByRole('button', { name: 'Ghi chú' }))
    await user.click(await screen.findByRole('menuitem', { name: /Ghi chú chữ/ }))
    expect(router.state.location.pathname).toBe('/notes/new')
    const body = editor().getByRole('textbox', { name: 'Nội dung ghi chú' })
    await user.type(body, 'Gọi lại cho phòng khám')

    await vi.waitFor(() => expect(router.state.location.pathname).toMatch(/^\/notes\/[0-9a-f-]{36}$/), { timeout: 3000 })
    expect(router.state.historyAction).toBe('REPLACE')
    // The list hears of the new note a tick after the address changes (TanStack Query batches with setTimeout); under
    // a loaded full run that tick came after the check (fe-ui-diagram-notes DG-02).
    expect(within(await list().findByRole('link', { name: /Gọi lại cho phòng khám/ })).getByText('Ghi chú độc lập')).toBeInTheDocument()
    expect(editor().getByRole('textbox', { name: 'Nội dung ghi chú' })).toHaveFocus()
    expect(list().getByRole('button', { name: 'Tất cả · 8' })).toBeInTheDocument()
  })

  it('leaves nothing behind when a new note is left empty', async () => {
    const user = userEvent.setup()
    open('/notes/new')
    await ready()

    await user.click(await list().findByRole('link', { name: /Ý tưởng chuyến đi/ }))

    expect(list().getByRole('button', { name: 'Tất cả · 7' })).toBeInTheDocument()
  })

  it('pins and unpins, moving the card between the groups', async () => {
    const user = userEvent.setup()
    open('/notes/note-trip')
    await ready()

    const pin = await editor().findByRole('button', { name: 'Ghim' })
    expect(pin).toHaveAttribute('aria-pressed', 'false')
    await user.click(pin)

    expect(list().getByRole('button', { name: 'Đã ghim · 3' })).toBeInTheDocument()
    expect(cardTitles().slice(0, 3)).toContain('Ý tưởng chuyến đi Đà Lạt tháng 12')
    // A toggle keeps its name and says its state.
    expect(pin).toHaveAttribute('aria-pressed', 'true')

    await user.click(pin)
    expect(list().getByRole('button', { name: 'Đã ghim · 2' })).toBeInTheDocument()
  })

  it('asks before deleting, and goes back to the list after it', async () => {
    const user = userEvent.setup()
    const { router } = open('/notes/note-clause?filter=linked')
    await ready()

    await user.click(await editor().findByRole('button', { name: 'Xóa ghi chú' }))
    let dialog = within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' }))
    await user.click(dialog.getByRole('button', { name: 'Hủy' }))
    expect(cardTitles()).toContain('Điều khoản 4 — thời hạn thanh toán')

    await user.click(editor().getByRole('button', { name: 'Xóa ghi chú' }))
    dialog = within(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' }))
    await user.click(dialog.getByRole('button', { name: 'Xóa' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/notes'))
    expect(router.state.location.search).toBe('?filter=linked')
    expect(router.state.historyAction).toBe('REPLACE')
    expect(cardTitles()).not.toContain('Điều khoản 4 — thời hạn thanh toán')
  })
})
