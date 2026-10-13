import type { Lang } from '@/site/pages'

/** Sections of the Sino Messages page, linked from its top bar (D-254). The page is in Vietnamese only. */
export const MESSAGES_SECTIONS = [
  { label: 'Tính năng', id: 'tinh-nang' },
  { label: 'Kế hoạch', id: 'ke-hoach' },
  { label: 'Cách hoạt động', id: 'cach-hoat-dong' },
  { label: 'Quyền riêng tư', id: 'rieng-tu' },
  { label: 'Câu hỏi', id: 'cau-hoi' },
] as const

/** The Sino products that run today; each gets a card on the brand page and a link in the family top bar (D-253). */
export const PRODUCTS = [{ name: 'Sino Messages', href: '/messages' }] as const

interface Chrome {
  familyNav: string
  openApp: string
  login: string
  openMenu: string
  tagline: string
  columns: { title: string; links: { label: string; href: string }[] }[]
  /** The name of this language, on the link from the other version (D-243). */
  languageName: string
}

const products = PRODUCTS.map((p) => ({ label: p.name, href: p.href }))

/** The words of the top bar and the footer in each language of the site. */
export const CHROME: Record<Lang, Chrome> = {
  vi: {
    familyNav: 'Sản phẩm Sino',
    openApp: 'Mở Sino Messages',
    login: 'Đăng nhập',
    openMenu: 'Mở menu',
    tagline: 'Ứng dụng gọn cho việc mỗi ngày.',
    columns: [
      { title: 'SẢN PHẨM', links: products },
      {
        title: 'TIN CẬY',
        links: [
          { label: 'Bảo mật', href: '/security' },
          { label: 'Câu hỏi thường gặp', href: '/messages#cau-hoi' },
        ],
      },
      {
        title: 'PHÁP LÝ',
        links: [
          { label: 'Điều khoản', href: '/terms' },
          { label: 'Chính sách quyền riêng tư', href: '/privacy' },
          { label: 'Phần mềm nguồn mở', href: '/open-source' },
        ],
      },
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
      {
        title: 'TRUST',
        links: [
          { label: 'Security', href: '/security' },
          { label: 'FAQ', href: '/messages#cau-hoi' },
        ],
      },
      {
        title: 'LEGAL',
        links: [
          { label: 'Terms of service', href: '/en/terms' },
          { label: 'Privacy policy', href: '/en/privacy' },
          { label: 'Open source', href: '/open-source' },
        ],
      },
    ],
    languageName: 'English',
  },
}
