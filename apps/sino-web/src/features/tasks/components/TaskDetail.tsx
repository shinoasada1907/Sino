import { Bell, Calendar, Check, ChevronRight, SquareCheck, StickyNote, Trash2, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { formatDayMonth, weekdayShort } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { createdLabel, detailDue, detailReminder, recurrenceLabel } from '../format'
import type { RelatedItem, TaskItem } from '../tasks.types'
import { TaskCheck } from './TaskCheck'

const RELATED: Record<RelatedItem['kind'], { icon: LucideIcon; to: (item: RelatedItem) => string }> = {
  TASK: { icon: SquareCheck, to: (item) => `/tasks/${item.id}` },
  EVENT: { icon: Calendar, to: () => '/calendar' },
  NOTE: { icon: StickyNote, to: () => '/notes' },
}

/**
 * Canvas `Tasks`, block "Chi tiết việc": the title with its done box, due, reminder, repeat and when it was made, the
 * message it came from (opens the inbox), the notes (saved when the box loses focus), related items and the actions.
 * The reminder, the message and the related items show only when the task has them: the API has none yet (D-150).
 * "Thêm thao tác" and "Nhắc lại sau…" are left out until they have a flow; "Xóa task" has none yet (FE-71).
 */
export function TaskDetail({
  task,
  now,
  nameOf,
  close,
  onToggle,
  onSaveNotes,
}: {
  task: TaskItem
  now: Date
  nameOf: ProviderNameOf
  /** Where "Đóng" goes: the list with its filter. */
  close: string
  onToggle: () => void
  onSaveNotes: (notes: string) => void
}) {
  const done = task.status === 'DONE'
  const [notes, setNotes] = useState(task.notes ?? '')

  return (
    <>
      {/* On a phone the sub-page header leads back; this row is for the column and the tablet page. */}
      <div className="hidden items-center justify-between gap-3 md:flex">
        <span className="text-xs leading-4 font-semibold text-muted-foreground">Task</span>
        <div className="flex items-center gap-0.5">
          <Button asChild variant="ghost" size="icon-sm">
            <Link to={close} aria-label="Đóng" title="Đóng">
              <X strokeWidth={1.6} />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-3.5">
        <span className="pt-0.75">
          <TaskCheck done={done} label="Đánh dấu xong" onToggle={onToggle} />
        </span>
        <h2 className={cn('text-xl leading-7 font-semibold tracking-[-0.01em]', done && 'text-subtle-foreground line-through')}>{task.title}</h2>
      </div>

      <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3">
        <Fact term="Hạn">{detailDue(task)}</Fact>
        {task.reminder && (
          <Fact term="Nhắc">
            <Bell aria-hidden="true" className="mr-1.25 inline size-3.25 align-[-2px] text-muted-foreground" strokeWidth={1.6} />
            {detailReminder(task)}
          </Fact>
        )}
        <Fact term="Lặp lại">{recurrenceLabel(task.recurrence) ?? 'Không'}</Fact>
        <Fact term="Tạo lúc">
          <span className="font-normal text-muted-foreground">{createdLabel(task, now)}</span>
        </Fact>
      </dl>

      {task.source && (
        <Section title="Tin nhắn gốc">
          {task.source.missing ? (
            <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3 rounded-md border border-dashed px-3.5 py-3 text-muted-foreground">
              <ProviderMark provider={task.source.provider} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm">
                  {task.source.title} · {nameOf(task.source.provider)}
                </span>
                <span className="truncate text-sm">Tin nhắn gốc đã bị xóa</span>
              </span>
            </div>
          ) : (
            <Link
              to={`/inbox/${task.source.conversationId}`}
              className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border bg-raised px-3.5 py-3 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <ProviderMark provider={task.source.provider} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm">
                  {task.source.title} · {nameOf(task.source.provider)}
                </span>
                {task.source.subject && <span className="truncate text-sm text-muted-foreground">{task.source.subject}</span>}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.6} />
            </Link>
          )}
        </Section>
      )}

      <div className="flex flex-col gap-3 border-t pt-5">
        <label htmlFor="task-notes" className="text-xs leading-4 font-semibold text-muted-foreground">
          Ghi chú
        </label>
        <textarea
          id="task-notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== (task.notes ?? '')) {
              onSaveNotes(notes)
            }
          }}
          placeholder="Thêm ghi chú…"
          className="min-h-21 w-full resize-y rounded-sm border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-(--dur-hover) ease-out outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-foreground"
        />
      </div>

      {task.related && task.related.length > 0 && (
        <Section title="Liên quan">
          <div className="flex flex-wrap gap-2">
            {task.related.map((item) => {
              const { icon: Icon, to } = RELATED[item.kind]
              return (
                <Link
                  key={item.id}
                  to={to(item)}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border bg-surface pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="truncate">{item.title}</span>
                  {item.at && <Spec className="truncate">{`${weekdayShort(new Date(item.at))} ${formatDayMonth(new Date(item.at))}`}</Spec>}
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      <div className="mt-auto flex flex-wrap gap-2.5 border-t pt-5">
        <Button type="button" variant="primary" size="sm" onClick={onToggle}>
          <Check strokeWidth={1.6} />
          {done ? 'Mở lại' : 'Đánh dấu xong'}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa task" title="Xóa task">
          <Trash2 strokeWidth={1.6} />
        </Button>
      </div>
    </>
  )
}

// Canvas `.kv.kv-tight`: one term and its value.
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[13px] leading-4.5 font-medium text-muted-foreground">{term}</dt>
      <dd className="m-0 text-sm font-medium">{children}</dd>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <span className="text-xs leading-4 font-semibold text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

// Canvas `.pmark-sm`.
function ProviderMark({ provider }: { provider: string }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-[7px] border bg-raised text-foreground">
      <ProviderIcon provider={provider} className="size-3.5" />
    </span>
  )
}
