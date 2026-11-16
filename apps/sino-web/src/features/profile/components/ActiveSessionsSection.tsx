import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'

/** The list of signed-in devices has no API yet (profile-info D-479; part 3 of the profile management): the block says so. */
export function ActiveSessionsSection() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center gap-2.5 pb-4 border-b border-border">
        <ShieldAlert className="size-5 text-primary" strokeWidth={1.8} />
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Phiên đăng nhập & Thiết bị</h3>
            <Badge className="text-muted-foreground">Sắp có</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Theo dõi và quản lý các thiết bị đang có quyền truy cập Sino.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Danh sách thiết bị đăng nhập sẽ có trong bản sau.</p>
    </div>
  )
}
