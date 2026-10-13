import { createCn } from 'cn/config'

/**
 * Joins class names; when two classes set the same thing, the later one wins (`cn('h-9', 'h-11')` gives `h-11`).
 * The merger must know our own theme names: without `popover` in the shadow scale it would read
 * `shadow-popover` as a shadow colour and keep it next to `shadow-none`.
 */
export const cn = createCn({ extend: { theme: { shadow: ['popover'] } } })
