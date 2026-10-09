import { Bell, Calendar, Check, Clock, Repeat, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import type { TaskMeta } from '../format'
import type { TaskItem } from '../tasks.types'
import { TaskCheck } from './TaskCheck'

const META_ICONS: Record<TaskMeta['icon'], LucideIcon> = { due: Calendar, today: Clock, reminder: Bell, repeat: Repeat, done: Check }

/**
 * Canvas `.trk`: the done box, then the title and its lines (due, reminder, repeat, or when it was done) with the source
 * tag. The title and lines open the task; the box beside them marks it done, so the two never nest.
 */
export function TaskRow({
  task,
  meta,
  selected,
  search,
  onToggle,
}: {
  task: TaskItem
  meta: TaskMeta[]
  selected: boolean
  search: string
  onToggle: () => void
}) {
  const done = task.status === 'DONE'

  return (
    <div
      className={cn(
        'grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-3.5 rounded-xl border border-transparent px-3.5 py-3 transition-colors duration-(--dur-hover) ease-out hover:bg-hover',
        selected && 'border-border-strong bg-raised hover:bg-raised',
      )}
    >
      <TaskCheck done={done} late={meta[0]?.tone === 'over'} label={`Đánh dấu xong: ${task.title}`} onToggle={onToggle} />
      <Link
        to={{ pathname: `/tasks/${task.id}`, search }}
        aria-current={selected ? 'page' : undefined}
        className="flex min-w-0 flex-col gap-1.25 rounded-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <span data-slot="task-title" className={cn('text-sm font-medium', done && 'text-subtle-foreground line-through')}>
          {task.title}
        </span>
        {(meta.length > 0 || task.source) && (
          <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {meta.map((line) => {
              const Icon = META_ICONS[line.icon]
              return (
                <span
                  key={line.icon + line.text}
                  className={cn(
                    'inline-flex items-center gap-1.25 text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground',
                    line.tone === 'over' && 'text-danger-ink',
                    line.tone === 'today' && 'font-semibold text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-3.25 shrink-0" strokeWidth={1.6} />
                  {line.text}
                </span>
              )
            })}
            {task.source && (
              <span className="inline-flex h-5.5 max-w-70 items-center gap-1.5 rounded-xs border bg-raised pr-2 pl-0.75 text-xs leading-4 font-medium text-muted-foreground">
                <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-surface text-foreground">
                  <ProviderIcon provider={task.source.provider} className="size-2.75" />
                </span>
                <span className="truncate">{task.source.title}</span>
              </span>
            )}
          </span>
        )}
      </Link>
    </div>
  )
}
