import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message } from './inbox.types'

// The chat on the full contract (sample data); what the API says of a library sticker is tested in inbox.api.test.ts.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))

type Mail = Message & { kind: 'MESSAGE' }

/** A sticker of the library that Sino sent (ZS-05): an `OUT` message whose text is the placeholder. */
function ownSticker(id: string, extra: Partial<Mail> = {}): Mail {
  return {
    id,
    kind: 'MESSAGE',
    direction: 'OUT',
    sender: 'Bạn',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: '[Sticker]',
    attachments: [],
    status: 'SENT',
    linked: [],
    clientMessageId: `cid-${id}`,
    libraryStickerId: 'lib-meo',
    ...extra,
  }
}

function serve(...items: Message[]) {
  vi.mocked(api.fetchMessages).mockResolvedValue({ items, nextCursor: null })
  return renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

describe('a sticker of the library in a chat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.mocked(api.sendSticker).mockClear()
    vi.mocked(api.sendMessage).mockClear()
    vi.mocked(api.discardMessage).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is shown from the library of the user, not from its text', async () => {
    serve(ownSticker('s-1'))

    const picture = await chat().findByRole('img', { name: 'Sticker' })

    expect(picture).toHaveAttribute('src', '/api/stickers/lib-meo/content')
    expect(chat().queryByText('[Sticker]')).toBeNull()
  })

  it('goes back to the text when the library no longer has the picture', async () => {
    serve(ownSticker('s-1'))
    const picture = await chat().findByRole('img', { name: 'Sticker' })

    picture.dispatchEvent(new Event('error'))

    expect(await chat().findByText('[Sticker]')).toBeInTheDocument()
  })

  it('keeps showing a sticker Zalo gave back its own address for, from the library', async () => {
    serve(ownSticker('s-1', { sticker: 'https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=1' }))

    expect(await chat().findByRole('img', { name: 'Sticker' })).toHaveAttribute('src', '/api/stickers/lib-meo/content')
  })

  it('offers "Gửi lại" and "Bỏ" for a sticker that was refused, and "Gửi lại" sends that sticker under the same ID', async () => {
    serve(ownSticker('s-1', { status: 'FAILED' }))
    const user = userEvent.setup()
    await chat().findByRole('img', { name: 'Sticker' })

    await user.click(chat().getByRole('button', { name: 'Gửi lại' }))

    await waitFor(() => expect(api.sendSticker).toHaveBeenCalledWith('conv-2', 'lib-meo', 'cid-s-1'))
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it('throws a refused sticker away with "Bỏ"', async () => {
    serve(ownSticker('s-1', { status: 'FAILED' }))
    vi.mocked(api.discardMessage).mockImplementation(async () => {
      vi.mocked(api.fetchMessages).mockResolvedValue({ items: [], nextCursor: null })
    })
    const user = userEvent.setup()
    await chat().findByRole('img', { name: 'Sticker' })

    await user.click(chat().getByRole('button', { name: 'Bỏ' }))

    await waitFor(() => expect(api.discardMessage).toHaveBeenCalledWith('conv-2', 's-1'))
    await waitFor(() => expect(chat().queryByRole('img', { name: 'Sticker' })).toBeNull())
  })

  it('says Sino is checking when the fate of a sticker is not known, and offers nothing while the server has it', async () => {
    serve(ownSticker('s-1', { status: 'UNKNOWN' }))

    expect(await chat().findByRole('status')).toHaveTextContent('Sino đang kiểm tra với Zalo.')
    expect(chat().queryByRole('button', { name: 'Gửi lại' })).toBeNull()
  })

  it('offers "Gửi lại" for a sticker whose answer never came, since the same ID cannot send it twice', async () => {
    serve(ownSticker('s-1', { status: 'UNKNOWN', local: true }))

    expect(await chat().findByRole('status')).toHaveTextContent('Gửi lại không làm tin bị gửi hai lần.')
    expect(chat().getByRole('button', { name: 'Gửi lại' })).toBeInTheDocument()
    expect(chat().getByRole('button', { name: 'Bỏ' })).toBeInTheDocument()
  })

  it('shows nothing to retry for a sticker that went out', async () => {
    serve(ownSticker('s-1'))

    await chat().findByRole('img', { name: 'Sticker' })

    expect(chat().queryByRole('button', { name: 'Gửi lại' })).toBeNull()
    expect(chat().queryByRole('button', { name: 'Bỏ' })).toBeNull()
  })
})

describe('a text that was refused in a chat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.mocked(api.sendSticker).mockClear()
    vi.mocked(api.sendMessage).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has the same "Gửi lại", and sends the same text under the same ID', async () => {
    serve(ownSticker('t-1', { status: 'FAILED', text: 'Alo mọi người', libraryStickerId: undefined }))
    const user = userEvent.setup()
    await chat().findByText('Alo mọi người')

    await user.click(chat().getByRole('button', { name: 'Gửi lại' }))

    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('conv-2', 'Alo mọi người', 'cid-t-1'))
    expect(api.sendSticker).not.toHaveBeenCalled()
  })
})
