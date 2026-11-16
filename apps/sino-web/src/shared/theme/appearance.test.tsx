import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AccentColorControl, CornersControl, DecorationsControl, LightBackgroundControl, PaletteTiles, TextToneControl } from '@/features/settings/components/AppearanceControls'
import { DEFAULT_APPEARANCE, readSavedAppearance, saveAppearance } from './appearance'
import { ThemeProvider } from './ThemeProvider'

const root = document.documentElement

function renderControls() {
  return render(
    <ThemeProvider>
      <PaletteTiles />
      <AccentColorControl />
      <CornersControl />
      <DecorationsControl />
      <TextToneControl />
      <LightBackgroundControl />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  root.className = ''
  root.removeAttribute('style')
})

describe('appearance (fe-ui-sunset, D-491)', () => {
  it('opens in Anh đào with no palette class', () => {
    renderControls()
    expect(root.className).not.toMatch(/pal-/)
    expect(screen.getByRole('button', { name: 'Anh đào' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts the palette class on <html> at once and remembers the choice', async () => {
    renderControls()
    await userEvent.click(screen.getByRole('button', { name: 'Bạc hà' }))
    expect(root).toHaveClass('pal-mint')
    expect(readSavedAppearance()).toMatchObject({ palette: 'MINT' })
    await userEvent.click(screen.getByRole('button', { name: 'Anh đào' }))
    expect(root).not.toHaveClass('pal-mint')
  })

  it('opens already in the remembered look, with no flash of the default', () => {
    saveAppearance({ ...DEFAULT_APPEARANCE, palette: 'LAVENDER', corners: 'COMPACT', decorations: false })
    renderControls()
    expect(root).toHaveClass('pal-lavender', 'corners-compact', 'no-decor')
  })

  it('switches corners and decorations', async () => {
    renderControls()
    await userEvent.click(screen.getByRole('button', { name: 'Gọn' }))
    expect(root).toHaveClass('corners-compact')
    await userEvent.click(screen.getByRole('switch', { name: 'Họa tiết trang trí' }))
    expect(root).toHaveClass('no-decor')
  })

  it('only keeps a dragged or typed accent in the control until "Áp dụng" (no repaint, no memory)', async () => {
    renderControls()
    const field = screen.getByRole('textbox', { name: 'Màu nhấn riêng' })
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled()
    await userEvent.type(field, '#FFE4EE')

    expect(root.style.getPropertyValue('--accent')).toBe('')
    expect(readSavedAppearance()).toBeNull()
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Áp dụng' }).closest('div')!.querySelector('[data-slot="accent-preview"]')).toHaveStyle({ background: '#FFE4EE' })
  })

  it('"Áp dụng" writes the accent as variables, scaled to be readable, and remembers it', async () => {
    renderControls()
    await userEvent.type(screen.getByRole('textbox', { name: 'Màu nhấn riêng' }), '#FFE4EE')
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))

    expect(root.style.getPropertyValue('--accent')).not.toBe('')
    expect(root.style.getPropertyValue('--accent').toUpperCase()).not.toBe('#FFE4EE')
    expect(readSavedAppearance()?.accentColor).toBe('#FFE4EE')
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled()
  })

  it('"Hủy" gives back the colour in use', async () => {
    renderControls()
    const field = screen.getByRole('textbox', { name: 'Màu nhấn riêng' })
    await userEvent.type(field, '#6A4FD0')
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))
    await userEvent.clear(field)
    await userEvent.type(field, '#112233')
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))

    expect(field).toHaveValue('#6A4FD0')
    expect(readSavedAppearance()?.accentColor).toBe('#6A4FD0')
  })

  it('reports a wrong code and keeps "Áp dụng" off', async () => {
    renderControls()
    await userEvent.type(screen.getByRole('textbox', { name: 'Màu nhấn riêng' }), 'hồng')
    expect(screen.getByRole('alert')).toHaveTextContent('không hợp lệ')
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeDisabled()
    expect(root.style.getPropertyValue('--accent')).toBe('')
  })

  it('goes back to the colour of the palette when the own accent is cleared', async () => {
    renderControls()
    await userEvent.type(screen.getByRole('textbox', { name: 'Màu nhấn riêng' }), '#6A4FD0')
    await userEvent.click(screen.getByRole('button', { name: 'Áp dụng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dùng màu của bộ' }))
    expect(root.style.getPropertyValue('--accent')).toBe('')
    expect(readSavedAppearance()?.accentColor).toBeNull()
  })

  it('puts text-neutral and light-white on <html> from the two new choices', async () => {
    renderControls()
    await userEvent.click(screen.getByRole('button', { name: 'Trung tính' }))
    expect(root).toHaveClass('text-neutral')
    await userEvent.click(screen.getByRole('button', { name: 'Trắng' }))
    expect(root).toHaveClass('light-white')
    expect(readSavedAppearance()).toMatchObject({ textTone: 'NEUTRAL', lightBackground: 'WHITE' })
    await userEvent.click(screen.getByRole('button', { name: 'Theo bộ màu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Phớt màu' }))
    expect(root).not.toHaveClass('text-neutral')
    expect(root).not.toHaveClass('light-white')
  })

  it('still opens a look saved before the two newer choices existed', () => {
    window.localStorage.setItem('sino.appearance', JSON.stringify({ palette: 'MINT', accentColor: null, corners: 'SOFT', decorations: true }))
    renderControls()
    expect(root).toHaveClass('pal-mint')
    expect(root).not.toHaveClass('text-neutral')
  })
})
