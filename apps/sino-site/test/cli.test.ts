// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const parents: string[] = []

afterAll(() => Promise.all(parents.map((p) => rm(p, { recursive: true, force: true }))))

async function runBuild(...args: string[]) {
  const parent = await mkdtemp(join(tmpdir(), 'sino-site-'))
  parents.push(parent)
  const outDir = join(parent, 'dist')
  const result = spawnSync(process.execPath, ['scripts/build.ts', '--out', outDir, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  return { ...result, outDir }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort()
}

describe('pnpm build', () => {
  it('exits with an error naming the missing field and writes no page', async () => {
    const { status, stderr, outDir } = await runBuild('--config', 'test/fixtures/missing-email.config.ts')

    expect(status).toBe(1)
    expect(stderr).toContain('contactEmail: chưa điền (email liên hệ)')
    expect(existsSync(outDir)).toBe(false)
  })
})

describe('pnpm build:preview', () => {
  it('builds even when nothing is filled yet', async () => {
    const { status, stderr, outDir } = await runBuild('--preview', '--config', 'test/fixtures/empty.config.ts')

    expect(stderr).toBe('')
    expect(status).toBe(0)
    expect(existsSync(join(outDir, '404.html'))).toBe(true)
  })
})

describe('a production build', () => {
  let outDir: string
  let files: string[]
  const fileFor = (url: string) => {
    const path = url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')
    return [path === '' ? 'index.html' : path, `${path}/index.html`].find((c) => files.includes(c)) ?? null
  }

  beforeAll(async () => {
    const result = await runBuild('--config', 'test/fixtures/full.config.ts')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    outDir = result.outDir
    files = await listFiles(outDir)
  })

  it('writes the pages, the icon, the script, the styles and the fonts, and no server bundle', () => {
    expect(files).toContain('index.html')
    expect(files).toContain('messages/index.html')
    expect(files).toContain('privacy/index.html')
    expect(files).toContain('en/privacy/index.html')
    expect(files).toContain('404.html')
    expect(files).toContain('favicon.svg')
    expect(files.some((f) => /^assets\/.+\.js$/.test(f))).toBe(true)
    expect(files.some((f) => /^assets\/.+\.css$/.test(f))).toBe(true)
    expect(files.some((f) => /^assets\/inter-vietnamese-wght-normal.+\.woff2$/.test(f))).toBe(true)
    expect(files.some((f) => /entry-server/.test(f))).toBe(false)
  })

  it('prerenders the pages into the HTML the browser hydrates', async () => {
    const doc = new JSDOM(await readFile(join(outDir, '404.html'), 'utf8')).window.document

    expect(doc.getElementById('root')?.dataset.page).toBe('not-found')
    expect(doc.querySelector('h1')?.textContent).toBe('Không tìm thấy trang này.')
    expect(doc.querySelector('script[type="module"]')).not.toBeNull()
  })

  it('loads every script, stylesheet and icon from the site itself', async () => {
    for (const file of files.filter((f) => f.endsWith('.html'))) {
      const doc = new JSDOM(await readFile(join(outDir, file), 'utf8')).window.document
      // What the page loads; canonical and hreflang links name pages, they load nothing.
      const resources = 'script[src], link[rel~="stylesheet"], link[rel~="icon"], link[rel~="modulepreload"], link[rel~="preload"]'
      const urls = [...doc.querySelectorAll(resources)].map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')

      expect(urls.length, file).toBeGreaterThan(0)
      for (const url of urls) {
        expect(url, `${file}: ${url}`).toMatch(/^\/[^/]/)
        expect(fileFor(url), `${file}: ${url}`).not.toBeNull()
      }
    }
  })

  it('takes every font of the stylesheet from the site itself', async () => {
    for (const file of files.filter((f) => f.endsWith('.css'))) {
      const css = await readFile(join(outDir, file), 'utf8')
      const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1])

      expect(css).not.toContain('fonts.googleapis.com')
      for (const url of urls.filter((u) => !u.startsWith('data:'))) {
        expect(url, url).toMatch(/^\/[^/]/)
        expect(fileFor(url), url).not.toBeNull()
      }
    }
  })
})
