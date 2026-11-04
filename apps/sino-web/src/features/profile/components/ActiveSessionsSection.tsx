import { Laptop, LogOut, ShieldAlert, Smartphone } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { ActiveSessionItem } from '../profile.types'

export function ActiveSessionsSection({
  sessions,
  onRevokeSession,
  isPending,
}: {
  sessions: ActiveSessionItem[]
  onRevokeSession: (sessionId: string) => Promise<unknown>
  isPending?: boolean
}) {
  const otherSessions = sessions.filter((s) => !s.isCurrent)

  const handleRevokeAllOthers = async () => {
    for (const sess of otherSessions) {
      await onRevokeSession(sess.id)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="size-5 text-primary" strokeWidth={1.8} />
          <div>
            <h3 className="text-base font-semibold text-foreground">Phiên đăng nhập & Thiết bị</h3>
            <p className="text-xs text-muted-foreground">Theo dõi và quản lý các thiết bị đang có quyền truy cập Sino.</p>
          </div>
        </div>
        {otherSessions.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRevokeAllOthers}
            disabled={isPending}
            className="text-xs text-destructive hover:text-destructive"
          >
            Đăng xuất thiết bị khác
          </Button>
        )}
      </div>

      <div className="mt-4 divide-y divide-border">
        {sessions.map((session) => {
          const isMobile = session.device.toLowerCase().includes('iphone') || session.device.toLowerCase().includes('phone')
          const DeviceIcon = isMobile ? Smartphone : Laptop

          return (
            <div key={session.id} className="flex items-start justify-between py-4 first:pt-1 last:pb-1">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <DeviceIcon className="size-5" strokeWidth={1.8} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{session.device}</span>
                    {session.isCurrent ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                        Thiết bị này
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">({session.lastActive})</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {session.browser} • {session.location}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground/75">IP: {session.ip}</p>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevokeSession(session.id)}
                  disabled={isPending}
                  className="shrink-0 text-xs text-muted-foreground hover:text-destructive gap-1"
                >
                  <LogOut className="size-3.5" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
