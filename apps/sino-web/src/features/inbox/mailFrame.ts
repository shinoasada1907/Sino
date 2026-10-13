/**
 * The frame of an HTML email (F06, D-120): no `allow-scripts`, so nothing in the email runs even if the backend's
 * cleaning missed it, and no `allow-forms`. `allow-same-origin` only lets Sino measure the height of the email.
 */
export const MAIL_FRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'

// Email is written for a light page; this keeps it readable in Sino's dark theme too.
const BASE_STYLE = [
  'html { color-scheme: light; overflow-y: hidden; }',
  'body { margin: 0; padding: 16px; background: #fff; color: #1f1f1f; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; }',
  'img { max-width: 100%; height: auto; }',
  'pre { white-space: pre-wrap; }',
].join(' ')

/**
 * The HTML of an email as the frame shows it. The backend cleaned it already; this removes again what could act on
 * the page from inside the body (`meta` refresh or referrer, `base`, `link` prefetch) and gives every link a new tab
 * without `window.opener` or a referrer. The styles the parser puts in `head` are kept. `DOMParser` makes an inert
 * document: nothing in it runs or loads.
 */
function forFrame(html: string): string {
  const page = new DOMParser().parseFromString(html, 'text/html')
  page.querySelectorAll('meta, base, link, title').forEach((element) => element.remove())
  page.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })
  const styles = [...page.head.querySelectorAll('style')].map((style) => style.outerHTML).join('')
  return styles + page.body.innerHTML
}

/**
 * The `srcdoc` of the frame for HTML the backend has cleaned. The policy lets in only the email's own styles, pictures
 * inside it (`data:`) and from Sino's API (embedded `cid:` pictures); pictures of the web only when the reader asks
 * (`showImages`, D-121), which a tracking pixel would otherwise tell the sender. Links open in a new tab and no site
 * learns where the reader came from.
 */
export function mailDocument(html: string, { showImages, origin }: { showImages: boolean; origin: string }): string {
  const sino = `${origin}/api/conversations/`
  const images = showImages ? `data: ${sino} https: http:` : `data: ${sino}`
  const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:`
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    `<style>${BASE_STYLE}</style>`,
    `</head><body>${forFrame(html)}</body></html>`,
  ].join('')
}

/** How the frame follows the height of its email. */
export interface FrameFit {
  height: number
  /** The email scrolls inside the frame instead. */
  scroll: boolean
  /** The frame stopped following the email. */
  done: boolean
  /** By how much the email outgrew the frame at the last measure, and how many times in a row by that much. */
  gap: number
  repeats: number
}

export const FRAME_START: FrameFit = { height: 160, scroll: false, done: false, gap: 0, repeats: 0 }
const MAX_FRAME_HEIGHT = 12_000
const RUNAWAY_FRAME_HEIGHT = 640

/**
 * The next height of the frame from what the email asks for (`wanted`) when the frame is `viewport` tall. The frame is
 * measured again after each resize, so an email that fits says so (no gap). One sized by the frame itself (`100vh`)
 * always asks the same bit more; after that gap three times in a row the frame stops following it and the email
 * scrolls inside, as a very long one does past the cap.
 */
export function fitFrame(fit: FrameFit, wanted: number, viewport: number): FrameFit {
  if (fit.done) {
    return fit
  }
  if (wanted > MAX_FRAME_HEIGHT) {
    return { ...fit, height: MAX_FRAME_HEIGHT, scroll: true, done: true }
  }
  const gap = wanted - viewport
  const repeats = gap > 0 && gap === fit.gap ? fit.repeats + 1 : 0
  if (repeats >= 2) {
    return { height: RUNAWAY_FRAME_HEIGHT, scroll: true, done: true, gap, repeats }
  }
  return { height: wanted, scroll: false, done: false, gap, repeats }
}
