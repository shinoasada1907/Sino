import { onlineManager } from '@tanstack/react-query'
import { Inbox, RotateCw, TriangleAlert, WifiOff } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { ProviderInfo } from '@/shared/domain'
import { providerDescription } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { formatClock } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { Progress } from '@/shared/ui/progress'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'

// The states of the canvas `InboxState` (D-55): loading, first sync, cannot load, offline, no source yet.

function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn('block rounded-[6px] bg-hover', className)} style={style} />
}

const SKELETON_ROWS = [
  [46, 88, 70],
  [38, 92, 64],
  [52, 80],
  [42, 86, 58],
  [34, 76],
]

/** Canvas `.skel-row`: the shape of the list while there is nothing to show; with a `label` it says it is loading. */
export function ListSkeleton({ label }: { label?: string }) {
  return (
    <div role={label ? 'status' : undefined} aria-label={label} className="flex flex-col md:px-2">
      {label && <span className="sr-only">{label}</span>}
      {SKELETON_ROWS.map((widths, index) => (
        <div key={index} aria-hidden="true" className="grid grid-cols-[36px_minmax(0,1fr)_40px] items-start gap-x-3.5 p-3.5">
          <Skel className="size-9 rounded-[10px]" />
          <div className="flex flex-col gap-2 pt-0.5">
            {widths.map((width, line) => (
              <Skel key={line} className={line === 0 ? 'h-3' : 'h-2.5'} style={{ width: `${width}%` }} />
            ))}
          </div>
          <Skel className="h-2.5 w-9" />
        </div>
      ))}
    </div>
  )
}

/** The source column before the list has arrived: its shape while loading, empty when the list cannot load. */
export function SourcesSkeleton({ loading, className }: { loading: boolean; className?: string }) {
  return (
    <aside aria-hidden="true" className={cn('min-h-0 border-r', className)}>
      {loading && (
        <div className="flex flex-col gap-4 px-5.5 py-6">
          {[56, 72, 48, 64].map((width) => (
            <Skel key={width} className="h-3" style={{ width: `${width}%` }} />
          ))}
        </div>
      )}
    </aside>
  )
}

/** The reading column while the list loads. */
export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] place-self-stretch">
      <div className="flex flex-col gap-2.5 border-b px-6 py-5">
        <Skel className="h-4.5 w-1/2" />
        <Skel className="h-2.5 w-1/4" />
      </div>
      <div className="flex flex-col gap-3 p-6">
        <Skel className="h-16 rounded-[14px]" />
        <Skel className="h-16 rounded-[14px]" />
        <Skel className="h-55 rounded-[14px]" />
      </div>
    </div>
  )
}

/** Canvas `.card-quiet` "Đồng bộ lần đầu · Gmail": the first sync of an account, before anything has arrived. */
export function FirstSyncCard({ name, progress }: { name: string; progress: number }) {
  const title = `Đồng bộ lần đầu · ${name}`
  return (
    <div role="status" aria-label={title} className="flex flex-col gap-2.5 rounded-md border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <Status tone="warn">{title}</Status>
        <Spec>{progress}%</Spec>
      </div>
      <Progress value={progress} />
      <span className="text-sm text-muted-foreground">Thư và tin nhắn mới nhất về trước.</span>
    </div>
  )
}

/** Canvas `.center-state` "Không tải được hộp thư", with what failed and a way to try again. */
export function LoadFailed({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4.5 px-7 py-10">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger"
      >
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được hộp thư</h2>
        <p className="text-sm text-muted-foreground">Máy chủ Sino không phản hồi. Thư và tin nhắn của bạn vẫn an toàn ở nhà cung cấp.</p>
        <Spec>{detail}</Spec>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw strokeWidth={1.6} />
          Thử lại
        </Button>
        <Button type="button" variant="ghost" size="sm">
          Trạng thái hệ thống
        </Button>
      </div>
    </div>
  )
}

/**
 * Canvas `.banner` while offline: the saved inbox stays on screen, and what is sent waits for the network. "Thử kết
 * nối lại" asks the browser again, in case the app missed the moment it came back online.
 */
export function OfflineBanner({ savedAt }: { savedAt: number }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-surface px-4 py-2.5 text-[13px] leading-4.5 font-medium md:px-8"
    >
      <WifiOff className="size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
      <span>
        <span className="font-semibold">Bạn đang ngoại tuyến.</span>{' '}
        <span className="text-muted-foreground">
          {savedAt > 0
            ? `Đang hiện dữ liệu đã lưu lúc ${formatClock(new Date(savedAt))}. Thư bạn soạn sẽ gửi khi có mạng.`
            : 'Hộp thư sẽ tải khi có mạng.'}
        </span>
      </span>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => onlineManager.setOnline(navigator.onLine)}>
        Thử kết nối lại
      </Button>
    </div>
  )
}

/** Canvas `.empty-hero` "Hộp thư đang trống.": one line per provider, each opening the connect wizard. */
export function NoSources({ providers }: { providers: ProviderInfo[] }) {
  return (
    <div className="grid h-full min-h-0 place-items-center overflow-auto">
      <div className="grid max-w-260 items-center gap-10 px-4 py-12 md:px-16 md:py-18 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-5">
          <div aria-hidden="true" className="relative h-26 w-33">
            <span className="absolute inset-[0_24px_16px_0] rounded-[18px] border border-dashed border-border-strong" />
            <span className="absolute top-4.5 right-0 bottom-0 left-5 rounded-2xl border bg-raised" />
            <span className="absolute top-10 left-13 grid size-11 place-items-center rounded-xl border border-border-strong bg-surface text-foreground">
              <Inbox className="size-5" strokeWidth={1.6} />
            </span>
          </div>
          <Spec>HỘP THƯ · CHƯA CÓ NGUỒN</Spec>
          <h1 className="text-[32px] leading-10 font-bold tracking-[-0.028em] md:text-[40px] md:leading-12">Hộp thư đang trống.</h1>
          <p className="text-base text-muted-foreground">
            Kết nối một tài khoản để thư và tin nhắn bắt đầu về đây. Sino chỉ đọc qua quyền bạn cấp, và bạn ngắt kết nối được bất cứ lúc nào.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {providers.map((provider, index) => (
            <li key={provider.type} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3.5 rounded-md border bg-surface px-4 py-3.5">
              <span className="grid size-10 place-items-center rounded-xl border bg-raised text-foreground">
                <ProviderIcon provider={provider.type} className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">{provider.displayName}</span>
                <span className="text-sm text-muted-foreground">{providerDescription(provider.type)}</span>
              </span>
              <Button asChild variant={index === 0 ? 'primary' : 'secondary'} size="sm">
                <Link to="/accounts?connect=new" aria-label={`Kết nối ${provider.displayName}`}>
                  Kết nối
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
