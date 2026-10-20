import { Sticker as StickerIcon } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Link } from 'react-router'
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive, Tabs as TabsPrimitive } from 'radix-ui'
import { groupByPack, type PackPart } from '@/features/stickers/groupByPack'
import { stickerContentUrl } from '@/features/stickers/stickers.api'
import type { StickerItem } from '@/features/stickers/stickers.types'
import { usePacks } from '@/features/stickers/usePacks'
import { useStickers } from '@/features/stickers/useStickers'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { Button } from '@/shared/ui/button'

/** Stickers in a row of the grid; the arrow keys go up and down by this many. */
const COLUMNS = 4
const UNSORTED = 'unsorted'

const valueOf = (part: PackPart) => part.pack?.id ?? UNSORTED

/**
 * The "Sticker" button of a chat and the picker it opens (zalo-send-images ZS-08, D-354): a panel above the button from
 * 768px, a sheet from the bottom below. The library is read when the picker first opens, not with the chat. One tab per
 * pack that holds stickers, in the order of the packs, then "Chưa xếp bộ"; a sticker is sent by clicking it or by Enter,
 * the arrows go between them. Sending closes the picker and gives the focus to `focusAfterPick` (the message box);
 * Escape closes it and gives the focus back to the button. No canvas frame yet (DN-5 = A: built from the parts we have).
 */
export function StickerPicker({
  onPick,
  focusAfterPick,
  className,
}: {
  onPick: (stickerId: string) => void
  focusAfterPick: RefObject<HTMLElement | null>
  className?: string
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const picked = useRef(false)
  // Set at each opening: the first grid shown takes the focus once, so the arrows work at once.
  const gridTakesFocus = useRef(false)

  const changeOpen = (next: boolean) => {
    gridTakesFocus.current = next
    setOpen(next)
  }
  const pick = (stickerId: string) => {
    picked.current = true
    onPick(stickerId)
    changeOpen(false)
  }
  const claimFocus = () => {
    const take = gridTakesFocus.current
    gridTakesFocus.current = false
    return take
  }
  // After a send the message box takes the focus; after Escape or a click outside, the button, as Radix does.
  const afterClose = (event: Event) => {
    if (picked.current) {
      picked.current = false
      event.preventDefault()
      focusAfterPick.current?.focus()
    }
  }

  const trigger = (
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Sticker" title="Sticker" className={className}>
      <StickerIcon strokeWidth={1.6} />
    </Button>
  )
  const body = <PickerBody onPick={pick} claimFocus={claimFocus} />

  if (wide) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
        <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-slot="sticker-popover"
            aria-label="Sticker"
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            onCloseAutoFocus={afterClose}
            className="z-50 flex h-[min(25rem,var(--radix-popover-content-available-height))] w-84 origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-xl border border-border-strong bg-popover pt-3 text-popover-foreground shadow-popover duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {body}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
  // Canvas `.sheet` (mobile web, bottom sheets): the grab bar, a title, and the rounded top edge.
  return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          data-slot="sticker-sheet"
          aria-describedby={undefined}
          onCloseAutoFocus={afterClose}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(28rem,85dvh)] flex-col rounded-t-[22px] border border-b-0 border-border-strong bg-raised pt-1.5 pb-7 text-foreground shadow-popover duration-200 outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6"
        >
          <span aria-hidden="true" className="mx-auto mt-1 mb-2.5 h-1 w-9 shrink-0 rounded-full bg-border-strong" />
          <DialogPrimitive.Title className="px-5 pb-3 text-base leading-6 font-semibold">Sticker</DialogPrimitive.Title>
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** `claimFocus` is true once per opening: for the first grid shown, which then takes the focus. */
function PickerBody({ onPick, claimFocus }: { onPick: (stickerId: string) => void; claimFocus: () => boolean }) {
  const { stickers, error: stickersError, retry: retryStickers } = useStickers()
  const { packs, error: packsError, retry: retryPacks } = usePacks()
  const [tab, setTab] = useState<string | null>(null)

  if (stickers && packs) {
    if (stickers.length === 0) {
      return (
        <div className="flex flex-col items-start gap-3 px-5 pb-5 text-sm">
          <p className="text-muted-foreground">Chưa có sticker nào.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to="/stickers">Mở thư viện sticker</Link>
          </Button>
        </div>
      )
    }
    const parts = groupByPack(stickers, packs).filter((part) => part.stickers.length > 0)
    // A tab whose pack has gone or been emptied meanwhile gives way to the first one.
    const current = parts.some((part) => valueOf(part) === tab) ? tab! : valueOf(parts[0])
    return (
      <TabsPrimitive.Root value={current} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsPrimitive.List aria-label="Bộ sticker" className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 pb-2">
          {parts.map((part) => (
            <TabsPrimitive.Trigger
              key={valueOf(part)}
              value={valueOf(part)}
              className="inline-flex h-8 max-w-40 shrink-0 cursor-pointer items-center truncate rounded-[8px] border border-transparent px-2.5 text-[13px] leading-4.5 font-medium text-muted-foreground transition-[background-color,border-color,color] duration-(--dur-hover) ease-out outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-selected:border-border-strong aria-selected:bg-surface aria-selected:text-foreground max-md:h-11"
            >
              {part.pack?.name ?? 'Chưa xếp bộ'}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {parts.map((part) => (
          // Not a tab stop of its own: the sticker of the grid that is in the tab order comes right after the tabs.
          <TabsPrimitive.Content key={valueOf(part)} value={valueOf(part)} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-3 outline-none">
            <StickerGrid stickers={part.stickers} onPick={onPick} claimFocus={claimFocus} />
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>
    )
  }
  if (stickersError || packsError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 px-5 pb-5 text-sm">
        <p className="text-danger-ink">Không tải được thư viện sticker.</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            retryStickers()
            retryPacks()
          }}
        >
          Thử lại
        </Button>
      </div>
    )
  }
  return (
    <p role="status" className="px-5 pb-5 text-sm text-muted-foreground">
      Đang tải sticker…
    </p>
  )
}

/**
 * The stickers of one pack, newest first, `COLUMNS` to a row. One of them is in the tab order at a time (a roving
 * `tabIndex`): the arrows, Home and End move it, Enter or a click sends. A GIF or a moving WebP plays by itself.
 */
function StickerGrid({ stickers, onPick, claimFocus }: { stickers: StickerItem[]; onPick: (stickerId: string) => void; claimFocus: () => boolean }) {
  const [active, setActive] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.min(active, stickers.length - 1)

  useEffect(() => {
    if (claimFocus()) {
      buttons.current[0]?.focus()
    }
  }, [claimFocus])

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = stickers.length - 1
    const targets: Record<string, number> = {
      ArrowRight: Math.min(at + 1, last),
      ArrowLeft: Math.max(at - 1, 0),
      ArrowDown: at + COLUMNS <= last ? at + COLUMNS : at,
      ArrowUp: at - COLUMNS >= 0 ? at - COLUMNS : at,
      Home: 0,
      End: last,
    }
    const to = targets[event.key]
    if (to === undefined) {
      return
    }
    event.preventDefault()
    setActive(to)
    buttons.current[to]?.focus()
  }

  return (
    <div className="grid grid-cols-4 gap-1.5" onKeyDown={move}>
      {stickers.map((item, index) => (
        <button
          key={item.id}
          ref={(button) => {
            buttons.current[index] = button
          }}
          type="button"
          aria-label={item.name}
          title={item.name}
          tabIndex={index === at ? 0 : -1}
          onFocus={() => setActive(index)}
          onClick={() => onPick(item.id)}
          className="flex aspect-square min-h-11 cursor-pointer items-center justify-center rounded-md p-1.5 transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <img src={stickerContentUrl(item.id)} alt="" loading="lazy" decoding="async" draggable={false} className="max-h-full max-w-full object-contain" />
        </button>
      ))}
    </div>
  )
}
