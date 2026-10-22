import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/shared/lib/utils'
import { CHIP_EMOJI, chipLabel, peopleOf, type Reaction, type ReactionKind } from '../reactions'
import { ReactionEmoji } from './ReactionEmoji'

/**
 * The chip under a chat message with emoji on it (zalo-reactions, D-390): up to three different emoji, most people
 * first, and how many people reacted when more than one. Its edge takes the accent colour when the user reacted.
 * Clicking it lists who dropped which emoji.
 */
export function ReactionChips({ reactions, kinds, own }: { reactions: Reaction[]; kinds: ReactionKind[]; own: boolean }) {
  if (reactions.length === 0) {
    return null
  }
  const people = peopleOf(reactions)
  const mine = reactions.some((reaction) => reaction.mine)
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        aria-label={chipLabel(reactions, kinds)}
        className={cn(
          'relative z-1 -mt-2.5 inline-flex h-6 cursor-pointer items-center gap-0.5 rounded-full border bg-raised px-1.5 text-[13px] leading-none text-foreground shadow-popover outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
          own ? 'mr-2' : 'ml-2',
          mine && 'border-primary hover:border-primary',
        )}
      >
        <span aria-hidden="true" className="inline-flex items-center gap-px">
          {reactions.slice(0, CHIP_EMOJI).map((reaction) => (
            <ReactionEmoji key={reaction.code} emoji={reaction.emoji} className="text-[14px]" />
          ))}
        </span>
        {people > 1 && (
          <span aria-hidden="true" className="pl-0.5 font-mono text-[11px] font-medium text-muted-foreground">
            {people}
          </span>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="reaction-people"
          aria-label="Người đã thả biểu cảm"
          side="top"
          align={own ? 'end' : 'start'}
          sideOffset={6}
          collisionPadding={16}
          className="z-50 max-h-72 w-60 overflow-y-auto rounded-xl border border-border-strong bg-popover p-1.5 text-popover-foreground shadow-popover duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <ul className="flex flex-col">
            {reactions.flatMap((reaction) =>
              reaction.names.map((name, index) => (
                <li key={`${reaction.code}-${index}`} className="flex h-9 items-center justify-between gap-3 rounded-md px-2.5 text-sm">
                  <span className="truncate">{name}</span>
                  <ReactionEmoji emoji={reaction.emoji} label={kinds.find((kind) => kind.code === reaction.code)?.label ?? reaction.emoji} className="text-lg" />
                </li>
              )),
            )}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
