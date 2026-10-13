import { useId } from 'react'
import type { LocalDate } from '@/shared/domain'
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '@/shared/time/local'
import { weekdayOfDate } from '@/shared/time/localDate'
import { Input } from '@/shared/ui/input'
import { MAX_COUNT, MAX_INTERVAL, WEEKDAYS, type CustomRule, type RepeatChoice, type TaskFormErrors } from '../taskForm'
import type { Weekday } from '../tasks.types'
import { errorIdOf, invalidProps } from './fieldProps'
import { Field, FieldError, SelectBox } from './fields'

const CHOICES: { value: RepeatChoice; label: string }[] = [
  { value: 'NONE', label: 'Không lặp' },
  { value: 'DAILY', label: 'Hằng ngày' },
  { value: 'WEEKLY', label: 'Hằng tuần' },
  { value: 'MONTHLY', label: 'Hằng tháng' },
  { value: 'YEARLY', label: 'Hằng năm' },
  { value: 'CUSTOM', label: 'Tùy chỉnh…' },
]

const UNITS: { value: CustomRule['freq']; label: string }[] = [
  { value: 'DAILY', label: 'ngày' },
  { value: 'WEEKLY', label: 'tuần' },
  { value: 'MONTHLY', label: 'tháng' },
  { value: 'YEARLY', label: 'năm' },
]

const ENDS: { value: CustomRule['end']; label: string }[] = [
  { value: 'NEVER', label: 'Không bao giờ' },
  { value: 'UNTIL', label: 'Vào ngày' },
  { value: 'COUNT', label: 'Sau số lần' },
]

// Weekday numbers (0 = Sunday) from Monday, as the weeks of the Lịch screen.
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const LABEL = 'text-[13px] leading-[18px] font-semibold'

const weekdayOf = (date: LocalDate): Weekday => WEEKDAYS[weekdayOfDate(date)]

/**
 * "Lặp lại" of the canvas forms (`InboxTask`, `InboxEvent`): the presets, and "Tùy chỉnh…" with every N, the weekdays of
 * a weekly rule and the end (D-158; the canvas does not draw that part, so it is built from its chips and boxes).
 * Without a date there is nothing to repeat: the box shows "Không lặp" and is disabled. Two cells of the form grid: the
 * box, and the custom part across the grid.
 */
export function RecurrenceField({
  date,
  repeat,
  custom,
  errors,
  onRepeat,
  onCustom,
}: {
  date: LocalDate | ''
  repeat: RepeatChoice
  custom: CustomRule
  errors: TaskFormErrors
  onRepeat: (repeat: RepeatChoice) => void
  onCustom: (custom: CustomRule) => void
}) {
  const id = useId()
  const choose = (next: RepeatChoice) => {
    onRepeat(next)
    // A task that had no due starts its custom rule without a weekday.
    if (next === 'CUSTOM' && date && custom.byWeekdays.length === 0) {
      onCustom({ ...custom, byWeekdays: [weekdayOf(date)] })
    }
  }

  return (
    <>
      <Field label="Lặp lại" id={id} error={errors.repeat} className="col-span-2 sm:col-span-1">
        <SelectBox
          id={id}
          value={date ? repeat : 'NONE'}
          disabled={!date}
          onChange={(event) => choose(event.target.value as RepeatChoice)}
          {...invalidProps(id, errors.repeat)}
        >
          {CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </SelectBox>
      </Field>
      {date && repeat === 'CUSTOM' && <CustomRuleFields date={date} custom={custom} errors={errors} onCustom={onCustom} />}
    </>
  )
}

function CustomRuleFields({
  date,
  custom,
  errors,
  onCustom,
}: {
  date: LocalDate
  custom: CustomRule
  errors: TaskFormErrors
  onCustom: (custom: CustomRule) => void
}) {
  const id = useId()
  const every = `${id}-every`
  const days = `${id}-days`
  const end = `${id}-end`
  const set = (fields: Partial<CustomRule>) => onCustom({ ...custom, ...fields })
  const toggle = (day: Weekday) =>
    set({ byWeekdays: custom.byWeekdays.includes(day) ? custom.byWeekdays.filter((other) => other !== day) : [...custom.byWeekdays, day] })
  const unit = (freq: CustomRule['freq']) =>
    set({ freq, byWeekdays: freq === 'WEEKLY' && custom.byWeekdays.length === 0 ? [weekdayOf(date)] : custom.byWeekdays })

  return (
    <div className="col-span-2 flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <label htmlFor={every} className={LABEL}>
            Mỗi
          </label>
          <Input
            id={every}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_INTERVAL}
            // An emptied box is 0 until something is typed; the check before saving says what it takes.
            value={custom.interval || ''}
            onChange={(event) => set({ interval: event.target.valueAsNumber || 0 })}
            className="w-20"
            {...invalidProps(every, errors.interval)}
          />
          <SelectBox aria-label="Đơn vị lặp" value={custom.freq} onChange={(event) => unit(event.target.value as CustomRule['freq'])} className="w-28">
            {UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectBox>
        </div>
        <FieldError id={errorIdOf(every)}>{errors.interval}</FieldError>
      </div>

      {custom.freq === 'WEEKLY' && (
        <div role="group" aria-labelledby={days} {...(errors.weekdays && { 'aria-describedby': errorIdOf(days) })} className="flex flex-col gap-2">
          <span id={days} className={LABEL}>
            Vào các thứ
          </span>
          <div className="flex flex-wrap gap-2">
            {WEEK.map((index) => {
              const day = WEEKDAYS[index]
              return (
                // Canvas `.chip`, a little narrower so the seven fit one row at 390 px.
                <button
                  key={day}
                  type="button"
                  aria-pressed={custom.byWeekdays.includes(day)}
                  aria-label={WEEKDAY_NAMES[index]}
                  onClick={() => toggle(day)}
                  className="inline-flex h-8.5 min-w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface px-2.5 text-[13px] leading-[18px] font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-foreground aria-pressed:bg-raised aria-pressed:text-foreground"
                >
                  {WEEKDAY_SHORT[index]}
                </button>
              )
            })}
          </div>
          <FieldError id={errorIdOf(days)}>{errors.weekdays}</FieldError>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={end} className={LABEL}>
          Kết thúc
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <SelectBox id={end} value={custom.end} onChange={(event) => set({ end: event.target.value as CustomRule['end'] })} className="w-40">
            {ENDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectBox>
          {custom.end === 'UNTIL' && (
            <Input
              type="date"
              aria-label="Ngày kết thúc"
              min={date}
              value={custom.untilDate}
              onChange={(event) => set({ untilDate: event.target.value })}
              className="w-44"
              {...invalidProps(end, errors.end)}
            />
          )}
          {custom.end === 'COUNT' && (
            <span className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                aria-label="Số lần"
                min={1}
                max={MAX_COUNT}
                value={custom.count || ''}
                onChange={(event) => set({ count: event.target.valueAsNumber || 0 })}
                className="w-20"
                {...invalidProps(end, errors.end)}
              />
              <span className="text-sm text-muted-foreground">lần</span>
            </span>
          )}
        </div>
        <FieldError id={errorIdOf(end)}>{errors.end}</FieldError>
      </div>
    </div>
  )
}
