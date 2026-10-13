import type { PageMeta } from './pages.ts'
import type { SiteData } from './site-data.ts'

const HEAD = '<!--app-head-->'
const ROOT = '<div id="root"><!--app-html--></div>'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The whole HTML file of a page: the client build's index.html with the page's head tags, its language and the
 * prerendered app put in (D-250). `data-page` tells the browser which page to hydrate.
 */
export function renderDocument(options: { template: string; page: PageMeta; site: SiteData; appHtml: string }) {
  const { template, page, site, appHtml } = options
  for (const placeholder of [HEAD, ROOT, '<html lang="vi">']) {
    if (!template.includes(placeholder)) throw new Error(`index.html lost ${placeholder}`)
  }

  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    site.mode === 'preview' || !page.indexable ? '<meta name="robots" content="noindex">' : '',
    page.indexable ? `<link rel="canonical" href="${escapeHtml(`${site.config.siteUrl ?? ''}${page.path}`)}">` : '',
  ].filter(Boolean)

  return template
    .replace('<html lang="vi">', `<html lang="${page.lang}">`)
    .replace(HEAD, head.join('\n    '))
    .replace(ROOT, () => `<div id="root" data-page="${page.id}">${appHtml}</div>`)
}
