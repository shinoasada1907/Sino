import { Camera, Calendar, MapPin } from 'lucide-react'
import { formatDate } from '@/shared/time/local'
import { UserAvatar } from '@/shared/ui/user-avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import type { UserProfile } from '../profile.types'

const ROLE_LABELS: Record<string, string> = { OWNER: 'Chủ sở hữu' }

/** `onAvatarChange` absent (the profile is not loaded yet): the picture button is off. */
export function ProfileHeaderCard({
  profile,
  onAvatarChange,
}: {
  profile: UserProfile
  onAvatarChange?: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Avatar with change button */}
        <div className="relative shrink-0">
          <UserAvatar
            name={profile.displayName}
            src={profile.avatarUrl}
            className="size-22 rounded-full border-2 border-border shadow-md"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Thay đổi ảnh đại diện"
            onClick={onAvatarChange}
            disabled={!onAvatarChange}
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
            <Badge className="bg-success-soft text-success-ink border-success/20 gap-1">
              <span className="size-1.5 rounded-full bg-success" />
              Đang hoạt động
            </Badge>
            <Badge className="text-muted-foreground">{ROLE_LABELS[profile.role] ?? profile.role}</Badge>
          </div>

          <p className="mt-1 font-mono text-xs text-muted-foreground">{profile.email}</p>

          <div className="mt-3.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground/80" strokeWidth={1.6} />
                {profile.location}
              </span>
            )}
            {profile.joinedAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground/80" strokeWidth={1.6} />
                Tham gia {formatDate(new Date(profile.joinedAt))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
