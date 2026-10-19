import { useEffect } from 'react'

const TITLE = 'Sino'
const ICON = '/favicon.svg'
const ICON_UNREAD = '/favicon-unread.svg'
const MOST = 99

/**
 * The mark on the browser tab (D-317): "(3) Sino" and an icon with a dot while something is unread, so that a tab nobody
 * looks at still says there is news. `undefined` is "the count has not arrived": the title and icon of index.html stay.
 * What the page had is given back when the count changes and when the app is left (sign-out), so a page outside the app
 * (the public pages put their own title) never keeps the mark. Only the app shell calls it; a page of the app that sets
 * `document.title` itself would be overwritten at the next change of the count.
 */
export function useTabUnread(total: number | undefined) {
  useEffect(() => {
    if (total === undefined) {
      return
    }
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const before = { title: document.title, href: icon?.getAttribute('href') ?? null }
    document.title = total > 0 ? `(${total > MOST ? `${MOST}+` : total}) ${TITLE}` : TITLE
    icon?.setAttribute('href', total > 0 ? ICON_UNREAD : ICON)
    return () => {
      document.title = before.title
      if (before.href !== null) {
        icon?.setAttribute('href', before.href)
      }
    }
  }, [total])
}
