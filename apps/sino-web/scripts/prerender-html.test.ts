import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs build script, outside the type-checked sources
import { buildPage, checkPage, cssOf } from './prerender-html.mjs'

const SHELL = `<!doctype html>
<html lang="vi">
  <head>
    <title>Sino</title>
    <link rel="stylesheet" href="/assets/index-a.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

describe('buildPage (D-461, D-463, D-464)', () => {
  const page = buildPage(SHELL, { html: '<h1>Hi $&amp;</h1>', title: 'A & B', lang: 'en', cssHrefs: ['/assets/Public-b.css'] })

  it('puts the body inside #root, in a wrapper the inline script can hide', () => {
    expect(page).toContain('<div id="root"><div data-prerendered><h1>Hi $&amp;</h1></div></div>')
    expect(page).toContain("classList.add('js')")
    expect(page).toContain('html.js [data-prerendered]{display:none}')
  })

  it('sets the title, the language and the public CSS', () => {
    expect(page).toContain('<html lang="en">')
    expect(page).toContain('<title>A &amp; B</title>')
    expect(page).toContain('<link rel="stylesheet" crossorigin href="/assets/Public-b.css"></head>')
  })

  it('leaves the shell itself untouched', () => {
    expect(SHELL).toContain('<div id="root"></div>')
  })

  it('refuses a shell that has no empty #root', () => {
    expect(() => buildPage(SHELL.replace('<div id="root"></div>', ''), { html: '', title: 't', lang: 'vi', cssHrefs: [] })).toThrow(
      /no <div id="root">/,
    )
  })
})

describe('checkPage (D-465)', () => {
  it('names the page and the landmark that is missing', () => {
    expect(checkPage('en/privacy.html', '<p>Privacy policy</p>', { landmarks: ['Privacy policy', 'Limited Use'], strictOwner: false })).toEqual([
      'en/privacy.html: thiếu câu mốc "Limited Use"',
    ])
  })

  it('lets an unfilled owner value pass only when not strict', () => {
    const html = '<p>Liên hệ [chưa điền: email liên hệ] và [chưa điền: người đứng tên]</p>'
    expect(checkPage('privacy.html', html, { landmarks: [], strictOwner: false })).toEqual([])
    const [problem] = checkPage('privacy.html', html, { landmarks: [], strictOwner: true })
    expect(problem).toContain('privacy.html')
    expect(problem).toContain('email liên hệ, người đứng tên')
  })

  it('passes a complete page', () => {
    expect(checkPage('home.html', '<p>Sino Messages</p>', { landmarks: ['Sino Messages'], strictOwner: true })).toEqual([])
  })
})

describe('cssOf (D-464)', () => {
  const manifest = {
    'src/Public.tsx': { css: ['assets/Public-b.css'], imports: ['_shared.js'] },
    '_shared.js': { css: ['assets/index-a.css', 'assets/Shared-c.css'] },
  }

  it('collects the CSS of the chunk and what it imports, minus what the shell links', () => {
    expect(cssOf(manifest, 'src/Public.tsx', SHELL)).toEqual(['/assets/Public-b.css', '/assets/Shared-c.css'])
  })

  it('fails on an entry the manifest does not have', () => {
    expect(() => cssOf(manifest, 'src/Missing.tsx', SHELL)).toThrow(/not in the Vite manifest/)
  })
})
