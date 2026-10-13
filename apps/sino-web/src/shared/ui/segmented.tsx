import { cn } from '@/shared/lib/utils'

// The canvas `.seg`: a small group of toggle buttons where exactly one is pressed.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-1 rounded-xl border bg-surface p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[8px] border border-transparent px-3 text-[13px] leading-[18px] font-medium text-muted-foreground transition-[background-color,border-color,color] duration-(--dur-hover) ease-out outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-border-strong aria-pressed:bg-raised aria-pressed:text-foreground"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export { Segmented }
