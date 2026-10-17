// Copied from apps/sino-site/src/layout/nav.ts (web-public-pages, D-312), with the links of sino-web (D-311).

export type Lang = 'vi' | 'en'

/** Which top bar a page has (sino-site D-254): the sections of Sino Messages, or the products of the Sino family. */
export type NavKind = 'product' | 'family'

/** Sections of the Sino Messages page at `/`, linked from its top bar. The page is in Vietnamese only. */
export const MESSAGES_SECTIONS = [
  { label: 'Tính năng', id: 'tinh-nang' },
  { label: 'Kế hoạch', id: 'ke-hoach' },
  { label: 'Cách hoạt động', id: 'cach-hoat-dong' },
  { label: 'Quyền riêng tư', id: 'rieng-tu' },
  { label: 'Câu hỏi', id: 'cau-hoi' },
] as const

/** The Sino products that run today: in sino-web, Sino Messages is the page at `/`. */
export const PRODUCTS = [{ name: 'Sino Messages', href: '/' }] as const

interface Chrome {
  familyNav: string
  openApp: string
  login: string
  openMenu: string
  tagline: string
  /** Only pages sino-web has (D-311): terms, security and open source come with SI-04 and SI-05. */
  columns: { title: string; links: { label: string; href: string }[] }[]
  /** The name of this language, on the link from the other version. */
  languageName: string
}

const products = PRODUCTS.map((p) => ({ label: p.name, href: p.href }))

/** The words of the top bar and the footer in each language. */
export const CHROME: Record<Lang, Chrome> = {
  vi: {
    familyNav: 'Sản phẩm Sino',
    openApp: 'Mở Sino Messages',
    login: 'Đăng nhập',
    openMenu: 'Mở menu',
    tagline: 'Ứng dụng gọn cho việc mỗi ngày.',
    columns: [
      { title: 'SẢN PHẨM', links: products },
      { title: 'TIN CẬY', links: [{ label: 'Câu hỏi thường gặp', href: '/#cau-hoi' }] },
      { title: 'PHÁP LÝ', links: [{ label: 'Chính sách quyền riêng tư', href: '/privacy' }] },
    ],
    languageName: 'Tiếng Việt',
  },
  en: {
    familyNav: 'Sino products',
    openApp: 'Open Sino Messages',
    login: 'Sign in',
    openMenu: 'Open menu',
    tagline: 'Small apps for everyday things.',
    columns: [
      { title: 'PRODUCTS', links: products },
      { title: 'TRUST', links: [{ label: 'FAQ', href: '/#cau-hoi' }] },
      { title: 'LEGAL', links: [{ label: 'Privacy policy', href: '/en/privacy' }] },
    ],
    languageName: 'English',
  },
}
