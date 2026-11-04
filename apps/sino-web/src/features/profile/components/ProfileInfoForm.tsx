import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, User } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import type { UserProfileData } from '../profile.types'

export function ProfileInfoForm({
  profile,
  onSave,
  isPending,
}: {
  profile: UserProfileData
  onSave: (data: Partial<UserProfileData>) => Promise<unknown>
  isPending?: boolean
}) {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber)
  const [jobTitle, setJobTitle] = useState(profile.jobTitle)
  const [location, setLocation] = useState(profile.location)
  const [bio, setBio] = useState(profile.bio)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await onSave({
      displayName,
      phoneNumber,
      jobTitle,
      location,
      bio,
    })
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3500)
  }

  const handleReset = () => {
    setDisplayName(profile.displayName)
    setPhoneNumber(profile.phoneNumber)
    setJobTitle(profile.jobTitle)
    setLocation(profile.location)
    setBio(profile.bio)
    setShowSuccess(false)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center gap-2.5 pb-4 border-b border-border">
        <User className="size-5 text-primary" strokeWidth={1.8} />
        <div>
          <h3 className="text-base font-semibold text-foreground">Thông tin cá nhân</h3>
          <p className="text-xs text-muted-foreground">Cập nhật họ tên, liên hệ và chức danh hiển thị của bạn trong Sino.</p>
        </div>
      </div>

      {showSuccess && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Đã lưu thay đổi thông tin cá nhân thành công!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Họ và tên</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nhập họ và tên..."
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Địa chỉ Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground">Email đăng nhập tài khoản chính.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber">Số điện thoại</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="VD: 0901 234 567"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Chức danh / Vai trò</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="VD: Quản trị viên hệ thống"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="location">Địa điểm làm việc</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="VD: Hà Nội, Việt Nam"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio">Giới thiệu ngắn (Bio)</Label>
          <textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Viết một vài dòng giới thiệu về vai trò hoặc phương châm làm việc của bạn..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={handleReset} disabled={isPending}>
            Khôi phục
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </div>
  )
}
