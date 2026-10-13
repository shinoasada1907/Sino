import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const TO = [{ name: 'Trần Minh Anh', address: 'minhanh@acme.vn' }]

/**
 * The inbox API after f05b: c-1 is a thread found in two accounts (`acc-1` first), c-2 is in one. The ID of another copy
 * (`c-9`) answers with the thread, under the thread's ID (D-183). Both accounts can send.
 */
function backend() {
  const patched: string[] = []
  const item = (id: string) => (id === 'c-9' ? API_CONVERSATIONS[0] : API_CONVERSATIONS.find((entry) => entry.id === id))
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS.map((account) => ({ ...account, capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] })))),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.get('/api/conversations/:id', ({ params }) =>
      HttpResponse.json({ ...item(String(params.id)), participants: API_PARTICIPANTS, reply: { state: 'READY', to: TO } }),
    ),
    http.patch('/api/conversations/:id', ({ params }) => {
      patched.push(String(params.id))
      return HttpResponse.json({ ...item(String(params.id)), unreadCount: 0 })
    }),
    http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: API_MESSAGES, nextCursor: null })),
  )
  return { patched }
}

const open = (path: string) => renderApp(path, { inbox: null })
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
/** The line of the reply box that says which account sends (below 1280px; the bar says it from 1280px). */
const fromLine = () => thread().queryByText((_, element) => element?.tagName === 'P' && element.textContent?.startsWith('Gửi từ ') === true)

describe('a thread found in several accounts, opened on the API (FE-81, f05b)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the address an own email went from (D-184)', async () => {
    backend()
    open('/inbox/c-1')

    expect(await thread().findByText('Bạn · an.nguyen@gmail.com')).toBeInTheDocument()
  })

  it('keeps "Bạn" alone in a thread of one account', async () => {
    backend()
    open('/inbox/c-2')

    expect(await thread().findByText('Bạn')).toBeInTheDocument()
    expect(thread().queryByText(/^Bạn · /)).toBeNull()
  })

  it('says which account a reply goes from at every width (D-186)', async () => {
    backend()
    open('/inbox/c-1')

    const line = await waitForLine()
    expect(line).toHaveTextContent('Gửi từ an.nguyen@gmail.com')
    expect(line).toHaveClass('xl:hidden')
  })

  it('leaves the account to the bar of 1280px in a thread of one account', async () => {
    backend()
    open('/inbox/c-2')

    expect(await thread().findByRole('textbox', { name: /Trả lời/ })).toBeInTheDocument()
    expect(fromLine()).toBeNull()
  })

  it('moves the address of another copy to the ID of the thread, keeping the filter, and reads it once (D-183)', async () => {
    const { patched } = backend()
    const { router } = open('/inbox/c-9?view=unread')

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/inbox/c-1'))
    expect(router.state.location.search).toBe('?view=unread')
    expect(router.state.historyAction).toBe('REPLACE')
    await vi.waitFor(() => expect(patched).toEqual(['c-1']))
  })
})

async function waitForLine(): Promise<HTMLElement> {
  await thread().findByRole('textbox', { name: /Trả lời/ })
  const line = fromLine()
  expect(line).not.toBeNull()
  return line as HTMLElement
}
