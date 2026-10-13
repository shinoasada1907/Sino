import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/**
 * Canvas `.check`: a round box that marks a task done. It is a real checkbox (the canvas styles it with
 * `appearance: none`), so a screen reader says whether the task is done; red while the task is late.
 */
export function TaskCheck({ done, late = false, label, onToggle }: { done: boolean; late?: boolean; label: string; onToggle: () => void }) {
  return (
    <span className="relative grid size-5.5 shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={label}
        className={cn(
          'peer size-5.5 cursor-pointer appearance-none rounded-full border-[1.5px] border-border-strong transition-[border-color,background-color] duration-(--dur-hover) ease-out outline-none hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid checked:border-primary checked:bg-primary',
          late && !done && 'border-danger',
        )}
      />
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute size-3 text-transparent peer-hover:text-muted-foreground peer-checked:text-primary-foreground"
        strokeWidth={2.6}
      />
    </span>
  )
}
