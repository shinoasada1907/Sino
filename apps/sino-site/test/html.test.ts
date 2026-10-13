import { describe, expect, it } from 'vitest'
import { escapeHtml, html, raw } from '../src/html.ts'

describe('escapeHtml', () => {
  it('escapes the characters that end text or an attribute', () => {
    expect(escapeHtml(`A & B <b> "c" 'd'`)).toBe('A &amp; B &lt;b&gt; &quot;c&quot; &#39;d&#39;')
  })
})

describe('html', () => {
  it('escapes interpolated text but keeps nested markup', () => {
    const name = 'Tom & <Jerry>'
    const inner = html`<b>${name}</b>`

    expect(html`<p>${inner}</p>`.value).toBe('<p><b>Tom &amp; &lt;Jerry&gt;</b></p>')
  })

  it('joins lists and leaves out null, undefined and false', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`)

    expect(html`<ul>${items}${null}${undefined}${false}</ul>`.value).toBe('<ul><li>a</li><li>b</li></ul>')
  })

  it('takes raw markup as it is', () => {
    expect(html`${raw('<svg></svg>')}`.value).toBe('<svg></svg>')
  })
})
