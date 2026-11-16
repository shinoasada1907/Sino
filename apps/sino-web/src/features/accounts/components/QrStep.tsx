import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Status } from '@/shared/ui/status'
import { qrFailedMessage } from '../connect.format'
import type { QrChallenge, QrConnectStatus } from '../connect.types'

/**
 * Step 3 of a QR connect (ZL-11, D-275): shows the QR code, the scanned nick name, or the terminal error/expiry state
 * with a button to request a fresh code.
 */
export function QrStep({
  challenge,
  status,
  starting,
  startFailed,
  onRetry,
}: {
  challenge: QrChallenge | null
  status: QrConnectStatus | null
  starting: boolean
  startFailed: boolean
  onRetry: () => void
}) {
  if (startFailed) {
    return (
      <div className="flex flex-col items-start gap-3 pt-2">
        <p
          role="alert"
          className="flex w-full items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
          Không lấy được mã QR Zalo. Hãy thử lại.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw strokeWidth={1.6} />
          Thử lại
        </Button>
      </div>
    )
  }

  if (starting || !challenge || !status) {
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        Đang lấy mã QR…
      </p>
    )
  }

  if (status.state === 'EXPIRED') {
    return (
      <div className="flex flex-col items-start gap-3.5 pt-2">
        <p className="text-sm font-medium text-foreground">Mã đã hết hạn</p>
        <p className="text-sm text-muted-foreground">Mã QR chỉ có hiệu lực trong 100 giây. Hãy tạo mã mới để quét.</p>
        <Button type="button" variant="primary" size="sm" onClick={onRetry}>
          <RefreshCw strokeWidth={1.6} />
          Tạo mã mới
        </Button>
      </div>
    )
  }

  if (status.state === 'DECLINED') {
    return (
      <div className="flex flex-col items-start gap-3.5 pt-2">
        <p className="text-sm font-medium text-foreground">Bạn đã từ chối trên điện thoại</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw strokeWidth={1.6} />
          Thử lại
        </Button>
      </div>
    )
  }

  if (status.state === 'FAILED') {
    return (
      <div className="flex flex-col items-start gap-3.5 pt-2">
        <p
          role="alert"
          className="flex w-full items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
          {qrFailedMessage(status.code)}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw strokeWidth={1.6} />
          Thử lại
        </Button>
      </div>
    )
  }

  const qrSrc = challenge.qrImage.startsWith('data:') ? challenge.qrImage : `data:image/png;base64,${challenge.qrImage}`

  return (
    <div className="flex flex-col items-center gap-4 pt-2 text-center">
      <div className="rounded-xl border bg-white p-3">
        <img src={qrSrc} alt="Mã QR đăng nhập Zalo" className="size-48 object-contain" />
      </div>
      <p className="max-w-100 text-sm text-muted-foreground">Mở Zalo trên điện thoại và quét mã QR này để kết nối.</p>
      {status.state === 'SCANNED' && (
        <Status tone="warn">Đã quét: {status.displayName ?? 'Zalo'}, xác nhận trên điện thoại</Status>
      )}
    </div>
  )
}
