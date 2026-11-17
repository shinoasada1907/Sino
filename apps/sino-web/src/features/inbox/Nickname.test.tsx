import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { API_CONVERSATIONS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { NicknameDialog } from './components/NicknameDialog'
import { canSetNickname, displayName, mobileThreadSubtitle, threadSubtitle } from './format'
import { fetchConversations, updateNickname } from './inbox.api'
import type { ConversationItem } from './inbox.types'
import { nicknameFailure } from './nickname'

// zalo-nicknames NK-04 (spec chat-nicknames-ui): the name of a chat, and the "Đặt biệt danh" box.
const problem = (code: string, status: number) => HttpResponse.json({ title: code, status, code }, { status, headers: { 'Content-Type': 'application/problem+json' } })

const CHAT: ConversationItem = {
  id: 'c-z',
  accountId: 'acc-z',
  accountIds: ['acc-z'],
  provider: 'zalo',
  kind: 'CHAT',
  title: 'Nguyễn Thu Hà',
  avatarUrl: null,
  subject: null,
  memberCount: null,
  snippetFrom: null,
  snippet: 'Chị ơi',
  lastMessageAt: '2026-10-02T07:00:00Z',
  unreadCount: 0,
  needsReply: false,
  hasAttachments: false,
  archived: false,
  snooze: null,
  scheduledSend: null,
  linked: [],
}
const ZALO = { type: 'zalo', displayName: 'Zalo', kind: 'CHAT' as const, nicknames: true as const }
const nameOf = () => 'Zalo'

describe('the name of a chat', () => {
  it('is the nickname when there is one, else the name Zalo gives (displayName)', () => {
    expect(displayName(CHAT)).toBe('Nguyễn Thu Hà')
    expect(displayName({ ...CHAT, nickname: 'Em Hà' })).toBe('Em Hà')
  })

  it('reads `nickname` from the API and leaves the field out when there is none', async () => {
    server.use(
      http.get('/api/conversations', () =>
        HttpResponse.json({ items: [{ ...API_CONVERSATIONS[0], nickname: 'Mẹ' }, { ...API_CONVERSATIONS[1], nickname: null }], nextCursor: null }),
      ),
    )

    const { items } = await fetchConversations({ view: 'all', account: null }, null)

    expect(items[0].nickname).toBe('Mẹ')
    expect(items[1]).not.toHaveProperty('nickname')
  })

  it('names the Zalo name in the thread subtitle only when a nickname hides it', () => {
    expect(threadSubtitle(CHAT, [{ address: 'An Nguyễn' }], nameOf)).toBe('Zalo · qua An Nguyễn')
    expect(threadSubtitle({ ...CHAT, nickname: 'Em Hà' }, [{ address: 'An Nguyễn' }], nameOf)).toBe('Zalo · Nguyễn Thu Hà · qua An Nguyễn')
    expect(mobileThreadSubtitle({ ...CHAT, nickname: 'Em Hà' }, nameOf)).toBe('Zalo · Nguyễn Thu Hà')
    expect(mobileThreadSubtitle(CHAT, nameOf)).toBe('Zalo')
  })

  it('can be given a nickname in a 1-1 chat of a provider with NICKNAMES, not in a group, a mail or another provider', () => {
    expect(canSetNickname(CHAT, [ZALO])).toBe(true)
    expect(canSetNickname({ ...CHAT, memberCount: 6 }, [ZALO])).toBe(false)
    expect(canSetNickname({ ...CHAT, kind: 'EMAIL' }, [ZALO])).toBe(false)
    expect(canSetNickname(CHAT, [{ type: 'zalo', displayName: 'Zalo', kind: 'CHAT' }])).toBe(false)
    expect(canSetNickname(CHAT, [{ ...ZALO, type: 'telegram' }])).toBe(false)
  })
})

describe('updateNickname', () => {
  it('sends the nickname to PATCH and returns the row as stored', async () => {
    let body: unknown
    server.use(
      http.patch('/api/conversations/c-z', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_CONVERSATIONS[0], id: 'c-z', nickname: 'Mẹ' })
      }),
    )

    const item = await updateNickname('c-z', 'Mẹ')

    expect(body).toEqual({ nickname: 'Mẹ' })
    expect(item.nickname).toBe('Mẹ')
  })

  it.each([
    ['NICKNAME_REJECTED', 422, 'Zalo không cho đặt biệt danh cho người này.'],
    ['NICKNAME_UNAVAILABLE', 502, 'Chưa nối được Zalo, biệt danh chưa được lưu. Hãy thử lại sau.'],
    ['VALIDATION_FAILED', 400, 'Biệt danh tối đa 50 ký tự.'],
  ])('names a %s answer in words the box can show', async (code, status, text) => {
    server.use(http.patch('/api/conversations/c-z', () => problem(code, status)))

    const failure = await updateNickname('c-z', 'x').then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).not.toBeNull()
    expect(nicknameFailure(failure)).toBe(text)
  })
})

function Box({ item, onOpenChange = () => {} }: { item: ConversationItem; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return <NicknameDialog item={item} open={open} onOpenChange={(next) => (setOpen(next), onOpenChange(next))} />
}

function openBox(item: ConversationItem, onOpenChange?: (open: boolean) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Box item={item} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
}

describe('the "Đặt biệt danh" box', () => {
  it('opens with the field focused and filled, the Zalo name under it, and Lưu off until something changes', async () => {
    openBox({ ...CHAT, nickname: 'Em Hà' })

    const field = await screen.findByRole('textbox', { name: 'Biệt danh' })
    expect(field).toHaveFocus()
    expect(field).toHaveValue('Em Hà')
    expect(screen.getByText('Tên Zalo: Nguyễn Thu Hà · tối đa 50 ký tự')).toBeInTheDocument()
    expect(screen.getByText('Biệt danh được đặt trong Zalo của bạn, nên cũng hiện trên điện thoại. Chỉ bạn thấy.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()

    await userEvent.type(field, '!')
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled()
  })

  it('offers "Xóa biệt danh" only when there is a nickname', async () => {
    const { unmount } = openBox(CHAT)
    await screen.findByRole('textbox', { name: 'Biệt danh' })
    expect(screen.queryByRole('button', { name: 'Xóa biệt danh' })).not.toBeInTheDocument()
    unmount()

    openBox({ ...CHAT, nickname: 'Em Hà' })
    expect(await screen.findByRole('button', { name: 'Xóa biệt danh' })).toBeInTheDocument()
  })

  it('saves with Enter and closes only after the server answered', async () => {
    let answer: () => void = () => {}
    const sent: unknown[] = []
    server.use(
      http.patch('/api/conversations/c-z', async ({ request }) => {
        sent.push(await request.json())
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json({ ...API_CONVERSATIONS[0], id: 'c-z', nickname: 'Mẹ' })
      }),
    )
    const onOpenChange = vi.fn()
    openBox(CHAT, onOpenChange)

    await userEvent.type(await screen.findByRole('textbox', { name: 'Biệt danh' }), '  Mẹ {Enter}')

    await waitFor(() => expect(sent).toEqual([{ nickname: 'Mẹ' }]))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    answer()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('keeps the box open and the typed text when Zalo refuses, and says so', async () => {
    server.use(http.patch('/api/conversations/c-z', () => problem('NICKNAME_REJECTED', 422)))
    const onOpenChange = vi.fn()
    openBox(CHAT, onOpenChange)

    const field = await screen.findByRole('textbox', { name: 'Biệt danh' })
    await userEvent.type(field, 'Em gái{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Zalo không cho đặt biệt danh cho người này.')
    expect(field).toHaveValue('Em gái')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(onOpenChange).not.toHaveBeenCalled()

    await userEvent.type(field, '!')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the nickname with an empty text', async () => {
    const sent: unknown[] = []
    server.use(
      http.patch('/api/conversations/c-z', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ ...API_CONVERSATIONS[0], id: 'c-z', nickname: null })
      }),
    )
    const onOpenChange = vi.fn()
    openBox({ ...CHAT, nickname: 'Em Hà' }, onOpenChange)

    await userEvent.click(await screen.findByRole('button', { name: 'Xóa biệt danh' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sent).toEqual([{ nickname: '' }])
  })

  it('closes on Esc without asking the server', async () => {
    const asked = vi.fn()
    server.use(http.patch('/api/conversations/c-z', () => (asked(), HttpResponse.json(CHAT))))
    const onOpenChange = vi.fn()
    openBox(CHAT, onOpenChange)
    await screen.findByRole('textbox', { name: 'Biệt danh' })

    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(asked).not.toHaveBeenCalled()
  })
})
