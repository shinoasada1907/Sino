import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SiteProvider } from '@/site/SiteProvider'
import { PRODUCTION_SITE } from '@/test/configs'
import { SiteHeader } from './SiteHeader'

function renderHeader(nav: 'product' | 'family') {
  return render(
    <SiteProvider site={PRODUCTION_SITE}>
      <SiteHeader nav={nav} />
    </SiteProvider>,
  )
}

describe('SiteHeader', () => {
  it('closes the phone menu when a link in it is followed', async () => {
    const user = userEvent.setup()
    const { container } = renderHeader('product')
    const menu = container.querySelector('details')!
    menu.open = true

    await user.click(within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Kế hoạch' }))

    expect(menu.open).toBe(false)
  })

  it('lists the products in the phone menu of a family page', () => {
    renderHeader('family')

    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getByRole('link', { name: 'Sino Messages' })).toHaveAttribute('href', '/messages')
    expect(within(menu).queryByRole('link', { name: 'Kế hoạch' })).toBeNull()
  })
})
