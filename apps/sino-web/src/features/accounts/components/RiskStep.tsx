import { TriangleAlert } from 'lucide-react'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AccountItem } from '../accounts.types'
import { ZALO_RISK_WARNING } from '../connect.format'

/**
 * Step 2 of a QR connect (ZL-11, D-272, DN-2): warns that Sino connects personal Zalo unofficially and locks "Hiện mã QR"
 * until the user ticks "Tôi hiểu rủi ro".
 */
export function RiskStep({
  account,
  accepted,
  onAccept,
}: {
  account: AccountItem | undefined
  accepted: boolean
  onAccept: (accepted: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {account && (
        <>
          <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3">
            <AccountAvatar provider={account.provider} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{account.displayName}</span>
              <Spec className="truncate">{account.address}</Spec>
            </div>
            <Status tone="err">Cần đăng nhập lại</Status>
          </div>
          <div aria-hidden="true" className="h-px bg-border" />
        </>
      )}
      <div className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-surface px-4 py-3.5 text-sm">
        <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-warning-ink" strokeWidth={1.6} />
        <p className="leading-5 text-foreground">{ZALO_RISK_WARNING}</p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium select-none">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAccept(event.target.checked)}
          className="size-4.5 cursor-pointer rounded-[4px] border border-border-strong accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        />
        Tôi hiểu rủi ro
      </label>
    </div>
  )
}
