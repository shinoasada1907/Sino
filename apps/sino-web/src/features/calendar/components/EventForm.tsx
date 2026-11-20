import { Calendar, Check, MapPin } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { errorIdOf, invalidProps } from '@/features/tasks/components/fieldProps'
import { Field, FieldError } from '@/features/tasks/components/fields'
import { RecurrenceField } from '@/features/tasks/components/RecurrenceField'
import type { LocalDate } from '@/shared/domain'
import { cn } from '@/shared/lib/utils'
import { timeZoneLabel } from '@/shared/time/local'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Spec } from '@/shared/ui/spec'
import type { StoredEvent } from '../calendar.types'
import { bodyOfEvent, emptyEventForm, errorsOfEvent, formOfEvent, validateEvent, type EventFormErrors, type EventFormValues } from '../eventForm'
import { useCreateEvent, useUpdateEvent } from '../useCalendar'

const MAX_TITLE_LENGTH = 200
const MAX_LOCATION_LENGTH = 200
const MAX_NOTES_LENGTH = 20_000
const TEXTAREA =
  'min-h-21 w-full resize-y rounded-md border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-(--dur-hover) ease-out outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-foreground aria-invalid:border-danger'

/** History state carried when opening `/calendar/new` or `/calendar/:itemId/edit` from inside the Lịch screen. */
export interface EventFormState {
  fromCalendar?: true
  fromDetail?: true
}

interface EventFormController {
  id: string
  editing: boolean
  repeatingSeries: boolean
  values: EventFormValues
  change: (fields: Partial<EventFormValues>) => void
  errors: EventFormErrors
  pending: boolean
  submit: (event: FormEvent) => void
}

function useEventForm(
  initial: { event?: StoredEvent; defaultDate: LocalDate },
  onSaved: (saved?: StoredEvent) => void,
): EventFormController {
  const { event, defaultDate } = initial
  const id = useId()
  const [values, setValues] = useState<EventFormValues>(() => (event ? formOfEvent(event) : emptyEventForm(defaultDate)))
  const [errors, setErrors] = useState<EventFormErrors>({})
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const pending = create.isPending || update.isPending

  const change = (fields: Partial<EventFormValues>) => {
    setValues((current) => ({ ...current, ...fields }))
    setErrors({})
  }

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    const found = validateEvent(values)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      return
    }
    const body = bodyOfEvent(values)
    if (!event) {
      create.mutate(body, {
        onSuccess: (created) => onSaved(created),
        onError: (error) => setErrors(errorsOfEvent(error)),
      })
      return
    }
    if (JSON.stringify(body) === JSON.stringify(bodyOfEvent(formOfEvent(event)))) {
      onSaved(event)
      return
    }
    update.mutate(
      { eventId: event.id, body },
      {
        onSuccess: (updated) => onSaved(updated),
        onError: (error) => setErrors(errorsOfEvent(error)),
      },
    )
  }

  return {
    id,
    editing: event !== undefined,
    repeatingSeries: event !== undefined && (event.recurrence !== null || values.repeat !== 'NONE'),
    values,
    change,
    errors,
    pending,
    submit,
  }
}

/**
 * Canvas `InboxEvent` without "Nhắc tôi" and the message link (D-158): Tiêu đề, Ngày, Thời gian (start – end or "Cả ngày"),
 * Địa điểm, Lặp lại, Ghi chú, and the note that Sino sends no invitations.
 */
function EventFormFields({ form }: { form: EventFormController }) {
  const { id, repeatingSeries, values, change, errors, submit } = form
  const title = `${id}-title`
  const date = `${id}-date`
  const time = `${id}-time`
  const location = `${id}-location`
  const notes = `${id}-notes`

  const toggleAllDay = () =>
    change({
      allDay: !values.allDay,
      daySpan: !values.allDay ? Math.max(1, values.daySpan) : 0,
    })

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

      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Ngày" id={date} error={errors.date} className="col-span-2 sm:col-span-1">
          <div className="relative">
            <Calendar aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            <Input
              id={date}
              type="date"
              value={values.date}
              onChange={(event) => change({ date: event.target.value })}
              className="pl-10.5"
              {...invalidProps(date, errors.date)}
            />
          </div>
        </Field>

        <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={values.allDay ? undefined : time} className="text-[13px] leading-[18px] font-semibold">
              Thời gian
            </label>
            <button
              type="button"
              aria-pressed={values.allDay}
              onClick={toggleAllDay}
              className={cn(
                'inline-flex h-6 cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid',
                values.allDay ? 'border-foreground bg-raised text-foreground' : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              Cả ngày
            </button>
          </div>
          {values.allDay ? (
            <div className="flex h-10.5 items-center rounded-md border bg-raised px-3.5 text-sm text-muted-foreground">Cả ngày</div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                id={time}
                type="time"
                aria-label="Giờ bắt đầu"
                value={values.startTime}
                onChange={(event) => change({ startTime: event.target.value })}
                className="min-w-0 flex-1 px-2.5"
                {...invalidProps(time, errors.time)}
              />
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              <Input
                type="time"
                aria-label="Giờ kết thúc"
                value={values.endTime}
                onChange={(event) => change({ endTime: event.target.value })}
                className="min-w-0 flex-1 px-2.5"
                {...invalidProps(time, errors.time)}
              />
            </div>
          )}
          <FieldError id={errorIdOf(time)}>{errors.time}</FieldError>
        </div>

        <Field label="Địa điểm" id={location} error={errors.location} className="col-span-2">
          <div className="relative">
            <MapPin aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            <Input
              id={location}
              value={values.location}
              maxLength={MAX_LOCATION_LENGTH}
              onChange={(event) => change({ location: event.target.value })}
              className="pl-10.5"
              {...invalidProps(location, errors.location)}
            />
          </div>
        </Field>

        <RecurrenceField
          date={values.date}
          repeat={values.repeat}
          custom={values.custom}
          errors={errors}
          onRepeat={(repeat) => change({ repeat })}
          onCustom={(custom) => change({ custom })}
        />

        {repeatingSeries && <p className="col-span-2 text-xs leading-4 text-muted-foreground">Áp dụng cho mọi lần lặp</p>}
      </div>

      <Field label="Ghi chú" id={notes} error={errors.notes}>
        <textarea
          id={notes}
          rows={2}
          value={values.notes}
          maxLength={MAX_NOTES_LENGTH}
          onChange={(event) => change({ notes: event.target.value })}
          placeholder="Thêm ghi chú cho lịch hẹn (không bắt buộc)"
          className={TEXTAREA}
          {...invalidProps(notes, errors.notes)}
        />
      </Field>

      <p className="text-xs leading-4 text-muted-foreground">Lịch hẹn chỉ nằm trong Sino, không gửi lời mời cho ai.</p>

      {errors.form && (
        <p role="alert" className="text-sm text-danger-ink">
          {errors.form}
        </p>
      )}
    </form>
  )
}

/** The appointment form over the calendar from 768 px (canvas `.modal.modal-wide`). */
export function EventFormDialog({
  event,
  defaultDate,
  onClose,
}: {
  event?: StoredEvent
  defaultDate: LocalDate
  onClose: (saved?: StoredEvent) => void
}) {
  const form = useEventForm({ event, defaultDate }, onClose)
  const now = useNow()
  const title = event ? 'Sửa lịch hẹn' : 'Lịch hẹn mới'
  const submitLabel = event ? 'Lưu' : 'Tạo lịch hẹn'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100svh-2rem)] sm:max-w-150">
        <DialogHeader>
          <span className="text-xs leading-4 font-semibold text-muted-foreground">Lịch</span>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 overflow-auto">
          <EventFormFields form={form} />
        </DialogBody>
        <DialogFooter>
          <Spec className="mr-auto">{timeZoneLabel(now)}</Spec>
          <Button type="button" variant="ghost" size="sm" onClick={() => onClose()}>
            Hủy
          </Button>
          <Button type="submit" form={form.id} size="sm" disabled={form.pending}>
            <Check strokeWidth={1.6} />
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The appointment form as a page below 768 px, under a sub-page header. */
export function EventFormPage({
  event,
  defaultDate,
  back,
  onClose,
}: {
  event?: StoredEvent
  defaultDate: LocalDate
  back: string
  onClose: (saved?: StoredEvent) => void
}) {
  const form = useEventForm({ event, defaultDate }, onClose)
  const now = useNow()
  const title = event ? 'Sửa lịch hẹn' : 'Lịch hẹn mới'
  const submitLabel = event ? 'Lưu' : 'Tạo lịch hẹn'
  const backLabel = event ? 'Quay lại chi tiết lịch hẹn' : 'Quay lại Lịch'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <MobilePageHeader
        back={{ to: back, label: backLabel }}
        title={title}
        action={
          <Button type="submit" form={form.id} size="sm" disabled={form.pending}>
            {submitLabel}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <EventFormFields form={form} />
        <Spec>{timeZoneLabel(now)}</Spec>
      </div>
    </div>
  )
}
