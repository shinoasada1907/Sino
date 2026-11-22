import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message, MessageContactCard } from './inbox.types'

vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

function contactMessage(id: string, contactCard: MessageContactCard, direction: 'IN' | 'OUT' = 'IN'): Message {
  return {
    id,
    kind: 'MESSAGE',
    direction,
    sender: direction === 'OUT' ? 'Bạn' : 'Bố',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: `[Danh thiếp] ${contactCard.name}`,
    attachments: [],
    status: direction === 'OUT' ? 'SENT' : null,
    linked: [],
    contactCard,
  }
}

async function openChat(items: Message[]) {
  vi.mocked(api.fetchMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null })
  const view = renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
  await screen.findByRole('region', { name: 'Cuộc trò chuyện Gia đình' })
  return view
}

describe('the contact card in a chat (zalo-location-card, ZC-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('draws a full contact card with avatar, name, QR image, "Gọi Điện" tel: link (no raw phone text) and "Nhắn Tin" router link', async () => {
    const { router } = await openChat([
      contactMessage(
        'm-card-full',
        {
          name: 'Tiến Nguyễn',
          avatarUrl: 'https://s120-ava-talk.zadn.vn/a/b/c.jpg',
          phone: '0901 234 567',
          qrUrl: 'https://qr.zdn.vn/u/123.png',
          conversationId: 'conv-42',
        },
        'OUT',
      ),
    ])
    const user = userEvent.setup()

    expect(await chat().findByText('Tiến Nguyễn')).toBeInTheDocument()
    const card = chat().getByText('Tiến Nguyễn').closest('[data-slot="contact-card"]') as HTMLElement
    expect(card.querySelector('img[src="https://s120-ava-talk.zadn.vn/a/b/c.jpg"]')).not.toBeNull()
    expect(within(card).getByAltText('Mã QR của Tiến Nguyễn')).toHaveAttribute('src', 'https://qr.zdn.vn/u/123.png')
    expect(within(card).queryByText(/0901/)).toBeNull()

    const call = within(card).getByRole('link', { name: 'Gọi Điện' })
    expect(call).toHaveAttribute('href', 'tel:0901234567')

    const message = within(card).getByRole('link', { name: 'Nhắn Tin' })
    expect(message).toHaveAttribute('href', '/messages/conv-42')
    await user.click(message)
    expect(router.state.location.pathname).toBe('/messages/conv-42')
  })

  it('shows initials when there is no avatar', async () => {
    await openChat([
      contactMessage('m-no-ava', {
        name: 'Trần Lan',
        avatarUrl: null,
        phone: '0912345678',
        qrUrl: null,
        conversationId: null,
      }),
    ])

    expect(await chat().findByText('Trần Lan')).toBeInTheDocument()
    const card = chat().getByText('Trần Lan').closest('[data-slot="contact-card"]') as HTMLElement
    expect(within(card).getByText('TL')).toBeInTheDocument()
    expect(card.querySelector('img')).toBeNull()
  })

  it('shows only "Nhắn Tin" when phone is missing', async () => {
    await openChat([
      contactMessage('m-no-phone', {
        name: 'Minh Anh',
        avatarUrl: null,
        phone: null,
        qrUrl: null,
        conversationId: 'conv-99',
      }),
    ])

    const card = (await chat().findByText('Minh Anh')).closest('[data-slot="contact-card"]') as HTMLElement
    expect(within(card).queryByRole('link', { name: 'Gọi Điện' })).toBeNull()
    expect(within(card).getByRole('link', { name: 'Nhắn Tin' })).toHaveAttribute('href', '/messages/conv-99')
  })

  it('shows only "Gọi Điện" when conversationId is missing', async () => {
    await openChat([
      contactMessage('m-no-conv', {
        name: 'Hoàng Nam',
        avatarUrl: null,
        phone: '+84 912 345 678',
        qrUrl: null,
        conversationId: null,
      }),
    ])

    const card = (await chat().findByText('Hoàng Nam')).closest('[data-slot="contact-card"]') as HTMLElement
    expect(within(card).getByRole('link', { name: 'Gọi Điện' })).toHaveAttribute('href', 'tel:+84912345678')
    expect(within(card).queryByRole('link', { name: 'Nhắn Tin' })).toBeNull()
  })

  it('omits the action row completely when neither phone nor conversationId is present', async () => {
    await openChat([
      contactMessage('m-no-actions', {
        name: 'Không Có Nút',
        avatarUrl: null,
        phone: null,
        qrUrl: null,
        conversationId: null,
      }),
    ])

    const card = (await chat().findByText('Không Có Nút')).closest('[data-slot="contact-card"]') as HTMLElement
    expect(card.querySelector('[data-slot="contact-card-actions"]')).toBeNull()
    expect(within(card).queryByRole('link')).toBeNull()
  })

  it('renders HTML in the contact name as plain text', async () => {
    await openChat([
      contactMessage('m-card-html', {
        name: '<b>An</b>',
        avatarUrl: null,
        phone: null,
        qrUrl: null,
        conversationId: null,
      }),
    ])

    const name = await chat().findByText('<b>An</b>')
    expect(name.querySelector('b')).toBeNull()
  })

  it('shows "Danh thiếp" instead of "Liên kết" in a reply quoting a contact card', async () => {
    const card = contactMessage('m-card-orig', {
      name: 'Tiến Nguyễn',
      avatarUrl: null,
      phone: null,
      qrUrl: null,
      conversationId: null,
    })
    const reply: Message = {
      id: 'm-reply-card',
      kind: 'MESSAGE',
      direction: 'OUT',
      sender: 'Bạn',
      to: null,
      at: '2026-10-02T07:01:00.000Z',
      text: '.',
      attachments: [],
      status: 'SENT',
      linked: [],
      quote: { messageId: 'm-card-orig', senderName: 'Nguyễn Thành Tiến', text: 'Liên kết' },
    }
    await openChat([card, reply])

    const quote = await chat().findByRole('button', { name: 'Tin được trả lời của Nguyễn Thành Tiến: Danh thiếp' })
    expect(within(quote).getByText('Danh thiếp')).toBeInTheDocument()
    expect(within(quote).queryByText('Liên kết')).toBeNull()
  })
})

describe('contactCard mapping in inbox.api (ZC-04)', () => {
  it('keeps valid contact cards, filters non-https avatarUrl and qrUrl, and ignores blank names', async () => {
    const { fetchMessages: realFetchMessages } = await vi.importActual<typeof api>('./inbox.api')
    server.use(
      http.get('/api/conversations/c-1/messages', () =>
        HttpResponse.json({
          items: [
            {
              id: 'm-ok',
              direction: 'INBOUND',
              status: 'DELIVERED',
              sentAt: '2026-10-02T07:00:00Z',
              sender: { address: 'u1', name: 'An', avatarUrl: null, self: false },
              to: [],
              cc: [],
              subject: null,
              text: '[Danh thiếp] Lan',
              bodyFormat: 'TEXT',
              read: true,
              attachments: [],
              contactCard: {
                name: 'Lan',
                avatarUrl: 'http://insecure.example/a.jpg',
                phone: '+84 912 345 678',
                qrUrl: 'https://qr.zdn.vn/lan.png',
                conversationId: 'conv-lan',
              },
            },
            {
              id: 'm-blank',
              direction: 'INBOUND',
              status: 'DELIVERED',
              sentAt: '2026-10-02T07:01:00Z',
              sender: { address: 'u1', name: 'An', avatarUrl: null, self: false },
              to: [],
              cc: [],
              subject: null,
              text: '[Tin Zalo chưa hỗ trợ]',
              bodyFormat: 'TEXT',
              read: true,
              attachments: [],
              contactCard: { name: '   ', avatarUrl: null, phone: null, qrUrl: null, conversationId: null },
            },
          ],
          nextCursor: null,
        }),
      ),
    )

    const page = await realFetchMessages('c-1', null)
    const ok = page.items[0]
    const blank = page.items[1]
    expect(ok?.kind === 'MESSAGE' && ok.contactCard).toEqual({
      name: 'Lan',
      avatarUrl: null,
      phone: '+84 912 345 678',
      qrUrl: 'https://qr.zdn.vn/lan.png',
      conversationId: 'conv-lan',
    })
    expect(blank?.kind === 'MESSAGE' && blank.contactCard).toBeUndefined()
  })
})
