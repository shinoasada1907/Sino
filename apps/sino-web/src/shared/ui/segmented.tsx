import { cn } from '@/shared/lib/utils'

// The canvas `.seg`: a small group of toggle buttons where exactly one is pressed.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-1 rounded-full bg-raised p-1 shadow-[inset_0_0_0_1px_var(--border)]', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className="inline-flex h-9 cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-40 gap-2 rounded-full px-3.5 text-[13px] leading-[18px] font-bold text-muted-foreground transition-[background-color,border-color,color] duration-(--dur-hover) ease-out outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export { Segmented }
