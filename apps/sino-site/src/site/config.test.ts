import { describe, expect, it } from 'vitest'
import { EMPTY_CONFIG, FULL_CONFIG } from '@/test/configs'
import { configProblems } from './config'

describe('configProblems', () => {
  it('finds nothing wrong when every field is filled correctly', () => {
    expect(configProblems(FULL_CONFIG)).toEqual([])
  })

  it('names every field that is still empty', () => {
    expect(configProblems(EMPTY_CONFIG).map((p) => p.field)).toEqual([
      'siteUrl',
      'appUrl',
      'contactEmail',
      'owner',
      'effectiveDate',
      'hosting',
    ])
  })

  it('treats a blank value as empty', () => {
    const problems = configProblems({ ...FULL_CONFIG, owner: '   ' })

    expect(problems).toEqual([{ field: 'owner', message: 'owner: chưa điền (người đứng tên)' }])
  })

  it.each([
    ['siteUrl', 'http://sino.example'],
    ['siteUrl', 'https://sino.example/'],
    ['appUrl', 'app.sino.example'],
    ['contactEmail', 'lienhe.sino.example'],
    ['effectiveDate', '01/11/2026'],
    ['effectiveDate', '2026-02-30'],
  ] as const)('rejects %s = %s', (field, value) => {
    const problems = configProblems({ ...FULL_CONFIG, [field]: value })

    expect(problems.map((p) => p.field)).toEqual([field])
  })
})
