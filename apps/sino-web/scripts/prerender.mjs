// Writes the public pages as HTML at build time (public-pages-prerender, D-460..D-465):
//   dist/home.html  dist/privacy.html  dist/en/privacy.html
// `dist/index.html` is not touched: it stays the empty shell for every page of the app (D-461).
// Run after `vite build` (with build.manifest) and `vite build --ssr` (see the `build` script).
//   --strict   also fail on an owner value not filled in yet ("[chưa điền"); `pnpm build` passes it once PP-01 is done.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPage, checkPage, cssOf } from './prerender-html.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const strictOwner = process.argv.includes('--strict')

// Phrases the whole page holds: a page that lost its text, or only its head, fails the build.
const OUTPUTS = [
  { route: '/', file: 'home.html', landmarks: ['Sino Messages', 'href="/privacy#google"', 'href="/login"'] },
  {
    route: '/privacy',
    file: 'privacy.html',
    landmarks: ['Chính sách quyền riêng tư', 'Dữ liệu nhận từ Google', 'Limited Use', 'Chịu trách nhiệm về dữ liệu của Sino'],
  },
  {
    route: '/en/privacy',
    file: 'en/privacy.html',
    landmarks: ['Privacy policy', 'Limited Use', 'Responsible for Sino'],
  },
]

const shell = await readFile(path.join(dist, 'index.html'), 'utf8')
const manifest = JSON.parse(await readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'))
const { prerenderPage } = await import(pathToFileURL(path.join(root, '.prerender', 'entry.js')).href)

const cssHrefs = cssOf(manifest, 'src/features/public/PublicPages.tsx', shell)
const problems = []
for (const { route, file, landmarks } of OUTPUTS) {
  const page = prerenderPage(route)
  const html = buildPage(shell, { ...page, cssHrefs })
  problems.push(...checkPage(file, html, { landmarks, strictOwner }))
  const target = path.join(dist, file)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, html)
  console.log(`prerender: ${file} (${html.length} bytes)`)
}

// The manifest is for this step only; it does not belong in what the server publishes.
await rm(path.join(dist, '.vite'), { recursive: true, force: true })

if (problems.length > 0) {
  console.error(`prerender: build lỗi:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}
if (!strictOwner) {
  console.warn('prerender: --strict is off, so a "[chưa điền" left in a page would not fail this build')
}
