import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildSite, ConfigError } from '../src/build.ts'
import { buildInto, type BuiltSite } from './built-site.ts'
import { FULL_CONFIG } from './fixtures/configs.ts'

/** Pages the footer and the top bar already link to; each SI task removes its own when it builds the page. */
const PAGES_NOT_BUILT_YET = ['/privacy', '/en/privacy', '/terms', '/en/terms', '/security', '/open-source']

describe('production build', () => {
  let site: BuiltSite

  beforeAll(async () => {
    site = await buildInto('production', FULL_CONFIG)
  })
  afterAll(() => site.remove())

  it('writes the pages, the stylesheet, the icon and the fonts', () => {
    expect(site.files).toContain('404.html')
    expect(site.files).toContain('site.css')
    expect(site.files).toContain('favicon.svg')
    for (const font of ['inter', 'jetbrains-mono']) {
      for (const subset of ['latin', 'latin-ext', 'vietnamese']) {
        expect(site.files).toContain(`fonts/${font}-${subset}-wght-normal.woff2`)
      }
    }
  })

  it('gives every page its language, title, description and viewport', async () => {
    for (const file of site.htmlFiles) {
      const doc = await site.document(file)

      expect(doc.documentElement.lang, file).toMatch(/^(vi|en)$/)
      expect(doc.title.trim(), file).not.toBe('')
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim(), file).toBeTruthy()
      expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content'), file).toContain('width=device-width')
    }
  })

  it('gives every page but 404 a canonical URL on the site and lets it be indexed', async () => {
    for (const file of site.htmlFiles.filter((f) => f !== '404.html')) {
      const doc = await site.document(file)
      const path = file === 'index.html' ? '/' : `/${file.replace(/\/index\.html$/, '')}`

      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), file).toBe(`https://sino.example${path}`)
      expect(doc.querySelector('meta[name="robots"]'), file).toBeNull()
    }
  })

  it('keeps the 404 page out of search results', async () => {
    const doc = await site.document('404.html')

    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })

  it('runs no script and loads nothing from another site', async () => {
    for (const file of site.htmlFiles) {
      const doc = await site.document(file)

      expect(doc.querySelectorAll('script'), file).toHaveLength(0)
      for (const el of doc.querySelectorAll('link[rel~="stylesheet"], link[rel~="icon"], link[rel~="preload"], img[src], source[src]')) {
        const url = el.getAttribute('href') ?? el.getAttribute('src') ?? ''
        expect(url, `${file}: ${el.outerHTML}`).toMatch(/^\/[^/]/)
        expect(site.fileFor(url.split(/[?#]/)[0]), `${file}: ${url}`).not.toBeNull()
      }
    }
  })

  it('takes every font and image of the stylesheet from the site itself', async () => {
    const css = await site.read('site.css')
    const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1])

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls.filter((u) => !u.startsWith('data:'))) {
      expect(url).toMatch(/^\/[^/]/)
      expect(site.fileFor(url), url).not.toBeNull()
    }
    expect(css).not.toMatch(/@import/)
  })

  it('leaves nothing unfilled', async () => {
    for (const file of site.htmlFiles) {
      expect(await site.read(file), file).not.toContain('[chưa điền')
    }
  })

  it('links only to pages and sections that exist', async () => {
    for (const file of site.htmlFiles) {
      const doc = await site.document(file)
      for (const a of doc.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') ?? ''
        if (/^(https?:|mailto:)/.test(href)) continue
        expect(href, `${file}: ${href}`).toMatch(/^(\/|#)/)

        const [path, fragment] = href.split('#')
        const target = path === '' ? file : site.fileFor(path)
        if (target === null && PAGES_NOT_BUILT_YET.includes(path)) continue
        expect(target, `${file}: ${href}`).not.toBeNull()
        if (fragment && target) {
          const targetDoc = await site.document(target)
          expect(targetDoc.getElementById(fragment), `${file}: ${href}`).not.toBeNull()
        }
      }
    }
  })

  it('has really not built the pages still listed as not built yet', () => {
    for (const path of PAGES_NOT_BUILT_YET) {
      expect(site.fileFor(path), path).toBeNull()
    }
  })

  it('opens the app from the top bar and points the footer at the legal pages', async () => {
    const doc = await site.document('404.html')
    const link = (name: string) =>
      [...doc.querySelectorAll('a')].find((a) => a.textContent?.trim() === name)?.getAttribute('href')

    expect(link('Đăng nhập')).toBe('https://app.sino.example/login')
    expect(link('Mở Sino')).toBe('https://app.sino.example/')
    expect(link('Tính năng')).toBe('/#tinh-nang')
    expect(link('Chính sách quyền riêng tư')).toBe('/privacy')
    expect(link('Điều khoản')).toBe('/terms')
    expect(doc.querySelector('summary[aria-label="Mở menu"]')).not.toBeNull()
  })
})

describe('the 404 page', () => {
  let site: BuiltSite

  beforeAll(async () => {
    site = await buildInto('production', FULL_CONFIG)
  })
  afterAll(() => site.remove())

  it('says the page is missing and offers the home page and the app', async () => {
    const doc = await site.document('404.html')
    const main = doc.querySelector('main')

    expect(doc.querySelector('h1')?.textContent).toBe('Không tìm thấy trang này.')
    expect(main?.querySelector('.nf-code')?.textContent).toBe('404')
    const actions = [...(main?.querySelectorAll('.lp-cta a') ?? [])].map((a) => [a.textContent?.trim(), a.getAttribute('href')])
    expect(actions).toEqual([
      ['Về trang chủ', '/'],
      ['Mở Sino', 'https://app.sino.example/'],
    ])
  })
})

describe('production build with missing details', () => {
  it('stops before writing anything and names what is missing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'sino-site-'))
    const outDir = join(parent, 'dist')
    try {
      const build = buildSite({ outDir, mode: 'production', config: { ...FULL_CONFIG, contactEmail: null } })

      await expect(build).rejects.toThrow(ConfigError)
      await expect(build).rejects.toThrow(/contactEmail/)
      expect(existsSync(outDir)).toBe(false)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
