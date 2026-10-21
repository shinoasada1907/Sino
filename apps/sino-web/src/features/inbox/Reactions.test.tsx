import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, delay } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createInboxSample } from './inbox.sample'
import type { Message } from './inbox.types'
import { afterPick, chipLabel, withoutMine, type Reaction, type ReactionKind } from './reactions'

// zalo-reactions RX-08, RX-09: the chip under a chat message and the emoji bar (spec chat-reactions-ui).
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const chat = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện Gia đình' }))
const REACTION_PATH = '/api/conversations/conv-2/messages/:messageId/reaction'

const kind = (code: string, emoji: string, label: string, quick = false): ReactionKind => ({ code, emoji, label, quick })
const HEART = kind('/-heart', '❤️', 'Tim', true)
const HAHA = kind(':>', '😆', 'Haha', true)
const SET: ReactionKind[] = [
  HEART,
  HAHA,
  kind(':o', '😮', 'Ngạc nhiên', true),
  kind(':-((', '😢', 'Buồn', true),
  kind(':-h', '😡', 'Giận', true),
  kind('/-strong', '👍', 'Thích', true),
  kind('/-rose', '🌹', 'Hoa hồng'),
  kind('/-beer', '🍺', 'Bia'),
]

const reaction = (of: ReactionKind, names: string[], mine = false): Reaction => ({ code: of.code, emoji: of.emoji, count: names.length, mine, names })

/** A message of Bố in the family chat; it takes an emoji unless told otherwise. */
function fromDad(id: string, extra: Partial<Message & { kind: 'MESSAGE' }> = {}): Message {
  return {
    id,
    kind: 'MESSAGE',
    direction: 'IN',
    sender: 'Bố',
    to: null,
    at: '2026-10-02T07:00:00.000Z',
    text: `Tin ${id}`,
    attachments: [],
    status: null,
    linked: [],
    canReact: true,
    ...extra,
  }
}

// The sample's own answer, taken once: `restoreMocks` does not undo the implementation a test gives a `vi.fn`.
const sampleConversation = vi.mocked(api.fetchConversation).getMockImplementation()!

/** Opens the family chat with these messages and this emoji set (null: none told); resolves once the first message shows. */
async function open(items: Message[], reactionSet: ReactionKind[] | null = SET) {
  vi.mocked(api.fetchConversation).mockImplementation(async (conversationId) => {
    const opened = await sampleConversation(conversationId)
    return { ...opened, detail: { ...opened.detail, ...(reactionSet ? { reactionSet } : {}) } }
  })
  vi.mocked(api.fetchMessages).mockResolvedValue({ items: [...items].reverse(), nextCursor: null })
  renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
  await chat().findByText(`Tin ${items[0]!.id}`)
}

/** What the server is asked, and what it answers: the reactions it is given, or a refusal. */
function serverReactions(answer: (method: string, code: string | null) => Reaction[] | number, wait = 0) {
  const calls: { method: string; messageId: string; code: string | null }[] = []
  const reply = async (method: string, messageId: string, code: string | null) => {
    calls.push({ method, messageId, code })
    await delay(wait)
    const result = answer(method, code)
    return typeof result === 'number' ? HttpResponse.json({ code: 'RATE_LIMITED' }, { status: result }) : HttpResponse.json({ reactions: result })
  }
  server.use(
    http.put(REACTION_PATH, async ({ request, params }) => reply('PUT', String(params.messageId), ((await request.json()) as { code: string }).code)),
    http.delete(REACTION_PATH, ({ params }) => reply('DELETE', String(params.messageId), null)),
  )
  return calls
}

const chip = () => chat().getByRole('button', { name: /người đã thả biểu cảm/ })

describe('the emoji of a chat message (pure steps)', () => {
  it('drops, changes and takes off the user’s emoji, most people first', () => {
    const before = [reaction(HAHA, ['Lan']), reaction(HEART, ['Minh'])]

    const dropped = afterPick(before, HEART)
    expect(dropped.map((r) => [r.emoji, r.count, r.mine])).toEqual([
      ['❤️', 2, true],
      ['😆', 1, false],
    ])
    expect(dropped[0]!.names).toEqual(['Minh', 'Bạn'])

    const changed = afterPick(dropped, HAHA)
    expect(changed.map((r) => [r.emoji, r.count, r.mine])).toEqual([
      ['😆', 2, true],
      ['❤️', 1, false],
    ])

    expect(afterPick(changed, HAHA)).toEqual(before)
    expect(withoutMine([reaction(HEART, ['Bạn'], true)])).toEqual([])
  })

  it('names each emoji by its label for a screen reader, and by itself when the set does not know it', () => {
    expect(chipLabel([reaction(HEART, ['Lan', 'Bạn'], true), reaction(kind(':x', ':x', ''), ['Minh'])], SET)).toBe('3 người đã thả biểu cảm: Tim 2, :x 1')
  })
})

describe('the emoji of a chat message', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    stubViewport(1440)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a chip with up to three emoji and how many people, and lists who dropped which', async () => {
    await open([fromDad('m1', { reactions: [reaction(HEART, ['Lan', 'Bạn'], true), reaction(HAHA, ['Minh'])] })])
    const user = userEvent.setup()

    expect(chip()).toHaveAccessibleName('3 người đã thả biểu cảm: Tim 2, Haha 1')
    expect(chip()).toHaveTextContent('❤️😆3')

    await user.click(chip())

    const people = within(await screen.findByRole('dialog', { name: 'Người đã thả biểu cảm' }))
    expect(people.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Lan❤️', 'Bạn❤️', 'Minh😆'])
  })

  it('shows no count for one person, and no chip without emoji', async () => {
    await open([fromDad('m1', { reactions: [reaction(HEART, ['Lan'])] }), fromDad('m2')])

    expect(chip()).toHaveTextContent(/^❤️$/)
    expect(chat().getAllByRole('button', { name: /người đã thả biểu cảm/ })).toHaveLength(1)
  })

  it('drops an emoji from the bar: the chip shows it at once, then the server’s answer', async () => {
    const calls = serverReactions(() => [reaction(HEART, ['Lan', 'Bạn'], true)], 300)
    await open([fromDad('m1')])
    const user = userEvent.setup()

    await user.click(chat().getAllByRole('button', { name: 'Thả biểu cảm' })[0]!)
    const bar = within(await screen.findByRole('toolbar', { name: 'Biểu cảm nhanh' }))
    expect(bar.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Tim',
      'Haha',
      'Ngạc nhiên',
      'Buồn',
      'Giận',
      'Thích',
      'Thêm biểu cảm',
    ])
    await user.click(bar.getByRole('button', { name: 'Tim' }))

    expect(chip()).toHaveAccessibleName('1 người đã thả biểu cảm: Tim 1')
    expect(screen.queryByRole('toolbar', { name: 'Biểu cảm nhanh' })).toBeNull()
    await waitFor(() => expect(chip()).toHaveAccessibleName('2 người đã thả biểu cảm: Tim 2'))
    expect(calls).toEqual([{ method: 'PUT', messageId: 'm1', code: '/-heart' }])
  })

  it('takes the user’s own emoji off when it is picked again', async () => {
    const calls = serverReactions(() => [reaction(HAHA, ['Minh'])])
    await open([fromDad('m1', { reactions: [reaction(HEART, ['Bạn'], true), reaction(HAHA, ['Minh'])] })])
    const user = userEvent.setup()

    await user.click(chat().getByRole('button', { name: 'Thả biểu cảm' }))
    const heart = within(await screen.findByRole('toolbar', { name: 'Biểu cảm nhanh' })).getByRole('button', { name: 'Tim' })
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    await user.click(heart)

    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', messageId: 'm1', code: null }]))
    expect(chip()).toHaveAccessibleName('1 người đã thả biểu cảm: Haha 1')
  })

  it('opens every emoji of the provider with "+", in the bar', async () => {
    const calls = serverReactions(() => [reaction(kind('/-rose', '🌹', 'Hoa hồng'), ['Bạn'], true)])
    await open([fromDad('m1')])
    const user = userEvent.setup()

    await user.click(chat().getByRole('button', { name: 'Thả biểu cảm' }))
    await user.click(await screen.findByRole('button', { name: 'Thêm biểu cảm' }))
    const all = within(screen.getByRole('group', { name: 'Tất cả biểu cảm' }))
    expect(all.getAllByRole('button')).toHaveLength(SET.length)
    await user.click(all.getByRole('button', { name: 'Hoa hồng' }))

    await waitFor(() => expect(calls).toEqual([{ method: 'PUT', messageId: 'm1', code: '/-rose' }]))
    expect(chip()).toHaveTextContent('🌹')
  })

  it('puts the chip back and asks to slow down when the server refuses the pace', async () => {
    serverReactions(() => 429)
    await open([fromDad('m1', { reactions: [reaction(HAHA, ['Minh'])] })])
    const user = userEvent.setup()

    await user.click(chat().getByRole('button', { name: 'Thả biểu cảm' }))
    await user.click(within(await screen.findByRole('toolbar', { name: 'Biểu cảm nhanh' })).getByRole('button', { name: 'Tim' }))

    expect(await chat().findByRole('alert')).toHaveTextContent('Chậm lại một chút.')
    expect(chip()).toHaveAccessibleName('1 người đã thả biểu cảm: Haha 1')
  })

  it('moves along the bar with the arrows, and Escape gives the focus back to the button', async () => {
    await open([fromDad('m1')])
    const user = userEvent.setup()
    const button = chat().getByRole('button', { name: 'Thả biểu cảm' })

    button.focus()
    await user.keyboard('{Enter}')
    const bar = within(await screen.findByRole('toolbar', { name: 'Biểu cảm nhanh' }))
    bar.getByRole('button', { name: 'Tim' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(bar.getByRole('button', { name: 'Haha' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(bar.getByRole('button', { name: 'Thêm biểu cảm' })).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Biểu cảm nhanh' })).toBeNull())
    expect(button).toHaveFocus()
  })

  it('has no bar where the provider has no emoji, or the message takes none, but still shows the chip', async () => {
    await open([fromDad('m1', { reactions: [reaction(HEART, ['Lan'])] })], null)
    expect(chip()).toBeInTheDocument()
    expect(chat().queryByRole('button', { name: 'Thả biểu cảm' })).toBeNull()
  })

  it('has no bar on a message that takes no emoji', async () => {
    await open([fromDad('m1', { canReact: false }), fromDad('m2')])

    expect(chat().getAllByRole('button', { name: 'Thả biểu cảm' })).toHaveLength(1)
  })
})

describe('the emoji of a chat message on a phone', () => {
  beforeEach(() => {
    stubViewport(390)
  })

  it('opens the bar when a finger rests on the bubble, and "+" opens a sheet', async () => {
    const calls = serverReactions(() => [reaction(kind('/-beer', '🍺', 'Bia'), ['Bạn'], true)])
    await open([fromDad('m1')])
    const user = userEvent.setup()
    const bubble = chat().getByText('Tin m1')

    fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    fireEvent.pointerUp(bubble, { pointerType: 'touch' })

    await user.click(await screen.findByRole('button', { name: 'Thêm biểu cảm' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Biểu cảm' }))
    await user.click(sheet.getByRole('button', { name: 'Bia' }))

    await waitFor(() => expect(calls).toEqual([{ method: 'PUT', messageId: 'm1', code: '/-beer' }]))
  })

  it('does not open the bar when the finger moves away, as when scrolling', async () => {
    await open([fromDad('m1')])
    const bubble = chat().getByText('Tin m1')

    fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 })
    fireEvent.pointerMove(bubble, { pointerType: 'touch', clientX: 10, clientY: 40 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))

    expect(screen.queryByRole('toolbar', { name: 'Biểu cảm nhanh' })).toBeNull()
  })
})
