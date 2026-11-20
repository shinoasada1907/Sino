import { Copy, Plus, Quote, ThumbsUp } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive } from 'radix-ui'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { cn } from '@/shared/lib/utils'
import type { ReactionKind } from '../reactions'
import { ReactionEmoji } from './ReactionEmoji'

/** How long a finger rests on a bubble before the bar opens, and how far it may move meanwhile (D-390). */
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
/** How long the mouse rests on the thumb before the bar opens. */
const HOVER_MS = 350
/** Emoji in a row of the full set. */
const COLUMNS = 8

/**
 * The emoji bar of one chat message (zalo-reactions, D-390), laid out like Zalo's: a round thumb on the lower corner of
 * the bubble shows on hover or focus. Pressing it drops the quick emoji (a thumb); resting the mouse on it, or ArrowUp,
 * opens the quick emoji and "+" above the bubble. On a phone a finger resting on the bubble opens the same bar with
 * "Trả lời tin này" and "Sao chép" under it (and, for a message that takes no emoji, with those two alone). "+" shows
 * every emoji of the provider: in the bar from 768px, in a sheet from the bottom below. Picking the user's own emoji
 * again takes it off.
 */
export function ReactionPicker({
  kinds,
  mine,
  own,
  onPick,
  onReply,
  onCopy,
  reacted,
  children,
}: {
  kinds: ReactionKind[]
  /** The code of the user's emoji on this message, or null. */
  mine: string | null
  own: boolean
  onPick: (kind: ReactionKind) => void
  /** Given where the message can be answered: "Trả lời tin này" under the bar on a phone (from 768px the bubble's side buttons do it). */
  onReply?: () => void
  /** Given where the message has text to copy: "Sao chép" under the bar on a phone. */
  onCopy?: () => void
  /** The message already has emoji: its chip sits at the foot of the bubble, so the thumb moves to the other corner of an own bubble. */
  reacted?: boolean
  /** The bubble: the bar opens over it, and a finger resting on it opens the bar. */
  children: ReactNode
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [sheet, setSheet] = useState(false)
  const reactive = kinds.length > 0
  const rows = Boolean(onReply || onCopy)
  const button = useRef<HTMLButtonElement>(null)
  const hold = useHold(() => setOpen(true))
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopHover = () => {
    if (hover.current) {
      clearTimeout(hover.current)
    }
    hover.current = null
  }

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
  // The reply box takes the focus; the bar must not give it back to the smiley button as it closes.
  const replied = useRef(false)
  const reply = () => {
    replied.current = true
    changeOpen(false)
    onReply?.()
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
  // What pressing the thumb drops: the thumb of the set, else its first quick emoji.
  const usual = kinds.find((kind) => kind.emoji.startsWith('👍')) ?? quick[0]
  const copy = () => {
    replied.current = true
    changeOpen(false)
    onCopy?.()
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div className="relative min-w-0 [-webkit-touch-callout:none]" {...hold}>
          {children}
          {reactive && usual && (
            /*
              Not a Popover.Trigger: beside a custom Anchor, Radix first anchors to the trigger, then mounts the trigger
              again without its anchor and keeps the old, detached node, so the bar opened at the corner of the screen.
              So this is a plain button, and what the trigger did (aria, the focus coming back) is done here.
            */
            <button
              ref={button}
              type="button"
              aria-label="Thả biểu cảm"
              title="Thả biểu cảm"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-state={open ? 'open' : 'closed'}
              onClick={() => {
                stopHover()
                pick(usual)
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse' && !open) {
                  hover.current = setTimeout(() => changeOpen(true), HOVER_MS)
                }
              }}
              onPointerLeave={stopHover}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  changeOpen(true)
                }
              }}
              className={cn(
                'absolute -bottom-2 z-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-raised text-muted-foreground opacity-0 shadow-xs outline-none transition-opacity duration-(--dur-hover) group-hover/bubble:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid data-[state=open]:opacity-100 max-md:hidden',
                own && reacted ? '-left-1.5' : '-right-1.5',
              )}
            >
              <ThumbsUp className="size-3" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </PopoverPrimitive.Anchor>
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
            if (replied.current) {
              replied.current = false
              return
            }
            button.current?.focus()
          }}
          side="top"
          align={own ? 'end' : 'start'}
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            'z-50 origin-(--radix-popover-content-transform-origin) border border-border-strong bg-popover text-popover-foreground shadow-popover duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            full ? 'w-84 rounded-xl p-2' : cn('rounded-full p-1', rows && 'max-md:rounded-2xl'),
          )}
        >
          {full ? (
            <EmojiGrid kinds={kinds} mine={mine} onPick={pick} />
          ) : reactive ? (
            <QuickBar kinds={quick} mine={mine} onPick={pick} onMore={kinds.length > quick.length ? showAll : undefined} />
          ) : null}
          {onReply && !full && (
            <button
              type="button"
              onClick={reply}
              className="mt-1 flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid md:hidden"
            >
              <Quote className="size-4" strokeWidth={1.6} />
              Trả lời tin này
            </button>
          )}
          {onCopy && !full && (
            <button
              type="button"
              onClick={copy}
              className="mt-1 flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid md:hidden"
            >
              <Copy className="size-4" strokeWidth={1.6} />
              Sao chép
            </button>
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
