import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildInto, type BuiltSite } from './built-site.ts'
import { EMPTY_CONFIG } from './fixtures/configs.ts'

describe('preview build with nothing filled yet', () => {
  let site: BuiltSite

  beforeAll(async () => {
    site = await buildInto('preview', EMPTY_CONFIG)
  })
  afterAll(() => site.remove())

  it('still builds the pages', () => {
    expect(site.htmlFiles).toContain('404.html')
  })

  it('keeps every page out of search results', async () => {
    for (const file of site.htmlFiles) {
      const doc = await site.document(file)

      expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), file).toBe('noindex')
    }
  })
})
