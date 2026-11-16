import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_PACKS, API_STICKERS, PACKED_STICKERS, pack } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import type { StickerItem, StickerPack } from './stickers.types'

// SP-06: the Sticker screen grouped by pack, and the packs managed on it (delta web-sticker-library of sticker-packs).

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/sticker-packs', ...extra }, { status, headers: { 'Content-Type': 'application/problem+json' } })
// `hidden: true`: while a dialog or a menu is open Radix hides the rest of the page from the accessibility tree.
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }))
const section = (name: string) => within(library().getByRole('region', { name, hidden: true }))
const sectionNames = () => library().queryAllByRole('heading', { level: 2, hidden: true }).map((heading) => heading.textContent)
const dialog = () => within(screen.getByRole('dialog'))

/** The screen on a library of `stickers` sorted into `packs`, once the pictures are there. */
async function openLibrary(stickers: StickerItem[] = PACKED_STICKERS, packs: StickerPack[] = API_PACKS) {
  server.use(
    http.get('/api/stickers', () => HttpResponse.json({ items: stickers })),
    http.get('/api/sticker-packs', () => HttpResponse.json({ items: packs })),
  )
  renderApp('/stickers')
  if (stickers.length > 0) {
    await library().findByRole('img', { name: stickers[0].name })
  } else {
    await library().findByRole('heading', { level: 2, name: packs[0].name })
  }
}

describe('Sticker screen: the grid by pack (SP-06)', () => {
  it('has a part per pack in the order of the packs, then "Chưa xếp bộ", each with its name and count', async () => {
    await openLibrary()

    expect(sectionNames()).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ'])
    expect(section('Mèo').getByRole('img', { name: 'meo' })).toBeInTheDocument()
    expect(section('Mèo').getByText('1 sticker')).toBeInTheDocument()
    expect(section('Chưa xếp bộ').getByRole('img', { name: 'nhay' })).toBeInTheDocument()
    expect(section('Chưa xếp bộ').getByText('1 sticker')).toBeInTheDocument()
  })

  it('says a pack is empty, and still names it', async () => {
    await openLibrary()

    expect(section('Chó').getByText('Bộ này đang trống.')).toBeInTheDocument()
    expect(section('Chó').queryByRole('img')).not.toBeInTheDocument()
  })

  it('leaves "Chưa xếp bộ" out when every sticker is in a pack', async () => {
    await openLibrary([PACKED_STICKERS[1]])

    expect(sectionNames()).toEqual(['Mèo', 'Chó'])
  })

  it('shows the packs alone when there is no sticker yet, and not the empty library', async () => {
    await openLibrary([])

    expect(sectionNames()).toEqual(['Mèo', 'Chó'])
    expect(library().queryByText('Thư viện sticker đang trống')).not.toBeInTheDocument()
  })

  it('keeps a sticker whose pack it does not know (made in another tab) in "Chưa xếp bộ", not out of sight', async () => {
    await openLibrary([{ ...PACKED_STICKERS[1], packId: 'pk-unknown' }])

    expect(section('Chưa xếp bộ').getByRole('img', { name: 'meo' })).toBeInTheDocument()
  })

  it('says why the packs are missing and reads them again on "Thử lại"', async () => {
    const user = userEvent.setup()
    let packReads = 0
    let stickerReads = 0
    server.use(
      http.get('/api/stickers', () => {
        stickerReads += 1
        return HttpResponse.json({ items: PACKED_STICKERS })
      }),
      http.get('/api/sticker-packs', () => {
        packReads += 1
        return packReads === 1 ? problem(500, 'INTERNAL') : HttpResponse.json({ items: API_PACKS })
      }),
    )
    renderApp('/stickers')

    expect(await library().findByRole('alert')).toHaveTextContent('Không tải được sticker')
    await user.click(library().getByRole('button', { name: 'Thử lại' }))

    expect(await library().findByRole('heading', { level: 2, name: 'Mèo' })).toBeInTheDocument()
    expect(packReads).toBe(2)
    // The stickers had come: only what failed is read again.
    expect(stickerReads).toBe(1)
  })

  it('shows the loading grid while the packs have not come', async () => {
    server.use(
      http.get('/api/stickers', () => HttpResponse.json({ items: PACKED_STICKERS })),
      http.get('/api/sticker-packs', () => delay('infinite')),
    )
    renderApp('/stickers')

    expect(await library().findByRole('status', { name: 'Đang tải sticker' })).toBeInTheDocument()
    expect(library().queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Sticker screen: creating a pack (SP-06)', () => {
  it('asks for a name, sends it trimmed by the server, and shows the new pack empty; the focus goes back to "Tạo bộ"', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.post('/api/sticker-packs', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(pack({ id: 'pk-hens', name: 'Gà' }), { status: 201 })
      }),
    )
    await openLibrary()
    // Two in the DOM: the phone header's icon and the button of 768 px up; CSS shows one.
    const create = library().getAllByRole('button', { name: 'Tạo bộ' })[1]

    await user.click(create)
    await user.type(dialog().getByLabelText('Tên bộ'), '  Gà  ')
    await user.click(dialog().getByRole('button', { name: 'Tạo bộ' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ name: '  Gà  ' }])
    expect(sectionNames()).toEqual(['Mèo', 'Chó', 'Gà', 'Chưa xếp bộ'])
    expect(section('Gà').getByText('Bộ này đang trống.')).toBeInTheDocument()
    expect(create).toHaveFocus()
  })

  it('refuses a blank name or one over 50 characters on the spot, with no request', async () => {
    const user = userEvent.setup()
    let posts = 0
    server.use(
      http.post('/api/sticker-packs', () => {
        posts += 1
        return HttpResponse.json(pack({ id: 'pk-x', name: 'x' }), { status: 201 })
      }),
    )
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    await user.type(dialog().getByLabelText('Tên bộ'), '   ')
    await user.click(dialog().getByRole('button', { name: 'Tạo bộ' }))
    expect(dialog().getByRole('alert')).toHaveTextContent('Tên bộ có từ 1 đến 50 ký tự.')
    expect(dialog().getByLabelText('Tên bộ')).toHaveAttribute('aria-invalid', 'true')

    await user.clear(dialog().getByLabelText('Tên bộ'))
    await user.type(dialog().getByLabelText('Tên bộ'), 'x'.repeat(51))
    await user.click(dialog().getByRole('button', { name: 'Tạo bộ' }))
    expect(dialog().getByRole('alert')).toHaveTextContent('Tên bộ có từ 1 đến 50 ký tự.')
    expect(posts).toBe(0)
  })

  it('counts a name by its characters: fifty emoji are a name', async () => {
    const user = userEvent.setup()
    const fifty = '😀'.repeat(50)
    server.use(http.post('/api/sticker-packs', () => HttpResponse.json(pack({ id: 'pk-x', name: fifty }), { status: 201 })))
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    await user.type(dialog().getByLabelText('Tên bộ'), fifty)
    await user.click(dialog().getByRole('button', { name: 'Tạo bộ' }))

    expect(await library().findByRole('heading', { level: 2, name: fifty })).toBeInTheDocument()
  })

  it('says in Vietnamese that the name is taken, and makes no pack', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/sticker-packs', () => problem(409, 'STICKER_PACK_NAME_TAKEN')))
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    await user.type(dialog().getByLabelText('Tên bộ'), 'mèo')
    await user.click(dialog().getByRole('button', { name: 'Tạo bộ' }))

    expect(await dialog().findByRole('alert')).toHaveTextContent('Đã có bộ tên “mèo”. Hãy đặt tên khác.')
    expect(sectionNames()).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ'])
  })

  it('says how many packs one may have when there are too many', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/sticker-packs', () => problem(409, 'STICKER_PACK_LIMIT_REACHED', { maxPacks: 50 })))
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    await user.type(dialog().getByLabelText('Tên bộ'), 'Gà')
    await user.keyboard('{Enter}')

    expect(await dialog().findByRole('alert')).toHaveTextContent('Bạn đã có đủ 50 bộ. Hãy xóa bớt một bộ rồi tạo lại.')
  })

  it('says the network is down when the request cannot go out', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/sticker-packs', () => HttpResponse.error()))
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    await user.type(dialog().getByLabelText('Tên bộ'), 'Gà')
    await user.keyboard('{Enter}')

    expect(await dialog().findByRole('alert')).toHaveTextContent('Không kết nối được với máy chủ. Hãy kiểm tra mạng rồi thử lại.')
  })

  it('starts with an empty name each time it opens', async () => {
    const user = userEvent.setup()
    await openLibrary()
    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])
    await user.type(dialog().getByLabelText('Tên bộ'), 'Gà')
    await user.click(dialog().getByRole('button', { name: 'Hủy' }))

    await user.click(library().getAllByRole('button', { name: 'Tạo bộ' })[1])

    expect(dialog().getByLabelText('Tên bộ')).toHaveValue('')
  })
})

describe('Sticker screen: renaming and deleting a pack (SP-06)', () => {
  it('renames a pack from its part, starting from its name', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.patch('/api/sticker-packs/pk-cats', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_PACKS[0], name: 'Mèo con' })
      }),
    )
    await openLibrary()

    await user.click(section('Mèo').getByRole('button', { name: 'Đổi tên bộ Mèo' }))
    expect(dialog().getByLabelText('Tên bộ')).toHaveValue('Mèo')
    await user.clear(dialog().getByLabelText('Tên bộ'))
    await user.type(dialog().getByLabelText('Tên bộ'), 'Mèo con')
    await user.click(dialog().getByRole('button', { name: 'Lưu' }))

    expect(await library().findByRole('heading', { level: 2, name: 'Mèo con' })).toBeInTheDocument()
    expect(body).toEqual({ name: 'Mèo con' })
    await waitFor(() => expect(library().getByRole('button', { name: 'Đổi tên bộ Mèo con' })).toHaveFocus())
  })

  it('says a pack deleted in another tab is gone, and takes its part away', async () => {
    const user = userEvent.setup()
    server.use(http.patch('/api/sticker-packs/pk-cats', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    await openLibrary()

    await user.click(section('Mèo').getByRole('button', { name: 'Đổi tên bộ Mèo' }))
    await user.type(dialog().getByLabelText('Tên bộ'), ' con')
    await user.click(dialog().getByRole('button', { name: 'Lưu' }))

    expect(await dialog().findByRole('alert')).toHaveTextContent('Bộ này không còn nữa.')
    expect(sectionNames()).toEqual(['Chó', 'Chưa xếp bộ'])
  })

  it('asks before deleting, says the stickers go to "Chưa xếp bộ", and puts them there', async () => {
    const user = userEvent.setup()
    const deleted: string[] = []
    server.use(
      http.delete('/api/sticker-packs/:id', ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await openLibrary()

    await user.click(section('Mèo').getByRole('button', { name: 'Xóa bộ Mèo' }))
    expect(dialog().getByRole('heading', { name: 'Xóa bộ “Mèo”?' })).toBeInTheDocument()
    expect(dialog().getByText('1 sticker của bộ sẽ về “Chưa xếp bộ”; không sticker nào bị xóa.')).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Xóa bộ' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleted).toEqual(['pk-cats'])
    expect(sectionNames()).toEqual(['Chó', 'Chưa xếp bộ'])
    expect(section('Chưa xếp bộ').getAllByRole('img').map((picture) => picture.getAttribute('alt'))).toEqual(['nhay', 'meo'])
    // The focus goes to the same button of the next part.
    expect(library().getByRole('button', { name: 'Xóa bộ Chó' })).toHaveFocus()
  })

  it('puts the focus on "Tạo bộ" once the last pack is deleted', async () => {
    const user = userEvent.setup()
    server.use(http.delete('/api/sticker-packs/pk-cats', () => new HttpResponse(null, { status: 204 })))
    await openLibrary(PACKED_STICKERS, [API_PACKS[0]])

    await user.click(section('Mèo').getByRole('button', { name: 'Xóa bộ Mèo' }))
    await user.click(dialog().getByRole('button', { name: 'Xóa bộ' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(library().getAllByRole('button', { name: 'Tạo bộ' })).toContainEqual(document.activeElement)
  })

  it('changes nothing when the owner thinks again, and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    await openLibrary()
    const remove = section('Mèo').getByRole('button', { name: 'Xóa bộ Mèo' })

    await user.click(remove)
    await user.click(dialog().getByRole('button', { name: 'Hủy' }))

    expect(sectionNames()).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ'])
    expect(remove).toHaveFocus()
  })

  it('says the delete failed and keeps the pack', async () => {
    const user = userEvent.setup()
    server.use(http.delete('/api/sticker-packs/pk-cats', () => problem(500, 'INTERNAL')))
    await openLibrary()

    await user.click(section('Mèo').getByRole('button', { name: 'Xóa bộ Mèo' }))
    await user.click(dialog().getByRole('button', { name: 'Xóa bộ' }))

    expect(await dialog().findByRole('alert')).toHaveTextContent('Không xóa được bộ. Hãy thử lại.')
    expect(sectionNames()).toEqual(['Mèo', 'Chó', 'Chưa xếp bộ'])
  })

  it('says an empty pack is empty before deleting it', async () => {
    const user = userEvent.setup()
    await openLibrary()

    await user.click(section('Chó').getByRole('button', { name: 'Xóa bộ Chó' }))

    expect(dialog().getByText('Bộ đang trống.')).toBeInTheDocument()
  })
})

describe('Sticker screen: moving a sticker (SP-06)', () => {
  const moveButton = (name: string) => library().getByRole('button', { name: `Chuyển ${name} sang bộ khác` })

  it('moves a sticker to another pack from its own cell, and the focus follows it', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/stickers/st-cat', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...PACKED_STICKERS[1], packId: 'pk-dogs' })
      }),
    )
    await openLibrary()

    await user.click(moveButton('meo'))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByRole('menuitemradio', { name: 'Mèo' })).toHaveAttribute('aria-checked', 'true')
    await user.click(menu.getByRole('menuitemradio', { name: 'Chó' }))

    await waitFor(() => expect(section('Chó').getByRole('img', { name: 'meo' })).toBeInTheDocument())
    expect(bodies).toEqual([{ packId: 'pk-dogs' }])
    expect(section('Mèo').getByText('Bộ này đang trống.')).toBeInTheDocument()
    expect(section('Chó').getByText('1 sticker')).toBeInTheDocument()
    await waitFor(() => expect(moveButton('meo')).toHaveFocus())
  })

  it('takes a sticker out of its pack with "Chưa xếp bộ"', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/stickers/st-cat', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...PACKED_STICKERS[1], packId: null })
      }),
    )
    await openLibrary()

    await user.click(moveButton('meo'))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Chưa xếp bộ' }))

    await waitFor(() => expect(section('Chưa xếp bộ').getByRole('img', { name: 'meo' })).toBeInTheDocument())
    expect(bodies).toEqual([{ packId: null }])
  })

  it('works from the keyboard alone', async () => {
    const user = userEvent.setup()
    server.use(http.patch('/api/stickers/st-dance', () => HttpResponse.json({ ...PACKED_STICKERS[0], packId: 'pk-cats' })))
    await openLibrary()

    moveButton('nhay').focus()
    await user.keyboard('{Enter}')
    // The first item has the focus: "Mèo".
    await waitFor(() => expect(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Mèo' })).toHaveFocus())
    await user.keyboard('{Enter}')

    await waitFor(() => expect(section('Mèo').getByRole('img', { name: 'nhay' })).toBeInTheDocument())
    await waitFor(() => expect(moveButton('nhay')).toHaveFocus())
  })

  it('sends nothing when the sticker is put where it already is', async () => {
    const user = userEvent.setup()
    let patches = 0
    server.use(
      http.patch('/api/stickers/:id', () => {
        patches += 1
        return HttpResponse.json(PACKED_STICKERS[1])
      }),
    )
    await openLibrary()

    await user.click(moveButton('meo'))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Mèo' }))

    expect(patches).toBe(0)
  })

  it('says at the cell that the pack is gone, and takes the pack away', async () => {
    const user = userEvent.setup()
    server.use(http.patch('/api/stickers/st-cat', () => problem(404, 'STICKER_PACK_NOT_FOUND')))
    await openLibrary()

    await user.click(moveButton('meo'))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Chó' }))

    expect(await section('Mèo').findByRole('alert')).toHaveTextContent('Bộ này không còn nữa.')
    expect(sectionNames()).toEqual(['Mèo', 'Chưa xếp bộ'])
  })

  it('says at the cell that the move failed, and leaves the sticker where it was', async () => {
    const user = userEvent.setup()
    server.use(http.patch('/api/stickers/st-cat', () => problem(500, 'INTERNAL')))
    await openLibrary()

    await user.click(moveButton('meo'))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Chó' }))

    expect(await section('Mèo').findByRole('alert')).toHaveTextContent('Không chuyển được sticker. Hãy thử lại.')
    expect(section('Mèo').getByRole('img', { name: 'meo' })).toBeInTheDocument()
  })

  it('offers "Chưa xếp bộ" alone to a library with no pack', async () => {
    const user = userEvent.setup()
    await openLibrary(API_STICKERS, [])

    await user.click(moveButton('meo'))

    expect(within(screen.getByRole('menu')).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['Chưa xếp bộ'])
  })
})
