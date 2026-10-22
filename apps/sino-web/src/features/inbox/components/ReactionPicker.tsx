import { Plus, SmilePlus } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive } from 'radix-ui'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { ReactionKind } from '../reactions'
import { ReactionEmoji } from './ReactionEmoji'

/** How long a finger rests on a bubble before the bar opens, and how far it may move meanwhile (D-390). */
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
/** Emoji in a row of the full set. */
const COLUMNS = 8

/**
 * The emoji bar of one chat message (zalo-reactions, D-390), built from the user's picture of Zalo's bar: a smiley
 * button beside the bubble shows on hover or focus; it opens the quick emoji and "+" above the bubble. On a phone a
 * finger resting on the bubble opens the same bar. "+" shows every emoji of the provider: in the bar from 768px, in a
 * sheet from the bottom below. Picking the user's own emoji again takes it off.
 */
export function ReactionPicker({
  kinds,
  mine,
  own,
  onPick,
  children,
}: {
  kinds: ReactionKind[]
  /** The code of the user's emoji on this message, or null. */
  mine: string | null
  own: boolean
  onPick: (kind: ReactionKind) => void
  /** The bubble: the bar opens over it, and a finger resting on it opens the bar. */
  children: ReactNode
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [sheet, setSheet] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const hold = useHold(() => setOpen(true))

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setFull(false)
    }
  }
  const pick = (kind: ReactionKind) => {
    onPick(kind)
    changeOpen(false)
    setSheet(false)
  }
  const showAll = () => {
    if (wide) {
      setFull(true)
    } else {
      changeOpen(false)
      setSheet(true)
    }
  }
  const quick = kinds.filter((kind) => kind.quick)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div className="min-w-0 [-webkit-touch-callout:none]" {...hold}>
          {children}
        </div>
      </PopoverPrimitive.Anchor>
      {/*
        Not a Popover.Trigger: beside a custom Anchor, Radix first anchors to the trigger, then mounts the trigger again
        without its anchor and keeps the old, detached node, so the bar opened at the corner of the screen. So this is a
        plain button, and what the trigger did (toggle, aria, the focus coming back) is done here.
      */}
      <Button
        ref={button}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Thả biểu cảm"
        title="Thả biểu cảm"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        onClick={() => changeOpen(!open)}
        className="shrink-0 self-center rounded-full text-muted-foreground opacity-0 transition-opacity duration-(--dur-hover) group-hover/bubble:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      >
        <SmilePlus strokeWidth={1.6} />
      </Button>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="reaction-bar"
          aria-label="Biểu cảm"
          // A press on the button while open is its own toggle, not a press outside that closes and reopens.
          onInteractOutside={(event) => {
            if (event.target instanceof Node && button.current?.contains(event.target)) {
              event.preventDefault()
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            button.current?.focus()
          }}
          side="top"
          align={own ? 'end' : 'start'}
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            'z-50 origin-(--radix-popover-content-transform-origin) border border-border-strong bg-popover text-popover-foreground shadow-popover duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            full ? 'w-84 rounded-xl p-2' : 'rounded-full p-1',
          )}
        >
          {full ? (
            <EmojiGrid kinds={kinds} mine={mine} onPick={pick} />
          ) : (
            <QuickBar kinds={quick} mine={mine} onPick={pick} onMore={kinds.length > quick.length ? showAll : undefined} />
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
      <DialogPrimitive.Root open={sheet} onOpenChange={setSheet}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          {/* Canvas `.sheet` (mobile web, bottom sheets), as the sticker picker. */}
          <DialogPrimitive.Content
            data-slot="reaction-sheet"
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(28rem,85dvh)] flex-col rounded-t-[22px] border border-b-0 border-border-strong bg-raised pt-1.5 pb-7 text-foreground shadow-popover duration-200 outline-none data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-6 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-6"
          >
            <span aria-hidden="true" className="mx-auto mt-1 mb-2.5 h-1 w-9 shrink-0 rounded-full bg-border-strong" />
            <DialogPrimitive.Title className="px-5 pb-3 text-base leading-6 font-semibold">Biểu cảm</DialogPrimitive.Title>
            <div className="min-h-0 overflow-y-auto px-3">
              <EmojiGrid kinds={kinds} mine={mine} onPick={pick} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PopoverPrimitive.Root>
  )
}

/** A finger resting on the bubble (touch only): opens the bar, and keeps the browser's own menu away. */
function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const touching = useRef(false)
  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current)
    }
    timer.current = null
    start.current = null
  }
  return {
    onPointerDown: (event: PointerEvent) => {
      touching.current = event.pointerType === 'touch'
      if (!touching.current) {
        return
      }
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        stop()
        onHold()
      }, HOLD_MS)
    },
    onPointerMove: (event: PointerEvent) => {
      const from = start.current
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > HOLD_SLOP_PX) {
        stop()
      }
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (event: { preventDefault: () => void }) => {
      if (touching.current) {
        event.preventDefault()
      }
    },
  }
}

/**
 * Buttons in a row or a grid with one of them in the tab order (a roving `tabIndex`): the arrows and Home / End move it,
 * Enter or a click picks. The first to take the focus is the user's own emoji, or the first one.
 */
function useRoving(count: number, columns: number, startAt: number) {
  const [active, setActive] = useState(Math.max(startAt, 0))
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const at = Math.min(active, count - 1)
  const onKeyDown = (event: KeyboardEvent) => {
    const last = count - 1
    const targets: Record<string, number> = {
      ArrowRight: Math.min(at + 1, last),
      ArrowLeft: Math.max(at - 1, 0),
      ArrowDown: at + columns <= last ? at + columns : at,
      ArrowUp: at - columns >= 0 ? at - columns : at,
      Home: 0,
      End: last,
    }
    const next = targets[event.key]
    if (next === undefined) {
      return
    }
    event.preventDefault()
    setActive(next)
    buttons.current[next]?.focus()
  }
  const propsOf = (index: number) => ({
    ref: (button: HTMLButtonElement | null) => {
      buttons.current[index] = button
    },
    tabIndex: index === at ? 0 : -1,
    onFocus: () => setActive(index),
  })
  return { onKeyDown, propsOf }
}

function QuickBar({ kinds, mine, onPick, onMore }: { kinds: ReactionKind[]; mine: string | null; onPick: (kind: ReactionKind) => void; onMore?: () => void }) {
  const count = kinds.length + (onMore ? 1 : 0)
  const roving = useRoving(count, count, kinds.findIndex((kind) => kind.code === mine))
  return (
    <div role="toolbar" aria-label="Biểu cảm nhanh" onKeyDown={roving.onKeyDown} className="flex items-center gap-0.5">
      {kinds.map((kind, index) => (
        <EmojiButton key={kind.code} kind={kind} mine={kind.code === mine} onPick={onPick} {...roving.propsOf(index)} />
      ))}
      {onMore && (
        <button
          type="button"
          aria-label="Thêm biểu cảm"
          title="Thêm biểu cảm"
          onClick={onMore}
          className="ml-0.5 inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-surface text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid max-md:size-11"
          {...roving.propsOf(kinds.length)}
        >
          <Plus className="size-4.5" strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}

function EmojiGrid({ kinds, mine, onPick }: { kinds: ReactionKind[]; mine: string | null; onPick: (kind: ReactionKind) => void }) {
  const roving = useRoving(kinds.length, COLUMNS, kinds.findIndex((kind) => kind.code === mine))
  return (
    <div role="group" aria-label="Tất cả biểu cảm" onKeyDown={roving.onKeyDown} className="grid max-h-64 grid-cols-8 gap-0.5 overflow-y-auto max-md:max-h-none">
      {kinds.map((kind, index) => (
        <EmojiButton key={kind.code} kind={kind} mine={kind.code === mine} onPick={onPick} {...roving.propsOf(index)} />
      ))}
    </div>
  )
}

function EmojiButton({
  kind,
  mine,
  onPick,
  ref,
  tabIndex,
  onFocus,
}: {
  kind: ReactionKind
  mine: boolean
  onPick: (kind: ReactionKind) => void
  ref: (button: HTMLButtonElement | null) => void
  tabIndex: number
  onFocus: () => void
}) {
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={tabIndex}
      onFocus={onFocus}
      aria-label={kind.label}
      aria-pressed={mine}
      title={kind.label}
      onClick={() => onPick(kind)}
      className={cn(
        'inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-[22px] leading-none outline-none transition-transform duration-(--dur-hover) ease-out hover:scale-115 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid motion-reduce:transition-none motion-reduce:hover:scale-100 max-md:size-11',
        mine && 'bg-accent',
      )}
    >
      <ReactionEmoji emoji={kind.emoji} />
    </button>
  )
}
