import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { healthView, syncStatusView } from '@/features/accounts/format'
import type { AccountItem } from '@/features/accounts/accounts.types'
import { useAccounts } from '@/features/accounts/useAccounts'
import { providerNameOf } from '@/shared/format'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { SoonButton } from '@/shared/ui/soon-button'
import { Status } from '@/shared/ui/status'
import { formatCount, formatMegabytes } from '../settings.options'
import { useStorageUse } from '../useSettings'
import { SettingRow, SettingSection } from './SettingRow'

/** What Sino keeps, counted by the server (settings-backend, D-406); "Xuất dữ liệu" and "Xóa dữ liệu" do nothing yet (D-399). */
export function PrivacyRows() {
  const { storage, failed } = useStorageUse()
  return (
    <>
      <SettingRow
        title="Dữ liệu Sino đang lưu"
        description={
          storage ? (
            <>
              <span className="tabular-nums">{formatCount(storage.messages)}</span> thư và tin nhắn ·{' '}
              <span className="tabular-nums">{formatMegabytes(storage.bytes)}</span> · tệp đính kèm chỉ lưu tên và dung lượng
            </>
          ) : failed ? (
            'Chưa tính được.'
          ) : (
            'Đang tính…'
          )
        }
        inline
        control={
          <SoonButton variant="secondary" size="sm">
            Xuất dữ liệu
          </SoonButton>
        }
      />
      <SettingRow
        title="Xóa toàn bộ dữ liệu"
        description="Xóa mọi thư đã lưu và ngắt kết nối mọi tài khoản. Không hoàn tác được."
        inline
        control={
          <SoonButton variant="danger" size="sm">
            Xóa dữ liệu
          </SoonButton>
        }
      />
    </>
  )
}

export function PrivacySection() {
  return (
    <SettingSection id="rieng-tu" title="Quyền riêng tư và dữ liệu">
      <PrivacyRows />
    </SettingSection>
  )
}

// A signed-out account says so in the colour of an error, as the canvas; otherwise how its sync goes.
const accountStatus = (account: AccountItem) => (account.status === 'AUTH_EXPIRED' ? healthView(account, new Date()) : syncStatusView(account))

/** The user's real accounts (D-396): provider, address, state; managing them stays on the Tài khoản screen. */
export function SourcesSection() {
  const { list } = useAccounts()
  const nameOf = list ? providerNameOf(list.providers) : null
  return (
    <SettingSection id="nguon" title="Nguồn đã kết nối" action={<SourcesLink />}>
      {list === undefined ? (
        <p role="status" className="py-3.5 text-sm text-muted-foreground">
          Đang tải…
        </p>
      ) : list.accounts.length === 0 ? (
        <p className="py-3.5 text-sm text-muted-foreground">Chưa kết nối tài khoản nào.</p>
      ) : (
        list.accounts.map((account) => {
          const { tone, label } = accountStatus(account)
          return (
            <SettingRow
              key={account.id}
              title={
                <span className="flex min-w-0 items-center gap-3">
                  <AccountAvatar provider={account.provider} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm leading-5 font-semibold">{nameOf?.(account.provider) ?? account.provider}</span>
                    <span className="truncate font-mono text-[11px] leading-4 font-medium text-muted-foreground">{account.address}</span>
                  </span>
                </span>
              }
              inline
              control={<Status tone={tone}>{label}</Status>}
            />
          )
        })
      )}
    </SettingSection>
  )
}

function SourcesLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-mr-2">
      <Link to="/accounts">
        Quản lý trong Tài khoản
        <ChevronRight strokeWidth={1.6} />
      </Link>
    </Button>
  )
}

/** Only what is true everywhere; the list of sessions and "Đăng xuất thiết bị khác" wait for a backend that has them. */
export function SecurityRows() {
  return (
    <SettingRow
      title="Mã hóa thông tin đăng nhập"
      description="Token của các nhà cung cấp được mã hóa trước khi lưu, không ai đọc được dạng gốc."
      inline
      control={<Badge className="font-mono">AES-256-GCM</Badge>}
    />
  )
}

export function SecuritySection() {
  return (
    <SettingSection id="bao-mat" title="Bảo mật">
      <SecurityRows />
    </SettingSection>
  )
}

/** The privacy policy is the public page `/privacy`; version, terms and licences are left out until there is something real to show. */
export function AboutSection() {
  return (
    <SettingSection id="ve-sino" title="Về Sino">
      <div className="flex flex-wrap gap-2 py-3.5">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/privacy">Chính sách quyền riêng tư</Link>
        </Button>
      </div>
    </SettingSection>
  )
}
