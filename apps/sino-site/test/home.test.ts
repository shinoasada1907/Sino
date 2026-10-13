import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildInto, type BuiltSite } from './built-site.ts'
import { FULL_CONFIG } from './fixtures/configs.ts'

describe('home page', () => {
  let site: BuiltSite
  let doc: Document

  beforeAll(async () => {
    site = await buildInto('production', FULL_CONFIG)
    doc = await site.document('index.html')
  })
  afterAll(() => site.remove())

  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const links = (scope: Element | null) =>
    [...(scope?.querySelectorAll('a') ?? [])].map((a) => [text(a), a.getAttribute('href')])

  it('is the root of the site', () => {
    expect(site.fileFor('/')).toBe('index.html')
    expect(doc.title).toBe('Sino · Hộp thư chung cho Gmail và việc cần làm')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://sino.example/')
  })

  it('keeps the sections of the canvas, in order', () => {
    const ids = [...doc.querySelectorAll('main [id]')].map((el) => el.id).filter((id) => !id.startsWith('h-'))

    expect(ids).toEqual(['dau-trang', 'tinh-nang', 'ke-hoach', 'cach-hoat-dong', 'rieng-tu', 'cau-hoi'])
  })

  it('links to the privacy policy in the HTML itself', async () => {
    expect(await site.read('index.html')).toContain('href="/privacy"')
  })

  it('connects Gmail today and marks the other services as coming', () => {
    const providers = [...doc.querySelectorAll('.lp-strip .lp-prov')].map((p) => [
      text(p).replace(text(p.querySelector('.badge')), '').trim(),
      text(p.querySelector('.badge')),
    ])

    expect(providers).toEqual([
      ['Gmail', ''],
      ['Zalo', 'Sắp có'],
      ['Messenger', 'Sắp có'],
      ['Telegram', 'Sắp có'],
    ])
  })

  it('pictures only Gmail mail', () => {
    const sources = [...doc.querySelectorAll('.mrow .mrow-top .spec')].map(text)

    expect(sources.length).toBeGreaterThan(0)
    expect(new Set(sources)).toEqual(new Set(['Gmail']))
  })

  it('says each Google permission Sino asks for and why', () => {
    const privacy = doc.getElementById('rieng-tu')
    const scopes = [...(privacy?.querySelectorAll('.lp-scope') ?? [])].map((row) => ({
      scope: text(row.querySelector('code')),
      reason: text(row.querySelector('dd')),
    }))

    expect(scopes.map((s) => s.scope)).toEqual(['openid', 'email', 'gmail.readonly', 'gmail.send'])
    for (const s of scopes) expect(s.reason, s.scope).not.toBe('')
    expect(scopes[2].reason).toContain('hộp thư chung')
    expect(scopes[3].reason).toContain('khi bạn bấm Gửi')
    expect(links(privacy)).toContainEqual(['Đọc thêm trong Chính sách quyền riêng tư', '/privacy#google'])
    expect(text(privacy)).toContain('Limited Use')
  })

  it('marks every feature that is not ready yet', () => {
    const soon = [...doc.querySelectorAll('.is-soon')]

    expect(soon.length).toBeGreaterThan(0)
    for (const el of soon) expect(text(el.querySelector('.badge')), text(el)).toBe('Sắp có')
  })

  it.each([
    'Hẹn giờ gửi',
    'Tạm ẩn',
    'Thông báo trình duyệt',
    'Xuất hoặc xóa',
    'danh tính',
    'Nhắc nhở',
  ])('does not claim "%s", which Sino does not do yet', (phrase) => {
    expect(text(doc.body)).not.toContain(phrase)
  })

  it('answers the questions in <details>, the first one open', () => {
    const questions = [...doc.querySelectorAll('#cau-hoi details')]

    expect(questions.length).toBeGreaterThanOrEqual(5)
    expect(questions.map((q) => q.hasAttribute('open'))).toEqual(questions.map((_, i) => i === 0))
    for (const q of questions) {
      expect(text(q.querySelector('summary')), q.outerHTML).not.toBe('')
      expect(text(q.querySelector('.lp-a')), q.outerHTML).not.toBe('')
    }
  })

  it('opens the app from the calls to action', () => {
    expect(links(doc.querySelector('.lp-hero .lp-cta'))).toEqual([
      ['Mở Sino', 'https://app.sino.example/'],
      ['Xem cách hoạt động', '#cach-hoat-dong'],
    ])
    expect(links(doc.querySelector('.lp-band .lp-cta'))).toEqual([
      ['Mở Sino', 'https://app.sino.example/'],
      ['Đăng nhập', 'https://app.sino.example/login'],
    ])
  })
})
