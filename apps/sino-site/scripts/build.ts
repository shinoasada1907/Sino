// pnpm build [--preview] [--out <dir>] [--config <file>]: writes the site into dist/ (D-242).
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildSite, ConfigError } from '../src/build.ts'
import { configProblems, type SiteConfig } from '../src/config.ts'

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

try {
  await buildSite({ outDir, mode, config })
  console.log(`Đã dựng bản ${mode === 'preview' ? 'xem trước' : 'đưa lên mạng'} vào ${outDir}`)
  const missing = configProblems(config)
  if (mode === 'preview' && missing.length > 0) {
    console.log(`Bản xem trước còn thiếu (trang có noindex):\n${missing.map((p) => `  - ${p.message}`).join('\n')}`)
  }
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  console.error(error.message)
  process.exitCode = 1
}
