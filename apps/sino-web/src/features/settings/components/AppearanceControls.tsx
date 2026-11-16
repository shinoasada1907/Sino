import { useId, useState } from 'react'
import { isValidHex } from '@/shared/theme/accentScale'
import { PALETTES, type Corners, type LightBackground, type Palette, type TextTone } from '@/shared/theme/appearance'
import { useTheme } from '@/shared/theme/themeContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'
import { Switch } from '@/shared/ui/switch'

/** The tiles of the palettes (canvas `Settings`): the light background, the accent and the dark background of each one. */
const PALETTE_TILES: Record<Palette, { label: string; bg: string; accent: string; dark: string }> = {
  SAKURA: { label: 'Anh đào', bg: '#FDF1F4', accent: '#CF3F6E', dark: '#1A1216' },
  SUNSET: { label: 'Hoàng hôn', bg: '#FDF5EE', accent: '#C25A12', dark: '#17110D' },
  MINT: { label: 'Bạc hà', bg: '#EFF8F5', accent: '#1C7F68', dark: '#0F1715' },
  LAVENDER: { label: 'Oải hương', bg: '#F4F1FC', accent: '#6A4FD0', dark: '#13111C' },
  MONO: { label: 'Đơn sắc', bg: '#F4F4F2', accent: '#1E1E1E', dark: '#0E0E0E' },
}

const CORNER_OPTIONS: { value: Corners; label: string }[] = [
  { value: 'SOFT', label: 'Mềm' },
  { value: 'COMPACT', label: 'Gọn' },
]

/** Five tiles, the chosen one pressed; picking one repaints the whole app at once. */
export function PaletteTiles() {
  const { appearance, chooseAppearance } = useTheme()
  return (
    <div role="group" aria-label="Bộ màu" className="grid grid-cols-3 gap-3 md:grid-cols-5">
      {PALETTES.map((palette) => {
        const tile = PALETTE_TILES[palette]
        return (
          <button
            key={palette}
            type="button"
            aria-pressed={appearance.palette === palette}
            onClick={() => chooseAppearance({ palette })}
            className="flex cursor-pointer flex-col gap-2.5 rounded-lg bg-surface p-2.5 text-left text-[13px] leading-[18px] font-bold text-foreground shadow-[inset_0_0_0_1.5px_var(--border)] outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:shadow-[inset_0_0_0_2px_var(--accent)]"
          >
            <span aria-hidden="true" className="flex h-16 flex-col justify-between overflow-hidden rounded-md p-2.5" style={{ background: tile.bg }}>
              <span className="flex gap-1">
                {[tile.accent, '#F3CF79', '#C6BCF8'].map((color) => (
                  <span key={color} className="block size-2 rounded-full" style={{ background: color }} />
                ))}
              </span>
              <span className="block h-1.5 w-3/4 rounded-full bg-black/12" />
              <span className="block h-3.5 w-10 rounded-full" style={{ background: tile.accent }} />
            </span>
            {tile.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A `#RRGGBB` that replaces the accent of the palette. Dragging or typing only changes the value in this control and the small
 * swatch beside it; the app, the browser's memory and the server change once, when "Áp dụng" is pressed (D-489).
 */
export function AccentColorControl() {
  const { appearance, chooseAppearance } = useTheme()
  const id = useId()
  const applied = appearance.accentColor ?? ''
  // With no own colour the picker shows the accent of the palette in use, not a fixed pink.
  const paletteAccent = PALETTE_TILES[appearance.palette].accent
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? applied
  const valid = isValidHex(text)
  const invalid = text !== '' && !valid
  const changed = draft !== null && draft.toUpperCase() !== applied.toUpperCase()

  function apply() {
    if (valid && changed) {
      chooseAppearance({ accentColor: text.toUpperCase() })
      setDraft(null)
    }
  }

  function clear() {
    setDraft(null)
    chooseAppearance({ accentColor: null })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="color"
          aria-label="Chọn màu nhấn"
          value={valid ? text.toUpperCase() : paletteAccent}
          onChange={(event) => setDraft(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        <Input
          id={id}
          aria-label="Màu nhấn riêng"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          placeholder={paletteAccent}
          maxLength={7}
          value={text}
          onChange={(event) => setDraft(event.target.value.trim())}
          className="w-32 font-mono"
        />
        <span
          data-slot="accent-preview"
          aria-hidden="true"
          className="size-6 shrink-0 rounded-full shadow-[0_0_0_3px_var(--surface),0_0_0_4px_var(--border-strong)]"
          style={{ background: valid ? text : 'var(--hover)' }}
        />
        <Button type="button" size="sm" disabled={!valid || !changed} onClick={apply}>
          Áp dụng
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={draft === null} onClick={() => setDraft(null)}>
          Hủy
        </Button>
        {appearance.accentColor && draft === null && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Dùng màu của bộ
          </Button>
        )}
      </div>
      {invalid && (
        <span id={`${id}-error`} role="alert" className="text-sm text-danger-ink">
          Mã màu không hợp lệ. Nhập dạng #RRGGBB, ví dụ #CF3F6E.
        </span>
      )}
    </div>
  )
}

export function CornersControl() {
  const { appearance, chooseAppearance } = useTheme()
  return (
    <Segmented
      label="Độ bo"
      value={appearance.corners}
      options={CORNER_OPTIONS}
      onChange={(corners) => chooseAppearance({ corners })}
      className="justify-self-start"
    />
  )
}

const TEXT_TONES: { value: TextTone; label: string }[] = [
  { value: 'TINTED', label: 'Theo bộ màu' },
  { value: 'NEUTRAL', label: 'Trung tính' },
]

const LIGHT_BACKGROUNDS: { value: LightBackground; label: string }[] = [
  { value: 'TINTED', label: 'Phớt màu' },
  { value: 'WHITE', label: 'Trắng' },
]

export function TextToneControl() {
  const { appearance, chooseAppearance } = useTheme()
  return (
    <Segmented label="Màu chữ" value={appearance.textTone} options={TEXT_TONES} onChange={(textTone) => chooseAppearance({ textTone })} className="justify-self-start" />
  )
}

/** Only the light theme has a white background; in the dark theme the choice is kept but changes nothing. */
export function LightBackgroundControl() {
  const { appearance, chooseAppearance } = useTheme()
  return (
    <Segmented
      label="Nền sáng"
      value={appearance.lightBackground}
      options={LIGHT_BACKGROUNDS}
      onChange={(lightBackground) => chooseAppearance({ lightBackground })}
      className="justify-self-start"
    />
  )
}

export function DecorationsControl() {
  const { appearance, chooseAppearance } = useTheme()
  return (
    <Switch
      aria-label="Họa tiết trang trí"
      checked={appearance.decorations}
      onCheckedChange={(decorations) => chooseAppearance({ decorations })}
    />
  )
}

/** The background picture of Tổng quan is not built yet: the tile says so and opens nothing (spec "Ảnh nền chưa có"). */
export function BackgroundSoon() {
  return (
    <span className="inline-flex h-10 items-center rounded-full bg-hover px-4 text-sm font-bold text-subtle-foreground" aria-disabled="true">
      Sắp có
    </span>
  )
}
