import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp, shellPart } from '@/test/renderApp'
import { createInboxSample } from './inbox.sample'

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const rowTitles = () => list().queryAllByRole('link').map((link) => link.querySelector('[data-slot="row-title"]')?.textContent)
/** The page's own mobile header: a <header> inside <main> is no landmark, so it is found through its heading. */
const mobileHeader = (heading: HTMLElement) => heading.closest('header')!

describe('Hộp thư on tablet and mobile', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has its own mobile header with the unread count, instead of the shell top bar', async () => {
    open('/inbox')
    const headings = await screen.findAllByRole('heading', { level: 1, name: 'Hộp thư' })
    const header = mobileHeader(headings.find((heading) => heading.closest('header'))!)

    expect(within(header).getByText('12 chưa đọc')).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Tìm kiếm' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Bộ lọc' })).toBeInTheDocument()
    expect(shellPart('topbar')).toHaveClass('max-md:hidden')
    expect(document.querySelector('[data-slot="tabbar"]')).not.toBeNull()
  })

  it('filters by source with the mobile chips', async () => {
    const { router } = open('/inbox')
    const user = userEvent.setup()
    const chips = within(await screen.findByRole('group', { name: 'Nguồn' }))

    expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Tất cả · 12', 'Gmail · 7', 'Zalo · 4', 'Messenger'])
    expect(chips.getByRole('button', { name: 'Tất cả · 12' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(chips.getByRole('button', { name: 'Zalo · 4' }))

    expect(router.state.location.search).toBe('?source=zalo')
    expect(chips.getByRole('button', { name: 'Zalo · 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(rowTitles()).toEqual(['Nhóm chạy bộ Hồ Tây', 'Gia đình'])
  })

  it('filters by source and view with the tablet chips', async () => {
    const { router } = open('/inbox')
    const user = userEvent.setup()
    const chips = within(await screen.findByRole('group', { name: 'Lọc' }))

    await user.selectOptions(chips.getByRole('combobox', { name: 'Nguồn' }), 'Gmail · 7')
    expect(router.state.location.search).toBe('?source=gmail')

    await user.click(chips.getByRole('button', { name: 'Chưa đọc' }))
    expect(router.state.location.search).toBe('?source=gmail&view=unread')
    expect(chips.getByRole('button', { name: 'Chưa đọc' })).toHaveAttribute('aria-pressed', 'true')
    expect(rowTitles()).toEqual(['Trần Minh Anh', 'Phòng khám Ánh Dương'])
  })

  it('opens a conversation as a mobile sub-page with a way back and no tab bar', async () => {
    open('/inbox/conv-2?source=zalo')
    const back = await screen.findByRole('link', { name: 'Quay lại Hộp thư' })
    const header = mobileHeader(back)

    expect(back).toHaveAttribute('href', '/inbox?source=zalo')
    expect(within(header).getByRole('heading', { level: 1, name: 'Gia đình' })).toBeInTheDocument()
    expect(within(header).getByText('Zalo · 6 người')).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Thông tin cuộc trò chuyện' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="tabbar"]')).toBeNull()
  })

  it('names an email conversation by its sender and source on mobile', async () => {
    open('/inbox/conv-1')
    const header = mobileHeader(await screen.findByRole('link', { name: 'Quay lại Hộp thư' }))

    expect(within(header).getByRole('heading', { level: 1, name: 'Trần Minh Anh' })).toBeInTheDocument()
    expect(within(header).getByText('Gmail')).toBeInTheDocument()
  })
})
