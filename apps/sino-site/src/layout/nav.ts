/** Sections of the Sino Messages page, linked from its top bar (D-254). */
export const MESSAGES_SECTIONS = [
  { label: 'Tính năng', id: 'tinh-nang' },
  { label: 'Kế hoạch', id: 'ke-hoach' },
  { label: 'Cách hoạt động', id: 'cach-hoat-dong' },
  { label: 'Quyền riêng tư', id: 'rieng-tu' },
  { label: 'Câu hỏi', id: 'cau-hoi' },
] as const

/** The Sino products that run today; each gets a card on the brand page and a link in the family top bar (D-253). */
export const PRODUCTS = [{ name: 'Sino Messages', href: '/messages' }] as const

export const FOOTER_COLUMNS = [
  {
    title: 'SẢN PHẨM',
    links: PRODUCTS.map((p) => ({ label: p.name, href: p.href })),
  },
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
]
