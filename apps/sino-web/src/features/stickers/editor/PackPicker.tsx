import { useId } from 'react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import type { StickerPack } from '../stickers.types'
import type { PackChoice } from './useBatch'

const NONE = 'none'
const NEW = 'new'

/**
 * "Lưu vào bộ" of the batch (SP-10, spec sticker-upload-editor): the owner's packs, "Chưa xếp bộ", and "Bộ mới…", which
 * asks for a name; the pack is made when the batch is saved, before the first picture. A plain `<select>`, for the
 * keyboard, a screen reader and the picker of a phone. Why the pack could not be used is said under it (`error`).
 */
export function PackPicker({
  packs,
  value,
  error,
  disabled,
  onChange,
}: {
  packs: StickerPack[]
  value: PackChoice
  error: string | null
  disabled: boolean
  onChange: (choice: PackChoice) => void
}) {
  const field = useId()
  const selected = value.kind === 'existing' ? value.id : value.kind === 'new' ? NEW : NONE

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Label htmlFor={field}>Lưu vào bộ</Label>
        <select
          id={field}
          value={selected}
          disabled={disabled}
          aria-describedby={error ? `${field}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value
            onChange(next === NONE ? { kind: 'none' } : next === NEW ? { kind: 'new', name: '' } : { kind: 'existing', id: next })
          }}
          className="h-11 min-w-0 rounded-sm border border-border bg-surface px-3 text-sm text-foreground outline-none hover:border-border-strong focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-foreground/16 md:h-9"
        >
          {packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.name}
            </option>
          ))}
          <option value={NONE}>Chưa xếp bộ</option>
          <option value={NEW}>Bộ mới…</option>
        </select>
        {value.kind === 'new' && (
          <Input
            aria-label="Tên bộ mới"
            placeholder="Tên bộ mới"
            value={value.name}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => onChange({ kind: 'new', name: event.target.value })}
            className="min-w-40 flex-1 md:h-9"
          />
        )}
      </div>
      {error && (
        <p id={`${field}-error`} role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}
