/** Sections of the home page, linked from the top bar of every page (D-244). */
export const SECTIONS = [
  { label: 'Tính năng', id: 'tinh-nang' },
  { label: 'Kế hoạch', id: 'ke-hoach' },
  { label: 'Cách hoạt động', id: 'cach-hoat-dong' },
  { label: 'Quyền riêng tư', id: 'rieng-tu' },
  { label: 'Câu hỏi', id: 'cau-hoi' },
] as const

export const FOOTER_COLUMNS = [
  {
    title: 'SẢN PHẨM',
    links: [
      { label: 'Tính năng', href: '/#tinh-nang' },
      { label: 'Kế hoạch', href: '/#ke-hoach' },
      { label: 'Cách hoạt động', href: '/#cach-hoat-dong' },
    ],
  },
  {
    title: 'TIN CẬY',
    links: [
      { label: 'Quyền riêng tư', href: '/#rieng-tu' },
      { label: 'Bảo mật', href: '/security' },
      { label: 'Câu hỏi thường gặp', href: '/#cau-hoi' },
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
] as const
