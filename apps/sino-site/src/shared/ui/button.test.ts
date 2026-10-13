import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

describe('buttonVariants', () => {
  it('keeps only the border colour of the variant, as the Button of sino-web does through cn', () => {
    const classes = buttonVariants({ variant: 'secondary' }).split(' ')

    expect(classes).toContain('border-border-strong')
    expect(classes).not.toContain('border-transparent')
  })

  it('lets a caller override a class', () => {
    expect(buttonVariants({ size: 'sm', className: 'h-11' }).split(' ')).not.toContain('h-9')
  })
})
