import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubOsColorScheme as osPrefers } from '@/test/matchMedia'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

const toLight = { name: 'Chuyển sang giao diện sáng' }

function openApp() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

function blockStorage() {
  const blocked = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
}

const html = document.documentElement

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    html.className = ''
  })

  it('follows a dark OS setting on the first visit', () => {
    osPrefers('dark')

    openApp()

    expect(html).toHaveClass('theme-dark')
    expect(screen.getByRole('button', toLight)).toBeInTheDocument()
  })

  it('follows a light OS setting on the first visit', () => {
    osPrefers('light')

    openApp()

    expect(html).toHaveClass('theme-light')
    expect(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' })).toBeInTheDocument()
  })

  it('uses the light theme when the test environment states no OS preference', () => {
    openApp()

    expect(html).toHaveClass('theme-light')
  })

  it('keeps the chosen theme after a reload', async () => {
    osPrefers('dark')
    const firstVisit = openApp()

    await userEvent.click(screen.getByRole('button', toLight))

    expect(html).toHaveClass('theme-light')
    expect(html).not.toHaveClass('theme-dark')
    expect(localStorage.getItem('sino.theme')).toBe('light')

    firstVisit.unmount()
    html.className = ''
    openApp()

    expect(html).toHaveClass('theme-light')
  })

  it('still works when the browser blocks local storage', async () => {
    osPrefers('dark')
    blockStorage()

    openApp()
    expect(html).toHaveClass('theme-dark')

    await userEvent.click(screen.getByRole('button', toLight))
    expect(html).toHaveClass('theme-light')
  })

  it('ignores a stored value that is not a theme', () => {
    osPrefers('dark')
    localStorage.setItem('sino.theme', 'blue')

    openApp()

    expect(html).toHaveClass('theme-dark')
    expect(html).not.toHaveClass('theme-blue')
  })
})
