import { Maximize } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import type { BlockColor } from '../notes.types'
import { COLOR_NAMES, SWATCH } from './blockColors'

const SWATCH_BOX = 'grid size-3.5 shrink-0 place-items-center rounded-[4px] border border-border-strong'

/** Where the menu opens, in px from the top-left corner of the canvas. */
export interface MenuSpot {
  left: number
  top: number
}

/**
 * "THÊM Ô", opened by a right click (a long press on a phone) on empty ground (D-207): a block of words, a main block,
 * a block of each colour, all where the ground was pressed, and "Vừa màn hình". It hangs on an invisible point at `spot`.
 */
export function AddMenu({
  open,
  spot,
  onClose,
  onAdd,
  onFit,
}: {
  open: boolean
  spot: MenuSpot
  onClose: () => void
  onAdd: (block: { color?: BlockColor; main?: boolean }) => void
  onFit: () => void
}) {
  // The block is added once the menu has let go of the cursor: the menu keeps it while open, and the new block wants it.
  const chosen = useRef<(() => void) | null>(null)
  const choose = (action: () => void) => () => {
    chosen.current = action
  }
  return (
    <DropdownMenu open={open} onOpenChange={(next) => !next && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="pointer-events-none absolute size-px" style={spot} />
      </DropdownMenuTrigger>
      {/* Named by itself: Radix names a menu after its trigger, here an invisible point, which must not take the cursor back. */}
      <DropdownMenuContent
        aria-label="Thêm ô"
        aria-labelledby={undefined}
        className="min-w-50"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          chosen.current?.()
          chosen.current = null
        }}
      >
        <DropdownMenuLabel className="pt-1.5 pb-1 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground">THÊM Ô</DropdownMenuLabel>
        <DropdownMenuItem onSelect={choose(() => onAdd({}))} className="h-8.5 text-[13px]">
          <span aria-hidden="true" className={cn(SWATCH_BOX, SWATCH.DEFAULT)} />
          Khối chữ
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={choose(() => onAdd({ main: true }))} className="h-8.5 text-[13px]">
          <span aria-hidden="true" className={cn(SWATCH_BOX, SWATCH.DEFAULT, 'text-[10px] leading-none font-bold')}>B</span>
          Khối chính
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {(['YELLOW', 'GREEN', 'RED', 'BLUE'] as const).map((color) => (
          <DropdownMenuItem key={color} onSelect={choose(() => onAdd({ color }))} className="h-8.5 text-[13px]">
            <span aria-hidden="true" className={cn(SWATCH_BOX, SWATCH[color])} />
            Khối {COLOR_NAMES[color]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={choose(onFit)} className="h-8.5 text-[13px]">
          <Maximize strokeWidth={1.6} />
          Vừa màn hình
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
