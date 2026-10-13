import { describe, expect, it } from 'vitest'
import { PAGES } from '@/site/pages'
import { PREVIEW_SITE, PRODUCTION_SITE } from '@/test/configs'
import { hrefOf, links, prerendered, text } from '@/test/prerendered'

const LIMITED_USE =
  "Sino Messages' use and transfer to any other app of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements."
const POLICY_URL = 'https://developers.google.com/terms/api-services-user-data-policy'

const sectionIds = (doc: Document) => [...doc.querySelectorAll('main section[id]')].map((s) => s.id)

describe('the privacy policy', () => {
  const vi = prerendered('privacy', PRODUCTION_SITE).doc
  const en = prerendered('privacy-en', PRODUCTION_SITE).doc

  it('lives at /privacy in Vietnamese and /en/privacy in English', () => {
    expect(PAGES.find((p) => p.id === 'privacy')).toMatchObject({ path: '/privacy', file: 'privacy/index.html', lang: 'vi' })
    expect(PAGES.find((p) => p.id === 'privacy-en')).toMatchObject({
      path: '/en/privacy',
      file: 'en/privacy/index.html',
      lang: 'en',
    })
    expect(vi.documentElement.lang).toBe('vi')
    expect(en.documentElement.lang).toBe('en')
    expect(vi.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://sino.example/privacy')
    expect(en.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://sino.example/en/privacy')
  })

  it('names both languages in the head of each version', () => {
    for (const doc of [vi, en]) {
      const alternates = [...doc.querySelectorAll('link[rel="alternate"]')].map((l) => [
        l.getAttribute('hreflang'),
        l.getAttribute('href'),
      ])
      expect(alternates).toEqual([
        ['vi', 'https://sino.example/privacy'],
        ['en', 'https://sino.example/en/privacy'],
      ])
    }
  })

  it('links one version to the other', () => {
    expect(hrefOf(vi, 'English')).toBe('/en/privacy')
    expect(hrefOf(en, 'Tiếng Việt')).toBe('/privacy')
  })

  it('has the same sections, in the same order, in both languages, each in the table of contents', () => {
    expect(sectionIds(vi)).toEqual([
      'tom-tat',
      'pham-vi',
      'thu-thap',
      'su-dung',
      'nguoi-xem',
      'ben-thu-ba',
      'google',
      'luu-giu',
      'bao-mat',
      'quyen',
      'thay-doi',
      'lien-he',
    ])
    expect(sectionIds(en)).toEqual(sectionIds(vi))
    for (const doc of [vi, en]) {
      const toc = links(doc.querySelector('nav[data-slot="toc"]')).map(([, href]) => href)
      expect(toc).toEqual(sectionIds(doc).map((id) => `#${id}`))
    }
  })

  it('carries the Limited Use statement word for word, with the policy it points to', () => {
    for (const doc of [vi, en]) {
      const google = doc.getElementById('google')
      expect(text(google)).toContain(LIMITED_USE)
      expect([...(google?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))).toContain(POLICY_URL)
    }
  })

  it('says Google data is not used for ads, not sold and not used to train AI', () => {
    const viGoogle = text(vi.getElementById('google'))
    for (const phrase of ['quảng cáo', 'không bán', 'huấn luyện']) expect(viGoogle).toContain(phrase)
    const enGoogle = text(en.getElementById('google'))
    for (const phrase of ['advertising', 'do not sell', 'train']) expect(enGoogle).toContain(phrase)
  })

  it('lists each Google permission with its reason', () => {
    for (const doc of [vi, en]) {
      const scopes = [...(doc.getElementById('google')?.querySelectorAll('code') ?? [])].map(text)
      expect(scopes).toEqual(['openid', 'email', 'gmail.readonly', 'gmail.send'])
    }
  })

  it('says what happens on disconnect, and how to have everything deleted', () => {
    const keep = vi.getElementById('luu-giu')

    expect(text(keep)).toContain('thu hồi')
    expect(text(keep)).toContain('Thư đã lưu được giữ lại')
    expect(text(keep)).toContain('30 ngày')
    expect(links(keep)).toContainEqual(['lienhe@sino.example', 'mailto:lienhe@sino.example'])
    expect(text(en.getElementById('luu-giu'))).toContain('30 days')
  })

  it('names the owner, the contact address, the host and the date it takes effect', () => {
    expect(text(vi.getElementById('lien-he'))).toContain('Nguyễn Văn Thử')
    expect(links(vi.getElementById('lien-he'))).toContainEqual(['lienhe@sino.example', 'mailto:lienhe@sino.example'])
    expect(text(vi.getElementById('ben-thu-ba'))).toContain('Máy chủ thử ở Singapore')
    expect(text(vi.querySelector('main header'))).toContain('01/11/2026')
    expect(text(en.querySelector('main header'))).toContain('1 November 2026')
  })

  it.each(['Hẹn giờ gửi', 'Nhắc nhở', 'Xuất', 'Cài đặt', 'thông báo của trình duyệt', 'lịch hẹn', 'ghi chú gắn'])(
    'does not describe "%s", which Sino does not do yet',
    (phrase) => {
      expect(text(vi.querySelector('main'))).not.toContain(phrase)
    },
  )

  it('shows what is missing in a preview build and stays out of search', () => {
    const { doc } = prerendered('privacy', PREVIEW_SITE)

    expect(text(doc.getElementById('lien-he'))).toContain('[chưa điền: email liên hệ]')
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
  })
})
