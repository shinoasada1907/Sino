import { describe, expect, it } from 'vitest'
import { MAIL_FRAME_SANDBOX, mailDocument } from './mailFrame'

const ORIGIN = 'https://sino.example'
const policyOf = (document: string) => document.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]

describe('the document of an HTML email (FE-58, D-120, D-121)', () => {
  it('allows nothing from outside but its own styles, pictures inside the email and pictures from Sino', () => {
    const document = mailDocument('<p>Báo giá</p>', { showImages: false, origin: ORIGIN })

    expect(policyOf(document)).toBe(`default-src 'none'; style-src 'unsafe-inline'; img-src data: ${ORIGIN}; font-src data:`)
  })

  it('lets the pictures of the web in only when the reader asks', () => {
    const document = mailDocument('<p>Báo giá</p>', { showImages: true, origin: ORIGIN })

    expect(policyOf(document)).toBe(`default-src 'none'; style-src 'unsafe-inline'; img-src data: ${ORIGIN} https: http:; font-src data:`)
  })

  it('opens links in a new tab and tells no site where the reader came from', () => {
    const document = mailDocument('<a href="https://acme.vn">Xem</a>', { showImages: false, origin: ORIGIN })

    expect(document).toContain('<base target="_blank">')
    expect(document).toContain('<meta name="referrer" content="no-referrer">')
  })

  it('puts the cleaned HTML in the body, on a light page whatever the theme of Sino', () => {
    const document = mailDocument('<table width="600"><tr><td>Báo giá</td></tr></table>', { showImages: false, origin: ORIGIN })

    expect(document).toMatch(/<body><table width="600"><tr><td>Báo giá<\/td><\/tr><\/table><\/body>/)
    expect(document).toContain('color-scheme: light')
    expect(document).toContain('background: #fff')
  })

  it('lets the frame run no script and send no form', () => {
    expect(MAIL_FRAME_SANDBOX).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox')
  })
})
