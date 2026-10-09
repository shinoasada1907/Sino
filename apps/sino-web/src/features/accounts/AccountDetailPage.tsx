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
import { ListUnavailable } from './components/ListUnavailable'
import { ActivityCard, ScopesCard, SitesCard, SyncHistoryCard } from './components/DetailCards'
import { DisconnectDialog } from './components/DisconnectDialog'
import { ImportAlert } from './components/ImportAlert'
import { MobileAccountDetail } from './components/MobileAccountDetail'
import { ReauthAlert } from './components/ReauthAlert'
import { SectionCard } from './components/SectionCard'
import { liveSyncError, liveSyncText, syncNowFailure } from './connect.format'
import { channelSummary, disconnectNote, reauthNotice, syncStatusView } from './format'
import { useAccount } from './useAccounts'
import { useRequestSync, useSyncStatus } from './useLiveSync'

/**
 * The detail of one account (canvas `AccountDetail`, `MobileAccountDetail`): six cards on a 12-column grid from 768 px,
 * the short mobile layout below. Signing in again and "Đồng bộ ngay" go through the connect wizard of the list
 * (`/accounts?reconnect=…`, `/accounts?sync=…`); the open-provider button has no flow yet.
 */
export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const { list, account, extras, notFound, receivedAt, error, retry } = useAccount(accountId)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const back = { to: '/accounts', label: 'Quay lại Tài khoản' }
  const importDone = account?.firstImport?.state === 'DONE'
  const liveSync = useSyncStatus(accountId, importDone)
  const syncNow = useRequestSync()

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
  if (!list && error) {
    return (
      <>
        <MobilePageHeader back={back} title="Tài khoản" />
        <ListUnavailable onRetry={retry} />
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
      <MobilePageHeader back={back} title={name} subtitle={account.address} />
      {/* One alert above both layouts, so its button is not drawn twice. */}
      <ImportAlert account={account} providerName={name} className="mx-4 mt-4 md:mx-6 md:mt-6 xl:mx-8 xl:mt-8" />
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
              {account.address}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm text-muted-foreground">
                {name} · {account.displayName} · kết nối từ {formatDate(new Date(account.createdAt))}
              </span>
              <Status tone={sync.tone}>{sync.label}</Status>
              {liveSync && <span className="text-sm text-muted-foreground">{liveSyncText(liveSync, now)}</span>}
            </div>
            {liveSync?.lastError && <p className="text-sm text-danger-ink">{liveSyncError(liveSync.lastError, name)}</p>}
            {syncNow.isError && (
              <p role="alert" className="text-sm text-danger-ink">
                {syncNowFailure(syncNow.error)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button type="button" variant="ghost" size="sm">
              <ExternalLink strokeWidth={1.6} />
              Mở {name}
            </Button>
            {account.firstImport?.state === 'RUNNING' || importDone ? (
              // An imported account syncs what changed (D-95); one still importing cannot.
              <Button type="button" variant="secondary" size="sm" disabled={!importDone || syncNow.isPending} onClick={() => syncNow.mutate(account.id)}>
                <RefreshCw strokeWidth={1.6} />
                Đồng bộ ngay
              </Button>
            ) : (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/accounts?sync=${account.id}`}>
                  <RefreshCw strokeWidth={1.6} />
                  Đồng bộ ngay
                </Link>
              </Button>
            )}
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
                  Ngắt kết nối {account.address}
                </Button>
              }
            />
          </SectionCard>
        </div>
      </div>
    </>
  )
}
