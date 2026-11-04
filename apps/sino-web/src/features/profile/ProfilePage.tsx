import { useState } from 'react'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ProfileHeaderCard } from './components/ProfileHeaderCard'
import { ProfileInfoForm } from './components/ProfileInfoForm'
import { SecuritySection } from './components/SecuritySection'
import { ConnectedAccountsSection } from './components/ConnectedAccountsSection'
import { ActiveSessionsSection } from './components/ActiveSessionsSection'
import { useProfile } from './useProfile'

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
]

export function ProfilePage() {
  const { profile, sessions, updateProfile, changePassword, revokeSession } = useProfile()
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [customAvatarUrl, setCustomAvatarUrl] = useState('')

  const handleSelectPreset = (url: string) => {
    updateProfile.mutate({ avatarUrl: url })
    setAvatarDialogOpen(false)
  }

  const handleApplyCustomUrl = () => {
    if (customAvatarUrl.trim()) {
      updateProfile.mutate({ avatarUrl: customAvatarUrl.trim() })
      setCustomAvatarUrl('')
      setAvatarDialogOpen(false)
    }
  }

  const handleRemoveAvatar = () => {
    updateProfile.mutate({ avatarUrl: '' })
    setAvatarDialogOpen(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <MobilePageHeader back={{ to: '/overview', label: 'Quay lại Tổng quan' }} title="Hồ sơ cá nhân" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8 space-y-6">
        {/* Page title for tablet and desktop */}
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Hồ sơ cá nhân</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý thông tin hồ sơ của bạn, bảo mật đăng nhập và các thiết bị đang hoạt động.
          </p>
        </div>

        {/* Top Profile Summary Card */}
        <ProfileHeaderCard
          profile={profile}
          onAvatarChange={() => setAvatarDialogOpen(true)}
        />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Main Column */}
          <div className="space-y-6 lg:col-span-7">
            <ProfileInfoForm
              profile={profile}
              onSave={(data) => updateProfile.mutateAsync(data)}
              isPending={updateProfile.isPending}
            />

            <SecuritySection
              twoFactorEnabled={profile.twoFactorEnabled}
              onChangePassword={(data) => changePassword.mutateAsync(data)}
              isPending={changePassword.isPending}
            />
          </div>

          {/* Side Column */}
          <div className="space-y-6 lg:col-span-5">
            <ConnectedAccountsSection />

            <ActiveSessionsSection
              sessions={sessions}
              onRevokeSession={(id) => revokeSession.mutateAsync(id)}
              isPending={revokeSession.isPending}
            />
          </div>
        </div>
      </main>

      {/* Avatar Change Dialog */}
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thay đổi ảnh đại diện</DialogTitle>
            <DialogDescription>
              Chọn một trong các ảnh đại diện mẫu dưới đây hoặc nhập đường dẫn ảnh (URL) tùy chỉnh.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Ảnh mẫu gợi ý</p>
              <div className="flex items-center gap-3">
                {AVATAR_PRESETS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPreset(url)}
                    className="size-14 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-all focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <img src={url} alt={`Preset ${idx + 1}`} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label htmlFor="customAvatar">Đường dẫn ảnh trực tiếp (URL)</Label>
              <div className="flex gap-2">
                <Input
                  id="customAvatar"
                  placeholder="https://example.com/avatar.jpg"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                />
                <Button type="button" onClick={handleApplyCustomUrl} disabled={!customAvatarUrl.trim()}>
                  Áp dụng
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={handleRemoveAvatar} className="text-destructive">
              Xóa ảnh
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAvatarDialogOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
