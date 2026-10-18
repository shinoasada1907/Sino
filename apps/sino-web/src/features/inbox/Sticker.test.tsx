import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message } from './inbox.types'

// The chat on the full contract (sample data); the mapping of the API's `sticker` is tested in inbox.api.test.ts.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const PICTURE = 'https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236'

const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

function stickerMessage(id: string, extra: Partial<Extract<Message, { kind: 'MESSAGE' }>> = {}): Message {
  return {
    id,
    kind: 'MESSAGE',
    direction: 'IN',
    sender: 'Bố',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: '[Sticker]',
    attachments: [],
    status: null,
    linked: [],
    ...extra,
  }
}

function serve(...items: Message[]) {
  vi.mocked(api.fetchMessages).mockResolvedValue({ items, nextCursor: null })
  return renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

describe('a sticker in a chat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the picture in place of the placeholder text', async () => {
    serve(stickerMessage('s-1', { sticker: PICTURE }))

    const picture = await chat().findByRole('img', { name: 'Sticker' })

    expect(picture).toHaveAttribute('src', PICTURE)
    expect(chat().queryByText('[Sticker]')).toBeNull()
  })

  it('asks the browser to load it late and to say nothing about Sino to Zalo', async () => {
    serve(stickerMessage('s-1', { sticker: PICTURE }))

    const picture = await chat().findByRole('img', { name: 'Sticker' })

    expect(picture).toHaveAttribute('loading', 'lazy')
    expect(picture).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('keeps the sender, the time and the state of the message around the picture', async () => {
    serve(stickerMessage('s-1', { sticker: PICTURE }), stickerMessage('s-2', { direction: 'OUT', sender: 'Bạn', status: 'SENT', sticker: PICTURE }))

    await chat().findAllByRole('img', { name: 'Sticker' })

    expect(chat().getByText('Bố')).toBeInTheDocument()
    expect(chat().getAllByRole('img', { name: 'Sticker' })).toHaveLength(2)
  })

  it('stays the placeholder text when the message has no picture', async () => {
    serve(stickerMessage('s-1'))

    expect(await chat().findByText('[Sticker]')).toBeInTheDocument()
    expect(chat().queryByRole('img', { name: 'Sticker' })).toBeNull()
  })

  it('stays the placeholder text when the address is not one the page may show', async () => {
    serve(stickerMessage('s-1', { sticker: 'javascript:alert(1)' }), stickerMessage('s-2', { sticker: 'http://zalo-api.zadn.vn/a.webp' }))

    expect(await chat().findAllByText('[Sticker]')).toHaveLength(2)
    expect(chat().queryByRole('img', { name: 'Sticker' })).toBeNull()
  })

  it('shows the text placeholder in the shape of the other messages when the picture cannot load', async () => {
    serve(stickerMessage('s-1', { sticker: PICTURE }))
    const picture = await chat().findByRole('img', { name: 'Sticker' })

    picture.dispatchEvent(new Event('error'))

    expect(await chat().findByText('[Sticker]')).toBeInTheDocument()
    expect(chat().queryByRole('img', { name: 'Sticker' })).toBeNull()
  })
})
