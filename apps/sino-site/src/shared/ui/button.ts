import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'

/**
 * The canvas `.btn`, copied from sino-web/src/shared/ui/button.tsx. The site has links that look like buttons, not
 * buttons, so it keeps only the class names: `<a className={buttonVariants()}>` (D-251).
 */
const variants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-transparent text-sm font-semibold tracking-[-0.005em] whitespace-nowrap select-none transition-[background-color,border-color,color,transform] duration-(--dur-hover) ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:-translate-y-px hover:bg-primary-hover motion-reduce:hover:translate-y-0',
        secondary: 'border-border-strong bg-surface text-foreground hover:border-subtle-foreground hover:bg-hover',
        ghost: 'text-muted-foreground hover:bg-hover hover:text-foreground',
      },
      size: {
        default: 'h-11 px-4.5',
        sm: "h-9 rounded-[8px] px-3 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        'icon-sm': "size-9 rounded-[8px] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof variants>

/** The classes of a button; like the Button of sino-web, `cn` drops the base classes a variant replaces. */
export function buttonVariants({ className, ...props }: ButtonVariants & { className?: string } = {}) {
  return cn(variants(props), className)
}
