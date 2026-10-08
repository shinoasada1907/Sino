import { TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'

// Canvas `.alert.alert-err` of `Accounts`. Signing in again belongs to the connect flow, not built yet (D-46).
export function ReauthAlert({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5">
      <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <Button type="button" variant="primary" size="sm">
        Đăng nhập lại
      </Button>
    </div>
  )
}
