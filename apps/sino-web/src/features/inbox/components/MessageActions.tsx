import { Copy, Ellipsis, Forward, Quote } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

const ROUND =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-raised text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-3.5'

/**
 * The round buttons at the side of a chat bubble, as Zalo's: "Trả lời", "Chuyển tiếp" and "Thêm" (a menu with "Sao chép").
 * They show while the mouse is on the row or the focus is in it, from 768px; a phone has the same in the bar of a finger
 * resting on the bubble.
 */
export function MessageActions({
  onReply,
  onForward,
  onCopy,
}: {
  onReply?: () => void
  onForward?: () => void
  onCopy?: () => void
}) {
  const [open, setOpen] = useState(false)
  if (!onReply && !onCopy && !onForward) {
    return null
  }
  return (
    <div
      data-slot="message-actions"
      className={cn(
        'flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity duration-(--dur-hover) group-focus-within/bubble:opacity-100 group-hover/bubble:opacity-100 max-md:hidden',
        open && 'opacity-100',
      )}
    >
      {onReply && (
        <button type="button" aria-label="Trả lời" title="Trả lời" onClick={onReply} className={ROUND}>
          <Quote strokeWidth={1.6} />
        </button>
      )}
      {onForward && (
        <button type="button" aria-label="Chuyển tiếp" title="Chuyển tiếp" onClick={onForward} className={ROUND}>
          <Forward strokeWidth={1.6} />
        </button>
      )}
      {onCopy && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger aria-label="Thêm" title="Thêm" className={ROUND}>
            <Ellipsis strokeWidth={1.6} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-40">
            <DropdownMenuItem onSelect={onCopy}>
              <Copy strokeWidth={1.6} />
              Sao chép
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
