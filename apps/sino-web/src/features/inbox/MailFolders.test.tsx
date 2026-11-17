import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp, shellPart } from '@/test/renderApp'

// /inbox?folder= (mail-folders, D-502): the server decides what each folder holds, so the answers here are its.
const [first, second] = API_CONVERSATIONS
const FOLDER_ROWS: Record<string, Array<(typeof API_CONVERSATIONS)[number] | Record<string, unknown>>> = {
  all: [first, second],
  sent: [{ ...first, id: 's-1', title: 'Gửi tới Minh Anh', accountId: 'acc-gmail' }],
  trash: [],
  archived: [{ ...second, id: 'a-1', title: 'Bản tin tuần', archived: true, accountId: 'acc-gmail', accountIds: ['acc-gmail'] }],
}

function backend() {
  const asked: string[] = []
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () =>
      HttpResponse.json({
        unread: 1,
        byProvider: { gmail: 1 },
        byAccount: { 'acc-gmail': { unread: 1, needsReply: 0, withAttachments: 0 }, 'acc-2': { unread: 0, needsReply: 0, withAttachments: 0 } },
        needsReply: 1,
        withAttachments: 1,
        scheduled: 0,
        snoozed: 0,
        unreadByKind: { EMAIL: 1, CHAT: 0 },
      }),
    ),
    http.get('/api/conversations', ({ request }) => {
      const params = new URL(request.url).searchParams
      asked.push(params.toString())
      const rows = FOLDER_ROWS[params.get('view') ?? 'all'] ?? []
      return HttpResponse.json({ items: rows, nextCursor: null })
    }),
  )
  return asked
}

const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))
const pane = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }).parentElement as HTMLElement)
// The title shows in the mobile header and the desktop one: jsdom ignores the CSS that hides one of them.
const headings = (name: string) => pane().getAllByRole('heading', { name })
const lit = (name: string) => within(shellPart('sidebar')).getByRole('link', { name: new RegExp(`^${name}`) }).className.includes('bg-brand-soft')
const open = (path: string) => renderApp(path, { inbox: null })

describe('Hộp thư by mail folder (MF-10)', () => {
  it.each([
    ['sent', 'sent', 'Đã gửi', /Gửi tới Minh Anh/],
    ['archive', 'archived', 'Đã lưu trữ', /Bản tin tuần/],
  ])('?folder=%s asks for view=%s with the emails, titles the list and lights its item only', async (folder, view, title, row) => {
    const asked = backend()
    open(`/inbox?folder=${folder}`)

    expect(await list().findByRole('link', { name: row })).toBeInTheDocument()
    expect(asked).toEqual([`view=${view}&kind=email`])
    expect(headings(title)).not.toHaveLength(0)
    expect(pane().queryByRole('group', { name: 'Lọc danh sách' })).not.toBeInTheDocument()
    expect(lit(title)).toBe(true)
    expect(lit('Hộp thư')).toBe(false)
  })

  it('says a folder is empty in its own words, not the inbox\'s', async () => {
    backend()
    open('/inbox?folder=trash')

    expect(await list().findByText('Thư rác trống')).toBeInTheDocument()
    expect(list().queryByText('Không có cuộc trò chuyện nào')).not.toBeInTheDocument()
    expect(headings('Thư rác')).not.toHaveLength(0)
  })

  it('shows the inbox for an unknown folder, with no folder item lit', async () => {
    const asked = backend()
    open('/inbox?folder=drafts')

    expect(await list().findByRole('link', { name: /Trần Minh Anh/ })).toBeInTheDocument()
    expect(asked).toEqual(['view=all&kind=email'])
    expect(headings('Hộp thư')).not.toHaveLength(0)
    expect(pane().getByRole('group', { name: 'Lọc danh sách' })).toBeInTheDocument()
    expect(lit('Hộp thư')).toBe(true)
    for (const name of ['Đã gửi', 'Thư rác', 'Đã lưu trữ']) {
      expect(lit(name)).toBe(false)
    }
  })

  it('keeps the folder in the address when an account is picked', async () => {
    const asked = backend()
    const { router } = open('/inbox?folder=archive')
    const user = userEvent.setup()
    await list().findByRole('link', { name: /Bản tin tuần/ })

    await user.click(await within(shellPart('sidebar')).findByRole('link', { name: /an.nguyen@gmail.com/ }))

    expect(router.state.location.search).toBe('?account=acc-gmail&folder=archive')
    expect(await list().findByRole('link', { name: /Bản tin tuần/ })).toBeInTheDocument()
    // The account is picked in the list, not asked of the server: the folder is still the one request.
    expect(asked.at(-1)).toBe('view=archived&kind=email')
    expect(lit('Đã lưu trữ')).toBe(true)
    expect(lit('Hộp thư')).toBe(false)
  })

  it('keeps the folder on a row it opens', async () => {
    backend()
    open('/inbox?folder=sent')
    await list().findByRole('link', { name: /Gửi tới Minh Anh/ })

    expect(list().getByRole('link', { name: /Gửi tới Minh Anh/ })).toHaveAttribute('href', '/inbox/s-1?folder=sent')
  })

  it('has no folders in Tin nhắn', async () => {
    const asked = backend()
    renderApp('/messages?folder=sent', { inbox: null })

    await vi.waitFor(() => expect(asked).toEqual(['view=all&kind=chat']))
  })
})
