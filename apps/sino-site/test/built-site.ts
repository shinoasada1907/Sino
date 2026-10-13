import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { JSDOM } from 'jsdom'
import { buildSite } from '../src/build.ts'
import type { SiteConfig } from '../src/config.ts'
import type { BuildMode } from '../src/context.ts'

export interface BuiltSite {
  dir: string
  /** Every file written, as "privacy/index.html", with forward slashes. */
  files: string[]
  htmlFiles: string[]
  read(file: string): Promise<string>
  document(file: string): Promise<Document>
  /** The file a root-relative URL path is served from, or null when the site has none. */
  fileFor(path: string): string | null
  remove(): Promise<void>
}

/** Builds the site into a fresh temporary folder. */
export async function buildInto(mode: BuildMode, config: SiteConfig): Promise<BuiltSite> {
  const dir = await mkdtemp(join(tmpdir(), 'sino-site-'))
  await buildSite({ outDir: dir, mode, config })
  const files = await listFiles(dir)
  return {
    dir,
    files,
    htmlFiles: files.filter((f) => f.endsWith('.html')),
    read: (file) => readFile(join(dir, file), 'utf8'),
    document: async (file) => new JSDOM(await readFile(join(dir, file), 'utf8')).window.document,
    fileFor: (path) => {
      const trimmed = path.replace(/^\/+|\/+$/g, '')
      const candidates = trimmed === '' ? ['index.html'] : [trimmed, `${trimmed}/index.html`]
      return candidates.find((c) => existsSync(join(dir, c)) && files.includes(c)) ?? null
    },
    remove: () => rm(dir, { recursive: true, force: true }),
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort()
}
