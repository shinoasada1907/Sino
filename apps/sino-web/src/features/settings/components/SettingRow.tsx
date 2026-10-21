import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { Switch } from '@/shared/ui/switch'

/** Canvas `.set-sec`: a section of the settings with its heading, the target of a link of the table of contents. */
export function SettingSection({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-1 border-t pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id={`${id}-title`} className="text-xl leading-7 font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Canvas `.set-row`: the name of a setting in bold, what it does below, and its control on the right; on a phone the
 * control goes under the text. `labelFor` ties the name to a form control, so a screen reader names it.
 */
export function SettingRow({
  title,
  description,
  labelFor,
  control,
  stale,
  inline,
}: {
  title: ReactNode
  description?: ReactNode
  labelFor?: string
  control: ReactNode
  stale?: boolean
  /** Keeps a small control (a switch, a button) on the right on a phone too. */
  inline?: boolean
}) {
  const Title = labelFor ? 'label' : 'span'
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-3 border-b py-3.5 last:border-b-0',
        !inline && 'max-md:grid-cols-1',
        stale && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Title {...(labelFor ? { htmlFor: labelFor } : {})} className="text-sm leading-5 font-semibold">
          {title}
        </Title>
        {description && <span className="text-sm leading-5 text-muted-foreground">{description}</span>}
      </div>
      {control}
    </div>
  )
}

/** The canvas `select` of a setting (`.input` with its chevron), 240 px wide from 768 px. */
export function SettingSelect<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="relative w-full md:w-60">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full cursor-pointer appearance-none rounded-sm border border-border bg-surface pr-10 pl-3.5 text-sm text-foreground transition-[border-color,box-shadow] duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus:border-foreground focus:ring-3 focus:ring-foreground/16"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
    </div>
  )
}

/** A row with a switch; the switch is named by the row's title. */
export function SwitchRow({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <SettingRow
      title={title}
      description={description}
      labelFor={id}
      inline
      control={<Switch id={id} checked={checked} onCheckedChange={onChange} />}
    />
  )
}
