import { FolderInput } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { StickerItem, StickerPack } from './stickers.types'

/** The value of "Chưa xếp bộ" among the choices; the id of a pack is a UUID, never this. */
const NO_PACK = 'none'

/**
 * "Chuyển … sang bộ khác" on a sticker (SP-06): a menu of the packs and "Chưa xếp bộ", the pack of the sticker checked. A
 * menu of Radix, so it opens with Enter, Space or the arrow keys and gives the focus back to its button on Esc. Choosing
 * where the sticker already is sends nothing. After a move the sticker is in another part of the screen, as a new cell: the
 * screen asks that cell to take the focus on its button (`focus`), and hears when it has (`onFocused`).
 */
export function MoveStickerMenu({
  sticker,
  packs,
  pending,
  onChoose,
  focus,
  onFocused,
  className,
}: {
  sticker: StickerItem
  packs: StickerPack[]
  pending: boolean
  onChoose: (packId: string | null) => void
  focus: boolean
  onFocused: () => void
  className?: string
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  // A sticker of a pack the screen does not know is shown in "Chưa xếp bộ", and checked there.
  const current = sticker.packId !== null && packs.some((pack) => pack.id === sticker.packId) ? sticker.packId : NO_PACK

  useEffect(() => {
    if (focus) {
      trigger.current?.focus()
      onFocused()
    }
  }, [focus, onFocused])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={`Chuyển ${sticker.name} sang bộ khác`}
          disabled={pending}
          className={className}
        >
          <FolderInput strokeWidth={1.6} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Chuyển tới</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            if (value !== current) {
              onChoose(value === NO_PACK ? null : value)
            }
          }}
        >
          {packs.map((pack) => (
            <DropdownMenuRadioItem key={pack.id} value={pack.id}>
              <span className="truncate">{pack.name}</span>
            </DropdownMenuRadioItem>
          ))}
          {packs.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuRadioItem value={NO_PACK}>Chưa xếp bộ</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
