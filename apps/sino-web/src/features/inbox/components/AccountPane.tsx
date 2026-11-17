import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { StatusDot, type StatusTone } from '@/shared/ui/status'
import type { InboxFilter } from '../format'
import type { InboxAccount, InboxData } from '../inbox.types'

const ITEM =
  'flex h-10 items-center gap-2.5 rounded-full px-3.5 text-sm font-bold text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-ink'

function accountTone(account: InboxAccount): StatusTone {
  if (account.status === 'AUTH_EXPIRED' || account.status === 'ERROR') {
    return 'err'
  }
  if (account.status === 'DEGRADED' || account.syncProgress !== null) {
    return 'warn'
  }
  return account.status === 'DISABLED' ? 'off' : 'ok'
}

/**
 * The account column of the canvas `AccountColumn` (D-429), from 1280px: "Tất cả", then the accounts of the screen under
 * the name of their provider, each with its state dot and its unread count. A click filters by that account (the address
 * `?account=`); while one is chosen, "Xem tài khoản" opens its page.
 */
export function AccountPane({
  inbox,
  filter,
  to,
  nameOf,
  className,
}: {
  inbox: InboxData
  filter: InboxFilter
  /** Where the list goes for a change of filter: the same as the list's own, so an open conversation the filter leaves out closes (D-434). */
  to: (change: Partial<InboxFilter>) => To
  nameOf: ProviderNameOf
  className?: string
}) {
  const providers = inbox.providers.filter((provider) => inbox.accounts.some((account) => account.provider === provider.type))
  return (
    <nav aria-label="Tài khoản" className={cn('min-h-0 flex-col gap-0.5 overflow-y-auto px-2.5 py-3.5', className)}>
      <div className="flex items-center gap-2 px-2 pb-2.5">
        <span className="text-base font-extrabold">Tài khoản</span>
        {filter.account && (
          <Link to={`/accounts/${filter.account}`} className="ml-auto rounded-xs text-[13px] font-bold text-brand-ink outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid">
            Xem tài khoản
          </Link>
        )}
      </div>
      <Link to={to({ account: null })} aria-current={filter.account === null ? 'page' : undefined} className={ITEM}>
        <span className="size-2 shrink-0 rounded-full bg-subtle-foreground" aria-hidden="true" />
        <span>Tất cả</span>
        <Count value={inbox.counts.unread} />
      </Link>
      {providers.map((provider) => (
        <div key={provider.type} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 px-3 pt-3.5 pb-1 text-xs font-bold text-subtle-foreground">
            <ProviderIcon provider={provider.type} className="size-3.5" />
            {nameOf(provider.type)}
          </div>
          {inbox.accounts
            .filter((account) => account.provider === provider.type)
            .map((account) => {
              const expired = account.status === 'AUTH_EXPIRED'
              return (
                <Link key={account.id} to={to({ account: account.id })} aria-current={filter.account === account.id ? 'page' : undefined} className={ITEM}>
                  <StatusDot tone={accountTone(account)} />
                  <span className="min-w-0 flex-1 truncate">{account.address}</span>
                  {expired ? (
                    <>
                      <StatusDot tone="err" />
                      <span className="sr-only">cần đăng nhập lại</span>
                    </>
                  ) : (
                    <Count value={inbox.counts.byAccount[account.id]?.unread ?? 0} />
                  )}
                </Link>
              )
            })}
        </div>
      ))}
      <Link
        to="/accounts?connect=new"
        className="mt-3 flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <Plus className="size-4" strokeWidth={1.6} />
        Thêm nguồn
      </Link>
    </nav>
  )
}

/** The number of unread conversations on the accent (the canvas `.count.hot`, and `.on .count`); nothing for 0. */
function Count({ value }: { value: number }): ReactNode {
  if (value <= 0) {
    return null
  }
  return (
    <span className="ml-auto inline-flex h-5 min-w-5.5 items-center justify-center rounded-full bg-primary px-1.5 text-[11.5px] font-extrabold text-primary-foreground">{value}</span>
  )
}
