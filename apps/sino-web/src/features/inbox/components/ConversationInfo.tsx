import {
  Ban,
  Bell,
  BellOff,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  Tag,
  User,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Switch } from '@/shared/ui/switch'
import { formatFileSize } from '../format'
import type { ConversationDetail, ConversationItem, InboxAccount } from '../inbox.types'

export function ConversationInfo({
  item,
  detail,
  account: _account,
  now: _now,
  nameOf: _nameOf,
  onClose,
  className,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: InboxAccount
  now: Date
  nameOf: ProviderNameOf
  onClose?: () => void
  className?: string
}) {
  const [muted, setMuted] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(true)

  const primaryMember = detail?.members?.[0]
  const avatarUrl = primaryMember?.avatarUrl || item.avatarUrl
  const title = item.title
  const role = primaryMember?.role
  const memberId = primaryMember?.id
  const location = primaryMember?.location

  const photos = detail?.files?.items.filter((f) => f.image) ?? []
  const docs = detail?.files?.items.filter((f) => !f.image) ?? []
  const linkedLink = detail?.linkedUrl

  const hasMediaOrFiles = photos.length > 0 || docs.length > 0 || !!linkedLink
  const totalDocBytes = docs.reduce((acc, f) => acc + (f.sizeBytes || 0), 0)

  return (
    <aside aria-label="Thông tin cuộc trò chuyện" className={cn('flex flex-col h-full min-h-0 bg-background border-l select-none', className)}>
      {/* Top Header */}
      <header className="shrink-0 flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-bold text-foreground">Chi tiết hội thoại</h2>
        {onClose && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng" className="size-8 cursor-pointer">
            <X className="size-4" strokeWidth={1.6} />
          </Button>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-5">
        {/* Contact Profile Card */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-18 rounded-full object-cover border-2 border-border/80 shadow-xs" />
            ) : (
              <div className="grid size-18 place-items-center rounded-full border-2 border-border/80 bg-surface font-semibold text-lg text-muted-foreground shadow-xs">
                {title.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
          </div>
          <h3 className="mt-3 text-base font-bold text-foreground leading-tight">{title}</h3>
          {role && <p className="mt-1 text-xs text-muted-foreground">{role}</p>}

          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
            {memberId && (
              <span className="rounded bg-surface border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                ID: {memberId}
              </span>
            )}
            {location && (
              <span className="rounded bg-surface border border-border/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {location}
              </span>
            )}
          </div>
        </div>

        {/* 3 Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface/70 py-2.5 px-1 hover:bg-hover hover:border-border transition-colors cursor-pointer"
          >
            <User className="size-4 text-muted-foreground" strokeWidth={1.6} />
            <span className="text-[11px] font-medium text-foreground">Hồ sơ</span>
          </button>
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg border py-2.5 px-1 transition-colors cursor-pointer',
              muted ? 'bg-hover border-border text-foreground' : 'border-border/80 bg-surface/70 hover:bg-hover hover:border-border text-foreground',
            )}
          >
            <BellOff className="size-4 text-muted-foreground" strokeWidth={1.6} />
            <span className="text-[11px] font-medium">{muted ? 'Bật tiếng' : 'Tắt tiếng'}</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface/70 py-2.5 px-1 hover:bg-hover hover:border-border transition-colors cursor-pointer"
          >
            <Tag className="size-4 text-muted-foreground" strokeWidth={1.6} />
            <span className="text-[11px] font-medium text-foreground">Nhãn dán</span>
          </button>
        </div>

        {/* Push Notification Switch Card */}
        <div className="rounded-lg border border-border/80 bg-surface/50 p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-muted-foreground" strokeWidth={1.6} />
              <span className="text-xs font-semibold text-foreground">Thông báo đẩy</span>
            </div>
            <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Đồng bộ tin nhắn tức thời qua webhook và thông báo máy tính.
          </p>
        </div>

        {/* Shared Media Grid - Only when photos exist */}
        {photos.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-muted-foreground tracking-tight">
                ẢNH & VIDEO ĐÃ CHIA SẺ ({detail?.files?.total ?? photos.length})
              </span>
              <button type="button" className="text-[11px] font-medium text-foreground hover:underline cursor-pointer">
                Xem tất cả
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {photos.slice(0, 4).map((file, idx) => (
                <div key={idx} className="group relative aspect-4/3 overflow-hidden rounded-lg border border-border/80 bg-surface">
                  {file.url ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--surface)_0_8px,var(--raised)_8px_16px)]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Files - Only when docs exist */}
        {docs.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-muted-foreground tracking-tight">
                TỆP TÀI LIỆU ({docs.length})
              </span>
              {totalDocBytes > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  Tổng {formatFileSize(totalDocBytes)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {docs.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border/80 bg-surface/50 p-2.5 hover:bg-hover transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/60 bg-background text-muted-foreground">
                      {file.type === 'PDF' ? (
                        <FileText className="size-4" strokeWidth={1.6} />
                      ) : (
                        <Code2 className="size-4" strokeWidth={1.6} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-semibold text-foreground">{file.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {file.sizeBytes ? formatFileSize(file.sizeBytes) : file.type} • {new Date(file.at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" className="size-7 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer">
                    <Download className="size-3.5" strokeWidth={1.6} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked items - Only when linkedLink exists */}
        {linkedLink && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[11px] font-semibold text-muted-foreground tracking-tight">
              LIÊN KẾT ĐÍNH KÈM
            </span>
            <a
              href={linkedLink.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-surface/50 p-2.5 hover:bg-hover transition-colors"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/60 bg-background text-muted-foreground">
                <Globe className="size-4" strokeWidth={1.6} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-foreground">{linkedLink.title}</span>
                <span className="truncate text-[10px] text-muted-foreground">{linkedLink.subtitle}</span>
              </div>
              <ExternalLink className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.6} />
            </a>
          </div>
        )}

        {/* Empty state when no media or files exist */}
        {!hasMediaOrFiles && (
          <div className="rounded-lg border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
            Chưa có tệp hoặc đa phương tiện nào được chia sẻ.
          </div>
        )}
      </div>

      {/* Info Footer */}
      <footer className="shrink-0 mt-auto border-t px-5 py-3 flex items-center justify-between font-mono text-xs">
        <button type="button" className="flex items-center gap-1.5 text-danger hover:underline cursor-pointer">
          <Ban className="size-3.5" strokeWidth={1.6} />
          <span>Chặn kênh</span>
        </button>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Lock className="size-3" strokeWidth={1.6} />
          <span>SSL 256-bit</span>
        </div>
      </footer>
    </aside>
  )
}
