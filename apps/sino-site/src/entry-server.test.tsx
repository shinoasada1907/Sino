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
      ['Mở Sino', 'https://app.sino.example/'],
    ])
  })

  it('opens the app from the top bar and points the footer at the legal pages', () => {
    expect(hrefOf(doc, 'Đăng nhập')).toBe('https://app.sino.example/login')
    expect(hrefOf(doc, 'Mở Sino')).toBe('https://app.sino.example/')
    expect(hrefOf(doc, 'Tính năng')).toBe('/#tinh-nang')
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

describe('a preview build', () => {
  it('keeps every page out of search results', () => {
    for (const page of PAGES) {
      const { doc } = prerendered(page.id, PREVIEW_SITE)

      expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), page.id).toBe('noindex')
    }
  })

  it('points the app links at a visible placeholder while the app URL is unknown', () => {
    const { doc } = prerendered('not-found', PREVIEW_SITE)

    expect(hrefOf(doc, 'Đăng nhập')).toBe('#chua-dien-app-url')
  })
})
