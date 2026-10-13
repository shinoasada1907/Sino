import { describe, expect, it } from 'vitest'
import { PAGES } from '@/site/pages'
import { PRODUCTION_SITE } from '@/test/configs'
import { hrefOf, links, prerendered, text } from '@/test/prerendered'

describe('the brand page of the Sino family', () => {
  const { html, doc } = prerendered('brand', PRODUCTION_SITE)

  it('is the root of the site, indexed under the site domain', () => {
    expect(PAGES.find((p) => p.id === 'brand')).toMatchObject({ path: '/', file: 'index.html' })
    expect(doc.title).toBe('Sino · Ứng dụng gọn cho việc mỗi ngày')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://sino.example/')
    expect(doc.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('shows one card per product that runs today: only Sino Messages', () => {
    const cards = [...doc.querySelectorAll('[data-slot="product"]')]

    expect(cards.map((c) => text(c.querySelector('h3')))).toEqual(['Sino Messages'])
    expect(links(cards[0])).toEqual([
      ['Xem Sino Messages', '/messages'],
      ['Mở ứng dụng', 'https://app.sino.example/'],
    ])
  })

  it('promises nothing that is not there yet', () => {
    expect(text(doc.body)).not.toContain('Sắp có')
  })

  it('links to the privacy policy in the HTML itself', () => {
    expect(html).toContain('href="/privacy"')
  })

  it('takes the family top bar: the products and the app', () => {
    expect(links(doc.querySelector('header nav[aria-label="Sản phẩm Sino"]'))).toEqual([['Sino Messages', '/messages']])
    expect(hrefOf(doc, 'Mở Sino Messages')).toBe('https://app.sino.example/')
  })
})
