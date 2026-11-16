import { KeyRound, ShieldCheck } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

const COMING_SOON = 'Sắp có'

/**
 * Two-factor and password change have no API yet (profile-info D-479): the block keeps its place on the page, wears
 * "Sắp có", and sends nothing. Parts 2 and 3 of the profile management give it a server.
 */
export function SecuritySection() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ShieldCheck className="size-5" strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Xác thực hai bước (2FA)</span>
              <Badge className="text-muted-foreground">{COMING_SOON}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Bảo vệ tài khoản bằng mã bảo mật mỗi khi đăng nhập.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="sm:self-center" disabled>
          Quản lý 2FA
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2.5 pb-4 border-b border-border">
          <KeyRound className="size-5 text-primary" strokeWidth={1.8} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Đổi mật khẩu</h3>
              <Badge className="text-muted-foreground">{COMING_SOON}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Nên sử dụng mật khẩu mạnh kết hợp chữ, số và ký tự đặc biệt.</p>
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
              <Input id="currentPassword" type="password" placeholder="Nhập mật khẩu đang dùng..." />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Mật khẩu mới</Label>
                <Input id="newPassword" type="password" placeholder="Tối thiểu 8 ký tự..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                <Input id="confirmPassword" type="password" placeholder="Nhập lại mật khẩu mới..." />
              </div>
            </div>
          </fieldset>
          <div className="flex items-center justify-end pt-3 border-t border-border">
            <Button type="submit" size="sm" disabled>
              Cập nhật mật khẩu
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
