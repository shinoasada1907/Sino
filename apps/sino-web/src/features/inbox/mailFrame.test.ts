import { describe, expect, it } from 'vitest'
import { fitFrame, MAIL_FRAME_SANDBOX, mailDocument, type FrameFit } from './mailFrame'

const ORIGIN = 'https://sino.example'
const policyOf = (document: string) => document.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]

describe('the document of an HTML email (FE-58, D-120, D-121)', () => {
  it('allows nothing from outside but its own styles, pictures inside the email and pictures from Sino', () => {
    const document = mailDocument('<p>Báo giá</p>', { showImages: false, origin: ORIGIN })

    expect(policyOf(document)).toBe(`default-src 'none'; style-src 'unsafe-inline'; img-src data: ${ORIGIN}/api/conversations/; font-src data:`)
  })

  it('lets the pictures of the web in only when the reader asks', () => {
    const document = mailDocument('<p>Báo giá</p>', { showImages: true, origin: ORIGIN })

    expect(policyOf(document)).toBe(`default-src 'none'; style-src 'unsafe-inline'; img-src data: ${ORIGIN}/api/conversations/ https: http:; font-src data:`)
  })

  it('opens links in a new tab and tells no site where the reader came from', () => {
    const document = mailDocument('<a href="https://acme.vn">Xem</a>', { showImages: false, origin: ORIGIN })

    expect(document).toContain('<base target="_blank">')
    expect(document).toContain('<meta name="referrer" content="no-referrer">')
  })

  it('puts the cleaned HTML in the body, on a light page whatever the theme of Sino', () => {
    const document = mailDocument('<div style="width:600px"><p>Báo giá</p></div>', { showImages: false, origin: ORIGIN })

    expect(document).toContain('<body><div style="width:600px"><p>Báo giá</p></div></body>')
    expect(document).toContain('color-scheme: light')
    expect(document).toContain('background: #fff')
  })

  it('drops what could redirect the frame, change the referrer policy or reach out, and makes every link safe', () => {
    const document = mailDocument(
      '<meta http-equiv="refresh" content="0;url=https://evil.example"><meta name="referrer" content="unsafe-url"><base href="https://evil.example/"><link rel="dns-prefetch" href="//evil.example"><p><a href="https://acme.vn">Xem</a></p>',
      { showImages: false, origin: ORIGIN },
    )
    const body = document.slice(document.indexOf('<body>'))

    expect(body).not.toMatch(/<meta|<base|<link/)
    expect(body).toContain('<a href="https://acme.vn" target="_blank" rel="noopener noreferrer">Xem</a>')
  })

  it('lets the frame run no script and send no form', () => {
    expect(MAIL_FRAME_SANDBOX).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox')
  })
})

describe('the height of the frame (FE-58, review 2026-10-10)', () => {
  const START: FrameFit = { height: 160, scroll: false, done: false, gap: 0, repeats: 0 }
  // `wanted`: what the email asks for; `viewport`: the height the frame has when it is measured.
  const step = (fit: FrameFit, wanted: number) => fitFrame(fit, wanted, fit.height)

  it('follows the email, taller when pictures load, shorter when it is short', () => {
    expect(step(START, 420)).toMatchObject({ height: 420, scroll: false, done: false })
    expect(step(step(START, 420), 640)).toMatchObject({ height: 640, done: false })
    expect(step(START, 80)).toMatchObject({ height: 80 })
  })

  it('stops following an email that grows with the frame itself (100vh), and scrolls it inside', () => {
    let fit = START
    for (let i = 0; i < 10 && !fit.done; i++) {
      fit = step(fit, fit.height + 32)
    }
    expect(fit).toMatchObject({ done: true, scroll: true, height: 640 })
  })

  it('does not take pictures of the same height loading one after another for that', () => {
    let fit = step(START, 400)
    fit = fitFrame(fit, fit.height, fit.height)
    fit = step(fit, fit.height + 200)
    fit = fitFrame(fit, fit.height, fit.height)
    fit = step(fit, fit.height + 200)
    expect(fit).toMatchObject({ done: false, scroll: false, height: 800 })
  })

  it('caps a very long email and scrolls it inside', () => {
    expect(step(START, 50_000)).toMatchObject({ height: 12_000, scroll: true, done: true })
  })
})
