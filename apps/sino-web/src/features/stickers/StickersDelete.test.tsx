import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_STICKERS } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import type { StickerItem } from './stickers.types'

// ST-15: deleting a sticker, with a confirmation (spec web-sticker-library, "Xóa sticker có xác nhận" and the focus part of
// "dùng được bằng bàn phím và trình đọc màn hình").

const list = (items: StickerItem[]) => http.get('/api/stickers', () => HttpResponse.json({ items }))
const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })
// `hidden: true`: while the dialog is open Radix hides the rest of the page from the accessibility tree, region included.
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker', hidden: true }))
const dialog = () => screen.getByRole('dialog')
const deleteButton = (name: string) => library().getByRole('button', { name: `Xóa ${name}` })

/** Answers each `DELETE /api/stickers/:id` with 204 and keeps the ids it was asked for. */
function acceptDeletes() {
  const asked: string[] = []
  server.use(
    http.delete('/api/stickers/:id', ({ params }) => {
      asked.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return asked
}

async function openLibrary(items: StickerItem[] = API_STICKERS) {
  server.use(list(items))
  renderApp('/stickers')
  await library().findByRole('img', { name: items[0].name })
}

describe('Sticker screen: deleting with a confirmation (ST-15)', () => {
  it('gives each sticker a delete button named after it', async () => {
    await openLibrary()

    expect(deleteButton('meo')).toBeInTheDocument()
    expect(deleteButton('nhay')).toBeInTheDocument()
  })

  it('opens a confirmation that names the sticker, and asks the server nothing yet', async () => {
    const user = userEvent.setup()
    const asked = acceptDeletes()
    await openLibrary()

    await user.click(deleteButton('meo'))

    expect(within(dialog()).getByRole('heading', { name: 'Xóa sticker này?' })).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('“meo” sẽ bị xóa khỏi thư viện.')
    expect(asked).toEqual([])
    // The rest of the page is hidden from a screen reader while the dialog is open.
    expect(library().getByRole('img', { name: 'meo', hidden: true })).toBeInTheDocument()
  })

  it('deletes only on confirm: one DELETE for that sticker, which leaves the grid at once, and the dialog closes', async () => {
    const user = userEvent.setup()
    const asked = acceptDeletes()
    await openLibrary()
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument())
    expect(asked).toEqual(['st-cat'])
    expect(library().getByRole('img', { name: 'nhay' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('deletes nothing on "Hủy", and the sticker stays', async () => {
    const user = userEvent.setup()
    const asked = acceptDeletes()
    await openLibrary()
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Hủy' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(asked).toEqual([])
    expect(library().getByRole('img', { name: 'meo' })).toBeInTheDocument()
  })

  it('deletes nothing on Esc or the close button either', async () => {
    const user = userEvent.setup()
    const asked = acceptDeletes()
    await openLibrary()
    await user.click(deleteButton('meo'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(deleteButton('meo'))
    await user.click(within(dialog()).getByRole('button', { name: 'Đóng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(asked).toEqual([])
    expect(library().getByRole('img', { name: 'meo' })).toBeInTheDocument()
  })

  it('says it could not delete, keeps the sticker in the grid and the dialog open, and deletes on a second try', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.delete('/api/stickers/:id', () => {
        calls += 1
        return calls === 1 ? problem(500, 'INTERNAL') : new HttpResponse(null, { status: 204 })
      }),
    )
    await openLibrary()
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Không xóa được sticker. Hãy thử lại.')
    expect(library().getByRole('img', { name: 'meo', hidden: true })).toBeInTheDocument()

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument())
    expect(calls).toBe(2)
  })

  it('takes a sticker the server no longer has (deleted in another tab) as deleted, with no error', async () => {
    const user = userEvent.setup()
    server.use(http.delete('/api/stickers/:id', () => problem(404, 'STICKER_NOT_FOUND')))
    await openLibrary()
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not send a second DELETE when "Xóa" is pressed again while the first is on its way', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let calls = 0
    server.use(
      http.delete('/api/stickers/:id', async () => {
        calls += 1
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await openLibrary()
    await user.click(deleteButton('meo'))
    const confirm = within(dialog()).getByRole('button', { name: 'Xóa' })

    await user.click(confirm)
    await waitFor(() => expect(confirm).toBeDisabled())
    await user.click(confirm)
    release()

    await waitFor(() => expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument())
    expect(calls).toBe(1)
  })

  it('works with the keyboard alone, keeping the focus in the dialog', async () => {
    const user = userEvent.setup()
    const asked = acceptDeletes()
    await openLibrary()

    deleteButton('nhay').focus()
    await user.keyboard('{Enter}')
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    // Tab and Shift+Tab go round inside the dialog: it holds the focus.
    for (let step = 0; step < 6; step += 1) {
      await user.tab()
      expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    }
    for (let step = 0; step < 6; step += 1) {
      await user.tab({ shift: true })
      expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    }
    within(dialog()).getByRole('button', { name: 'Xóa' }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(asked).toEqual(['st-dance']))
  })
})

describe('Sticker screen: where the focus goes after the dialog (ST-15)', () => {
  it('gives it back to the delete button that opened the dialog when it is cancelled or closed with Esc', async () => {
    const user = userEvent.setup()
    await openLibrary()

    await user.click(deleteButton('meo'))
    await user.click(within(dialog()).getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(deleteButton('meo')).toHaveFocus())

    await user.click(deleteButton('nhay'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(deleteButton('nhay')).toHaveFocus())
  })

  it('gives it back to the opener when the delete failed and the dialog is closed', async () => {
    const user = userEvent.setup()
    server.use(http.delete('/api/stickers/:id', () => problem(500, 'INTERNAL')))
    await openLibrary()
    await user.click(deleteButton('meo'))
    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))
    await within(dialog()).findByRole('alert')

    await user.click(within(dialog()).getByRole('button', { name: 'Hủy' }))

    await waitFor(() => expect(deleteButton('meo')).toHaveFocus())
  })

  it('moves it to the delete button of the next sticker when the one deleted is gone', async () => {
    const user = userEvent.setup()
    acceptDeletes()
    await openLibrary()
    await user.click(deleteButton('nhay')) // the first of two

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(library().queryByRole('img', { name: 'nhay' })).not.toBeInTheDocument())
    await waitFor(() => expect(deleteButton('meo')).toHaveFocus())
  })

  it('moves it to the previous sticker when the last one of the grid is deleted', async () => {
    const user = userEvent.setup()
    acceptDeletes()
    await openLibrary()
    await user.click(deleteButton('meo')) // the last of two

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument())
    await waitFor(() => expect(deleteButton('nhay')).toHaveFocus())
  })

  it('moves it to the upload button of the empty library when the only sticker is deleted', async () => {
    const user = userEvent.setup()
    acceptDeletes()
    await openLibrary([API_STICKERS[1]])
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    expect(await library().findByText('Thư viện sticker đang trống')).toBeInTheDocument()
    const emptyUpload = within(library().getByText('Thư viện sticker đang trống').parentElement as HTMLElement).getByRole('button', { name: 'Tải lên' })
    await waitFor(() => expect(emptyUpload).toHaveFocus())
  })

  it('still deletes when the server is slow, and the rest of the grid is untouched', async () => {
    const user = userEvent.setup()
    server.use(http.delete('/api/stickers/:id', async () => {
      await delay(20)
      return new HttpResponse(null, { status: 204 })
    }))
    await openLibrary()
    await user.click(deleteButton('meo'))

    await user.click(within(dialog()).getByRole('button', { name: 'Xóa' }))

    // While the dialog is open Radix hides the page from the accessibility tree, so "meo is not there" holds at once and
    // "nhay is there" cannot be found: wait for the dialog (it closes when the slow server has answered) before the grid.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(library().queryByRole('img', { name: 'meo' })).not.toBeInTheDocument())
    expect(library().getByRole('img', { name: 'nhay' })).toBeInTheDocument()
  })
})
