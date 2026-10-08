import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// Only Vietnamese exists for now: the button is drawn as in the canvas but does nothing yet.
export function LanguageButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Ngôn ngữ: Tiếng Việt"
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border bg-surface pr-2 pl-2.5 font-mono text-xs leading-4 font-semibold tracking-[0.04em] text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
        className,
      )}
    >
      VI
      <ChevronDown className="size-3.5" strokeWidth={1.6} />
    </button>
  )
}
