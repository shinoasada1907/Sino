import { Lock, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { sendBlockText, type SendBlock } from '../format'
import type { ConversationKind } from '../inbox.types'

/**
 * Canvas `ThreadState` `.blocked`, in place of the reply box: an account that must sign in again (red, "Kết nối lại"),
 * or one that can still read but no longer send (amber, "Cấp lại quyền gửi"). Both open the connect wizard at the
 * sign-in step; "Trả lời trong …" has no flow yet (D-52).
 */
export function ThreadNotice({
  block,
  kind,
  providerName,
  account,
}: {
  block: SendBlock
  kind: ConversationKind
  providerName: string
  account: { id: string; externalAccountId: string }
}) {
  const { title, text } = sendBlockText(block, kind, providerName, account.externalAccountId)
  const reconnect = block === 'RECONNECT'
  const Icon = reconnect ? TriangleAlert : Lock
  const to = `/accounts?reconnect=${account.id}`

  return (
    <div className="border-t bg-background px-3 pt-2.5 pb-6 md:px-5 md:pt-3 md:pb-4 xl:px-6 xl:pt-4 xl:pb-5">
      <div
        role={reconnect ? 'alert' : 'status'}
        className={cn(
          'flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-md border bg-surface px-4.5 py-4',
          reconnect ? 'border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]' : 'border-[color-mix(in_srgb,var(--warning)_40%,var(--border))]',
        )}
      >
        <Icon className={cn('size-4.5 shrink-0', reconnect ? 'text-danger' : 'text-warning')} strokeWidth={1.6} />
        <div className="flex min-w-0 grow basis-56 flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground">{text}</span>
        </div>
        {reconnect ? (
          <Button asChild variant="primary" size="sm">
            <Link to={to}>Kết nối lại</Link>
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm">
              Trả lời trong {providerName}
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to={to}>Cấp lại quyền gửi</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
