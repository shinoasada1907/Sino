import { Bell, CalendarClock, Database, Globe, Info, Lock, Plug, Sparkles, SunMoon, type LucideIcon } from 'lucide-react'

/** The sections of the settings page, in the order of the canvas, with the anchors the table of contents links to. */
export const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'giao-dien', label: 'Giao diện', icon: SunMoon },
  { id: 'ngon-ngu', label: 'Ngôn ngữ', icon: Globe },
  { id: 'chuyen-dong', label: 'Chuyển động', icon: Sparkles },
  { id: 'thong-bao', label: 'Thông báo', icon: Bell },
  { id: 'lich-nhac', label: 'Lịch và nhắc nhở', icon: CalendarClock },
  { id: 'rieng-tu', label: 'Quyền riêng tư và dữ liệu', icon: Database },
  { id: 'nguon', label: 'Nguồn đã kết nối', icon: Plug },
  { id: 'bao-mat', label: 'Bảo mật', icon: Lock },
  { id: 've-sino', label: 'Về Sino', icon: Info },
]

/** Canvas `.src-item`: a row of the table of contents, the current one raised. */
export const NAV_ITEM =
  'grid h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-sm border border-transparent px-2.5 text-sm leading-5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current]:border-border aria-[current]:bg-raised aria-[current]:font-semibold aria-[current]:text-foreground'
