import { ChevronDown, CircleAlert } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { errorIdOf } from './fieldProps'

/** Canvas `.field`: the label, the control with the id `id`, and its error. */
export function Field({ label, id, error, className, children }: { label: string; id: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[13px] leading-[18px] font-semibold">
        {label}
      </label>
      {children}
      <FieldError id={errorIdOf(id)}>{error}</FieldError>
    </div>
  )
}

/** Canvas `.field-error`. */
export function FieldError({ id, children }: { id: string; children: string | undefined }) {
  if (!children) {
    return null
  }
  return (
    <span id={id} className="inline-flex items-start gap-1.5 text-xs leading-4 font-medium text-danger-ink">
      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.6} />
      {children}
    </span>
  )
}

/** Canvas `.input-wrap.select-wrap`: a native select with the chevron of the canvas. */
export function SelectBox({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative has-disabled:opacity-45', className)}>
      <select
        className="h-11 w-full cursor-pointer appearance-none rounded-sm border border-border bg-surface pr-10 pl-3.5 text-sm text-foreground transition-[border-color,box-shadow] duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus:border-foreground focus:ring-3 focus:ring-foreground/16 disabled:cursor-not-allowed aria-invalid:border-danger"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
    </div>
  )
}
