import { Plus, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { formatCount, providerNameOf } from '@/shared/format'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Segmented } from '@/shared/ui/segmented'
import { Status } from '@/shared/ui/status'
import { AccountsTable } from './components/AccountsTable'
import { ConnectWizard, type WizardState } from './components/ConnectWizard'
import { MobileAccountList } from './components/MobileAccountList'
import { ReauthAlert } from './components/ReauthAlert'
import {
  accountsHeadline,
  filterAccounts,
  latestSyncTime,
  mobileSubtitle,
  reauthNotice,
  ribbonItems,
  type AccountFilter,
} from './format'
import { useAccounts } from './useAccounts'

const FILTERS: { value: AccountFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'attention', label: 'Cần xử lý' },
]

/**
 * The Tài khoản screen (canvas `Accounts`, `MobileAccounts`): a table with search and filter from 768 px,
 * a short list under its own header on mobile. "Kết nối tài khoản" and "Đăng nhập lại" open the connect wizard
 * (`?reconnect={id}` opens it for that account); "Đồng bộ tất cả" has no flow yet.
 */
export function AccountsPage() {
  const { list, receivedAt } = useAccounts()
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AccountFilter>('all')
  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [handledVisit, setHandledVisit] = useState<string | null>(null)

  // "Đăng nhập lại" anywhere links here with ?reconnect=id. Each visit (location.key) is read once, while rendering,
  // as React advises for state that follows an input; clicking the same link again is a new visit.
  if (list && location.key !== handledVisit) {
    setHandledVisit(location.key)
    const account = list.accounts.find((item) => item.id === searchParams.get('reconnect'))
    if (account) {
      setWizard({ step: 2, provider: account.provider, accountId: account.id })
    }
  }

  // Then the parameter leaves the address without a new history entry, so reloading does not open the wizard again.
  useEffect(() => {
    if (searchParams.has('reconnect')) {
      setSearchParams(
        (params) => {
          params.delete('reconnect')
          return params
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  if (!list) {
    return (
      <p role="status" className="p-8 text-sm text-muted-foreground">
        Đang tải…
      </p>
    )
  }

  const { accounts } = list
  const nameOf = providerNameOf(list.providers)
  const shown = filterAccounts(accounts, { query, filter }, nameOf)
  const ribbon = ribbonItems(accounts)
  const lastSync = latestSyncTime(accounts)
  const connect = () => setWizard({ step: 1, provider: null, accountId: null })

  return (
    <>
      <MobilePageHeader
        back={{ to: '/more', label: 'Quay lại Thêm' }}
        title="Tài khoản"
        subtitle={mobileSubtitle(accounts)}
        action={
          <Button type="button" variant="ghost" size="icon" aria-label="Thêm tài khoản" onClick={connect}>
            <Plus strokeWidth={1.6} />
          </Button>
        }
      />
      <MobileAccountList accounts={accounts} now={now} nameOf={nameOf} onConnect={connect} className="md:hidden" />
      <ConnectWizard state={wizard} onChange={setWizard} accounts={accounts} nameOf={nameOf} />

      <div className="hidden flex-col gap-5 p-6 md:flex xl:gap-6 xl:p-8">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8">
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">
              {accountsHeadline(accounts.length)}
            </span>
            <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] xl:text-[40px] xl:leading-12 xl:font-bold xl:tracking-[-0.028em]">
              Tài khoản
            </h1>
            <p className="max-w-160 text-base text-muted-foreground">
              Mỗi tài khoản là một danh tính của bạn ở một nhà cung cấp. Sino đọc dữ liệu qua quyền bạn cấp và không lưu mật khẩu.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button type="button" variant="secondary" size="sm">
              <RefreshCw strokeWidth={1.6} />
              Đồng bộ tất cả
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={connect}>
              <Plus strokeWidth={1.6} />
              Kết nối tài khoản
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 rounded-md border bg-surface px-5 py-3.5">
          {ribbon.map((item) => (
            <Status key={item.label} tone={item.tone}>
              {item.label}
            </Status>
          ))}
          {ribbon.length > 0 && <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />}
          {lastSync && (
            <span className="text-sm text-muted-foreground">
              Đồng bộ gần nhất <Num>{lastSync}</Num>
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            Đã lưu <Num>{formatCount(list.storedMessages)}</Num> thư và tin nhắn
          </span>
        </div>

        {accounts
          .filter((account) => account.status === 'AUTH_EXPIRED')
          .map((account) => (
            <ReauthAlert key={account.id} {...reauthNotice(account, nameOf, now)} accountId={account.id} />
          ))}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-75">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.6}
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo email, số điện thoại, tên…"
              aria-label="Tìm tài khoản"
              className="pl-10.5"
            />
          </div>
          <Segmented label="Lọc tài khoản" value={filter} options={FILTERS} onChange={setFilter} />
        </div>

        <AccountsTable
          accounts={shown}
          emptyText={accounts.length === 0 ? 'Chưa kết nối tài khoản nào.' : 'Không có tài khoản nào khớp'}
          now={now}
          nameOf={nameOf}
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">Đồng bộ</span> cho biết dữ liệu có đang về không.
          </span>
          <span>
            <span className="font-semibold text-foreground">Sức khỏe</span> cho biết quyền truy cập còn dùng được bao lâu.
          </span>
        </div>
      </div>
    </>
  )
}

/** A number inside a sentence of the ribbon (canvas `.num`). */
function Num({ children }: { children: string }) {
  return <span className="font-mono text-[13px] leading-[18px] font-medium text-foreground">{children}</span>
}
