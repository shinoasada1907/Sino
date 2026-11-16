import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { API_STICKERS, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { stubPictureDecoding } from '@/test/pictureDecoding'
import { renderApp } from '@/test/renderApp'

// SP-09: the frame of one picture in the "Thêm sticker" step (spec sticker-upload-editor, "Chỉnh một ảnh tĩnh trước khi
// lưu"). jsdom loads no picture, so react-easy-crop never measures its frame here: dragging, the wheel and the arrow keys on
// the frame are checked in a real Chrome; these tests hold the controls, what each picture keeps, and what is sent.

const bytes = (head: number[], size: number) => {
  const content = new Uint8Array(Math.max(size, head.length))
  content.set(head)
  return content
}
const png = (name: string) => new File([bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 8)], name, { type: 'image/png' })
const gif = (name: string) => new File([bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 10)], name, { type: 'image/gif' })

const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }))
const step = () => within(screen.getByRole('dialog', { name: 'Thêm sticker' }))
const input = () => screen.getByLabelText('Chọn tệp sticker') as HTMLInputElement

let sent: { file: string; type: string; name: FormDataEntryValue | null }[]

beforeEach(() => {
  sent = []
  server.use(
    http.get('/api/stickers', () => HttpResponse.json({ items: API_STICKERS })),
    http.get('/api/sticker-packs', () => HttpResponse.json({ items: [] })),
  )
  // The form as the page hands it over: in jsdom a file loses its name on the way to the fake server.
  vi.spyOn(api, 'upload').mockImplementation(async <T,>(_path: string, form: FormData) => {
    const part = form.get('file') as File
    sent.push({ file: part.name, type: part.type, name: form.get('name') })
    return sticker({ id: `st-new-${sent.length}`, name: String(form.get('name') ?? part.name), createdAt: '2026-10-20T10:00:00Z' }) as T
  })
})

async function openWith(...files: File[]) {
  const user = userEvent.setup({ applyAccept: false })
  renderApp('/stickers')
  await library().findByRole('img', { name: 'meo' })
  await user.upload(input(), files)
  await screen.findByRole('dialog', { name: 'Thêm sticker' })
  return user
}

const zoom = () => step().getByRole('slider', { name: 'Phóng to' }) as HTMLInputElement
const shape = () => within(step().getByRole('group', { name: 'Hình khung' }))
const name = () => step().getByRole('textbox', { name: 'Tên sticker' }) as HTMLInputElement

describe('the frame of a still picture (SP-09)', () => {
  beforeEach(() => {
    stubPictureDecoding({ size: { width: 2000, height: 1000 } })
  })

  it('starts as a square in the middle, not zoomed, not turned, named after its file', async () => {
    await openWith(png('meo-vui.png'))

    expect(zoom()).toHaveValue('1')
    expect(zoom()).toHaveAttribute('min', '1')
    expect(zoom()).toHaveAttribute('max', '3')
    expect(shape().getByRole('button', { name: 'Vuông' })).toHaveAttribute('aria-pressed', 'true')
    expect(shape().getByRole('button', { name: 'Theo ảnh' })).toHaveAttribute('aria-pressed', 'false')
    expect(step().getByRole('button', { name: 'Xoay 90°' })).toBeInTheDocument()
    expect(name()).toHaveValue('meo-vui')
    expect(step().getByRole('img', { name: 'Xem trước meo-vui.png' })).toBeInTheDocument()
  })

  it('keeps what was done to each picture when going from one to another and back', async () => {
    const user = await openWith(png('a.png'), png('b.png'))

    // The shape first: a new shape starts the zoom afresh, so that the picture fills the new frame.
    await user.click(shape().getByRole('button', { name: 'Theo ảnh' }))
    fireEvent.change(zoom(), { target: { value: '2.5' } })
    await user.click(step().getByRole('button', { name: 'Xoay 90°' }))
    await user.clear(name())
    await user.type(name(), 'Mèo xoay')
    await user.click(step().getByRole('button', { name: 'b.png' }))

    expect(zoom()).toHaveValue('1')
    expect(shape().getByRole('button', { name: 'Vuông' })).toHaveAttribute('aria-pressed', 'true')
    expect(name()).toHaveValue('b')
    expect(step().getByText('Không xoay')).toBeInTheDocument()

    await user.click(step().getByRole('button', { name: 'a.png' }))

    expect(zoom()).toHaveValue('2.5')
    expect(shape().getByRole('button', { name: 'Theo ảnh' })).toHaveAttribute('aria-pressed', 'true')
    expect(name()).toHaveValue('Mèo xoay')
    expect(step().getByText('Đã xoay 90°')).toBeInTheDocument()
  })

  it('starts the zoom afresh for a new shape of frame', async () => {
    const user = await openWith(png('a.png'))
    fireEvent.change(zoom(), { target: { value: '2' } })

    await user.click(shape().getByRole('button', { name: 'Theo ảnh' }))

    expect(zoom()).toHaveValue('1')
  })

  it('turns a quarter each press, and is back after four', async () => {
    const user = await openWith(png('a.png'))
    const turn = step().getByRole('button', { name: 'Xoay 90°' })

    for (const said of ['Đã xoay 90°', 'Đã xoay 180°', 'Đã xoay 270°', 'Không xoay']) {
      await user.click(turn)
      expect(step().getByText(said)).toBeInTheDocument()
    }
  })

  it('sends the picture as framed and turned, with the name typed', async () => {
    const { exported } = stubPictureDecoding({ size: { width: 2000, height: 1000 } })
    const user = await openWith(png('a.png'))
    await user.click(step().getByRole('button', { name: 'Xoay 90°' }))
    await user.click(shape().getByRole('button', { name: 'Theo ảnh' }))
    await user.clear(name())
    await user.type(name(), 'Mèo đứng')

    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    await waitFor(() => expect(sent).toEqual([{ file: 'Mèo đứng.png', type: 'image/png', name: 'Mèo đứng' }]))
    // The whole picture turned a quarter, 1000 × 2000, brought down to 512 on its longest side.
    expect(exported).toEqual([{ width: 256, height: 512 }])
  })

  it('sends the middle square by default, at 512 × 512', async () => {
    const { exported } = stubPictureDecoding({ size: { width: 2000, height: 1000 } })
    const user = await openWith(png('a.png'))

    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(exported).toEqual([{ width: 512, height: 512 }])
    expect(sent[0].name).toBe('a')
  })
})

describe('the frame of a moving picture (SP-09)', () => {
  beforeEach(() => {
    stubPictureDecoding()
  })

  it('has no frame, zoom or turn, says it is kept whole, and still has a name', async () => {
    await openWith(gif('nhay.gif'))

    expect(step().getByText('Ảnh động được lưu nguyên: không cắt, không xoay.')).toBeInTheDocument()
    expect(step().queryByRole('slider', { name: 'Phóng to' })).not.toBeInTheDocument()
    expect(step().queryByRole('button', { name: 'Xoay 90°' })).not.toBeInTheDocument()
    expect(step().queryByRole('group', { name: 'Hình khung' })).not.toBeInTheDocument()
    expect(name()).toHaveValue('nhay')
  })

  it('sends the very file, with the name typed', async () => {
    const user = await openWith(gif('nhay.gif'))
    await user.clear(name())
    await user.type(name(), 'Nhảy múa')

    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    await waitFor(() => expect(sent).toEqual([{ file: 'nhay.gif', type: 'image/gif', name: 'Nhảy múa' }]))
  })
})
