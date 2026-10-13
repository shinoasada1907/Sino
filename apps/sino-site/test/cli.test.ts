import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
let parent: string | undefined

afterEach(async () => {
  if (parent) await rm(parent, { recursive: true, force: true })
})

async function runBuild(...args: string[]) {
  parent = await mkdtemp(join(tmpdir(), 'sino-site-'))
  const outDir = join(parent, 'dist')
  const result = spawnSync(process.execPath, ['scripts/build.ts', '--out', outDir, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  return { ...result, outDir }
}

describe('pnpm build', () => {
  it('exits with an error naming the missing field and writes no page', async () => {
    const { status, stderr, outDir } = await runBuild('--config', 'test/fixtures/missing-email.config.ts')

    expect(status).toBe(1)
    expect(stderr).toContain('contactEmail: chưa điền (email liên hệ)')
    expect(existsSync(join(outDir, '404.html'))).toBe(false)
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
