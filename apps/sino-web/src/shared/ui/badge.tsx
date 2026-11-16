import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'

// The canvas `.tag`: a round label such as "Độ nhạy cao" or "Tạm dừng". The default is the grey one; accent, honey, dusk,
// ok and bad are the soft tones; `solid` is the accent colour filled, for the one label that must stand out.
const badgeVariants = cva(
  'inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.75 text-xs leading-4 font-bold whitespace-nowrap',
  {
    variants: {
      tone: {
        default: 'bg-hover text-muted-foreground',
        accent: 'bg-brand-soft text-brand-ink',
        solid: 'bg-primary text-primary-foreground',
        honey: 'bg-honey-soft text-honey',
        dusk: 'bg-dusk-soft text-dusk-ink',
        ok: 'bg-success-soft text-success',
        bad: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" data-tone={tone ?? 'default'} className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge }
