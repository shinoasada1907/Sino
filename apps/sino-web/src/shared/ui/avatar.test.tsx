import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './avatar'

const PICTURE = 'https://s120-ava-talk.zadn.vn/a/b/c/1/1/abc.jpg'
const ANOTHER = 'https://s120-ava-talk.zadn.vn/a/b/c/2/2/xyz.jpg'

// An `<img alt="">` has the role `presentation`, so the tests reach it through the circle.
const circle = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-slot="avatar"]')!
const picture = (container: HTMLElement) => container.querySelector('img')

describe('Avatar (zalo-avatars, D-412)', () => {
  it('draws the placeholder circle alone when there is no picture', () => {
    const { container, rerender } = render(<Avatar placeholder="c" />)

    expect(picture(container)).toBeNull()
    expect(circle(container)).toHaveClass('rounded-full')

    rerender(<Avatar placeholder="c" src={null} />)
    expect(picture(container)).toBeNull()
    rerender(<Avatar placeholder="c" src="" />)
    expect(picture(container)).toBeNull()
  })

  it('covers the circle with the picture and keeps the placeholder under it', () => {
    const { container } = render(<Avatar placeholder="b" src={PICTURE} className="size-7" />)

    const image = picture(container)!
    expect(image).toHaveAttribute('src', PICTURE)
    expect(image.parentElement).toBe(circle(container))
    expect(image).toHaveClass('absolute', 'inset-0', 'size-full', 'rounded-full', 'object-cover')
    // The circle keeps its size and its placeholder: it shows while the picture loads and when it fails.
    expect(circle(container)).toHaveClass('size-7', 'rounded-full')
    expect(circle(container).className).toContain('conic-gradient')
  })

  it('is decoration, loads without a referrer, lazily and off the main thread (D-408)', () => {
    const { container } = render(<Avatar src={PICTURE} />)

    const image = picture(container)!
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
  })

  it('takes the picture out when it fails to load, so no broken-picture icon shows, and keeps the placeholder', () => {
    const { container } = render(<Avatar placeholder="d" src={PICTURE} />)

    fireEvent.error(picture(container)!)

    expect(picture(container)).toBeNull()
    expect(circle(container)).toBeInTheDocument()
    expect(circle(container).className).toContain('linear-gradient(160deg')
  })

  it('tries a new address after one failed, and does not try the failed one again', () => {
    const { container, rerender } = render(<Avatar src={PICTURE} />)
    fireEvent.error(picture(container)!)

    rerender(<Avatar src={PICTURE} />)
    expect(picture(container)).toBeNull()

    rerender(<Avatar src={ANOTHER} />)
    expect(picture(container)).toHaveAttribute('src', ANOTHER)
  })

  it('keeps what the caller puts inside, such as the provider mark of an account, above the picture', () => {
    const { container } = render(
      <Avatar src={PICTURE}>
        <span data-testid="mark" />
      </Avatar>,
    )

    const children = Array.from(circle(container).children)
    expect(children.map((child) => child.tagName)).toEqual(['IMG', 'SPAN'])
  })
})
