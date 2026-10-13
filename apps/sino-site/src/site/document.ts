import type { Lang, PageMeta } from './pages.ts'
import type { SiteData } from './site-data.ts'

const HEAD = '<!--app-head-->'
const ROOT = '<div id="root"><!--app-html--></div>'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The whole HTML file of a page: the client build's index.html with the page's head tags, its language and the
 * prerendered app put in (D-250). `data-page` tells the browser which page to hydrate. `alternate` is the same page in
 * the other language (D-243); both versions are then named with `hreflang`.
 */
export function renderDocument(options: {
  template: string
  page: PageMeta
  site: SiteData
  appHtml: string
  alternate?: { lang: Lang; path: string }
}) {
  const { template, page, site, appHtml, alternate } = options
  for (const placeholder of [HEAD, ROOT, '<html lang="vi">']) {
    if (!template.includes(placeholder)) throw new Error(`index.html lost ${placeholder}`)
  }
  const url = (path: string) => escapeHtml(`${site.config.siteUrl ?? ''}${path}`)
  const versions = alternate ? [{ lang: page.lang, path: page.path }, alternate] : []
  // Vietnamese first, whichever page this is, so both versions carry the same lines.
  versions.sort((a, b) => (a.lang === b.lang ? 0 : a.lang === 'vi' ? -1 : 1))

  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    site.mode === 'preview' || !page.indexable ? '<meta name="robots" content="noindex">' : '',
    page.indexable ? `<link rel="canonical" href="${url(page.path)}">` : '',
    ...versions.map((v) => `<link rel="alternate" hreflang="${v.lang}" href="${url(v.path)}">`),
  ].filter(Boolean)

  return template
    .replace('<html lang="vi">', `<html lang="${page.lang}">`)
    .replace(HEAD, head.join('\n    '))
    .replace(ROOT, () => `<div id="root" data-page="${page.id}">${appHtml}</div>`)
}
