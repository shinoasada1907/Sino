import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configProblems, type ConfigProblem, type SiteConfig } from './config.ts'
import { createContext, type BuildMode } from './context.ts'
import { renderPage } from './layout.ts'
import { sitePages } from './pages/index.ts'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Self-hosted fonts (D-247): the subsets Vietnamese text needs, variable weight. */
const FONT_FILES = ['inter', 'jetbrains-mono'].flatMap((font) =>
  ['latin', 'latin-ext', 'vietnamese'].map((subset) => ({
    from: join(PACKAGE_ROOT, 'node_modules', '@fontsource-variable', font, 'files', `${font}-${subset}-wght-normal.woff2`),
    to: `fonts/${font}-${subset}-wght-normal.woff2`,
  })),
)

/** A production build refused because the config is not complete (D-242). */
export class ConfigError extends Error {
  readonly problems: ConfigProblem[]

  constructor(problems: ConfigProblem[]) {
    super(`site.config.ts chưa đủ để dựng bản đưa lên mạng:\n${problems.map((p) => `  - ${p.message}`).join('\n')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

/** Writes the whole site into `outDir`, replacing what was there. A production build checks the config first. */
export async function buildSite(options: { outDir: string; mode: BuildMode; config: SiteConfig }): Promise<void> {
  const { outDir, mode, config } = options
  if (mode === 'production') {
    const problems = configProblems(config)
    if (problems.length > 0) throw new ConfigError(problems)
  }

  const ctx = createContext(config, mode)
  const pages = sitePages(ctx).map((page) => ({ file: page.file, content: renderPage(ctx, page) }))

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  for (const page of pages) {
    await writeTo(join(outDir, page.file), page.content)
  }
  await copyFile(join(PACKAGE_ROOT, 'styles', 'site.css'), join(outDir, 'site.css'))
  await cp(join(PACKAGE_ROOT, 'public'), outDir, { recursive: true })
  await mkdir(join(outDir, 'fonts'))
  for (const font of FONT_FILES) {
    await copyFile(font.from, join(outDir, font.to))
  }
}

async function writeTo(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content, 'utf8')
}
