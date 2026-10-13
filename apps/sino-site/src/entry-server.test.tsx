import { describe, expect, it } from 'vitest'
import { PAGES } from '@/site/pages'
import { PREVIEW_SITE, PRODUCTION_SITE } from '@/test/configs'
import { hrefOf, links, prerendered, text } from '@/test/prerendered'

describe('the prerendered 404 page', () => {
  const { doc } = prerendered('not-found', PRODUCTION_SITE)

  it('is written to 404.html, which static hosts answer unknown paths with', () => {
    expect(PAGES.find((p) => p.id === 'not-found')?.file).toBe('404.html')
  })

  it('has its language, title, description and viewport', () => {
    expect(doc.documentElement.lang).toBe('vi')
    expect(doc.title).toBe('Không tìm thấy trang · Sino')
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Trang này không có trên site của Sino.',
    )
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain('width=device-width')
  })

  it('keeps out of search results and names no canonical URL', () => {
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    expect(doc.querySelector('link[rel="canonical"]')).toBeNull()
  })

  it('puts the page in the HTML itself, marked for hydration', () => {
    const root = doc.getElementById('root')

    expect(root?.dataset.page).toBe('not-found')
    expect(text(root?.querySelector('h1'))).toBe('Không tìm thấy trang này.')
    expect(text(root)).toContain('404')
  })

  it('offers the home page and the app', () => {
    expect(links(doc.querySelector('main section'))).toEqual([
      ['Về trang chủ', '/'],
      ['Mở Sino Messages', 'https://app.sino.example/'],
    ])
  })

  it('takes the family top bar and points the footer at the products and the legal pages', () => {
    expect(links(doc.querySelector('header nav[aria-label="Sản phẩm Sino"]'))).toEqual([['Sino Messages', '/messages']])
    expect(hrefOf(doc, 'Mở Sino Messages')).toBe('https://app.sino.example/')
    expect(hrefOf(doc, 'Câu hỏi thường gặp')).toBe('/messages#cau-hoi')
    expect(hrefOf(doc, 'Chính sách quyền riêng tư')).toBe('/privacy')
    expect(hrefOf(doc, 'Điều khoản')).toBe('/terms')
    expect(doc.querySelector('summary[aria-label="Mở menu"]')).not.toBeNull()
  })

  it('writes the copyright year of the build', () => {
    expect(text(doc.querySelector('footer'))).toContain('© 2026 SINO')
  })

  it('hides nothing in the HTML, so it reads the same without JavaScript', () => {
    for (const el of doc.querySelectorAll('[style]')) {
      expect(el.getAttribute('style'), el.outerHTML).not.toMatch(/opacity:\s*0|visibility:\s*hidden/)
    }
  })
})

/** Pages the footer already links to; each SI task removes its own when it builds the page. */
const PAGES_NOT_BUILT_YET = ['/terms', '/en/terms', '/security', '/open-source']

describe('links between the pages', () => {
  const docs = new Map(PAGES.map((p) => [p.path, prerendered(p.id, PRODUCTION_SITE).doc]))

  it('point only at pages and sections that exist', () => {
    for (const [from, doc] of docs) {
      for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') ?? ''
        if (/^(https?:|mailto:)/.test(href)) continue
        expect(href, `${from}: ${href}`).toMatch(/^(\/|#)/)

        const [path, fragment] = href.split('#')
        if (PAGES_NOT_BUILT_YET.includes(path)) continue
        const target = path === '' ? doc : docs.get(path)
        expect(target, `${from}: ${href}`).toBeDefined()
        if (fragment) expect(target?.getElementById(fragment), `${from}: ${href}`).not.toBeNull()
      }
    }
  })

  it('have really not built the pages still listed as not built yet', () => {
    for (const path of PAGES_NOT_BUILT_YET) expect(docs.has(path), path).toBe(false)
  })
})

describe('a preview build', () => {
  it('keeps every page out of search results', () => {
    for (const page of PAGES) {
      const { doc } = prerendered(page.id, PREVIEW_SITE)

      expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), page.id).toBe('noindex')
    }
  })

  it('points the app links at a visible placeholder while the app URL is unknown', () => {
    const { doc } = prerendered('not-found', PREVIEW_SITE)

    expect(hrefOf(doc, 'Mở Sino Messages')).toBe('#chua-dien-app-url')
  })
})
