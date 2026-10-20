import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/shared/api/client'
import { ApiError } from '@/shared/api/problem'
import { API_PACKS, PACKED_STICKERS, pack, sticker } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { liveObjectUrls } from '@/test/objectUrls'
import { stubPictureDecoding } from '@/test/pictureDecoding'
import { renderApp } from '@/test/renderApp'

// SP-10, D-347, D-348: saving the batch (spec sticker-upload-editor, "Tên và bộ của lượt", "Lưu lần lượt và báo từng ảnh").
// The creation of a pack goes over MSW; the stickers are read where the page hands them over (`api.upload`), since in
// jsdom a file loses its name on the way to the fake server. Both write into `calls`, in the order they happen.

const png = (name: string) => {
  const content = new Uint8Array(8)
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new File([content], name, { type: 'image/png' })
}
const problem = (status: number, code: string) =>
  new ApiError(status, code, null)

const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }))
const step = () => within(screen.getByRole('dialog', { name: 'Thêm sticker' }))
const input = () => screen.getByLabelText('Chọn tệp sticker') as HTMLInputElement
const picker = () => step().getByRole('combobox', { name: 'Lưu vào bộ' }) as HTMLSelectElement
const section = (name: string) => within(library().getByRole('region', { name, hidden: true }))
const batchNames = () => within(step().getByRole('list', { name: 'Ảnh trong lượt' })).getAllByRole('listitem').map((item) => within(item).getAllByRole('button')[0].textContent)

let calls: string[]
let packs: typeof API_PACKS
/** How each upload answers, by the name of the file; a sticker by default. */
let answers: Record<string, () => Promise<unknown>>

beforeEach(() => {
  calls = []
  packs = [...API_PACKS]
  answers = {}
  stubPictureDecoding()
  server.use(
    http.get('/api/stickers', () => HttpResponse.json({ items: PACKED_STICKERS })),
    http.get('/api/sticker-packs', () => HttpResponse.json({ items: packs })),
    http.post('/api/sticker-packs', async ({ request }) => {
      const { name } = (await request.json()) as { name: string }
      calls.push(`POST /api/sticker-packs ${name}`)
      if (packs.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) {
        return HttpResponse.json({ title: 'Conflict', status: 409, code: 'STICKER_PACK_NAME_TAKEN' }, { status: 409, headers: { 'Content-Type': 'application/problem+json' } })
      }
      const made = pack({ id: 'pk-new', name: name.trim(), createdAt: '2026-10-20T11:00:00Z' })
      packs = [...packs, made]
      return HttpResponse.json(made, { status: 201 })
    }),
  )
  vi.spyOn(api, 'upload').mockImplementation(async <T,>(_path: string, form: FormData) => {
    const file = (form.get('file') as File).name
    calls.push(`POST /api/stickers ${file} packId=${form.get('packId') ?? '-'}`)
    const answer = answers[file]
    if (answer) {
      return (await answer()) as T
    }
    const name = String(form.get('name'))
    return sticker({ id: `st-${name}`, name, packId: (form.get('packId') as string | null) ?? null, createdAt: '2026-10-20T12:00:00Z' }) as T
  })
})

async function openLibrary() {
  renderApp('/stickers')
  await library().findByRole('img', { name: 'meo' })
}

async function chooseWith(button: HTMLElement, ...files: File[]) {
  const user = userEvent.setup({ applyAccept: false })
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  await user.click(button)
  fireEvent.change(input(), { target: { files } })
  await screen.findByRole('dialog', { name: 'Thêm sticker' })
  return user
}

const uploadButton = () => library().getAllByRole('button', { name: 'Tải lên' })[1]

describe('the pack of the batch (SP-10, D-348)', () => {
  it('offers the packs, "Chưa xếp bộ" and "Bộ mới…", and starts on "Chưa xếp bộ" from "Tải lên"', async () => {
    await openLibrary()
    await chooseWith(uploadButton(), png('a.png'))

    expect([...picker().options].map((option) => option.textContent)).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ', 'Bộ mới…'])
    expect(picker().selectedOptions[0].textContent).toBe('Chưa xếp bộ')
  })

  it('starts on the pack whose "Thêm ảnh vào bộ" opened it, and saves into it', async () => {
    await openLibrary()
    const user = await chooseWith(section('Chó').getByRole('button', { name: 'Thêm ảnh vào bộ Chó' }), png('cun.png'))
    expect(picker().selectedOptions[0].textContent).toBe('Chó')

    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    await waitFor(() => expect(calls).toEqual(['POST /api/stickers cun.png packId=pk-dogs']))
    expect(await section('Chó').findByRole('img', { name: 'cun' })).toBeInTheDocument()
  })

  it('starts the next batch on the pack the last one went into', async () => {
    await openLibrary()
    let user = await chooseWith(section('Chó').getByRole('button', { name: 'Thêm ảnh vào bộ Chó' }), png('cun.png'))
    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    user = await chooseWith(uploadButton(), png('cun-nua.png'))

    expect(picker().selectedOptions[0].textContent).toBe('Chó')
  })

  it('creates a new pack once, before the first picture, and saves every picture into it', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))

    await user.selectOptions(picker(), 'Bộ mới…')
    await user.type(step().getByRole('textbox', { name: 'Tên bộ mới' }), 'Gà con')
    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    await waitFor(() => expect(calls).toEqual(['POST /api/sticker-packs Gà con', 'POST /api/stickers a.png packId=pk-new', 'POST /api/stickers b.png packId=pk-new']))
    expect(await library().findByRole('heading', { level: 2, name: 'Gà con' })).toBeInTheDocument()
    expect(section('Gà con').getAllByRole('img').map((picture) => picture.getAttribute('alt'))).toEqual(['b', 'a'])
  })

  it('sends no picture when the new pack cannot be made, says why at the picker, and keeps the batch', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))

    await user.selectOptions(picker(), 'Bộ mới…')
    await user.type(step().getByRole('textbox', { name: 'Tên bộ mới' }), 'mèo')
    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    expect(await step().findByText('Đã có bộ tên “mèo”. Hãy đặt tên khác.')).toBeInTheDocument()
    expect(calls).toEqual(['POST /api/sticker-packs mèo'])
    expect(batchNames()).toEqual(['a.png', 'b.png'])
  })

  it('refuses a blank name for the new pack on the spot', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'))

    await user.selectOptions(picker(), 'Bộ mới…')
    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    expect(step().getByText('Tên bộ có từ 1 đến 50 ký tự.')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('stops when the pack is gone (deleted in another tab), says so, and goes back to "Chưa xếp bộ" with the pictures kept', async () => {
    await openLibrary()
    const user = await chooseWith(section('Chó').getByRole('button', { name: 'Thêm ảnh vào bộ Chó' }), png('a.png'), png('b.png'))
    answers['a.png'] = async () => {
      throw problem(404, 'STICKER_PACK_NOT_FOUND')
    }

    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    expect(await step().findByText('Bộ này không còn nữa. Có thể nó vừa bị xóa ở nơi khác.')).toBeInTheDocument()
    expect(calls).toEqual(['POST /api/stickers a.png packId=pk-dogs'])
    expect(batchNames()).toEqual(['a.png', 'b.png'])
    expect(picker().selectedOptions[0].textContent).toBe('Chưa xếp bộ')
  })
})

describe('saving the batch one picture after another (SP-10)', () => {
  it('saves in the order of the list, takes each saved one out, closes when all are saved, and says so on the screen', async () => {
    await openLibrary()
    const user = await chooseWith(section('Mèo').getByRole('button', { name: 'Thêm ảnh vào bộ Mèo' }), png('a.png'), png('b.png'))

    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).toEqual(['POST /api/stickers a.png packId=pk-cats', 'POST /api/stickers b.png packId=pk-cats'])
    expect(library().getByRole('status', { name: 'Kết quả lưu' })).toHaveTextContent('Đã lưu 2 sticker vào bộ Mèo.')
    expect(liveObjectUrls()).toEqual([])
  })

  it('keeps a picture the server refuses, says why under it, saves the others, and stays open', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'), png('c.png'))
    answers['b.png'] = async () => {
      throw problem(409, 'STICKER_DUPLICATE')
    }

    await user.click(step().getByRole('button', { name: 'Lưu 3 sticker' }))

    await waitFor(() => expect(calls).toHaveLength(3))
    await waitFor(() => expect(batchNames()).toEqual(['b.png']))
    const kept = within(step().getByRole('list', { name: 'Ảnh trong lượt' })).getByRole('listitem')
    expect(kept).toHaveTextContent('Sticker này đã có trong thư viện.')
    expect(step().getByRole('status')).toHaveTextContent('Đã lưu 2 sticker. 1 ảnh chưa lưu được.')
    expect(step().getByRole('button', { name: 'Lưu 1 sticker' })).toBeEnabled()
    // The step is still open, so Radix hides the grid from the accessibility tree.
    expect(await section('Chưa xếp bộ').findByRole('img', { name: 'c', hidden: true })).toBeInTheDocument()
  })

  it('says which picture is being sent and which ones wait', async () => {
    await openLibrary()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    answers['a.png'] = async () => {
      await gate
      return sticker({ id: 'st-a', name: 'a', createdAt: '2026-10-20T12:00:00Z' })
    }
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))

    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))

    const items = within(step().getByRole('list', { name: 'Ảnh trong lượt' }))
    expect(await items.findByText('Đang gửi…')).toBeInTheDocument()
    expect(items.getByText('Đang chờ')).toBeInTheDocument()
    expect(step().getByRole('status')).toHaveTextContent('Đang lưu ảnh 1 trên 2…')
    expect(step().getByRole('button', { name: 'Lưu 2 sticker' })).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('sends a picture again with the next "Lưu" after the network failed', async () => {
    await openLibrary()
    let tries = 0
    answers['a.png'] = async () => {
      tries += 1
      if (tries === 1) {
        throw new ApiError(0, 'NETWORK_ERROR', null)
      }
      return sticker({ id: 'st-a', name: 'a', createdAt: '2026-10-20T12:00:00Z' })
    }
    const user = await chooseWith(uploadButton(), png('a.png'))

    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))
    expect(await step().findByText('Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.')).toBeInTheDocument()
    await user.click(step().getByRole('button', { name: 'Lưu 1 sticker' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(tries).toBe(2)
  })

  it('never sends two at once', async () => {
    await openLibrary()
    let inFlight = 0
    let most = 0
    for (const name of ['a.png', 'b.png', 'c.png']) {
      answers[name] = async () => {
        inFlight += 1
        most = Math.max(most, inFlight)
        await delay(10)
        inFlight -= 1
        return sticker({ id: `st-${name}`, name, createdAt: '2026-10-20T12:00:00Z' })
      }
    }
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'), png('c.png'))

    await user.click(step().getByRole('button', { name: 'Lưu 3 sticker' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(most).toBe(1)
  })
})

describe('closing the step with pictures not saved (SP-10)', () => {
  it('asks first, and keeps the batch when the owner goes back to it', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))

    await user.click(step().getByRole('button', { name: 'Hủy' }))

    const ask = within(screen.getByRole('alertdialog', { name: 'Bỏ 2 ảnh chưa lưu?' }))
    await user.click(ask.getByRole('button', { name: 'Tiếp tục chỉnh' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(batchNames()).toEqual(['a.png', 'b.png'])
  })

  it('closes and lets every preview go when the owner agrees, with nothing sent', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))

    await user.keyboard('{Escape}')
    await user.click(within(screen.getByRole('alertdialog', { name: 'Bỏ 2 ảnh chưa lưu?' })).getByRole('button', { name: 'Bỏ ảnh' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).toEqual([])
    expect(liveObjectUrls()).toEqual([])
  })

  it('starts the next batch with nothing said about the last one', async () => {
    await openLibrary()
    answers['b.png'] = async () => {
      throw problem(409, 'STICKER_DUPLICATE')
    }
    let user = await chooseWith(uploadButton(), png('a.png'), png('b.png'))
    await user.selectOptions(picker(), 'Bộ mới…')
    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))
    expect(await step().findByText('Tên bộ có từ 1 đến 50 ký tự.')).toBeInTheDocument()
    await user.selectOptions(picker(), 'Chưa xếp bộ')
    await user.click(step().getByRole('button', { name: 'Lưu 2 sticker' }))
    await waitFor(() => expect(step().getByRole('status')).toHaveTextContent('Đã lưu 1 sticker. 1 ảnh chưa lưu được.'))
    await user.click(step().getByRole('button', { name: 'Hủy' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Bỏ ảnh' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    user = await chooseWith(uploadButton(), png('c.png'))

    expect(step().getByRole('status')).toBeEmptyDOMElement()
    expect(step().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes at once when no picture is left', async () => {
    await openLibrary()
    const user = await chooseWith(uploadButton(), png('a.png'))
    await user.click(step().getByRole('button', { name: 'Bỏ a.png khỏi lượt' }))

    await user.click(step().getByRole('button', { name: 'Hủy' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
