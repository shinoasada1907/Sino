import { ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { formatDate } from '@/shared/time/local'
import { useNow } from '@/shared/time/useNow'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import { ChannelRows } from './components/Channels'
import { ActivityCard, ScopesCard, SitesCard, SyncHistoryCard } from './components/DetailCards'
import { DisconnectDialog } from './components/DisconnectDialog'
import { MobileAccountDetail } from './components/MobileAccountDetail'
import { ReauthAlert } from './components/ReauthAlert'
import { SectionCard } from './components/SectionCard'
import { channelSummary, disconnectNote, reauthNotice, syncStatusView } from './format'
import { useAccount } from './useAccounts'

/**
 * The detail of one account (canvas `AccountDetail`, `MobileAccountDetail`): six cards on a 12-column grid from 768 px,
 * the short mobile layout below. Open-provider and sync buttons have no flow yet; signing in again goes through the
 * connect wizard of the list (`/accounts?reconnect=…`).
 */
export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const { list, account, extras, notFound, receivedAt } = useAccount(accountId)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const back = { to: '/accounts', label: 'Quay lại Tài khoản' }

  if (notFound) {
    return (
      <>
        <MobilePageHeader back={back} title="Tài khoản" />
        <div className="flex flex-col items-start gap-3 px-4 py-6 md:p-8">
          <p className="text-base">Không tìm thấy tài khoản này.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to="/accounts">Về danh sách tài khoản</Link>
          </Button>
        </div>
      </>
    )
  }
  if (!list || !account) {
    return (
      <p role="status" className="p-8 text-sm text-muted-foreground">
        Đang tải…
      </p>
    )
  }

  const nameOf = providerNameOf(list.providers)
  const name = nameOf(account.provider)
  const sync = syncStatusView(account)

  return (
    <>
      <MobilePageHeader back={back} title={name} subtitle={account.externalAccountId} />
      <MobileAccountDetail account={account} now={now} nameOf={nameOf} className="md:hidden" />

      <div className="hidden flex-col gap-5 p-6 md:flex xl:gap-6 xl:p-8">
        <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
          <Link to="/accounts">
            <ChevronLeft strokeWidth={1.6} />
            Tài khoản
          </Link>
        </Button>

        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-5">
          <AccountAvatar provider={account.provider} size="lg" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate text-[28px] leading-9 font-semibold tracking-[-0.018em] xl:text-[40px] xl:leading-12 xl:font-bold xl:tracking-[-0.028em]">
              {account.externalAccountId}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm text-muted-foreground">
                {name} · {account.displayName} · kết nối từ {formatDate(new Date(account.createdAt))}
              </span>
              <Status tone={sync.tone}>{sync.label}</Status>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button type="button" variant="ghost" size="sm">
              <ExternalLink strokeWidth={1.6} />
              Mở {name}
            </Button>
            <Button type="button" variant="secondary" size="sm">
              <RefreshCw strokeWidth={1.6} />
              Đồng bộ ngay
            </Button>
          </div>
        </header>

        {account.status === 'AUTH_EXPIRED' && <ReauthAlert {...reauthNotice(account, nameOf, now)} accountId={account.id} />}

        <div className="grid grid-cols-12 gap-4">
          <SectionCard title="Kênh đã kết nối" meta={<Spec>{channelSummary(account)}</Spec>} className="col-span-7">
            <ChannelRows account={account} now={now} />
          </SectionCard>
          <ScopesCard scopes={extras?.scopes ?? null} account={account} now={now} className="col-span-5" />
          <SitesCard sites={extras?.sites ?? null} className="col-span-7" />
          <SyncHistoryCard runs={extras?.syncRuns ?? null} account={account} now={now} className="col-span-5" />
          <ActivityCard activity={extras?.activity ?? null} account={account} nameOf={nameOf} className="col-span-7" />
          <SectionCard title="Ngắt kết nối tài khoản" danger className="col-span-5">
            <p className="text-sm text-muted-foreground">{disconnectNote(account)}</p>
            <DisconnectDialog
              account={account}
              nameOf={nameOf}
              trigger={
                <Button type="button" variant="danger" size="sm" className="self-start">
                  Ngắt kết nối {account.externalAccountId}
                </Button>
              }
            />
          </SectionCard>
        </div>
      </div>
    </>
  )
}
