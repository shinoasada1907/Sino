import { Inbox, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { AccountItem } from '../accounts.types'
import { initialSyncFailure, startSyncFailure } from '../connect.format'
import { DEFAULT_SYNC_OPTIONS } from '../connect.types'
import { isMail } from '../format'
import { useStartInitialSync } from '../useConnect'

/**
 * Above the detail of a connected account whose first import has not started or has stopped (BE-45): what to do next.
 * The canvas has every account imported, so this follows `ReauthAlert`. An account to sign in again has that alert instead.
 */
export function ImportAlert({ account, providerName, className }: { account: AccountItem; providerName: string; className?: string }) {
  const startSync = useStartInitialSync()
  const status = account.firstImport
  const connected = account.status === 'CONNECTED' || account.status === 'DEGRADED'
  if (!status || !connected || (status.state !== 'NOT_STARTED' && status.state !== 'FAILED')) {
    return null
  }

  const noun = isMail(account.provider) ? 'thư' : 'tin nhắn'
  const stopped = status.state === 'FAILED' ? initialSyncFailure(status.errorCode, providerName) : null
  const detail = startSync.isError
    ? startSyncFailure(startSync.error)
    : (stopped?.text ?? `Sino chưa nhập ${noun} nào của tài khoản này. Nhập để đọc trong Hộp thư.`)
  const Icon = stopped ? TriangleAlert : Inbox

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-sm border bg-surface px-4 py-3.5',
        stopped && 'border-[color-mix(in_srgb,var(--danger)_40%,var(--border))]',
        className,
      )}
    >
      <Icon className={cn('mt-px size-4.5 shrink-0', stopped ? 'text-danger' : 'text-muted-foreground')} strokeWidth={1.6} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{stopped ? `Lần nhập ${noun} đầu tiên đã dừng` : `Chưa nhập ${noun}`}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      {stopped?.fix === 'SIGN_IN' ? (
        <Button asChild variant="primary" size="sm">
          <Link to={`/accounts?reconnect=${account.id}`}>Đăng nhập lại</Link>
        </Button>
      ) : stopped ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={startSync.isPending}
          onClick={() => startSync.mutate({ accountId: account.id, options: { ...DEFAULT_SYNC_OPTIONS, range: status.range ?? DEFAULT_SYNC_OPTIONS.range } })}
        >
          Nhập tiếp
        </Button>
      ) : (
        <Button asChild variant="primary" size="sm">
          <Link to={`/accounts?sync=${account.id}`}>Nhập {noun}</Link>
        </Button>
      )}
    </div>
  )
}
