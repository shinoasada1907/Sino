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
 * The `srcdoc` of the frame for HTML the backend has cleaned. The policy lets in only the email's own styles, pictures
 * inside it (`data:`) and from Sino (embedded `cid:` pictures); pictures of the web only when the reader asks
 * (`showImages`, D-121), which a tracking pixel would otherwise tell the sender. Links open in a new tab and no site
 * learns where the reader came from.
 */
export function mailDocument(html: string, { showImages, origin }: { showImages: boolean; origin: string }): string {
  const images = showImages ? `data: ${origin} https: http:` : `data: ${origin}`
  const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:`
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    `<style>${BASE_STYLE}</style>`,
    `</head><body>${html}</body></html>`,
  ].join('')
}
