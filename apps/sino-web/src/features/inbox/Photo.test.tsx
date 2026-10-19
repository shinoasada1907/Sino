import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message } from './inbox.types'

// The chat on the full contract (sample data); the mapping of the API's `image` is tested in inbox.api.test.ts.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const FULL = 'https://f21-zpc.zdn.vn/jpg/1234/full.jpg'
const THUMB = 'https://b-f21-zpc.zdn.vn/jpg/1234/thumb.jpg'

const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

function photoMessage(id: string, extra: Partial<Extract<Message, { kind: 'MESSAGE' }>> = {}): Message {
  return {
    id,
    kind: 'MESSAGE',
    direction: 'IN',
    sender: 'Bố',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: '[Ảnh]',
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

describe('a photo in a chat (ZL-16)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the picture in place of the placeholder text', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: THUMB, caption: null } }))

    const picture = await chat().findByRole('img', { name: 'Ảnh' })

    expect(picture).toHaveAttribute('src', FULL)
    expect(chat().queryByText('[Ảnh]')).toBeNull()
  })

  it('asks the browser to load it late and to say nothing about Sino to Zalo', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: null, caption: null } }))

    const picture = await chat().findByRole('img', { name: 'Ảnh' })

    expect(picture).toHaveAttribute('loading', 'lazy')
    expect(picture).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('opens the picture in a new tab without handing that tab the page or the address of Sino', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: THUMB, caption: null } }))

    const link = (await chat().findByRole('img', { name: 'Ảnh' })).closest('a')

    expect(link).toHaveAttribute('href', FULL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
    expect(link?.getAttribute('rel')).toContain('noreferrer')
  })

  it('shows the caption under the picture', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: null, caption: 'Chuyến đi Đà Lạt' } }))

    await chat().findByRole('img', { name: 'Ảnh' })

    expect(chat().getByText('Chuyến đi Đà Lạt')).toBeInTheDocument()
  })

  it('keeps the sender and the picture of an own photo', async () => {
    serve(photoMessage('p-1', { direction: 'OUT', sender: 'Bạn', status: 'SENT', image: { url: FULL, thumbUrl: null, caption: null } }))

    expect(await chat().findByRole('img', { name: 'Ảnh' })).toHaveAttribute('src', FULL)
  })

  it('stays the placeholder text when the message has no picture', async () => {
    serve(photoMessage('p-1'))

    expect(await chat().findByText('[Ảnh]')).toBeInTheDocument()
    expect(chat().queryByRole('img', { name: 'Ảnh' })).toBeNull()
  })

  it('stays the placeholder text when the address is not one the page may show', async () => {
    serve(
      photoMessage('p-1', { image: { url: 'javascript:alert(1)', thumbUrl: null, caption: null } }),
      photoMessage('p-2', { image: { url: 'http://f21-zpc.zdn.vn/a.jpg', thumbUrl: null, caption: null } }),
    )

    expect(await chat().findAllByText('[Ảnh]')).toHaveLength(2)
    expect(chat().queryByRole('img', { name: 'Ảnh' })).toBeNull()
  })

  it('falls back to the thumbnail when the picture cannot load, then to the placeholder text', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: THUMB, caption: null } }))
    const picture = await chat().findByRole('img', { name: 'Ảnh' })

    picture.dispatchEvent(new Event('error'))

    await waitFor(() => expect(chat().getByRole('img', { name: 'Ảnh' })).toHaveAttribute('src', THUMB))
    chat().getByRole('img', { name: 'Ảnh' }).dispatchEvent(new Event('error'))
    expect(await chat().findByText('[Ảnh]')).toBeInTheDocument()
    expect(chat().queryByRole('img', { name: 'Ảnh' })).toBeNull()
  })

  it('shows the placeholder text at once when a picture with no thumbnail cannot load', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: null, caption: null } }))
    const picture = await chat().findByRole('img', { name: 'Ảnh' })

    picture.dispatchEvent(new Event('error'))

    expect(await chat().findByText('[Ảnh]')).toBeInTheDocument()
    expect(chat().queryByRole('img', { name: 'Ảnh' })).toBeNull()
  })

  it('keeps the caption when the picture cannot load', async () => {
    serve(photoMessage('p-1', { image: { url: FULL, thumbUrl: null, caption: 'Chuyến đi Đà Lạt' } }))
    const picture = await chat().findByRole('img', { name: 'Ảnh' })

    picture.dispatchEvent(new Event('error'))

    expect(await chat().findByText('[Ảnh]')).toBeInTheDocument()
    expect(chat().getByText('Chuyến đi Đà Lạt')).toBeInTheDocument()
  })

  it('does not let one photo that failed hide the picture of another', async () => {
    serve(
      photoMessage('p-1', { image: { url: FULL, thumbUrl: null, caption: null } }),
      photoMessage('p-2', { image: { url: 'https://f21-zpc.zdn.vn/jpg/5678/other.jpg', thumbUrl: null, caption: null } }),
    )
    const pictures = await chat().findAllByRole('img', { name: 'Ảnh' })
    expect(pictures).toHaveLength(2)

    pictures[0]?.dispatchEvent(new Event('error'))

    expect(await chat().findByText('[Ảnh]')).toBeInTheDocument()
    expect(chat().getAllByRole('img', { name: 'Ảnh' })).toHaveLength(1)
  })
})
