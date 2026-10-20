import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { stubPictureDecoding } from '@/test/pictureDecoding'
import { renderApp } from '@/test/renderApp'
import { STICKER_MAX_BYTES } from './format'
import type { StickerItem } from './stickers.types'

const list = (items: StickerItem[]) => http.get('/api/stickers', () => HttpResponse.json({ items }))
const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

/** The library is there: the region of the screen has come. */
const ready = () => screen.findByRole('region', { name: 'Thư viện sticker' })
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker' }))


// The screen also reads the packs (SP-06); these tests are about a library in no pack, so there is none.
beforeEach(() => server.use(http.get('/api/sticker-packs', () => HttpResponse.json({ items: [] }))))

describe('Sticker screen: the library (ST-12, spec web-sticker-library)', () => {
  it('shows each sticker as a picture named by the sticker, newest first, from its content address', async () => {
    server.use(list(API_STICKERS))
    renderApp('/stickers')
    await ready()

    const pictures = await library().findAllByRole('img')

    expect(pictures.map((picture) => picture.getAttribute('alt'))).toEqual(['nhay', 'meo'])
    expect(library().getByRole('img', { name: 'meo' })).toHaveAttribute('src', '/api/stickers/st-cat/content')
    expect(library().getByRole('img', { name: 'nhay' })).toHaveAttribute('src', '/api/stickers/st-dance/content')
  })

  it('loads the pictures lazily, so a library of three hundred does not fetch them all at once', async () => {
    server.use(list(API_STICKERS))
    renderApp('/stickers')
    await ready()

    for (const picture of await library().findAllByRole('img')) {
      expect(picture).toHaveAttribute('loading', 'lazy')
    }
  })

  it('names the sticker and its size under the picture, and says which ones move (DN-4: a GIF always plays)', async () => {
    server.use(list(API_STICKERS))
    renderApp('/stickers')
    await ready()
    const cards = await library().findAllByRole('listitem')

    const dance = within(cards[0])
    expect(dance.getByText('nhay')).toBeInTheDocument()
    expect(dance.getByText('320 × 240')).toBeInTheDocument()
    expect(dance.getByText('Động')).toBeInTheDocument()
    const cat = within(cards[1])
    expect(cat.getByText('meo')).toBeInTheDocument()
    expect(cat.getByText('256 × 256')).toBeInTheDocument()
    expect(cat.queryByText('Động')).not.toBeInTheDocument()
  })

  it('counts the stickers in the header, in the phone header too', async () => {
    server.use(list(API_STICKERS))
    renderApp('/stickers')
    await ready()

    // Two in the DOM: the phone header's and the title of 768 px up; CSS shows one. The third is the count of the part
    // "Chưa xếp bộ", which holds both (SP-06).
    expect(await library().findAllByRole('heading', { level: 1, name: 'Sticker' })).toHaveLength(2)
    expect(library().getAllByText('2 sticker')).toHaveLength(3)
  })

  it('goes back to Thêm from the phone header, as the other screens behind it (canvas MobileNotes)', async () => {
    server.use(list(API_STICKERS))
    renderApp('/stickers')
    await ready()

    expect(library().getByRole('link', { name: 'Quay lại Thêm' })).toHaveAttribute('href', '/more')
  })

  it('says the library is empty, and not a blank grid, when there is no sticker', async () => {
    server.use(list([]))
    renderApp('/stickers')
    await ready()

    expect(await library().findByText('Thư viện sticker đang trống')).toBeInTheDocument()
    expect(library().queryByRole('list')).not.toBeInTheDocument()
    expect(library().queryByRole('img')).not.toBeInTheDocument()
  })

  it('says it is loading while the list has not come', async () => {
    server.use(http.get('/api/stickers', () => delay('infinite')))
    renderApp('/stickers')
    await ready()

    expect(await library().findByRole('status', { name: 'Đang tải sticker' })).toBeInTheDocument()
    expect(library().queryByText('Thư viện sticker đang trống')).not.toBeInTheDocument()
  })

  it('says why the list is missing and reads it again on "Thử lại", never a white screen', async () => {
    const user = userEvent.setup()
    let reads = 0
    server.use(
      http.get('/api/stickers', () => {
        reads += 1
        return reads === 1 ? problem(500, 'INTERNAL') : HttpResponse.json({ items: API_STICKERS })
      }),
    )
    renderApp('/stickers')
    await ready()

    expect(await library().findByRole('alert')).toHaveTextContent('Không tải được sticker')
    expect(library().queryByRole('img')).not.toBeInTheDocument()

    await user.click(library().getByRole('button', { name: 'Thử lại' }))

    expect(await library().findByRole('img', { name: 'meo' })).toBeInTheDocument()
    expect(reads).toBe(2)
    expect(library().queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ST-13: choose files with the button. `applyAccept: false` because `accept` only tunes the picker of the browser (a person
// can always choose "all files"), so the page must hold on its own against a file the picker would have hidden.
const input = () => screen.getByLabelText('Chọn tệp sticker') as HTMLInputElement
const pickerUser = () => userEvent.setup({ applyAccept: false })
const pngFile = (name = 'moi.png') => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' })

/** A choice opens the "Thêm sticker" step (SP-08); "Lưu" hands what it holds to the queue these tests are about. */
async function saveStep() {
  const step = await screen.findByRole('dialog', { name: 'Thêm sticker' })
  await userEvent.click(within(step).getByRole('button', { name: /^Lưu \d+ sticker$/ }))
}
const made = (overrides: Partial<StickerItem> = {}) => sticker({ id: 'st-new', name: 'moi', createdAt: '2026-10-19T10:00:00Z', ...overrides })

describe('Sticker screen: uploading with the button (ST-13, spec web-sticker-library)', () => {
  // jsdom decodes no picture: the step's PNG of each still one is a stand-in (SP-08).
  beforeEach(() => {
    stubPictureDecoding()
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends the chosen picture as a multipart form and puts the new sticker first in the grid, without reading the list again', async () => {
    const user = pickerUser()
    let listReads = 0
    const posts: { type: string | null; body: string }[] = []
    server.use(
      http.get('/api/stickers', () => {
        listReads += 1
        return HttpResponse.json({ items: API_STICKERS })
      }),
      http.post('/api/stickers', async ({ request }) => {
        posts.push({ type: request.headers.get('Content-Type'), body: await request.text() })
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })

    await user.upload(input(), pngFile())
    await saveStep()

    expect(await library().findByRole('img', { name: 'moi' })).toBeInTheDocument()
    expect(library().getAllByRole('img').map((picture) => picture.getAttribute('alt'))).toEqual(['moi', 'nhay', 'meo'])
    expect(posts).toHaveLength(1)
    expect(posts[0].type).toMatch(/^multipart\/form-data; boundary=/)
    expect(posts[0].body).toContain('name="file"')
    expect(listReads).toBe(1)
  })

  it('says the file is being sent, then that it is saved', async () => {
    const user = pickerUser()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', async () => {
        await gate
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })

    await user.upload(input(), pngFile('moi.png'))
    await saveStep()

    // In the step while it is sent (SP-10), then on the screen once the step has closed.
    const step = within(screen.getByRole('dialog', { name: 'Thêm sticker' }))
    expect(await step.findByText('Đang gửi…')).toBeInTheDocument()
    expect(step.getByRole('status')).toHaveTextContent('Đang lưu ảnh 1 trên 1…')
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(library().getByRole('status', { name: 'Kết quả lưu' })).toHaveTextContent('Đã lưu 1 sticker.')
  })

  it('refuses a file of another type on the spot: it says so with the name, and no request goes out', async () => {
    const user = pickerUser()
    let posts = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        posts += 1
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })

    await user.upload(input(), new File(['%PDF-1.7'], 'ghi-chu.pdf', { type: 'application/pdf' }))

    const alert = await library().findByRole('alert')
    expect(alert).toHaveTextContent('ghi-chu.pdf')
    expect(alert).toHaveTextContent('Không phải ảnh dùng được: chỉ nhận PNG, JPEG, GIF, WebP.')
    expect(posts).toBe(0)
    expect(library().getAllByRole('img')).toHaveLength(2)
  })

  it('refuses a moving picture over the limit on the spot, saying what the limit is', async () => {
    const user = pickerUser()
    let posts = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        posts += 1
        return HttpResponse.json(made(), { status: 201 })
      }),
    )
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })

    // A moving picture is sent as it is, so it must be within the limit already; a still one is made smaller (SP-08).
    const heavy = new Uint8Array(STICKER_MAX_BYTES + 1)
    heavy.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    await user.upload(input(), new File([heavy], 'nang.gif', { type: 'image/gif' }))

    const alert = await library().findByRole('alert')
    expect(alert).toHaveTextContent('nang.gif')
    expect(alert).toHaveTextContent('nặng hơn 1 MB')
    expect(posts).toBe(0)
  })

  it('lets the same file be chosen again right after: the picker is cleared each time', async () => {
    const user = pickerUser()
    let posts = 0
    server.use(
      list(API_STICKERS),
      http.post('/api/stickers', () => {
        posts += 1
        return HttpResponse.json(made({ id: `st-new-${posts}` }), { status: 201 })
      }),
    )
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })
    const file = pngFile()

    await user.upload(input(), file)
    await saveStep()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await library().findByRole('status', { name: 'Kết quả lưu' })
    await user.upload(input(), file)
    await saveStep()

    await vi.waitFor(() => expect(posts).toBe(2))
  })

  it('opens the file picker from the keyboard: the button takes Enter and passes the click to the hidden input', async () => {
    const user = pickerUser()
    server.use(list(API_STICKERS))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })

    // Two in the DOM: the phone header's icon and the button of 768 px up; CSS shows one.
    const buttons = library().getAllByRole('button', { name: 'Tải lên' })
    expect(buttons).toHaveLength(2)
    buttons[1].focus()
    await user.keyboard('{Enter}')

    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLInputElement).type).toBe('file')
  })

  it('shows how to upload on an empty library, with a button of its own', async () => {
    server.use(list([]))
    renderApp('/stickers')

    expect(await library().findByText(/Bấm “Tải lên” để chọn ảnh PNG, JPEG, GIF hoặc WebP. Ảnh tĩnh được cắt và thu nhỏ trước khi lưu; ảnh động tối đa 1 MB./)).toBeInTheDocument()
    expect(library().getAllByRole('button', { name: 'Tải lên' })).toHaveLength(3)
  })

  it('says what the last save did until new pictures are chosen', async () => {
    const user = pickerUser()
    server.use(list(API_STICKERS), http.post('/api/stickers', () => HttpResponse.json(made(), { status: 201 })))
    renderApp('/stickers')
    await library().findByRole('img', { name: 'meo' })
    await user.upload(input(), pngFile('moi.png'))
    await saveStep()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await library().findByRole('status', { name: 'Kết quả lưu' })).toHaveTextContent('Đã lưu 1 sticker.')

    await user.upload(input(), pngFile('moi-nua.png'))

    expect(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }).querySelector('[aria-label="Kết quả lưu"]')).toBeNull()
  })
})
