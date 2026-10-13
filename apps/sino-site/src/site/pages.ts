export type PageId = 'home' | 'not-found'

export type Lang = 'vi' | 'en'

/** One page of the site: where it lives and what its <head> says. */
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
}

export const PAGES: PageMeta[] = [
  {
    id: 'home',
    path: '/',
    file: 'index.html',
    lang: 'vi',
    title: 'Sino · Hộp thư chung cho Gmail và việc cần làm',
    description:
      'Sino gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và giữ việc cần làm ở cùng một chỗ.',
    indexable: true,
  },
  {
    id: 'not-found',
    path: '/404',
    file: '404.html',
    lang: 'vi',
    title: 'Không tìm thấy trang · Sino',
    description: 'Trang này không có trên site của Sino.',
    indexable: false,
  },
]

export function pageById(id: PageId): PageMeta {
  const page = PAGES.find((p) => p.id === id)
  if (!page) throw new Error(`Unknown page: ${id}`)
  return page
}

/** The page `pnpm dev` shows for a URL; anything unknown gets the 404 page, as on a static host. */
export function pageForPath(path: string): PageMeta {
  const trimmed = path.replace(/\/index\.html$/, '').replace(/(.)\/+$/, '$1')
  return PAGES.find((p) => p.path === trimmed) ?? pageById('not-found')
}
