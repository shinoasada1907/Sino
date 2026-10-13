export type PageId = 'brand' | 'messages' | 'privacy' | 'privacy-en' | 'not-found'

export type Lang = 'vi' | 'en'

/** Which top bar a page has (D-254): the sections of Sino Messages, or the products of the Sino family. */
export type NavKind = 'product' | 'family'

/** One page of the site: where it lives, what its <head> says and which top bar it has. */
export interface PageMeta {
  id: PageId
  /** URL path, such as "/privacy". */
  path: string
  /** Where the build writes it in dist/, such as "privacy/index.html". */
  file: string
  lang: Lang
  title: string
  description: string
  /** False for the 404 page: no canonical URL and kept out of search results. */
  indexable: boolean
  nav: NavKind
  /** The same page in the other language (D-243): `hreflang` in the head, a language link in the footer. */
  alternate?: PageId
}

export const PAGES: PageMeta[] = [
  {
    id: 'brand',
    path: '/',
    file: 'index.html',
    lang: 'vi',
    title: 'Sino · Ứng dụng gọn cho việc mỗi ngày',
    description: 'Sino làm những ứng dụng nhỏ, làm đúng một việc và giữ dữ liệu của bạn riêng tư. Ứng dụng đầu tiên: Sino Messages.',
    indexable: true,
    nav: 'family',
  },
  {
    // The App home page declared to Google for Sino Messages (D-253).
    id: 'messages',
    path: '/messages',
    file: 'messages/index.html',
    lang: 'vi',
    title: 'Sino Messages · Hộp thư chung cho Gmail và việc cần làm',
    description:
      'Sino Messages gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và giữ việc cần làm ở cùng một chỗ.',
    indexable: true,
    nav: 'product',
  },
  {
    // The Privacy policy declared to Google (D-253); shared by the Sino family.
    id: 'privacy',
    path: '/privacy',
    file: 'privacy/index.html',
    lang: 'vi',
    title: 'Chính sách quyền riêng tư · Sino',
    description: 'Sino lưu dữ liệu gì, dùng để làm gì, ai được xem, giữ bao lâu và bạn xóa thế nào.',
    indexable: true,
    nav: 'family',
    alternate: 'privacy-en',
  },
  {
    id: 'privacy-en',
    path: '/en/privacy',
    file: 'en/privacy/index.html',
    lang: 'en',
    title: 'Privacy policy · Sino',
    description: 'What Sino stores, what it uses it for, who can see it, how long it is kept and how you delete it.',
    indexable: true,
    nav: 'family',
    alternate: 'privacy',
  },
  {
    id: 'not-found',
    path: '/404',
    file: '404.html',
    lang: 'vi',
    title: 'Không tìm thấy trang · Sino',
    description: 'Trang này không có trên site của Sino.',
    indexable: false,
    nav: 'family',
  },
]

export function pageById(id: PageId): PageMeta {
  const page = PAGES.find((p) => p.id === id)
  if (!page) throw new Error(`Unknown page: ${id}`)
  return page
}

/** The page `pnpm dev` shows for a URL; anything unknown gets the 404 page, as on a static host. */
export function pageForPath(path: string): PageMeta {
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/(.)\/+$/, '$1')
  return PAGES.find((p) => p.path === trimmed) ?? pageById('not-found')
}
