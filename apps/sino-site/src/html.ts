/** Markup that is already safe to write into a page. */
export class Html {
  readonly value: string

  constructor(value: string) {
    this.value = value
  }

  toString(): string {
    return this.value
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/** Trusted markup written by this site, such as an SVG icon. */
export function raw(markup: string): Html {
  return new Html(markup)
}

/**
 * Builds markup: text values are escaped, {@link Html} values are kept, lists are joined, and null, undefined and
 * false write nothing.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  return new Html(strings.reduce((out, part, i) => out + part + (i < values.length ? render(values[i]) : ''), ''))
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (value instanceof Html) return value.value
  if (Array.isArray(value)) return value.map(render).join('')
  return escapeHtml(String(value))
}
