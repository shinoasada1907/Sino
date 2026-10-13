import { Calendar, Check } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { timeZoneLabel } from '@/shared/time/local'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Spec } from '@/shared/ui/spec'
import { errorsOf, formOf, scheduleOf, validate, type TaskFormErrors, type TaskFormValues } from '../taskForm'
import type { TaskItem } from '../tasks.types'
import { useUpdateTask, type TaskChanges } from '../useTasks'
import { invalidProps } from './fieldProps'
import { Field, SelectBox } from './fields'
import { RecurrenceField } from './RecurrenceField'

const MAX_TITLE_LENGTH = 200
const MAX_NOTES_LENGTH = 20_000
const PRESET_TIMES = ['09:00', '17:00']
const TEXTAREA =
  'min-h-21 w-full resize-y rounded-sm border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-(--dur-hover) ease-out outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-foreground aria-invalid:border-danger'

/** The history state of the "Sửa" link: the form was opened from the detail, so closing it goes back there. */
export interface EditState {
  fromDetail: true
}

interface TaskForm {
  id: string
  values: TaskFormValues
  change: (fields: Partial<TaskFormValues>) => void
  errors: TaskFormErrors
  pending: boolean
  submit: (event: FormEvent) => void
}

/**
 * The state of the form of `task`. "Lưu" checks the values, then sends only what changed: the due and the rule
 * (`PUT …/schedule`), the title and the notes (`PATCH`); nothing changed closes it at once. A refusal shows next to the
 * box it is about and the form stays open with what was typed.
 */
function useTaskForm(task: TaskItem, onSaved: () => void): TaskForm {
  const id = useId()
  const [values, setValues] = useState(() => formOf(task))
  const [errors, setErrors] = useState<TaskFormErrors>({})
  const { mutate, isPending } = useUpdateTask()

  const change = (fields: Partial<TaskFormValues>) => {
    setValues((current) => ({ ...current, ...fields }))
    setErrors({})
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      return
    }
    const changes: TaskChanges = {}
    const schedule = scheduleOf(values)
    // Both sides through the form, so an untouched form is no change whatever the server stored.
    if (JSON.stringify(schedule) !== JSON.stringify(scheduleOf(formOf(task)))) {
      changes.schedule = schedule
    }
    const title = values.title.trim()
    if (title !== task.title || values.notes !== (task.notes ?? '')) {
      changes.fields = { title, notes: values.notes }
    }
    if (!changes.schedule && !changes.fields) {
      onSaved()
      return
    }
    mutate({ task, changes }, { onSuccess: onSaved, onError: (error) => setErrors(errorsOf(error)) })
  }

  return { id, values, change, errors, pending: isPending, submit }
}

/**
 * Canvas `InboxTask` without "Nhắc tôi" and the message link (D-158): Tiêu đề, Hạn and Giờ, Lặp lại, Ghi chú. Times are
 * the browser's, as its time zone line says.
 */
function TaskFormFields({ form }: { form: TaskForm }) {
  const { id, values, change, errors, submit } = form
  const title = `${id}-title`
  const date = `${id}-date`
  const notes = `${id}-notes`

  return (
    <form id={id} noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Tiêu đề" id={title} error={errors.title}>
        <Input
          id={title}
          value={values.title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(event) => change({ title: event.target.value })}
          {...invalidProps(title, errors.title)}
        />
      </Field>

      {/* Canvas `.form-grid`. */}
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Hạn" id={date} error={errors.date}>
          <div className="relative">
            <Calendar aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            <Input id={date} type="date" value={values.date} onChange={(event) => change({ date: event.target.value })} className="pl-10.5" {...invalidProps(date, errors.date)} />
          </div>
        </Field>
        <TimeField date={values.date} time={values.time} error={errors.time} onTime={(time) => change({ time })} />
        <RecurrenceField
          date={values.date}
          repeat={values.repeat}
          custom={values.custom}
          errors={errors}
          onRepeat={(repeat) => change({ repeat })}
          onCustom={(custom) => change({ custom })}
        />
      </div>

      <Field label="Ghi chú" id={notes} error={errors.notes}>
        <textarea
          id={notes}
          rows={2}
          value={values.notes}
          maxLength={MAX_NOTES_LENGTH}
          onChange={(event) => change({ notes: event.target.value })}
          placeholder="Thêm ghi chú cho việc (không bắt buộc)"
          className={TEXTAREA}
          {...invalidProps(notes, errors.notes)}
        />
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-danger-ink">
          {errors.form}
        </p>
      )}
    </form>
  )
}

// "Cả ngày", the times of the canvas, the task's own time, and "Giờ khác…" with a time box.
function TimeField({ date, time, error, onTime }: { date: string; time: string; error?: string; onTime: (time: string) => void }) {
  const id = useId()
  const [other, setOther] = useState(false)
  const own = time !== 'ALL_DAY' && !PRESET_TIMES.includes(time)

  const choose = (value: string) => {
    setOther(value === 'OTHER')
    onTime(value !== 'OTHER' ? value : time === 'ALL_DAY' ? '' : time)
  }

  return (
    <Field label="Giờ" id={id} error={error}>
      <SelectBox id={id} value={!date ? 'ALL_DAY' : other ? 'OTHER' : time} disabled={!date} onChange={(event) => choose(event.target.value)}>
        <option value="ALL_DAY">Cả ngày</option>
        {PRESET_TIMES.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        {own && !other && <option value={time}>{time}</option>}
        <option value="OTHER">Giờ khác…</option>
      </SelectBox>
      {date && other && <Input type="time" aria-label="Giờ khác" value={time} onChange={(event) => onTime(event.target.value)} {...invalidProps(id, error)} />}
    </Field>
  )
}

/** The form over the page from 768 px (canvas `.modal.modal-wide`); Esc, the close button and "Hủy" change nothing. */
export function TaskFormDialog({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const form = useTaskForm(task, onClose)
  const now = useNow()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100svh-2rem)] sm:max-w-150">
        <DialogHeader>
          <span className="text-xs leading-4 font-semibold text-muted-foreground">Việc cần làm</span>
          <DialogTitle>Sửa việc</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 overflow-auto">
          <TaskFormFields form={form} />
        </DialogBody>
        <DialogFooter>
          <Spec className="mr-auto">{timeZoneLabel(now)}</Spec>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form={form.id} size="sm" disabled={form.pending}>
            <Check strokeWidth={1.6} />
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The form as a page below 768 px, under a sub-page header with "Lưu" (canvas `MobileConversation`, sheet "task"). */
export function TaskFormPage({ task, back, onClose }: { task: TaskItem; back: string; onClose: () => void }) {
  const form = useTaskForm(task, onClose)
  const now = useNow()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <MobilePageHeader
        back={{ to: back, label: 'Quay lại chi tiết việc' }}
        title="Sửa việc"
        action={
          <Button type="submit" form={form.id} size="sm" disabled={form.pending}>
            Lưu
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <TaskFormFields form={form} />
        <Spec>{timeZoneLabel(now)}</Spec>
      </div>
    </div>
  )
}
