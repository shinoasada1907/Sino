import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_STICKERS } from '@/test/fixtures/stickersApi'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'
import type { StickerItem } from './stickers.types'

const list = (items: StickerItem[]) => http.get('/api/stickers', () => HttpResponse.json({ items }))
const problem = (status: number, code: string) =>
  HttpResponse.json({ title: 'Error', status, code, instance: '/api/stickers' }, { status, headers: { 'Content-Type': 'application/problem+json' } })

/** The library is there: the region of the screen has come. */
const ready = () => screen.findByRole('region', { name: 'Thư viện sticker' })
const library = () => within(screen.getByRole('region', { name: 'Thư viện sticker' }))

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

    // Two in the DOM: the phone header's and the title of 768 px up; CSS shows one.
    expect(await library().findAllByRole('heading', { level: 1, name: 'Sticker' })).toHaveLength(2)
    expect(library().getAllByText('2 sticker')).toHaveLength(2)
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
