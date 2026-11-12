import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Button } from '@/shared/ui/button'
import { ProfileHeaderCard } from './components/ProfileHeaderCard'
import { ProfileInfoForm } from './components/ProfileInfoForm'
import { SecuritySection } from './components/SecuritySection'
import { ConnectedAccountsSection } from './components/ConnectedAccountsSection'
import { ActiveSessionsSection } from './components/ActiveSessionsSection'
import { useProfile } from './useProfile'

export function ProfilePage() {
  const { profile, loaded, isLoading, isError, retry, updateProfile } = useProfile()

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
        <ProfileHeaderCard profile={profile} />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Main Column */}
          <div className="space-y-6 lg:col-span-7">
            {loaded ? (
              <ProfileInfoForm
                profile={profile}
                onSave={(change) => updateProfile.mutateAsync(change)}
                isPending={updateProfile.isPending}
              />
            ) : (
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
                {isError ? (
                  <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
                    <span>Không tải được thông tin cá nhân.</span>
                    <Button type="button" variant="secondary" size="sm" onClick={retry}>
                      Thử lại
                    </Button>
                  </div>
                ) : (
                  isLoading && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Đang tải thông tin cá nhân…
                    </p>
                  )
                )}
              </div>
            )}

            <SecuritySection />
          </div>

          {/* Side Column */}
          <div className="space-y-6 lg:col-span-5">
            <ConnectedAccountsSection />

            <ActiveSessionsSection />
          </div>
        </div>
      </main>
    </div>
  )
}
