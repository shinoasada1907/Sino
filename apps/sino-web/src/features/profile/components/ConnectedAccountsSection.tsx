import { ChevronRight, Link2, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { useAccounts } from '@/features/accounts/useAccounts'
import { syncStatusView } from '@/features/accounts/format'
import { providerNameOf } from '@/shared/format'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Button } from '@/shared/ui/button'
import { Status } from '@/shared/ui/status'

export function ConnectedAccountsSection() {
  const { list } = useAccounts()
  const nameOf = list ? providerNameOf(list.providers) : null

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Link2 className="size-5 text-primary" strokeWidth={1.8} />
          <div>
            <h3 className="text-base font-semibold text-foreground">Tài khoản liên kết</h3>
            <p className="text-xs text-muted-foreground">Các kênh tin nhắn & thư đang kết nối đồng bộ với Sino.</p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex gap-1 text-xs">
          <Link to="/accounts">
            Quản lý
            <ChevronRight className="size-3.5" strokeWidth={1.8} />
          </Link>
        </Button>
      </div>

      <div className="mt-4 divide-y divide-border">
        {list === undefined ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Đang tải danh sách tài khoản…</p>
        ) : list.accounts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Chưa có tài khoản nào được kết nối.</p>
            <Button asChild size="sm" variant="secondary" className="mt-3 gap-1.5">
              <Link to="/accounts">
                <Plus className="size-4" />
                Kết nối ngay
              </Link>
            </Button>
          </div>
        ) : (
          list.accounts.map((account) => {
            const { tone, label } = syncStatusView(account)
            return (
              <div key={account.id} className="flex items-center justify-between py-3.5 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <AccountAvatar provider={account.provider} />
                  <div className="min-w-0 flex flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {nameOf?.(account.provider) ?? account.provider}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {account.address}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 pl-3">
                  <Status tone={tone}>{label}</Status>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border flex sm:hidden justify-end">
        <Button asChild variant="ghost" size="sm" className="w-full justify-center gap-1 text-xs">
          <Link to="/accounts">
            Xem tất cả trong mục Tài khoản
            <ChevronRight className="size-3.5" strokeWidth={1.8} />
          </Link>
        </Button>
      </div>
    </div>
  )
}
