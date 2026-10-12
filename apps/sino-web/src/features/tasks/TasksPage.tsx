import { ListFilter } from 'lucide-react'
import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { Segmented } from '@/shared/ui/segmented'
import { Spec } from '@/shared/ui/spec'
import { QuickAdd } from './components/QuickAdd'
import { TaskDetail } from './components/TaskDetail'
import { TaskFormDialog, TaskFormPage, type EditState } from './components/TaskForm'
import { TaskRow } from './components/TaskRow'
import { TasksLoadFailed, TasksSkeleton } from './components/TaskStates'
import { filterTasks, groupTasks, openCountLabel, taskMeta, tasksHeadline, type TaskFilter } from './format'
import { useTaskFilter } from './useTaskFilter'
import { useAddTask, useSaveTaskNotes, useTasks, useToggleTask } from './useTasks'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'messages', label: 'Từ tin nhắn' },
  { value: 'repeat', label: 'Lặp lại' },
]

/**
 * The Việc cần làm screen (canvas `Tasks`, `MobileTasks`): the list in groups with its filter and the quick add, and
 * from 1280 px a right column for the open task, only while one is open. `/tasks/:taskId` opens a task; below 1280 px its detail takes the place
 * of the list, under a sub-page header on a phone (D-82). Below 768 px the list has its own header with a "Lọc" menu.
 * `/tasks/:taskId/edit` opens the form of the task: a dialog over the page from 768 px, a page of its own below (D-158).
 */
export function TasksPage() {
  const { taskId } = useParams()
  const editing = useMatch('/tasks/:taskId/edit') !== null
  const location = useLocation()
  const navigate = useNavigate()
  const { tasks, providers, receivedAt, error, retry } = useTasks()
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const { filter, search, setFilter } = useTaskFilter()
  const wide = useMediaQuery('(min-width: 768px)')
  const { mutateAsync: add } = useAddTask()
  const { mutate: toggle, isError: toggleFailed } = useToggleTask()
  const { mutate: saveNotes, isError: notesFailed } = useSaveTaskNotes()
  // The list is already back as it was (useTasks); the line says why. It goes where the user is looking.
  const saveFailed = (toggleFailed || notesFailed) && <SaveFailed />

  if (!tasks) {
    return error ? <TasksLoadFailed onRetry={retry} /> : <TasksSkeleton />
  }

  const nameOf = providerNameOf(providers)
  const selected = taskId === undefined ? undefined : tasks.find((task) => task.id === taskId)
  const detailPath = `/tasks/${taskId}${search}`
  // Back to the detail it was opened from, or in place of the form when it was opened by its address.
  const closeForm = () => ((location.state as EditState | null)?.fromDetail ? navigate(-1) : navigate(detailPath, { replace: true }))

  if (editing && selected && !wide) {
    return <TaskFormPage key={selected.id} task={selected} back={detailPath} onClose={closeForm} />
  }

  const headline = tasksHeadline(tasks, now)
  const groups = groupTasks(filterTasks(tasks, filter), now)
  const filterName = FILTERS.find((option) => option.value === filter)!.label

  return (
    <div className={cn('grid h-full min-h-0', taskId && 'xl:grid-cols-[minmax(0,1fr)_400px]')}>
      <section
        aria-label="Danh sách việc"
        // A scrolling flex column shrinks its children once they overflow; the quick add (52 px) must keep its height.
        className={cn(
          'min-h-0 flex-col gap-3 overflow-auto px-4 pt-1 pb-5 *:shrink-0 md:gap-5.5 md:p-6 xl:px-8 xl:pt-7 xl:pb-10',
          taskId ? 'hidden xl:flex' : 'flex',
        )}
      >
        <header data-slot="tasks-mobile-header" className="-mx-4 flex min-h-15 items-center gap-1 py-2 pr-2 pl-4 md:hidden">
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Việc cần làm</h1>
          <Spec className="ml-2.5 pt-1.5">{openCountLabel(tasks)}</Spec>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={filter === 'all' ? 'Lọc' : `Lọc: ${filterName}`} className="ml-auto">
                <ListFilter strokeWidth={1.6} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as TaskFilter)}>
                {FILTERS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <header className="hidden grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 md:grid">
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
          <Segmented label="Lọc việc" value={filter} options={FILTERS} onChange={setFilter} />
        </header>

        <QuickAdd placeholder={wide ? 'Thêm việc mới — Enter để lưu, chọn hạn sau' : 'Thêm việc mới'} onAdd={add} />
        {!taskId && saveFailed}

        {groups.length === 0 && (
          <p className="px-1 py-4 text-sm text-muted-foreground md:px-3.5">{tasks.length === 0 ? 'Chưa có việc nào.' : 'Không có việc nào khớp bộ lọc này.'}</p>
        )}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col md:gap-0.5">
            <div className="flex items-center gap-2.5 px-1 pb-0.5 md:px-3.5 md:pb-1.5">
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

      {taskId && (
        <aside aria-label="Chi tiết việc" className="flex min-h-0 flex-col overflow-auto bg-surface md:border-l">
          <MobilePageHeader back={{ to: `/tasks${search}`, label: 'Quay lại Việc cần làm' }} title="Chi tiết việc" />
          <div className="flex grow flex-col gap-5 p-4 *:shrink-0 md:p-7">
            {saveFailed}
            {selected ? (
              <TaskDetail
                key={selected.id}
                task={selected}
                now={now}
                nameOf={nameOf}
                close={`/tasks${search}`}
                edit={`/tasks/${selected.id}/edit${search}`}
                onToggle={() => toggle(selected)}
                onSaveNotes={(notes) => saveNotes({ task: selected, notes })}
              />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-base">Không tìm thấy việc này.</p>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/tasks">Về danh sách việc</Link>
                </Button>
              </div>
            )}
          </div>
        </aside>
      )}
      {editing && selected && <TaskFormDialog key={selected.id} task={selected} onClose={closeForm} />}
    </div>
  )
}

// A change the server refused: done / reopened, or the notes.
function SaveFailed() {
  return (
    <p role="alert" className="px-1 text-sm text-danger-ink md:px-3.5">
      Không lưu được thay đổi. Hãy thử lại.
    </p>
  )
}
