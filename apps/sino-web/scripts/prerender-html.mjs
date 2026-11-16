// The pure part of the prerender step (public-pages-prerender, D-461, D-464, D-465): turn the app shell into the HTML
// of a public page, and check the result. No file or Vite here, so a test can run it (prerender-html.test.ts).

const ROOT = '<div id="root"></div>'
const TITLE = /<title>[^<]*<\/title>/
const HTML_LANG = /<html lang="[^"]*">/

/** Hides the generated text as soon as scripts run: React then replaces it (D-463). Without scripts it stays shown. */
const HIDE_WHEN_SCRIPTED =
  "<script>document.documentElement.classList.add('js')</script>" + '<style>html.js [data-prerendered]{display:none}</style>'

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The shell with a public page in it: tab title, language, the page's own CSS, and the generated body inside `#root`.
 * The shell's own scripts stay, so the app starts as it always did and `createRoot` replaces the body.
 */
export function buildPage(shell, { html, title, lang, cssHrefs }) {
  for (const [what, found] of [
    ['<div id="root"></div>', shell.includes(ROOT)],
    ['<title>', TITLE.test(shell)],
    ['<html lang>', HTML_LANG.test(shell)],
    ['</head>', shell.includes('</head>')],
  ]) {
    if (!found) throw new Error(`prerender: the app shell has no ${what}`)
  }
  const links = cssHrefs.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`).join('')
  return shell
    .replace(HTML_LANG, () => `<html lang="${lang}">`)
    .replace(TITLE, () => `<title>${escapeHtml(title)}</title>`)
    .replace('</head>', () => `${HIDE_WHEN_SCRIPTED}${links}</head>`)
    .replace(ROOT, () => `<div id="root"><div data-prerendered>${html}</div></div>`)
}

/**
 * What is wrong with a generated page, as sentences naming the page (D-465). Landmarks are phrases the full page holds;
 * with `strictOwner` an owner value not filled in yet (`[chưa điền`) is a problem as well.
 */
export function checkPage(file, html, { landmarks, strictOwner }) {
  const problems = landmarks.filter((text) => !html.includes(text)).map((text) => `${file}: thiếu câu mốc "${text}"`)
  if (strictOwner && html.includes('[chưa điền')) {
    const missing = [...new Set([...html.matchAll(/\[chưa điền: ([^\]]*)\]/g)].map((m) => m[1]))]
    problems.push(`${file}: còn "[chưa điền" (${missing.join(', ')}); điền owner.ts`)
  }
  return problems
}

/** The stylesheets a Vite manifest entry brings, itself and what it imports, minus the ones the shell already links. */
export function cssOf(manifest, key, shell) {
  const seen = new Set()
  const hrefs = []
  const visit = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    const chunk = manifest[name]
    if (!chunk) throw new Error(`prerender: ${name} is not in the Vite manifest`)
    for (const css of chunk.css ?? []) {
      const href = `/${css}`
      if (!shell.includes(href) && !hrefs.includes(href)) hrefs.push(href)
    }
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  visit(key)
  return hrefs
}
