import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import { ApiError } from '@/shared/api/problem'
import type { Message } from './inbox.types'
import { quoteText } from './reply'

// Reply to a chat message: the button, the strip above the box, the request and the quote in the bubble.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

function fromDad(id: string, extra: Partial<Message & { kind: 'MESSAGE' }> = {}): Message & { kind: 'MESSAGE' } {
  return { id, kind: 'MESSAGE', direction: 'IN', sender: 'Bố', to: null, at: '2026-10-02T07:00:00.000Z', text: `Tin ${id}`, attachments: [], status: null, linked: [], canQuote: true, ...extra }
}

async function open(items: Message[]) {
  vi.mocked(api.fetchMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null })
  renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
  await chat().findAllByText(`Tin ${items[0]!.id}`)
}

describe('quoteText', () => {
  it('names a sticker, a photo and a file by what they are, and cuts a long text', () => {
    expect(quoteText(fromDad('a', { text: '[Sticker]', libraryStickerId: 's1' }))).toBe('Sticker')
    expect(quoteText(fromDad('b', { text: '[Ảnh]', image: { url: 'https://x/y.jpg', thumbUrl: null, width: 1, height: 1, caption: null } as never }))).toBe('Ảnh')
    expect(quoteText(fromDad('c', { text: 'hd.pdf', attachments: [{ name: 'hd.pdf', type: 'PDF', sizeBytes: 1, image: false, caption: null }] }))).toBe('hd.pdf')
    expect(quoteText(fromDad('d', { text: 'x'.repeat(200) }))).toHaveLength(121)
  })
})

describe('the side buttons of a chat bubble', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('copies the text of a message from "Thêm", and has no "Thêm" for a sticker or a forward button at all', async () => {
    const user = userEvent.setup()
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } })
    await open([fromDad('m1'), fromDad('m2', { text: '[Sticker]', libraryStickerId: 's1' })])

    expect(chat().getAllByRole('button', { name: 'Thêm' })).toHaveLength(1)
    expect(chat().queryByRole('button', { name: /Chuyển tiếp/ })).toBeNull()
    await user.click(chat().getByRole('button', { name: 'Thêm' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sao chép' }))

    expect(written).toEqual(['Tin m1'])
  })
})

describe('replying to a chat message', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
    vi.mocked(api.sendMessage).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has a "Trả lời" on a stored message but not on one that is only in this browser', async () => {
    await open([fromDad('m1'), fromDad('m2', { direction: 'OUT', sender: 'Bạn', status: 'FAILED', local: true, clientMessageId: 'c2' })])
    expect(chat().getAllByRole('button', { name: 'Trả lời' })).toHaveLength(1)
  })

  it('shows "Trả lời" on every stored message regardless of canQuote', async () => {
    await open([fromDad('m1', { canQuote: false }), fromDad('m2', { canQuote: undefined }), fromDad('m3')])
    expect(chat().getAllByRole('button', { name: 'Trả lời' })).toHaveLength(3)
  })

  it('keeps the quote in the bubble when refused, says so, and "Gửi lại" retries the reply', async () => {
    await open([fromDad('m1')])
    const user = userEvent.setup()
    vi.mocked(api.sendMessage).mockRejectedValueOnce(new ApiError(422, 'QUOTE_UNAVAILABLE', null))

    await user.click(chat().getByRole('button', { name: 'Trả lời' }))
    await user.type(chat().getByRole('textbox'), 'Dạ con biết{Enter}')

    expect(await chat().findByText(/Không trả lời được tin này/)).toBeInTheDocument()
    const failed = chat().getByText('Dạ con biết').closest('[data-message-id]') as HTMLElement
    expect(within(failed).getByText('Tin m1')).toBeInTheDocument()
    await user.click(chat().getByRole('button', { name: 'Gửi lại' }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenLastCalledWith('conv-2', 'Dạ con biết', expect.any(String), 'm1'))
  })

  it('shows the quote strip, focuses the box, cancels with X and with Esc', async () => {
    await open([fromDad('m1')])
    const user = userEvent.setup()

    await user.click(chat().getByRole('button', { name: 'Trả lời' }))
    const strip = within(chat().getByRole('group', { name: 'Đang trả lời' }))
    expect(strip.getByText('Trả lời Bố')).toBeInTheDocument()
    expect(strip.getByText('Tin m1')).toBeInTheDocument()
    expect(chat().getByRole('textbox')).toHaveFocus()

    await user.click(strip.getByRole('button', { name: 'Hủy trả lời' }))
    expect(chat().queryByRole('group', { name: 'Đang trả lời' })).not.toBeInTheDocument()

    await user.click(chat().getByRole('button', { name: 'Trả lời' }))
    await user.keyboard('{Escape}')
    expect(chat().queryByRole('group', { name: 'Đang trả lời' })).not.toBeInTheDocument()
  })

  it('sends replyToMessageId, shows the quote in the bubble at once and clears the strip', async () => {
    await open([fromDad('m1')])
    const user = userEvent.setup()

    await user.click(chat().getByRole('button', { name: 'Trả lời' }))
    await user.type(chat().getByRole('textbox'), 'Dạ con biết{Enter}')

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('conv-2', 'Dạ con biết', expect.any(String), 'm1'))
    expect(chat().queryByRole('group', { name: 'Đang trả lời' })).not.toBeInTheDocument()
    const sent = (await chat().findByText('Dạ con biết')).closest('[data-message-id]') as HTMLElement
    expect(within(sent).getByText('Tin m1')).toBeInTheDocument()
  })

  it('sends no reply field for an ordinary message', async () => {
    await open([fromDad('m1')])
    const user = userEvent.setup()
    await user.type(chat().getByRole('textbox'), 'Chào{Enter}')
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('conv-2', 'Chào', expect.any(String)))
  })

  it('shows the quote of a message from the server and scrolls to the original when it is listed', async () => {
    await open([fromDad('m1'), fromDad('m2', { quote: { messageId: 'm1', senderName: 'Bố', text: 'Tin m1' } })])
    const scrolled = vi.fn()
    const original = document.querySelector<HTMLElement>('[data-message-id="m1"]')!
    original.scrollIntoView = scrolled

    fireEvent.click(chat().getByRole('button', { name: /Tin được trả lời của Bố/ }))

    expect(scrolled).toHaveBeenCalled()
  })

  it('shows a quote whose original is not in the list as plain text', async () => {
    await open([fromDad('m2', { quote: { messageId: 'old', senderName: 'Mẹ', text: 'Tin cũ' } })])
    expect(chat().getByText('Tin cũ')).toBeInTheDocument()
    expect(chat().queryByRole('button', { name: /Tin được trả lời/ })).not.toBeInTheDocument()
  })
})
