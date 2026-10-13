// pnpm build [--preview] [--out <dir>] [--config <file>]: builds the site into dist/ (D-242, D-250).
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { build, type InlineConfig } from 'vite'
import { configProblems, type SiteConfig } from '../src/site/config.ts'
import type { PageId, PageMeta } from '../src/site/pages.ts'
import type { SiteData } from '../src/site/site-data.ts'

interface ServerBundle {
  PAGES: PageMeta[]
  prerender(pageId: PageId, template: string): string
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({
  options: {
    preview: { type: 'boolean', default: false },
    out: { type: 'string' },
    config: { type: 'string', default: 'site.config.ts' },
  },
})

const mode = values.preview ? 'preview' : 'production'
const outDir = values.out ? resolve(values.out) : resolve(packageRoot, 'dist')
const config: SiteConfig = (await import(pathToFileURL(resolve(packageRoot, values.config)).href)).default
const problems = configProblems(config)

if (mode === 'production' && problems.length > 0) {
  console.error(`site.config.ts chưa đủ để dựng bản đưa lên mạng:\n${problems.map((p) => `  - ${p.message}`).join('\n')}`)
  process.exit(1)
}

// Vite keeps a NODE_ENV it inherits (vitest sets "test"), and React then ships its development build.
process.env.NODE_ENV = 'production'
const site: SiteData = { mode, config, year: new Date().getFullYear() }
// Inside node_modules, so the server bundle finds react and the other packages it leaves out of itself.
const staging = await mkdtemp(join(packageRoot, 'node_modules', '.sino-build-'))
const clientDir = join(staging, 'client')

try {
  const shared: InlineConfig = { root: packageRoot, logLevel: 'warn', define: { __SITE_DATA__: JSON.stringify(site) } }
  await build({ ...shared, build: { outDir: clientDir, emptyOutDir: true } })
  await build({ ...shared, build: { ssr: 'src/entry-server.tsx', outDir: join(staging, 'server'), emptyOutDir: true } })

  // The client build's index.html is only the frame; every HTML file in dist/ is a prerendered page.
  const template = await readFile(join(clientDir, 'index.html'), 'utf8')
  await rm(join(clientDir, 'index.html'))
  const server: ServerBundle = await import(pathToFileURL(join(staging, 'server', 'entry-server.js')).href)
  for (const page of server.PAGES) {
    const file = join(clientDir, page.file)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, server.prerender(page.id, template), 'utf8')
  }

  await rm(outDir, { recursive: true, force: true })
  await cp(clientDir, outDir, { recursive: true })
} finally {
  await rm(staging, { recursive: true, force: true })
}

console.log(`Đã dựng bản ${mode === 'preview' ? 'xem trước' : 'đưa lên mạng'} vào ${outDir}`)
if (mode === 'preview' && problems.length > 0) {
  console.log(`Bản xem trước còn thiếu (trang có noindex):\n${problems.map((p) => `  - ${p.message}`).join('\n')}`)
}
