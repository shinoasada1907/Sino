import { StickersPage } from '@/features/stickers/StickersPage'
import { SettingsNav } from './components/SettingsNav'

/**
 * `/settings/stickers` (fe-ui-settings, D-397): the sticker library, as it is, inside Cài đặt, beside the table of
 * contents from 1280 px. The library's own files are left as they are (change `sticker-packs`), so on a phone its back
 * button still goes to Thêm.
 */
export function SettingsStickersPage() {
  return (
    <div className="items-start gap-x-6 xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:pt-8 xl:pl-8">
      <SettingsNav current="stickers" className="hidden xl:flex" />
      <div className="min-w-0">
        <StickersPage />
      </div>
    </div>
  )
}
