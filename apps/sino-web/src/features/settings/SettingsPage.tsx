import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { AboutSection, PrivacySection, SecuritySection, SourcesSection } from './components/DataSections'
import { AppearanceSection, LanguageSection, MotionSection } from './components/LookSections'
import { CalendarSection, NotifySection } from './components/NotifySections'
import { SettingsNav } from './components/SettingsNav'

/**
 * `/settings`, the canvas `Settings` (fe-ui-settings): the table of contents from 1280 px and the nine sections, on
 * sample data except the theme and the connected accounts (D-392…D-396).
 */
export function SettingsPage() {
  const { hash } = useLocation()
  // Coming from another page with an anchor (the table of contents of `/settings/stickers`): the router does not
  // scroll to it, so the page does.
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    }
  }, [hash])

  return (
    <>
      <MobilePageHeader back={{ to: '/more', label: 'Quay lại Thêm' }} title="Cài đặt" />
      <div className="items-start gap-x-12 p-4 md:p-6 xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:p-8">
        <SettingsNav className="hidden xl:flex" />
        <div className="flex max-w-215 min-w-0 flex-col gap-9">
          <header className="hidden flex-col gap-2.5 md:flex">
            <span className="font-mono text-xs leading-4 font-medium text-muted-foreground">CÀI ĐẶT</span>
            <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] xl:text-[40px] xl:leading-12 xl:font-bold xl:tracking-[-0.028em]">Cài đặt</h1>
          </header>
          <AppearanceSection />
          <LanguageSection />
          <MotionSection />
          <NotifySection />
          <CalendarSection />
          <PrivacySection />
          <SourcesSection />
          <SecuritySection />
          <AboutSection />
        </div>
      </div>
    </>
  )
}
