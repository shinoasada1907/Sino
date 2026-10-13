import type { SiteContext } from './context.ts'
import { html, type Html } from './html.ts'
import { icon, logoMark } from './icons.ts'

export type Lang = 'vi' | 'en'

/** One page of the site, before the shared head, top bar and footer are put around it. */
export interface PageSpec {
  /** URL path, such as "/privacy". */
  path: string
  /** Where the page is written in dist/, such as "privacy/index.html". */
  file: string
  lang: Lang
  title: string
  description: string
  /** What goes inside the page frame, above the footer. */
  main: Html
  /** The same page in the other language (D-243). */
  alternate?: { lang: Lang; path: string }
  /** False for the 404 page: no canonical URL and kept out of search results. */
  indexable?: boolean
}

interface Chrome {
  sections: [label: string, id: string][]
  sectionsLabel: string
  openMenu: string
  login: string
  openApp: string
  tagline: string
  columns: [title: string, links: [label: string, href: string][]][]
  switchTo: string
}

const CHROME: Record<Lang, Chrome> = {
  vi: {
    sections: [
      ['Tính năng', 'tinh-nang'],
      ['Kế hoạch', 'ke-hoach'],
      ['Cách hoạt động', 'cach-hoat-dong'],
      ['Quyền riêng tư', 'rieng-tu'],
      ['Câu hỏi', 'cau-hoi'],
    ],
    sectionsLabel: 'Các mục của trang chủ',
    openMenu: 'Mở menu',
    login: 'Đăng nhập',
    openApp: 'Mở Sino',
    tagline: 'Hộp thư chung và việc cần làm, ở cùng một nơi.',
    columns: [
      ['SẢN PHẨM', [['Tính năng', '/#tinh-nang'], ['Kế hoạch', '/#ke-hoach'], ['Cách hoạt động', '/#cach-hoat-dong']]],
      ['TIN CẬY', [['Quyền riêng tư', '/#rieng-tu'], ['Bảo mật', '/security'], ['Câu hỏi thường gặp', '/#cau-hoi']]],
      ['PHÁP LÝ', [['Điều khoản', '/terms'], ['Chính sách quyền riêng tư', '/privacy'], ['Phần mềm nguồn mở', '/open-source']]],
    ],
    switchTo: 'Tiếng Việt',
  },
  en: {
    sections: [
      ['Features', 'tinh-nang'],
      ['Planning', 'ke-hoach'],
      ['How it works', 'cach-hoat-dong'],
      ['Privacy', 'rieng-tu'],
      ['FAQ', 'cau-hoi'],
    ],
    sectionsLabel: 'Sections of the home page',
    openMenu: 'Open menu',
    login: 'Sign in',
    openApp: 'Open Sino',
    tagline: 'One inbox and your to-dos, in one place.',
    columns: [
      ['PRODUCT', [['Features', '/#tinh-nang'], ['Planning', '/#ke-hoach'], ['How it works', '/#cach-hoat-dong']]],
      ['TRUST', [['Privacy', '/#rieng-tu'], ['Security', '/security'], ['FAQ', '/#cau-hoi']]],
      ['LEGAL', [['Terms of service', '/en/terms'], ['Privacy policy', '/en/privacy'], ['Open source', '/open-source']]],
    ],
    switchTo: 'English',
  },
}

/** A whole HTML document: head, top bar, the page, footer. No script (D-247). */
export function renderPage(ctx: SiteContext, page: PageSpec): string {
  const chrome = CHROME[page.lang]
  const indexable = page.indexable !== false
  const alternates = page.alternate ? [{ lang: page.lang, path: page.path }, page.alternate] : []

  return `<!doctype html>\n${html`<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.description}">
${ctx.mode === 'preview' || !indexable ? html`<meta name="robots" content="noindex">` : ''}
${indexable ? html`<link rel="canonical" href="${ctx.canonical(page.path)}">` : ''}
${alternates.map((a) => html`<link rel="alternate" hreflang="${a.lang}" href="${ctx.canonical(a.path)}">\n`)}<meta name="color-scheme" content="dark light">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
</head>
<body class="sino lp">
${topBar(ctx, chrome)}
<main class="dotbg">
<div class="lp-wrap">
${page.main}
${footer(chrome, page.alternate)}
</div>
</main>
</body>
</html>
`.value}`
}

function topBar(ctx: SiteContext, chrome: Chrome): Html {
  const sectionLinks = chrome.sections.map(([label, id]) => html`<a class="lp-link" href="/#${id}">${label}</a>`)
  return html`<header class="lp-nav">
<div class="lp-wrap">
<div class="lp-nav-in">
<a class="lp-brand" href="/">${logoMark()}Sino</a>
<nav class="lp-links" aria-label="${chrome.sectionsLabel}">${sectionLinks}</nav>
<div class="lp-nav-cta">
<a class="btn btn-ghost btn-sm lp-hide-m" href="${ctx.appHref('/login')}">${chrome.login}</a>
<a class="btn btn-primary btn-sm" href="${ctx.appHref('/')}">${chrome.openApp}</a>
<details class="lp-menu-d">
<summary class="btn btn-ghost btn-icon btn-sm lp-menu-btn" aria-label="${chrome.openMenu}">${icon('menu')}</summary>
<nav class="lp-menu" aria-label="Menu">${sectionLinks}<a class="lp-link" href="${ctx.appHref('/login')}">${chrome.login}</a></nav>
</details>
</div>
</div>
</div>
</header>`
}

function footer(chrome: Chrome, alternate: PageSpec['alternate']): Html {
  const columns = chrome.columns.map(
    ([title, links]) =>
      html`<div class="lp-foot-col"><span class="micro-label">${title}</span>${links.map(([label, href]) => html`<a href="${href}">${label}</a>`)}</div>`,
  )
  const switcher = alternate
    ? html`<a class="lang" href="${alternate.path}" hreflang="${alternate.lang}" lang="${alternate.lang}">${CHROME[alternate.lang].switchTo}</a>`
    : ''
  return html`<footer>
<div class="lp-foot">
<div class="lp-foot-col lp-foot-brand"><a class="lp-brand" href="/">${logoMark()}Sino</a><span class="t-small c-muted">${chrome.tagline}</span></div>
${columns}
</div>
<div class="lp-legal"><span class="spec">© ${new Date().getFullYear()} SINO</span>${switcher}</div>
</footer>`
}
