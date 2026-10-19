import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreReactFlow, stubReactFlow } from '@/test/reactFlow'
import { renderApp } from '@/test/renderApp'

// The canvas sample answers the requests of these tests (NT-01 to DG-04); the real API is tested in NotesOnApi.test.tsx (FE-90).
vi.mock('./notes.api', async (importOriginal) => (await import('@/test/notesSampleApi')).sampleNotesApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

// See DiagramCanvas.test: the canvas loads on its own, and the first one of a busy full run is slow.
beforeAll(() => import('./diagram/DiagramEditor'), 30_000)
const OPEN = { timeout: 8000 }

const open = async (path: string) => {
  renderApp(path)
  const main = within(await screen.findByRole('main', { name: 'Sơ đồ đang mở' }, OPEN))
  await main.findAllByText(/khối/)
  return main
}
/** The diagram's own header on a phone, found by its back link: the list's header is in the DOM too, hidden by CSS. */
const phoneHeader = () => within(screen.getByRole('link', { name: 'Quay lại Ghi chú' }).closest('header')!)
const pane = () => document.querySelector<HTMLElement>('.react-flow__pane')!
const touch = { pointerType: 'touch', pointerId: 1, clientX: 300, clientY: 300 }

describe('A diagram on a phone and a tablet (DG-04, fe-ui-diagram-notes, D-212)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubReactFlow()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(restoreReactFlow)

  it('opens as a page of its own on a phone: back to the list, saved time and Ghim above, the size and Xóa below', async () => {
    const user = userEvent.setup()
    const main = await open('/notes/note-plan?filter=diagram')

    expect(phoneHeader().getByRole('link', { name: 'Quay lại Ghi chú' })).toHaveAttribute('href', '/notes?filter=diagram')
    expect(phoneHeader().getByText('TỰ LƯU · 24/09')).toBeInTheDocument()
    expect(phoneHeader().getByRole('button', { name: 'Ghim' })).toBeInTheDocument()
    // The foot of 768 px up gives way to the bar of the phone.
    expect(main.getByText('Sửa lúc 24/09 · 21:30 · tự lưu').parentElement).toHaveClass('max-md:hidden')

    const bar = within(screen.getByRole('group', { name: 'Sơ đồ này' }))
    expect(bar.getByText('7 khối · 6 nối')).toBeInTheDocument()
    await user.click(bar.getByRole('button', { name: 'Xóa' }))
    expect(await screen.findByRole('dialog', { name: 'Xóa ghi chú này?' })).toBeInTheDocument()
  })

  it('shows the list and the diagram side by side from 768 px, the diagram alone on a phone', async () => {
    await open('/notes/note-plan')

    expect(screen.getByRole('region', { name: 'Danh sách ghi chú' })).toHaveClass('hidden', 'md:flex')
    expect(screen.getByRole('main', { name: 'Sơ đồ đang mở' }).parentElement).toHaveClass('flex')
  })

  it('opens "THÊM Ô" on a long press on empty ground (spec: nhấn giữ trên điện thoại)', async () => {
    await open('/notes/note-plan')

    fireEvent.pointerDown(pane(), touch)

    expect(await screen.findByRole('menu', { name: 'Thêm ô' }, { timeout: 2000 })).toBeInTheDocument()
  })

  it('does not open it on a short tap, on a press that moves (a pan), or when a second finger comes (a pinch)', async () => {
    await open('/notes/note-plan')

    // Each case waits past the long press on its own, so that none hides another.
    const pastLongPress = () => new Promise((resolve) => setTimeout(resolve, 700))
    fireEvent.pointerDown(pane(), touch)
    fireEvent.pointerUp(pane(), touch)
    await pastLongPress()
    expect(screen.queryByRole('menu', { name: 'Thêm ô' })).toBeNull()

    fireEvent.pointerDown(pane(), touch)
    fireEvent.pointerMove(pane(), { ...touch, clientX: 340 })
    await pastLongPress()
    expect(screen.queryByRole('menu', { name: 'Thêm ô' })).toBeNull()

    fireEvent.pointerDown(pane(), touch)
    fireEvent.pointerDown(pane(), { ...touch, pointerId: 2, clientX: 400 })
    await pastLongPress()
    expect(screen.queryByRole('menu', { name: 'Thêm ô' })).toBeNull()
  })

  it('tells a finger how to add and link', async () => {
    await open('/notes/new?kind=diagram')
    expect(screen.getByText(/Nhấn giữ chỗ trống để thêm khối/)).toHaveClass('pointer-coarse:inline')
    expect(screen.getByText(/Chuột phải hoặc bấm đúp vào chỗ trống/)).toHaveClass('pointer-coarse:hidden')
  })
})
