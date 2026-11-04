import { Camera, Calendar, MapPin, ShieldCheck } from 'lucide-react'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { UserProfileData } from '../profile.types'

export function ProfileHeaderCard({
  profile,
  onAvatarChange,
}: {
  profile: UserProfileData
  onAvatarChange?: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Avatar with change button */}
        <div className="relative shrink-0">
          <Avatar
            src={profile.avatarUrl || null}
            placeholder="a"
            className="size-22 rounded-full border-2 border-border shadow-md"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Thay đổi ảnh đại diện"
            onClick={onAvatarChange}
            className="absolute -bottom-1 -right-1 size-8 rounded-full border border-border bg-background shadow-xs hover:bg-hover"
          >
            <Camera className="size-4 text-foreground" strokeWidth={1.8} />
          </Button>
        </div>

        {/* User main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
              {profile.displayName}
            </h2>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Đang hoạt động
            </Badge>
            <Badge className="text-muted-foreground">{profile.role}</Badge>
          </div>

          <p className="mt-1 font-mono text-xs text-muted-foreground">{profile.email}</p>

          <div className="mt-3.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground/80" strokeWidth={1.6} />
              {profile.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-muted-foreground/80" strokeWidth={1.6} />
              Tham gia {profile.joinedAt}
            </span>
            {profile.twoFactorEnabled && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <ShieldCheck className="size-3.5" strokeWidth={1.8} />
                2FA đã kích hoạt
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
