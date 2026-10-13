import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

// Canvas `.alert.alert-err` of `Accounts`. "Đăng nhập lại" opens the connect wizard of the list at the scopes step.
export function ReauthAlert({ title, detail, accountId }: { title: string; detail: string; accountId: string }) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5">
      <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <Button asChild variant="primary" size="sm">
        <Link to={`/accounts?reconnect=${accountId}`}>Đăng nhập lại</Link>
      </Button>
    </div>
  )
}
