import { describe, expect, it } from 'vitest'
import { PAGES } from '@/site/pages'
import { PRODUCTION_SITE } from '@/test/configs'
import { hrefOf, links, prerendered, text } from '@/test/prerendered'

describe('the Sino Messages page', () => {
  const { html, doc } = prerendered('messages', PRODUCTION_SITE)

  it('lives at /messages, the App home page declared to Google, indexed under the site domain', () => {
    expect(PAGES.find((p) => p.id === 'messages')).toMatchObject({ path: '/messages', file: 'messages/index.html' })
    expect(doc.title).toBe('Sino Messages · Hộp thư chung cho Gmail và việc cần làm')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://sino.example/messages')
    expect(doc.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('keeps the sections of the canvas, in order', () => {
    const ids = [...doc.querySelectorAll('main [id]')].map((el) => el.id).filter((id) => !id.startsWith('h-'))

    expect(ids).toEqual(['dau-trang', 'tinh-nang', 'ke-hoach', 'cach-hoat-dong', 'rieng-tu', 'cau-hoi'])
  })

  it('links to the privacy policy in the HTML itself', () => {
    expect(html).toContain('href="/privacy"')
  })

  it('connects Gmail today and marks the other services as coming', () => {
    const providers = [...doc.querySelectorAll('[data-slot="provider"]')].map((p) => [
      text(p).replace(text(p.querySelector('[data-slot="badge"]')), '').trim(),
      text(p.querySelector('[data-slot="badge"]')),
    ])

    expect(providers).toEqual([
      ['Gmail', ''],
      ['Zalo', 'Sắp có'],
      ['Messenger', 'Sắp có'],
      ['Telegram', 'Sắp có'],
    ])
  })

  it('pictures only Gmail mail', () => {
    const sources = [...doc.querySelectorAll('[data-slot="mail-row"] [data-slot="mail-source"]')].map(text)

    expect(sources.length).toBeGreaterThan(0)
    expect(new Set(sources)).toEqual(new Set(['Gmail']))
  })

  it('says each Google permission Sino asks for and why', () => {
    const privacy = doc.getElementById('rieng-tu')
    const scopes = [...(privacy?.querySelectorAll('[data-slot="scope"]') ?? [])].map((row) => ({
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
    const soon = [...doc.querySelectorAll('[data-soon]')]

    expect(soon.length).toBeGreaterThan(0)
    for (const el of soon) expect(text(el.querySelector('[data-slot="badge"]')), text(el)).toBe('Sắp có')
  })

  it.each(['Hẹn giờ gửi', 'Tạm ẩn', 'Thông báo trình duyệt', 'Xuất hoặc xóa', 'danh tính', 'Nhắc nhở'])(
    'does not claim "%s", which Sino does not do yet',
    (phrase) => {
      expect(text(doc.body)).not.toContain(phrase)
    },
  )

  it('answers the questions in <details>, the first one open', () => {
    const questions = [...doc.querySelectorAll('#cau-hoi details')]

    expect(questions.length).toBeGreaterThanOrEqual(5)
    expect(questions.map((q) => q.hasAttribute('open'))).toEqual(questions.map((_, i) => i === 0))
    for (const q of questions) {
      expect(text(q.querySelector('summary')), q.outerHTML).not.toBe('')
      expect(text(q.querySelector('p')), q.outerHTML).not.toBe('')
    }
  })

  it('opens the app from the calls to action', () => {
    expect(links(doc.querySelector('#dau-trang [data-slot="cta"]'))).toEqual([
      ['Mở Sino Messages', 'https://app.sino.example/'],
      ['Xem cách hoạt động', '#cach-hoat-dong'],
    ])
    expect(links(doc.querySelector('[aria-label="Bắt đầu"] [data-slot="cta"]'))).toEqual([
      ['Mở Sino Messages', 'https://app.sino.example/'],
      ['Đăng nhập', 'https://app.sino.example/login'],
    ])
  })

  it('takes the product top bar: the sections of this page and the app', () => {
    const nav = doc.querySelector('header nav[aria-label="Các mục của Sino Messages"]')

    expect(links(nav)).toEqual([
      ['Tính năng', '/messages#tinh-nang'],
      ['Kế hoạch', '/messages#ke-hoach'],
      ['Cách hoạt động', '/messages#cach-hoat-dong'],
      ['Quyền riêng tư', '/messages#rieng-tu'],
      ['Câu hỏi', '/messages#cau-hoi'],
    ])
    expect(hrefOf(doc, 'Đăng nhập')).toBe('https://app.sino.example/login')
  })

  it('hides nothing in the HTML, so it reads the same before and without JavaScript', () => {
    for (const el of doc.querySelectorAll('[style]')) {
      expect(el.getAttribute('style'), el.outerHTML.slice(0, 120)).not.toMatch(/opacity:\s*0|visibility:\s*hidden/)
    }
  })
})
