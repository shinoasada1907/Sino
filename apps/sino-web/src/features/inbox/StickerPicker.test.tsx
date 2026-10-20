import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import type { StickerItem, StickerPack } from '@/features/stickers/stickers.types'
import { pack, sticker } from '@/test/fixtures/stickersApi'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'

// ZS-08: the "Sticker" button of the chat composer and the picker it opens (spec chat-sticker-picker of zalo-send-images).
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))
const messageBox = () => chat().getByRole('textbox', { name: 'Nhắn tin tới Gia đình' })
const picker = () => within(screen.getByRole('dialog', { name: 'Sticker' }))

/** `Mèo` holds a cat and a dance (the cat is newer), `Chó` a dog, `Trống` nothing, and one sticker is in no pack. */
const PACKS: StickerPack[] = [
  pack({ id: 'pk-cats', name: 'Mèo', stickerCount: 2, coverStickerId: 'st-cat', createdAt: '2026-10-20T08:00:00Z' }),
  pack({ id: 'pk-dogs', name: 'Chó', stickerCount: 1, coverStickerId: 'st-dog', createdAt: '2026-10-20T09:00:00Z' }),
  pack({ id: 'pk-empty', name: 'Trống', createdAt: '2026-10-20T10:00:00Z' }),
]
const STICKERS: StickerItem[] = [
  sticker({ id: 'st-cat', name: 'meo', packId: 'pk-cats', createdAt: '2026-10-19T09:00:00Z' }),
  sticker({ id: 'st-dance', name: 'nhay', mediaType: 'image/gif', kind: 'ANIMATED', packId: 'pk-cats', createdAt: '2026-10-19T08:00:00Z' }),
  sticker({ id: 'st-dog', name: 'cho', packId: 'pk-dogs', createdAt: '2026-10-19T07:00:00Z' }),
  sticker({ id: 'st-loose', name: 'le', createdAt: '2026-10-19T06:00:00Z' }),
]

/** The library the server keeps; counts how often the stickers are read. */
function library(stickers: StickerItem[] = STICKERS, packs: StickerPack[] = PACKS) {
  const reads = { stickers: 0 }
  server.use(
    http.get('/api/stickers', () => {
      reads.stickers += 1
      return HttpResponse.json({ items: stickers })
    }),
    http.get('/api/sticker-packs', () => HttpResponse.json({ items: packs })),
  )
  return reads
}

// The sample's own answer, taken once: `restoreMocks` does not undo the implementation a test gives a `vi.fn`.
const sampleConversation = vi.mocked(api.fetchConversation).getMockImplementation()!

/** Opens a conversation whose detail says whether a picture can be sent there, once its message box is there. */
async function open(path: string, canSendImages: boolean) {
  vi.mocked(api.fetchConversation).mockImplementation(async (conversationId) => {
    const opened = await sampleConversation(conversationId)
    return { ...opened, detail: { ...opened.detail, canSendImages } }
  })
  renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
  await screen.findByRole('textbox', { name: /^(Nhắn tin tới|Trả lời)/ })
}

const openChat = (canSendImages = true) => open('/messages/conv-2', canSendImages)

describe('the sticker picker of a chat (ZS-08)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.mocked(api.sendSticker).mockClear()
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has a "Sticker" button where the conversation sends pictures', async () => {
    library()
    await openChat(true)

    expect(chat().getByRole('button', { name: 'Sticker' })).toBeInTheDocument()
  })

  it('has no "Sticker" button where the conversation cannot send pictures', async () => {
    library()
    await openChat(false)

    expect(chat().queryByRole('button', { name: 'Sticker' })).not.toBeInTheDocument()
  })

  it('has no "Sticker" button in an email, even when the account could send pictures', async () => {
    library()
    await open('/inbox/conv-1', true)

    expect(screen.queryByRole('button', { name: 'Sticker' })).not.toBeInTheDocument()
  })

  it('reads the library when the picker opens, not when the chat opens', async () => {
    const reads = library()
    const user = userEvent.setup()
    await openChat()

    expect(reads.stickers).toBe(0)
    await user.click(chat().getByRole('button', { name: 'Sticker' }))

    await picker().findByRole('tablist', { name: 'Bộ sticker' })
    expect(reads.stickers).toBe(1)
  })

  it('has a tab per pack that holds stickers, in the order of the packs, then "Chưa xếp bộ"', async () => {
    library()
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))

    const tabs = await picker().findAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    const cats = within(picker().getByRole('tabpanel', { name: 'Mèo' }))
    expect(cats.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['meo', 'nhay'])
    // The picture comes from the library; a GIF or a moving WebP plays on its own.
    expect(cats.getByRole('button', { name: 'nhay' }).querySelector('img')).toHaveAttribute('src', '/api/stickers/st-dance/content')

    await user.click(picker().getByRole('tab', { name: 'Chó' }))
    expect(within(picker().getByRole('tabpanel', { name: 'Chó' })).getByRole('button', { name: 'cho' })).toBeInTheDocument()
    await user.click(picker().getByRole('tab', { name: 'Chưa xếp bộ' }))
    expect(within(picker().getByRole('tabpanel', { name: 'Chưa xếp bộ' })).getByRole('button', { name: 'le' })).toBeInTheDocument()
  })

  it('says the library is empty, with a way to it', async () => {
    library([], [])
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))

    expect(await picker().findByText('Chưa có sticker nào.')).toBeInTheDocument()
    expect(picker().getByRole('link', { name: 'Mở thư viện sticker' })).toHaveAttribute('href', '/stickers')
    expect(picker().queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('says when the library cannot be read, and reads it again on "Thử lại"', async () => {
    let fail = true
    library()
    server.use(
      http.get('/api/stickers', () =>
        fail ? HttpResponse.json({ title: 'Error', status: 500, code: 'INTERNAL' }, { status: 500 }) : HttpResponse.json({ items: STICKERS }),
      ),
    )
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))
    expect(await picker().findByText('Không tải được thư viện sticker.')).toBeInTheDocument()

    fail = false
    await user.click(picker().getByRole('button', { name: 'Thử lại' }))
    expect(await picker().findByRole('tab', { name: 'Mèo' })).toBeInTheDocument()
  })

  it('sends the sticker clicked, closes, shows the message at once and gives the focus back to the message box', async () => {
    library()
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))
    await user.click(await picker().findByRole('button', { name: 'meo' }))

    expect(api.sendSticker).toHaveBeenCalledTimes(1)
    expect(api.sendSticker).toHaveBeenCalledWith('conv-2', 'st-cat', expect.stringMatching(/^[0-9a-f-]{36}$/))
    expect(screen.queryByRole('dialog', { name: 'Sticker' })).not.toBeInTheDocument()
    expect(await chat().findByRole('img', { name: 'Sticker' })).toHaveAttribute('src', '/api/stickers/st-cat/content')
    await waitFor(() => expect(messageBox()).toHaveFocus())
  })

  it('works from the keyboard: Enter opens on the first sticker, the arrows move, Enter sends', async () => {
    library()
    const user = userEvent.setup()
    await openChat()

    chat().getByRole('button', { name: 'Sticker' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(picker().getByRole('button', { name: 'meo' })).toHaveFocus())
    // One sticker of the grid is in the tab order at a time; the arrows go between them.
    expect(picker().getByRole('button', { name: 'nhay' })).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowRight}')
    expect(picker().getByRole('button', { name: 'nhay' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(picker().getByRole('button', { name: 'nhay' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(picker().getByRole('button', { name: 'meo' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(picker().getByRole('button', { name: 'nhay' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(api.sendSticker).toHaveBeenCalledWith('conv-2', 'st-dance', expect.any(String))
    await waitFor(() => expect(messageBox()).toHaveFocus())
  })

  it('goes up and down the grid by rows of four', async () => {
    const many = Array.from({ length: 6 }, (_, index) => sticker({ id: `st-${index}`, name: `s${index}` }))
    library(many, [])
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))
    await waitFor(() => expect(picker().getByRole('button', { name: 's0' })).toHaveFocus())

    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(picker().getByRole('button', { name: 's5' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(picker().getByRole('button', { name: 's5' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(picker().getByRole('button', { name: 's1' })).toHaveFocus()
  })

  it('closes on Escape and gives the focus back to the "Sticker" button, sending nothing', async () => {
    library()
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))
    await picker().findByRole('button', { name: 'meo' })
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Sticker' })).not.toBeInTheDocument()
    await waitFor(() => expect(chat().getByRole('button', { name: 'Sticker' })).toHaveFocus())
    expect(api.sendSticker).not.toHaveBeenCalled()
  })

  it('floats over the chat from 768 px', async () => {
    library()
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker' }))

    expect(await screen.findByRole('dialog', { name: 'Sticker' })).toHaveAttribute('data-slot', 'sticker-popover')
  })

  it('is a sheet from the bottom below 768 px, and sends from there too', async () => {
    stubViewport(390)
    library()
    const user = userEvent.setup()
    await openChat()

    await user.click(chat().getByRole('button', { name: 'Sticker', hidden: true }))

    expect(await screen.findByRole('dialog', { name: 'Sticker' })).toHaveAttribute('data-slot', 'sticker-sheet')
    await user.click(await picker().findByRole('button', { name: 'meo' }))
    expect(api.sendSticker).toHaveBeenCalledWith('conv-2', 'st-cat', expect.any(String))
    expect(screen.queryByRole('dialog', { name: 'Sticker' })).not.toBeInTheDocument()
  })
})
