import { Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/utils'

// The longest title a task can have (spec `tasks` of planner-from-messages).
const TITLE_MAX = 200

/**
 * Canvas `.quick-add`: a dashed box that adds a task by its title on Enter; the due is chosen later (D-80). The box
 * empties and keeps the focus for the next one; spaces alone add nothing. When the server refuses the task, the title
 * comes back into the box (unless something new was typed meanwhile) with a line saying so.
 */
export function QuickAdd({ placeholder, onAdd, className }: { placeholder: string; onAdd: (title: string) => Promise<unknown>; className?: string }) {
  const [title, setTitle] = useState('')
  const [failed, setFailed] = useState(false)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label className="grid h-13 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border border-dashed border-border-strong bg-surface pr-2 pl-4 transition-colors duration-(--dur-hover) ease-out focus-within:border-solid focus-within:border-foreground">
        <Plus aria-hidden="true" className="size-5 text-muted-foreground" strokeWidth={1.6} />
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              const value = title.trim()
              if (value) {
                setTitle('')
                setFailed(false)
                onAdd(value).catch(() => {
                  setTitle((current) => (current === '' ? value : current))
                  setFailed(true)
                })
              }
            }
          }}
          placeholder={placeholder}
          aria-label="Thêm việc mới"
          className="min-w-0 appearance-none border-none bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
        />
        <kbd className="hidden rounded-xs border border-b-2 bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-4 font-medium text-muted-foreground md:inline">Enter</kbd>
      </label>
      {failed && (
        <p role="alert" className="px-1 text-sm text-danger-ink md:px-3.5">
          Không thêm được việc. Hãy thử lại.
        </p>
      )}
    </div>
  )
}
