import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ChatThread } from './components/ChatThread'
import { createInboxSample } from './inbox.sample'
import type { ConversationDetail, Message } from './inbox.types'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const sample = createInboxSample(NOW)
const item = sample.conversations.find((conversation) => conversation.id === 'conv-2')!
const account = sample.accounts.find((candidate) => candidate.id === item.accountId)!

function message(n: number, extra: Partial<Extract<Message, { kind: 'MESSAGE' }>> = {}): Message {
  return {
    id: `m${n}`,
    kind: 'MESSAGE',
    direction: 'IN',
    sender: 'Bố',
    to: null,
    at: '2026-10-02T06:00:00.000Z',
    text: `Tin ${n}`,
    attachments: [],
    status: null,
    linked: [],
    ...extra,
  }
}

/** A page of 20 messages ending at `last`: the newest page of a long conversation. */
const page = (last: number, tail: Message[] = []): ConversationDetail => ({
  id: item.id,
  messages: [...Array.from({ length: 20 - tail.length }, (_, index) => message(last - 19 + index)), ...tail].slice(-20),
  firstUnreadId: null,
  linked: null,
  members: null,
  files: null,
  canSend: null,
  replyTo: null,
  previousCursor: 'older',
})

function mount(detail: ConversationDetail) {
  const element = (value: ConversationDetail) => (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ChatThread item={{ ...item, unreadCount: 0 }} detail={value} account={account} backSearch="" now={NOW} nameOf={() => 'Zalo'} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const view = render(element(detail))
  // jsdom has no layout: the body of the thread is given a height, a window and a scroll position by hand.
  const body = screen.getByRole('region', { name: `Cuộc trò chuyện ${item.title}` }).querySelector<HTMLElement>('.overflow-auto')!
  const geometry = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 }
  for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) {
    Object.defineProperty(body, key, { configurable: true, get: () => geometry[key], set: (value: number) => (geometry[key] = value) })
  }
  const scrollTo = (top: number) => {
    geometry.scrollTop = top
    fireEvent.scroll(body)
  }
  return { body, geometry, scrollTo, show: (value: ConversationDetail) => view.rerender(element(value)) }
}

describe('the chat scrolls to a new message (chat-scroll-new-message)', () => {
  it('goes to the bottom when the reader is there, though a full page keeps its count', () => {
    const chat = mount(page(30))
    chat.scrollTo(600)
    chat.geometry.scrollHeight = 1060

    chat.show(page(31))

    expect(chat.geometry.scrollTop).toBe(1060)
  })

  it('stays where the reader is while they read older messages', () => {
    const chat = mount(page(30))
    chat.scrollTo(100)

    chat.show(page(31))

    expect(chat.geometry.scrollTop).toBe(100)
  })

  it('goes to the bottom for an own message, even while the reader is up', () => {
    const chat = mount(page(30))
    chat.scrollTo(100)

    chat.show(page(31, [message(31, { direction: 'OUT', status: 'SENDING', local: true })]))

    expect(chat.geometry.scrollTop).toBe(1000)
  })

  it('does nothing when the newest message is the same one, as after dropping an emoji or a refetch', () => {
    const chat = mount(page(30))
    chat.scrollTo(590)
    chat.geometry.scrollTop = 590

    chat.show({ ...page(30), messages: page(30).messages!.map((candidate) => ({ ...candidate })) })

    expect(chat.geometry.scrollTop).toBe(590)
  })

  it('scrolls down again when a picture finishes loading while the reader sits at the bottom', () => {
    const photo = message(31, { text: '[Ảnh]', image: { url: 'https://f21-zpc.zdn.vn/jpg/1/full.jpg', thumbUrl: null, caption: null } })
    const chat = mount(page(30))
    chat.scrollTo(600)
    chat.show(page(31, [photo]))
    // The picture is taller once loaded.
    chat.geometry.scrollHeight = 1300

    fireEvent.load(screen.getByRole('img', { name: 'Ảnh' }))

    expect(chat.geometry.scrollTop).toBe(1300)
  })

  it('leaves a reader who scrolled up alone when a picture loads', () => {
    const photo = message(31, { text: '[Ảnh]', image: { url: 'https://f21-zpc.zdn.vn/jpg/1/full.jpg', thumbUrl: null, caption: null } })
    const chat = mount(page(30, [photo]))
    chat.scrollTo(100)
    chat.geometry.scrollHeight = 1300

    fireEvent.load(screen.getByRole('img', { name: 'Ảnh' }))

    expect(chat.geometry.scrollTop).toBe(100)
  })
})
