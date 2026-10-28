import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createInboxSample } from '../inbox.sample'
import type { ConversationItem, Member } from '../inbox.types'
import { ConversationAvatars } from './ConversationAvatars'

const NOW = new Date('2026-10-02T07:05:00Z')
const conversations = createInboxSample(NOW).conversations
const group = conversations.find((item) => item.kind === 'CHAT' && item.memberCount !== null)!
const chat = conversations.find((item) => item.kind === 'CHAT' && item.memberCount === null)!
const PERSON = 'https://s120-ava-talk.zadn.vn/p/1.jpg'
const GROUP = 'https://s120-ava-grp-talk.zadn.vn/g/1.jpg'

const member = (name: string, avatarUrl: string | null = null): Member => ({ name, avatarUrl, owner: false, joinedRecently: false })
const MEMBERS = [member('Mẹ', 'https://ava.example/me.jpg'), member('Bố', 'https://ava.example/bo.jpg'), member('Hà'), member('Minh', 'https://ava.example/minh.jpg'), member('Bà', 'https://ava.example/ba.jpg')]

const circles = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-slot="avatar"]'))
const pictures = (container: HTMLElement) => Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))
const withItem = (item: ConversationItem, extra: Partial<ConversationItem>): ConversationItem => ({ ...item, ...extra })

describe('ConversationAvatars (zalo-avatars, D-412, DN-1 = A)', () => {
  it('shows the one person of a chat with their picture', () => {
    const { container } = render(<ConversationAvatars item={withItem(chat, { avatarUrl: PERSON })} members={[member(chat.title, PERSON), member('Bạn')]} />)

    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([PERSON])
  })

  it('shows the placeholder of a chat when its person has no picture, or the members are not loaded yet', () => {
    const { container, rerender } = render(<ConversationAvatars item={withItem(chat, { avatarUrl: null })} members={[member(chat.title), member('Bạn')]} />)
    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([])

    rerender(<ConversationAvatars item={withItem(chat, { avatarUrl: PERSON })} members={null} />)
    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([PERSON])
  })

  it('shows a group with a picture of its own as one circle with that picture, whatever its members have', () => {
    const { container } = render(<ConversationAvatars item={withItem(group, { avatarUrl: GROUP })} members={MEMBERS} />)

    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([GROUP])
  })

  it('shows a group with no picture of its own as up to three members overlapping, each with their own picture', () => {
    const { container } = render(<ConversationAvatars item={withItem(group, { avatarUrl: null })} members={MEMBERS} />)

    const stack = circles(container)
    expect(stack).toHaveLength(3)
    // The third member has no picture: that circle is its placeholder alone.
    expect(pictures(container)).toEqual(['https://ava.example/me.jpg', 'https://ava.example/bo.jpg'])
    expect(stack[1]).toHaveClass('-ml-2')
    expect(stack[0]).not.toHaveClass('-ml-2')
  })

  it('shows a group of two as two circles', () => {
    const { container } = render(<ConversationAvatars item={withItem(group, { avatarUrl: null })} members={MEMBERS.slice(0, 2)} />)

    expect(circles(container)).toHaveLength(2)
  })

  it('shows a group whose members are not loaded yet as one circle with its picture, or the placeholder', () => {
    const { container, rerender } = render(<ConversationAvatars item={withItem(group, { avatarUrl: GROUP })} members={null} />)
    expect(pictures(container)).toEqual([GROUP])

    rerender(<ConversationAvatars item={withItem(group, { avatarUrl: null })} members={null} />)
    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([])
  })

  it('shows a group whose own picture cannot load as the placeholder circle, not the stack', () => {
    const { container } = render(<ConversationAvatars item={withItem(group, { avatarUrl: GROUP })} members={MEMBERS} />)

    fireEvent.error(container.querySelector('img')!)

    expect(circles(container)).toHaveLength(1)
    expect(pictures(container)).toEqual([])
  })

  it('is decoration for a screen reader', () => {
    const { container } = render(<ConversationAvatars item={withItem(chat, { avatarUrl: PERSON })} members={null} />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
