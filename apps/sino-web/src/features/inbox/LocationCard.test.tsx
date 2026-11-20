import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message, MessageLocation } from './inbox.types'

vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

function locationMessage(id: string, location: MessageLocation, direction: 'IN' | 'OUT' = 'IN'): Message {
  return {
    id,
    kind: 'MESSAGE',
    direction,
    sender: direction === 'OUT' ? 'Bạn' : 'Bố',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: '[Vị trí]',
    attachments: [],
    status: direction === 'OUT' ? 'SENT' : null,
    linked: [],
    location,
  }
}

async function openChat(items: Message[]) {
  vi.mocked(api.fetchMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null })
  renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
  await screen.findByRole('region', { name: 'Cuộc trò chuyện Gia đình' })
}

describe('the location card in a chat (zalo-location-card, ZC-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('draws a named place with its embedded Google Map, "Maps" link, bold title and address', async () => {
    await openChat([
      locationMessage(
        'm-loc-1',
        {
          latitude: 10.8482,
          longitude: 106.7865,
          title: 'Heyman Coffee',
          address: '19 Đ. Tân Hòa 2, Phường Tân Phú, Thủ Đức',
          previewUrl: null,
          current: false,
        },
        'OUT',
      ),
    ])

    const iframe = await chat().findByTitle('Bản đồ: Heyman Coffee')
    expect(iframe).toHaveAttribute('src', 'https://maps.google.com/maps?q=10.8482,106.7865&z=16&output=embed')
    expect(iframe).toHaveAttribute('loading', 'lazy')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')

    const link = chat().getByRole('link', { name: 'Maps' })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=10.8482,106.7865')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    expect(chat().getByText('Heyman Coffee')).toBeInTheDocument()
    expect(chat().getByText('19 Đ. Tân Hòa 2, Phường Tân Phú, Thủ Đức')).toBeInTheDocument()
  })

  it('shows "Vị trí hiện tại" when the sender shared their own position without a title, and "Vị trí" when neither is set', async () => {
    await openChat([
      locationMessage('m-cur', {
        latitude: 10.7769,
        longitude: 106.70098,
        title: null,
        address: null,
        previewUrl: null,
        current: true,
      }),
      locationMessage('m-plain', {
        latitude: 21.0285,
        longitude: 105.8542,
        title: null,
        address: null,
        previewUrl: null,
        current: false,
      }),
    ])

    expect(await chat().findByText('Vị trí hiện tại')).toBeInTheDocument()
    expect(chat().getByTitle('Bản đồ: Vị trí hiện tại')).toHaveAttribute('src', 'https://maps.google.com/maps?q=10.7769,106.70098&z=16&output=embed')
    expect(chat().getByText('Vị trí')).toBeInTheDocument()
  })

  it('renders HTML in title and address as plain text', async () => {
    await openChat([
      locationMessage('m-html', {
        latitude: 10.7769,
        longitude: 106.70098,
        title: '<b>Quán An</b>',
        address: '<img src=x onerror=alert(1)>',
        previewUrl: null,
        current: false,
      }),
    ])

    const title = await chat().findByText('<b>Quán An</b>')
    expect(title.querySelector('b')).toBeNull()
    const address = chat().getByText('<img src=x onerror=alert(1)>')
    expect(address.querySelector('img')).toBeNull()
  })
})

describe('location mapping in inbox.api (ZC-04)', () => {
  it('keeps valid coordinates and ignores out-of-range coordinates from the API', async () => {
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
              text: '[Vị trí] Heyman Coffee',
              bodyFormat: 'TEXT',
              read: true,
              attachments: [],
              location: { latitude: 10.8482, longitude: 106.7865, title: 'Heyman Coffee', address: '19 Đ. Tân Hòa 2', previewUrl: null, current: false },
            },
            {
              id: 'm-bad',
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
              location: { latitude: 999, longitude: 106.7865, title: 'Bad', address: null, previewUrl: null, current: false },
            },
          ],
          nextCursor: null,
        }),
      ),
    )

    const page = await realFetchMessages('c-1', null)
    const ok = page.items[0]
    const bad = page.items[1]
    expect(ok?.kind === 'MESSAGE' && ok.location).toEqual({
      latitude: 10.8482,
      longitude: 106.7865,
      title: 'Heyman Coffee',
      address: '19 Đ. Tân Hòa 2',
      previewUrl: null,
      current: false,
    })
    expect(bad?.kind === 'MESSAGE' && bad.location).toBeUndefined()
  })
})
