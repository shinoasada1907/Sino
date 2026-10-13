// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveRequest } from '../scripts/static-files.ts'

describe('resolveRequest', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sino-site-'))
    await mkdir(join(root, 'privacy'))
    await Promise.all(
      ['index.html', 'privacy/index.html', 'site.css', '404.html'].map((f) => writeFile(join(root, f), f)),
    )
  })
  afterAll(() => rm(root, { recursive: true, force: true }))

  it.each([
    ['/', 'index.html'],
    ['/privacy', 'privacy/index.html'],
    ['/privacy/', 'privacy/index.html'],
    ['/privacy?ref=google', 'privacy/index.html'],
    ['/site.css', 'site.css'],
  ])('serves %s from %s', (url, file) => {
    expect(resolveRequest(root, url)).toEqual({ file: join(root, file), status: 200 })
  })

  it.each(['/nope', '/privacy/nope', '/../package.json', '/%2e%2e/package.json', '/%E0%A4%A'])(
    'answers %s with the 404 page',
    (url) => {
      expect(resolveRequest(root, url)).toEqual({ file: join(root, '404.html'), status: 404 })
    },
  )
})
