import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import * as api from './inbox.api'
import { createConversationSample, createInboxSample } from './inbox.sample'
import type { Member } from './inbox.types'

// The chat on the sample data: the pictures come from `avatarUrl` of the item and of the members; their mapping from the API is in inbox.api.test.ts.
vi.mock('./inbox.api', async (importOriginal) => (await import('@/test/inboxSampleApi')).sampleInboxApi(await importOriginal()))

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const PICTURE = (name: string) => `https://s120-ava-talk.zadn.vn/${encodeURIComponent(name)}.jpg`
const GROUP_PICTURE = 'https://s120-ava-grp-talk.zadn.vn/gia-dinh.jpg'

const chat = (title: string) => within(screen.getByRole('region', { name: `Cuộc trò chuyện ${title}` }))
const info = () => within(screen.getByRole('complementary', { name: 'Thông tin cuộc trò chuyện' }))
const pictures = (scope: { container: HTMLElement } | HTMLElement) =>
  Array.from(('container' in scope ? scope.container : scope).querySelectorAll('[data-slot="avatar"] img')).map((image) => image.getAttribute('src'))

/** The group "Gia đình" with these pictures: of the group itself, and of the members by name (the others have none). */
async function openFamily({ group = null, members = {} }: { group?: string | null; members?: Record<string, string> }) {
  const sample = createInboxSample(NOW)
  sample.conversations = sample.conversations.map((conversation) => (conversation.id === 'conv-2' ? { ...conversation, avatarUrl: group } : conversation))
  const detail = createConversationSample('conv-2', NOW)
  vi.mocked(api.fetchConversation).mockResolvedValue({
    item: sample.conversations.find((conversation) => conversation.id === 'conv-2')!,
    detail: { ...detail, members: detail.members!.map((member): Member => ({ ...member, avatarUrl: members[member.name] ?? null })) },
  })
  renderApp('/messages/conv-2', { shell: createShellSample(NOW), inbox: sample })
  await chat('Gia đình').findByText('Tuần sau ông bà lên chơi, mấy đứa sắp xếp về nhé.')
}

describe('the pictures in a Zalo chat (zalo-avatars)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a picture next to the message of a group member who has one, and the placeholder next to one who has none', async () => {
    await openFamily({ members: { Bố: PICTURE('Bố'), Mẹ: PICTURE('Mẹ') } })

    const bubbles = chat('Gia đình')
      .getAllByText(/Tuần sau ông bà|Cuối tuần này cả nhà|Con mua bánh/)
      .map((text) => text.closest('.group\\/bubble') as HTMLElement)
    // The messages of Bố, Mẹ and Hà, in order; Hà has no picture.
    expect(bubbles.map((bubble) => pictures(bubble))).toEqual([[PICTURE('Bố')], [PICTURE('Mẹ')], []])
    expect(bubbles[2].querySelector('[data-slot="avatar"]')).toBeInTheDocument()
  })

  it('shows no picture next to an own message', async () => {
    await openFamily({ members: { Bố: PICTURE('Bố') } })

    const own = chat('Gia đình').getByText('Dạ, con về tối thứ Bảy ạ.').closest('.group\\/bubble') as HTMLElement

    expect(own.querySelector('[data-slot="avatar"]')).toBeNull()
  })

  it('shows a group with no picture of its own in the head as the pictures of its first three members', async () => {
    await openFamily({ members: { Mẹ: PICTURE('Mẹ'), Bố: PICTURE('Bố'), Minh: PICTURE('Minh') } })

    const head = chat('Gia đình').getByRole('heading', { level: 1, name: 'Gia đình' }).closest('div')!.parentElement!
    // The members are Mẹ, Bố, Hà, Minh…: the stack takes the first three, and Hà has no picture.
    expect(pictures(head)).toEqual([PICTURE('Mẹ'), PICTURE('Bố')])
    expect(head.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3)
  })

  it('shows a group with a picture of its own in the head as that one picture', async () => {
    await openFamily({ group: GROUP_PICTURE, members: { Mẹ: PICTURE('Mẹ'), Bố: PICTURE('Bố') } })

    const head = chat('Gia đình').getByRole('heading', { level: 1, name: 'Gia đình' }).closest('div')!.parentElement!
    expect(pictures(head)).toEqual([GROUP_PICTURE])
    expect(head.querySelectorAll('[data-slot="avatar"]')).toHaveLength(1)
  })

  it('shows the members of the info column with their pictures', async () => {
    await openFamily({ members: { Mẹ: PICTURE('Mẹ'), 'Bà ngoại': PICTURE('Bà ngoại') } })

    const rows = Array.from(info().getByRole('region', { name: 'Thành viên' }).querySelectorAll<HTMLElement>('.grid'))
    const byName = Object.fromEntries(rows.map((row) => [row.querySelector('span.truncate')?.textContent, pictures(row)]))

    expect(byName['Mẹ']).toEqual([PICTURE('Mẹ')])
    expect(byName['Bố']).toEqual([])
    expect(byName['Bà ngoại']).toEqual([PICTURE('Bà ngoại')])
  })
})
