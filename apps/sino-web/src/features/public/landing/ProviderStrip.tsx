// Copied from apps/sino-site/src/pages/messages/ProviderStrip.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { microLabel } from '../ui'
import { SOON } from './SectionHead'

const PROVIDERS = [
  { id: 'gmail', name: 'Gmail', soon: false },
  { id: 'zalo', name: 'Zalo', soon: true },
  { id: 'messenger', name: 'Messenger', soon: true },
  { id: 'telegram', name: 'Telegram', soon: true },
]

/** Canvas `lp-strip`: Gmail connects today; the others carry "Sắp có" (D-241). */
export function ProviderStrip() {
  return (
    <div
      aria-label="Dịch vụ kết nối được"
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-y border-border py-7"
    >
      <span className={microLabel}>KẾT NỐI VỚI</span>
      <div className="flex flex-wrap items-center gap-x-9 gap-y-4">
        {PROVIDERS.map((p) => (
          <span
            key={p.id}
            data-slot="provider"
            data-soon={p.soon || undefined}
            className={cn(
              'inline-flex items-center gap-2.5 text-[15px] leading-5 font-semibold text-foreground',
              p.soon && 'text-muted-foreground',
            )}
          >
            <span className="grid size-6 place-items-center rounded-[7px] border border-border bg-raised text-foreground">
              <ProviderIcon provider={p.id} className="size-3.5" />
            </span>
            {p.name}
            {p.soon && <Badge>{SOON}</Badge>}
          </span>
        ))}
      </div>
    </div>
  )
}
