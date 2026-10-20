import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { API_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import type { StickerItem } from './stickers.types'

// ST-14: drag and drop, several files at once, the refusals of the server said in Vietnamese (spec web-sticker-library).
// A drag of files carries `types: ['Files']`; a selection of text carries `['text/plain']`.

const list = (items: StickerItem[]) => http.get('/api/stickers', () => HttpResponse.json({ items }))
const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker' }))
const region = () => screen.getByRole('region', { name: 'Thư viện sticker' })
const input = () => screen.getByLabelText('Chọn tệp sticker') as HTMLInputElement
// `applyAccept: false`: `accept` only tunes the picker of the browser; the page must hold on its own.
const pickerUser = () => userEvent.setup({ applyAccept: false })
const pngFile = (name = 'moi.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
const made = (overrides: Partial<StickerItem> = {}) => sticker({ id: 'st-new', name: 'moi', createdAt: '2026-10-19T10:00:00Z', ...overrides })
const dragOf = (files: File[]) => ({ dataTransfer: { files, types: ['Files'] } })
const textDrag = { dataTransfer: { files: [], types: ['text/plain'] } }
const DROP_HINT = 'Thả ảnh PNG, GIF hoặc WebP để tải lên'

async function openLibrary() {
  renderApp('/stickers')
  await library().findByRole('img', { name: 'meo' })
}


// The screen also reads the packs (SP-06); these tests are about a library in no pack, so there is none.
beforeEach(() => server.use(http.get('/api/sticker-packs', () => HttpResponse.json({ items: [] }))))

describe('Sticker screen: drag and drop (ST-14)', () => {
  it('uploads a file dropped on the screen as one chosen with the button', async () => {
    let posts = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        posts += 1
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    await openLibrary()

    fireEvent.drop(region(), dragOf([pngFile('moi.png')]))

    expect(await library().findByRole('img', { name: 'moi' })).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('shows where to drop while files are dragged over the screen, and takes it away when they leave or drop', async () => {
    server.use(list(API_STICKERS), http.post('/api/stickers', () => HttpResponse.json(made(), { status: 201 })))
    await openLibrary()
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()

    fireEvent.dragEnter(region(), dragOf([]))
    expect(await screen.findByText(DROP_HINT)).toBeInTheDocument()
    fireEvent.dragLeave(region(), dragOf([]))
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()

    fireEvent.dragEnter(region(), dragOf([]))
    await screen.findByText(DROP_HINT)
    fireEvent.drop(region(), dragOf([pngFile()]))
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
    await library().findByText('Đã thêm moi.png')
  })

  it('keeps the hint while the pointer crosses from one element of the screen to another', async () => {
    server.use(list(API_STICKERS))
    await openLibrary()
    const picture = library().getByRole('img', { name: 'meo' })

    fireEvent.dragEnter(region(), dragOf([]))
    fireEvent.dragEnter(picture, dragOf([])) // enters the picture before it has left the screen
    fireEvent.dragLeave(region(), dragOf([]))

    expect(screen.getByText(DROP_HINT)).toBeInTheDocument()
    fireEvent.dragLeave(picture, dragOf([]))
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
  })

  it('allows a drop of files, which needs dragover cancelled, and leaves a drag of text to the browser', async () => {
    server.use(list(API_STICKERS))
    await openLibrary()

    // `fireEvent` gives false when the handler called `preventDefault()`.
    expect(fireEvent.dragOver(region(), dragOf([]))).toBe(false)
    expect(fireEvent.dragOver(region(), textDrag)).toBe(true)
    fireEvent.dragEnter(region(), textDrag)
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
  })

  it('refuses a dropped file of another type on the spot, with no request', async () => {
    let posts = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        posts += 1
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    await openLibrary()

    fireEvent.drop(region(), dragOf([new File(['x'], 'anh.jpg', { type: 'image/jpeg' })]))

    expect(await library().findByRole('alert')).toHaveTextContent(/anh\.jpg.*chỉ nhận PNG, GIF, WebP/i)
    expect(posts).toBe(0)
  })

  it('ignores a drop that carries no file', async () => {
    server.use(list(API_STICKERS))
    await openLibrary()

    fireEvent.drop(region(), dragOf([]))

    expect(library().queryByRole('alert')).not.toBeInTheDocument()
    expect(library().getByRole('status', { name: 'Tiến trình tải lên' })).toBeEmptyDOMElement()
  })
})

describe('Sticker screen: several files and the words of the refusals (ST-14)', () => {
  it('goes on with the other files when the server refuses one, and names that file with the cause in Vietnamese', async () => {
    const user = pickerUser()
    let calls = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        const call = calls++
        return call === 1 ? problem(409, 'STICKER_DUPLICATE') : HttpResponse.json(made({ id: `st-${call}`, name: call === 0 ? 'a' : 'c' }), { status: 201 })
      }),
    )
    await openLibrary()

    await user.upload(input(), [pngFile('a.png'), pngFile('b.png'), pngFile('c.png')])

    expect(await library().findByText('Đã thêm c.png')).toBeInTheDocument()
    expect(library().getByText('Đã thêm a.png')).toBeInTheDocument()
    const alert = library().getByRole('alert')
    expect(alert).toHaveTextContent('b.png')
    expect(alert).toHaveTextContent('Sticker này đã có trong thư viện.')
    expect(alert).not.toHaveTextContent('STICKER_DUPLICATE')
    // The last one sent is the newest, so it is first.
    expect(library().getAllByRole('img').map((picture) => picture.getAttribute('alt'))).toEqual(['c', 'a', 'nhay', 'meo'])
    // The same file would be refused again, so no second try is offered.
    expect(library().queryByRole('button', { name: /^Thử lại tải/ })).not.toBeInTheDocument()
  })

  it('sends them one after the other, never two at once', async () => {
    const user = pickerUser()
    let inFlight = 0
    let mostInFlight = 0
    let ids = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', async () => {
        inFlight += 1
        mostInFlight = Math.max(mostInFlight, inFlight)
        await delay(15)
        inFlight -= 1
        return HttpResponse.json(made({ id: `st-${ids++}` }), { status: 201 })
      }),
    )
    await openLibrary()

    await user.upload(input(), [pngFile('a.png'), pngFile('b.png'), pngFile('c.png')])
    await library().findByText('Đã thêm c.png')

    expect(mostInFlight).toBe(1)
  })

  it('says a file is waiting for its turn while the one before it is loading', async () => {
    const user = pickerUser()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let ids = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', async () => {
        await gate
        return HttpResponse.json(made({ id: `st-${ids++}` }), { status: 201 })
      }),
    )
    await openLibrary()

    await user.upload(input(), [pngFile('a.png'), pngFile('b.png')])

    const progress = within(await library().findByRole('status', { name: 'Tiến trình tải lên' }))
    expect(await progress.findByText('Đang tải a.png…')).toBeInTheDocument()
    expect(progress.getByText('b.png: đang chờ')).toBeInTheDocument()
    release()
    expect(await progress.findByText('Đã thêm b.png')).toBeInTheDocument()
  })

  it('says the library is full and to delete some', async () => {
    const user = pickerUser()
    server.use(list(API_STICKERS), http.post('/api/stickers', () => problem(409, 'STICKER_LIMIT_REACHED')))
    await openLibrary()

    await user.upload(input(), pngFile())

    const alert = await library().findByRole('alert')
    expect(alert).toHaveTextContent(/thư viện đã đầy/i)
    expect(alert).toHaveTextContent(/xóa bớt/i)
    expect(alert).not.toHaveTextContent('STICKER_LIMIT_REACHED')
  })

  it('says the picture could not be read when the server cannot', async () => {
    const user = pickerUser()
    server.use(list(API_STICKERS), http.post('/api/stickers', () => problem(422, 'STICKER_INVALID_IMAGE')))
    await openLibrary()

    await user.upload(input(), pngFile('hong.png'))

    expect(await library().findByRole('alert')).toHaveTextContent(/hong\.png.*không đọc được/i)
  })

  it('says there is no connection and lets that file be tried again, which then goes through', async () => {
    const user = pickerUser()
    let calls = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        calls += 1
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(made(), { status: 201 })
      }),
    )
    await openLibrary()
    await user.upload(input(), pngFile('moi.png'))
    expect(await library().findByRole('alert')).toHaveTextContent(/moi\.png.*không kết nối được/i)

    await user.click(library().getByRole('button', { name: 'Thử lại tải moi.png' }))

    expect(await library().findByText('Đã thêm moi.png')).toBeInTheDocument()
    expect(library().queryByRole('alert')).not.toBeInTheDocument()
    expect(library().getByRole('img', { name: 'moi' })).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('shows a plain sentence, not the code, for a failure it does not know, and offers a second try', async () => {
    const user = pickerUser()
    server.use(list(API_STICKERS), http.post('/api/stickers', () => problem(500, 'INTERNAL')))
    await openLibrary()

    await user.upload(input(), pngFile('moi.png'))

    const alert = await library().findByRole('alert')
    expect(alert).toHaveTextContent('Không tải lên được. Hãy thử lại.')
    expect(alert).not.toHaveTextContent('INTERNAL')
    expect(library().getByRole('button', { name: 'Thử lại tải moi.png' })).toBeInTheDocument()
  })
})
