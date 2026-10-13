import { createCn } from 'cn/config'

/**
 * Joins class names; when two classes set the same thing, the later one wins (`cn('h-9', 'h-11')` gives `h-11`).
 * Copied from sino-web: the merger must know our own theme names (`shadow-popover`).
 */
export const cn = createCn({ extend: { theme: { shadow: ['popover'] } } })
