import { describe, expect, it } from 'vitest'
import { PRODUCTION_SITE } from '@/test/configs'
import { renderDocument } from './document'
import type { PageMeta } from './pages'

const TEMPLATE =
  '<!doctype html><html lang="vi"><head><!--app-head--></head><body><div id="root"><!--app-html--></div></body></html>'

const page: PageMeta = {
  id: 'not-found',
  path: '/a',
  file: 'a.html',
  lang: 'en',
  title: 'A & B <c>',
  description: 'Say "hi"',
  indexable: true,
  nav: 'family',
}

describe('renderDocument', () => {
  const html = renderDocument({ template: TEMPLATE, page, site: PRODUCTION_SITE, appHtml: '<p>x</p>' })

  it('sets the language and marks the page for hydration', () => {
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<div id="root" data-page="not-found"><p>x</p></div>')
  })

  it('escapes what it writes into the head', () => {
    expect(html).toContain('<title>A &amp; B &lt;c&gt;</title>')
    expect(html).toContain('<meta name="description" content="Say &quot;hi&quot;">')
  })

  it('names the canonical URL on the site domain', () => {
    expect(html).toContain('<link rel="canonical" href="https://sino.example/a">')
    expect(html).not.toContain('noindex')
  })

  it('fails loudly when the template lost a placeholder', () => {
    expect(() =>
      renderDocument({ template: '<html lang="vi"></html>', page, site: PRODUCTION_SITE, appHtml: '' }),
    ).toThrow(/app-head/)
  })
})
