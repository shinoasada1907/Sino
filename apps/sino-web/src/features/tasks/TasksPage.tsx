import { Link, useParams } from 'react-router'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/segmented'
import { QuickAdd } from './components/QuickAdd'
import { TaskDetail } from './components/TaskDetail'
import { TaskRow } from './components/TaskRow'
import { filterTasks, groupTasks, taskMeta, tasksHeadline, type TaskFilter } from './format'
import { useTaskFilter } from './useTaskFilter'
import { useAddTask, useSaveTaskNotes, useTasks, useToggleTask } from './useTasks'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'messages', label: 'Từ tin nhắn' },
  { value: 'repeat', label: 'Lặp lại' },
]

/**
 * The Việc cần làm screen (canvas `Tasks`): the list in groups with its filter and the quick add, and the open task in
 * the right column from 1280 px. `/tasks/:taskId` opens a task; below 1280 px its detail takes the place of the list
 * (D-82).
 */
export function TasksPage() {
  const { taskId } = useParams()
  const { tasks, providers, receivedAt } = useTasks()
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const { filter, search, setFilter } = useTaskFilter()
  const { mutate: add } = useAddTask()
  const { mutate: toggle } = useToggleTask()
  const { mutate: saveNotes } = useSaveTaskNotes()
  const nameOf = providerNameOf(providers)
  const selected = taskId === undefined ? undefined : tasks?.find((task) => task.id === taskId)

  if (!tasks) {
    return (
      <p role="status" className="p-8 text-sm text-muted-foreground">
        Đang tải…
      </p>
    )
  }

  const headline = tasksHeadline(tasks, now)
  const groups = groupTasks(filterTasks(tasks, filter), now)

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section
        aria-label="Danh sách việc"
        // A scrolling flex column shrinks its children once they overflow; the quick add (52 px) must keep its height.
        className={cn('min-h-0 flex-col gap-5.5 overflow-auto bg-dots p-6 *:shrink-0 xl:px-8 xl:pt-7 xl:pb-10', taskId ? 'hidden xl:flex' : 'flex')}
      >
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 gap-y-4 max-md:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">KẾ HOẠCH</span>
            <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] xl:text-[40px] xl:leading-12 xl:font-bold xl:tracking-[-0.028em]">
              Việc cần làm
            </h1>
            <p className="text-base text-muted-foreground">
              {headline.open}
              {headline.overdue && (
                <>
                  {' · '}
                  <span className="text-danger-ink">{headline.overdue}</span>
                </>
              )}
              {headline.fromMessages && ` · ${headline.fromMessages}`}
            </p>
          </div>
          <Segmented label="Lọc việc" value={filter} options={FILTERS} onChange={setFilter} className="justify-self-start md:justify-self-end" />
        </header>

        <QuickAdd placeholder="Thêm việc mới — Enter để lưu, chọn hạn sau" onAdd={(title) => add(title)} />

        {groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5 px-3.5 pb-1.5">
              <span className={cn('text-xs leading-4 font-semibold text-muted-foreground', group.key === 'OVERDUE' && 'text-danger-ink')}>{group.label}</span>
              <span className="font-mono text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">{group.tasks.length}</span>
            </div>
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                meta={taskMeta(task, tasks, now)}
                selected={task.id === taskId}
                search={search}
                onToggle={() => toggle(task)}
              />
            ))}
          </section>
        ))}
      </section>

      <aside
        aria-label="Chi tiết việc"
        className={cn('min-h-0 flex-col gap-5 overflow-auto border-l bg-surface p-7 *:shrink-0', taskId ? 'flex' : 'hidden xl:flex')}
      >
        {selected ? (
          <TaskDetail
            key={selected.id}
            task={selected}
            now={now}
            nameOf={nameOf}
            close={`/tasks${search}`}
            onToggle={() => toggle(selected)}
            onSaveNotes={(notes) => saveNotes({ task: selected, notes })}
          />
        ) : taskId ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base">Không tìm thấy việc này.</p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/tasks">Về danh sách việc</Link>
            </Button>
          </div>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">Chọn một việc để xem chi tiết.</p>
        )}
      </aside>
    </div>
  )
}
