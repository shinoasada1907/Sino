import { describe, expect, it } from 'vitest'
import favicon from '../../../public/favicon.svg?raw'
import faviconUnread from '../../../public/favicon-unread.svg?raw'

// The two icons of the tab (D-317) are files a browser parses as XML on its own: a file that is not well-formed is not drawn
// at all, and the tab shows no icon exactly when there is news. The unit tests of the hook cannot see that. `?raw` hands
// the test the text of the file itself, so that it needs neither Node's `fs` nor a working folder.
const ICONS = { 'favicon.svg': favicon, 'favicon-unread.svg': faviconUnread }

function parse(name: keyof typeof ICONS) {
  const svg = new DOMParser().parseFromString(ICONS[name], 'image/svg+xml')
  return { svg, errors: svg.getElementsByTagName('parsererror') }
}

describe('the icons of the browser tab (D-317)', () => {
  it.each(Object.keys(ICONS) as (keyof typeof ICONS)[])('%s is well-formed XML', (name) => {
    const { svg, errors } = parse(name)

    expect(errors).toHaveLength(0)
    expect(svg.documentElement.tagName).toBe('svg')
  })

  it('draws the dot on the unread icon only', () => {
    expect(parse('favicon-unread.svg').svg.getElementsByTagName('circle')).toHaveLength(1)
    expect(parse('favicon.svg').svg.getElementsByTagName('circle')).toHaveLength(0)
  })

  it('keeps the mark of Sino as it is on the unread icon', () => {
    const marks = (name: keyof typeof ICONS) => [...parse(name).svg.querySelectorAll('path, rect')].map((node) => node.outerHTML)

    expect(marks('favicon-unread.svg')).toEqual(marks('favicon.svg'))
  })
})
