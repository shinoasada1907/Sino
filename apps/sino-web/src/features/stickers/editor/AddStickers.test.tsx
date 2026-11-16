import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { API_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { liveObjectUrls } from '@/test/objectUrls'
import { stubPictureDecoding } from '@/test/pictureDecoding'
import { renderApp } from '@/test/renderApp'
import { STICKER_MAX_BYTES } from '../format'

// SP-08: choosing or dropping pictures opens the "Thêm sticker" step instead of sending them (spec sticker-upload-editor:
// "Chọn nhiều ảnh mở bước Thêm sticker"). Nothing goes to the server before "Lưu".

/** `size` bytes that start like a file of that type: enough for the step to tell what it is. */
const bytes = (head: number[], size: number) => {
  const content = new Uint8Array(Math.max(size, head.length))
  content.set(head)
  return content
}
const png = (name: string) => new File([bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 8)], name, { type: 'image/png' })
const jpeg = (name: string, size = 4) => new File([bytes([0xff, 0xd8, 0xff, 0xe0], size)], name, { type: 'image/jpeg' })
const gif = (name: string, size = 10) => new File([bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], size)], name, { type: 'image/gif' })
const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' })

// `hidden: true`: while the step is open Radix hides the rest of the page from the accessibility tree.
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }))
const step = () => within(screen.getByRole('dialog', { name: 'Thêm sticker' }))
const input = () => screen.getByLabelText('Chọn tệp sticker') as HTMLInputElement
const pickerUser = () => userEvent.setup({ applyAccept: false })
const batchNames = () => within(step().getByRole('list', { name: 'Ảnh trong lượt' })).getAllByRole('listitem').map((item) => within(item).getAllByRole('button')[0].textContent)

let posts: { name: string; type: string }[]

beforeEach(() => {
  posts = []
  server.use(
    http.get('/api/stickers', () => HttpResponse.json({ items: API_STICKERS })),
    http.get('/api/sticker-packs', () => HttpResponse.json({ items: [] })),
  )
  // The form as the page hands it over: in jsdom a file loses its name on the way to the fake server (`filename="blob"`).
  vi.spyOn(api, 'upload').mockImplementation(async <T,>(_path: string, form: FormData) => {
    const part = form.get('file') as File
    posts.push({ name: part.name, type: part.type })
    return sticker({ id: `st-new-${posts.length}`, name: part.name.replace(/\.[^.]*$/, ''), createdAt: '2026-10-20T10:00:00Z' }) as T
  })
})

async function openLibrary() {
  renderApp('/stickers')
  await library().findByRole('img', { name: 'meo' })
}

describe('the "Thêm sticker" step: opening it (SP-08)', () => {
  beforeEach(() => {
    stubPictureDecoding()
  })

  it('opens with the three pictures chosen, the first one selected and shown large, and sends nothing', async () => {
    const user = pickerUser()
    await openLibrary()

    await user.upload(input(), [jpeg('meo.jpg'), png('cho.png'), gif('nhay.gif')])

    expect(await screen.findByRole('dialog', { name: 'Thêm sticker' })).toBeInTheDocument()
    expect(batchNames()).toEqual(['meo.jpg', 'cho.png', 'nhay.gif'])
    expect(step().getByRole('button', { name: 'meo.jpg' })).toHaveAttribute('aria-current', 'true')
    expect(step().getByRole('img', { name: 'Xem trước meo.jpg' })).toHaveAttribute('src', liveObjectUrls()[0])
    expect(step().getByRole('button', { name: 'Lưu 3 sticker' })).toBeEnabled()
    expect(posts).toEqual([])
  })

  it('keeps out a file that is no picture, and says so with its name', async () => {
    const user = pickerUser()
    await openLibrary()

    await user.upload(input(), [pdf('ghi-chu.pdf'), png('meo.png')])

    await screen.findByRole('dialog', { name: 'Thêm sticker' })
    expect(batchNames()).toEqual(['meo.png'])
    const alert = step().getByRole('alert')
    expect(alert).toHaveTextContent('ghi-chu.pdf')
    expect(alert).toHaveTextContent('Không phải ảnh dùng được: chỉ nhận PNG, JPEG, GIF, WebP.')
  })

  it('says on the screen why, and opens nothing, when no file of the choice can be used', async () => {
    const user = pickerUser()
    await openLibrary()

    await user.upload(input(), [pdf('ghi-chu.pdf')])

    expect(await library().findByRole('alert')).toHaveTextContent('ghi-chu.pdf')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(library().getByRole('button', { name: 'Ẩn thông báo' }))
    expect(library().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refuses a moving picture over 1 MB, and takes a still one of any weight', async () => {
    const user = pickerUser()
    await openLibrary()

    await user.upload(input(), [gif('nang.gif', STICKER_MAX_BYTES + 1), jpeg('anh-chup.jpg', 3 * STICKER_MAX_BYTES)])

    await screen.findByRole('dialog', { name: 'Thêm sticker' })
    expect(batchNames()).toEqual(['anh-chup.jpg'])
    expect(step().getByRole('alert')).toHaveTextContent('nang.gif')
    expect(step().getByRole('alert')).toHaveTextContent('Ảnh động nặng hơn 1 MB.')
  })

  it('opens for pictures dropped on the screen, as for the button', async () => {
    await openLibrary()

    fireEvent.drop(screen.getByRole('region', { name: 'Thư viện sticker' }), { dataTransfer: { files: [png('moi.png')], types: ['Files'] } })

    expect(await screen.findByRole('dialog', { name: 'Thêm sticker' })).toBeInTheDocument()
    expect(batchNames()).toEqual(['moi.png'])
  })
})

describe('the "Thêm sticker" step: the list (SP-08)', () => {
  beforeEach(() => {
    stubPictureDecoding()
  })

  async function openWith(...files: File[]) {
    const user = pickerUser()
    await openLibrary()
    await user.upload(input(), files)
    await screen.findByRole('dialog', { name: 'Thêm sticker' })
    return user
  }

  it('shows the picture chosen in the list, and says a moving one is kept whole', async () => {
    const user = await openWith(png('meo.png'), gif('nhay.gif'))
    expect(step().getByText('Phần trong khung được lưu thành PNG, cạnh tối đa 512 điểm ảnh.')).toBeInTheDocument()

    await user.click(step().getByRole('button', { name: 'nhay.gif' }))

    expect(step().getByRole('button', { name: 'nhay.gif' })).toHaveAttribute('aria-current', 'true')
    expect(step().getByRole('button', { name: 'meo.png' })).not.toHaveAttribute('aria-current')
    expect(step().getByRole('img', { name: 'Xem trước nhay.gif' })).toBeInTheDocument()
    expect(step().getByText('Ảnh động được lưu nguyên: không cắt, không xoay.')).toBeInTheDocument()
  })

  it('takes a picture out, lets its preview go, and gives the focus to the next one', async () => {
    const user = await openWith(png('a.png'), png('b.png'), png('c.png'))
    const before = liveObjectUrls()

    await user.click(step().getByRole('button', { name: 'Bỏ a.png khỏi lượt' }))

    expect(batchNames()).toEqual(['b.png', 'c.png'])
    expect(liveObjectUrls()).toEqual(before.slice(1))
    expect(step().getByRole('button', { name: 'Lưu 2 sticker' })).toBeInTheDocument()
    await waitFor(() => expect(step().getByRole('button', { name: 'Bỏ b.png khỏi lượt' })).toHaveFocus())
  })

  it('stays open when the last picture is taken out, says so, and puts the focus on "Thêm ảnh"', async () => {
    const user = await openWith(png('a.png'))

    await user.click(step().getByRole('button', { name: 'Bỏ a.png khỏi lượt' }))

    expect(step().getByText('Chưa có ảnh nào trong lượt. Thêm ảnh để tiếp tục.')).toBeInTheDocument()
    expect(step().getByRole('button', { name: 'Lưu 0 sticker' })).toBeDisabled()
    await waitFor(() => expect(step().getByRole('button', { name: 'Thêm ảnh' })).toHaveFocus())
  })

  it('adds more pictures with "Thêm ảnh", after the ones it has', async () => {
    const user = await openWith(png('a.png'))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')

    await user.click(step().getByRole('button', { name: 'Thêm ảnh' }))
    expect(click).toHaveBeenCalledTimes(1)
    // The picker of the browser answers. The input is outside the step, which Radix keeps the pointer away from, so the
    // answer is played as the change event it is.
    fireEvent.change(input(), { target: { files: [gif('b.gif')] } })

    await waitFor(() => expect(batchNames()).toEqual(['a.png', 'b.gif']))
    expect(step().getByRole('button', { name: 'a.png' })).toHaveAttribute('aria-current', 'true')
  })

  it('adds the pictures dropped on the step itself', async () => {
    await openWith(png('a.png'))

    fireEvent.drop(screen.getByRole('dialog', { name: 'Thêm sticker' }), { dataTransfer: { files: [png('b.png')], types: ['Files'] } })

    await waitFor(() => expect(batchNames()).toEqual(['a.png', 'b.png']))
  })

  it('gives the focus back to the "Tải lên" that opened the picker when it closes, whatever had it meanwhile', async () => {
    const user = pickerUser()
    await openLibrary()
    // The picker of the browser opens and answers; the focus is not on the button any more when the step opens.
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const upload = library().getAllByRole('button', { name: 'Tải lên' })[1]
    await user.click(upload)
    upload.blur()
    fireEvent.change(input(), { target: { files: [png('a.png')] } })
    await screen.findByRole('dialog', { name: 'Thêm sticker' })

    await user.keyboard('{Escape}')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bỏ ảnh' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(upload).toHaveFocus()
  })

  it('gives the focus to "Tải lên" when it closes after a drop, which no button opened', async () => {
    const user = pickerUser()
    await openLibrary()
    fireEvent.drop(screen.getByRole('region', { name: 'Thư viện sticker' }), { dataTransfer: { files: [png('a.png')], types: ['Files'] } })
    await screen.findByRole('dialog', { name: 'Thêm sticker' })

    await user.keyboard('{Escape}')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bỏ ảnh' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(library().getAllByRole('button', { name: 'Tải lên' })).toContainEqual(document.activeElement)
  })

  it('closes with "Hủy", sends nothing, and lets every preview go', async () => {
    const user = await openWith(png('a.png'), png('b.png'))

    await user.click(step().getByRole('button', { name: 'Hủy' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bỏ ảnh' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(posts).toEqual([])
    expect(liveObjectUrls()).toEqual([])
  })
})

describe('the "Thêm sticker" step: saving (SP-08, until the frame of SP-09 and the batch save of SP-10)', () => {
  it('sends a still picture as a PNG of its middle square and a moving one as it is, then closes', async () => {
    stubPictureDecoding({ size: { width: 2000, height: 1000 } })
    const user = pickerUser()
    await openLibrary()
    await user.upload(input(), [jpeg('meo-moi.jpg'), gif('nhay-moi.gif')])
    await screen.findByRole('dialog', { name: 'Thêm sticker' })

    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(posts).toEqual([
      { name: 'meo-moi.png', type: 'image/png' },
      { name: 'nhay-moi.gif', type: 'image/gif' },
    ]))
    expect(await library().findByRole('img', { name: 'nhay-moi' })).toBeInTheDocument()
    expect(liveObjectUrls()).toEqual([])
  })

  it('keeps a picture the browser cannot read in the step, says so, and sends the others', async () => {
    stubPictureDecoding({ unreadable: (file) => file.name === 'hong.png' })
    const user = pickerUser()
    await openLibrary()
    await user.upload(input(), [png('hong.png'), png('tot.png')])
    await screen.findByRole('dialog', { name: 'Thêm sticker' })

    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    await waitFor(() => expect(posts).toEqual([{ name: 'tot.png', type: 'image/png' }]))
    expect(batchNames()).toEqual(['hong.png'])
    expect(step().getByText('Không đọc được ảnh này. Hãy bỏ nó hoặc chọn ảnh khác.')).toBeInTheDocument()
  })
})
