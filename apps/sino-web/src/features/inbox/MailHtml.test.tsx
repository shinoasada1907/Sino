import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// Friday 2 October 2026, 14:05 in Vietnam.
const NOW = new Date('2026-10-02T07:05:00Z')
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

type Format = 'TEXT' | 'HTML' | 'UNCHECKED'
type Body = { format: 'TEXT' | 'HTML'; html: string | null; remoteImages: boolean }

const NEWSLETTER: Body = { format: 'HTML', html: '<div><p>Báo giá <b>tháng 10</b></p><img src="https://track.example.com/p.gif"></div>', remoteImages: true }
const DRAFT: Body = { format: 'HTML', html: '<p>Bản <i>nháp</i></p><img src="https://cdn.example.com/a.png">', remoteImages: true }

/** The F05 + F06 API for c-1: the newest email in `newest` format, the oldest unchecked; bodies by message ID. */
function backend({ newest = 'HTML', bodies = { 'm-3': NEWSLETTER, 'm-1': DRAFT } }: { newest?: Format; bodies?: Record<string, Body> } = {}) {
  const asked: string[] = []
  let failBody = false
  const messages = [{ ...API_MESSAGES[0], bodyFormat: newest }, API_MESSAGES[1], API_MESSAGES[2]]
  server.use(
    http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
    http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
    http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    http.get('/api/conversations', () => HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: null })),
    http.get('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), participants: API_PARTICIPANTS })),
    http.patch('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS.find((entry) => entry.id === params.id), unreadCount: 0 })),
    http.get('/api/conversations/:id/messages', () => HttpResponse.json({ items: messages, nextCursor: null })),
    http.get('/api/conversations/:id/messages/:messageId/body', ({ params }) => {
      asked.push(String(params.messageId))
      return failBody
        ? problem({ title: 'Bad gateway', status: 502, code: 'MESSAGE_CONTENT_UNAVAILABLE' }, 502)
        : HttpResponse.json(bodies[String(params.messageId)])
    }),
  )
  return { asked, failBody: (fail: boolean) => (failBody = fail) }
}

const open = (path: string) => renderApp(path, { inbox: null })
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const frames = () => thread().queryAllByTitle('Nội dung thư')
const policyOf = (frame: HTMLElement) => frame.getAttribute('srcdoc')?.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]
const HELD = 'Ảnh trong thư đang ẩn để người gửi không biết bạn đã mở thư.'

describe('an HTML email on the F06 API (FE-58)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the cleaned HTML in a frame that runs no script, with the pictures of the web held back', async () => {
    backend()
    open('/inbox/c-1')

    const frame = await thread().findByTitle('Nội dung thư')

    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox')
    expect(frame.getAttribute('srcdoc')).toContain('<p>Báo giá <b>tháng 10</b></p>')
    expect(policyOf(frame)).toMatch(/^default-src 'none';/)
    expect(policyOf(frame)).not.toContain('https:')
    expect(thread().getByText(HELD)).toBeInTheDocument()
    // The text of the email is not shown next to its HTML.
    expect(thread().queryByText(/^Chào An, mình gửi bản hợp đồng/)).toBeNull()
  })

  it('shows the pictures of one email when asked, and keeps them held back in another', async () => {
    const { asked } = backend()
    open('/inbox/c-1')
    const user = userEvent.setup()
    await thread().findByTitle('Nội dung thư')
    expect(asked).toEqual(['m-3'])

    await user.click(thread().getByRole('button', { name: 'Hiện ảnh' }))

    expect(policyOf(frames()[0])).toContain('https: http:')
    expect(thread().queryByText(HELD)).toBeNull()

    // The oldest email, unchecked, asks for its content only once it is opened.
    await user.click(thread().getAllByRole('button', { expanded: false })[0])
    await vi.waitFor(() => expect(frames()).toHaveLength(2))
    expect(asked).toEqual(['m-3', 'm-1'])
    const draft = frames().find((frame) => frame.getAttribute('srcdoc')?.includes('<i>nháp</i>')) as HTMLElement
    expect(policyOf(draft)).not.toContain('https:')
    expect(thread().getByText(HELD)).toBeInTheDocument()
  })

  it('asks nothing more for an email that is only text', async () => {
    const { asked } = backend({ newest: 'TEXT' })
    open('/inbox/c-1')

    expect(await thread().findByText(/^Chào An, mình gửi bản hợp đồng/)).toBeInTheDocument()

    expect(asked).toEqual([])
    expect(frames()).toHaveLength(0)
  })

  it('shows the text of an older email that turns out to have no HTML, without an error', async () => {
    backend({ newest: 'UNCHECKED', bodies: { 'm-3': { format: 'TEXT', html: null, remoteImages: false } } })
    open('/inbox/c-1')

    expect(await thread().findByText(/^Chào An, mình gửi bản hợp đồng/)).toBeInTheDocument()
    await vi.waitFor(() => expect(thread().getByText(/^Chào An, mình gửi bản hợp đồng/).closest('[aria-busy="true"]')).toBeNull())

    expect(frames()).toHaveLength(0)
    expect(thread().queryByText(/Không tải được bản đầy đủ/)).toBeNull()
  })

  it('keeps the text when the full email cannot load, and shows it on retry', async () => {
    const api = backend()
    api.failBody(true)
    open('/inbox/c-1')
    const user = userEvent.setup()

    const note = await thread().findByText('Không tải được bản đầy đủ của thư này. Đang hiện phần chữ.')
    expect(thread().getByText(/^Chào An, mình gửi bản hợp đồng/)).toBeInTheDocument()
    api.failBody(false)
    await user.click(within(note.parentElement as HTMLElement).getByRole('button', { name: 'Thử lại' }))

    expect(await thread().findByTitle('Nội dung thư')).toBeInTheDocument()
    expect(thread().queryByText(/Không tải được bản đầy đủ/)).toBeNull()
  })
})
