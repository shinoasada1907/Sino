import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { healthView, syncStatusView } from '@/features/accounts/format'
import type { AccountItem } from '@/features/accounts/accounts.types'
import { useAccounts } from '@/features/accounts/useAccounts'
import { providerNameOf } from '@/shared/format'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Status } from '@/shared/ui/status'
import { formatCount } from '../settings.sample'
import { useSettingsSample } from '../useSettingsSample'
import { SettingRow, SettingSection } from './SettingRow'

/** What Sino keeps; "Xuất dữ liệu" and "Xóa dữ liệu" do nothing yet (D-399). */
export function PrivacyRows() {
  const { settings } = useSettingsSample()
  return (
    <>
      <SettingRow
        title="Dữ liệu Sino đang lưu"
        description={
          <>
            <span className="tabular-nums">{formatCount(settings.stored.messages)}</span> thư và tin nhắn ·{' '}
            <span className="tabular-nums">{formatCount(settings.stored.megabytes)} MB</span> · tệp đính kèm chỉ lưu tên và dung lượng
          </>
        }
        inline
        control={
          <Button type="button" variant="secondary" size="sm">
            Xuất dữ liệu
          </Button>
        }
      />
      <SettingRow
        title="Xóa toàn bộ dữ liệu"
        description="Xóa mọi thư đã lưu và ngắt kết nối mọi tài khoản. Không hoàn tác được."
        inline
        control={
          <Button type="button" variant="danger" size="sm">
            Xóa dữ liệu
          </Button>
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

/** "Đăng xuất thiết bị khác" does nothing yet (D-399). */
export function SecurityRows() {
  const { settings } = useSettingsSample()
  return (
    <>
      <SettingRow
        title="Mã hóa thông tin đăng nhập"
        description="Token của các nhà cung cấp được mã hóa trước khi lưu, không ai đọc được dạng gốc."
        inline
        control={<Badge className="font-mono">AES-256-GCM</Badge>}
      />
      <SettingRow
        title="Phiên đăng nhập"
        description={`${settings.sessions.count} thiết bị · ${settings.sessions.summary}`}
        inline
        control={
          <Button type="button" variant="ghost" size="sm">
            Đăng xuất thiết bị khác
          </Button>
        }
      />
    </>
  )
}

export function SecuritySection() {
  return (
    <SettingSection id="bao-mat" title="Bảo mật">
      <SecurityRows />
    </SettingSection>
  )
}

/** The version is sample data: the web app has none yet (D-396). The privacy policy is the public page `/privacy`. */
export function AboutSection() {
  const { settings } = useSettingsSample()
  return (
    <SettingSection id="ve-sino" title="Về Sino">
      <SettingRow
        title="Phiên bản"
        description={
          <span className="font-mono text-[11px] leading-4 font-medium">
            Sino {settings.version} · bản dựng {settings.build}
          </span>
        }
        inline
        control={
          <Button type="button" variant="ghost" size="sm">
            Có gì mới
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2 py-3.5">
        <Button type="button" variant="ghost" size="sm" className="-ml-3">
          Điều khoản
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/privacy">Chính sách quyền riêng tư</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm">
          Phần mềm nguồn mở đã dùng
        </Button>
      </div>
    </SettingSection>
  )
}
