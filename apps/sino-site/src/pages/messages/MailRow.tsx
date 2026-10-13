import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { spec } from '@/shared/ui/text'

export interface Mail {
  sender: string
  subject: string
  preview: string
  time: string
  unread?: boolean
  selected?: boolean
  count?: number
  flag?: ReactNode
}

/** A Gmail row of the canvas inbox (`mrow`), drawn in the pictures of the home page. */
export function MailRow({ mail, className }: { mail: Mail; className?: string }) {
  const strong = mail.unread && 'font-bold text-foreground'
  return (
    <div
      data-slot="mail-row"
      className={cn(
        'grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-x-3.5 rounded-[12px] border border-transparent p-3.5 transition-colors duration-(--dur-hover) ease-out hover:bg-hover',
        mail.selected && 'border-border-strong bg-raised hover:bg-raised',
        className,
      )}
    >
      <span className="grid size-9 place-items-center rounded-sm border border-border bg-raised text-foreground">
        <ProviderIcon provider="gmail" />
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className={cn('min-w-0 truncate text-sm leading-5 font-medium text-foreground', strong)}>{mail.sender}</span>
          <span data-slot="mail-source" className={cn(spec, 'truncate')}>
            Gmail
          </span>
        </div>
        <span className={cn('truncate text-sm leading-5 font-medium text-muted-foreground', strong)}>{mail.subject}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">{mail.preview}</span>
        {mail.flag && (
          <span className="mt-[3px] inline-flex items-center gap-[5px] font-mono text-[11px] leading-4 font-medium text-muted-foreground [&_svg]:size-3">
            {mail.flag}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 pt-0.5">
        <span className={cn(spec, (mail.unread || mail.selected) && 'text-foreground')}>{mail.time}</span>
        {mail.count && (
          <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-xs border border-primary bg-primary px-2 font-mono text-[11px] leading-4 font-semibold text-primary-foreground">
            {mail.count}
          </span>
        )}
      </div>
    </div>
  )
}
