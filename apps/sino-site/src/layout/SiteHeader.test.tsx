import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SiteProvider } from '@/site/SiteProvider'
import { PRODUCTION_SITE } from '@/test/configs'
import { SiteHeader } from './SiteHeader'

describe('SiteHeader', () => {
  it('closes the phone menu when a link in it is followed', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <SiteProvider site={PRODUCTION_SITE}>
        <SiteHeader />
      </SiteProvider>,
    )
    const menu = container.querySelector('details')!
    menu.open = true

    await user.click(within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('link', { name: 'Kế hoạch' }))

    expect(menu.open).toBe(false)
  })
})
