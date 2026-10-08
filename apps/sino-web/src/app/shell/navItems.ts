import {
  Calendar,
  Ellipsis,
  Inbox,
  Key,
  LayoutDashboard,
  Plug,
  Settings2,
  SquareCheck,
  StickyNote,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { NavCounts } from './shell.types'

/** A number from the shell data shown on a navigation item, with the words a screen reader says after it. */
export interface NavBadge {
  key: keyof NavCounts
  text: string
  tone: 'neutral' | 'danger'
}

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  group: 'main' | 'plan' | 'identity' | 'footer'
  /** The number next to the label in the sidebar. */
  count?: NavBadge
  /** The dot on the icon-only rail and tab bar. */
  alert?: NavBadge
}

const inboxUnread: NavBadge = { key: 'inboxUnread', text: 'chưa đọc', tone: 'neutral' }
const tasksOverdue: NavBadge = { key: 'tasksOverdue', text: 'quá hạn', tone: 'danger' }
const accountsNeedingAction: NavBadge = { key: 'accountsNeedingAction', text: 'cần xử lý', tone: 'danger' }

export const NAV_ITEMS: NavItem[] = [
  { to: '/overview', label: 'Tổng quan', icon: LayoutDashboard, group: 'main' },
  { to: '/inbox', label: 'Hộp thư', icon: Inbox, group: 'main', count: inboxUnread, alert: inboxUnread },
  { to: '/calendar', label: 'Lịch', icon: Calendar, group: 'plan' },
  {
    to: '/tasks',
    label: 'Việc cần làm',
    icon: SquareCheck,
    group: 'plan',
    count: { key: 'tasksOpen', text: 'chưa xong', tone: 'neutral' },
    alert: tasksOverdue,
  },
  { to: '/notes', label: 'Ghi chú', icon: StickyNote, group: 'plan' },
  {
    to: '/accounts',
    label: 'Tài khoản',
    icon: Users,
    group: 'identity',
    count: accountsNeedingAction,
    alert: accountsNeedingAction,
  },
  { to: '/services', label: 'Dịch vụ', icon: Plug, group: 'identity' },
  {
    to: '/registrations',
    label: 'Đăng ký',
    icon: Key,
    group: 'identity',
    count: { key: 'registrationsNew', text: 'mới', tone: 'neutral' },
  },
  { to: '/settings', label: 'Cài đặt', icon: Settings2, group: 'footer' },
]

export const NAV_GROUP_LABELS: Record<'plan' | 'identity', string> = { plan: 'KẾ HOẠCH', identity: 'DANH TÍNH' }

/** The mobile tab bar: the most used screens, the rest behind "Thêm". */
export const TAB_ITEMS: Pick<NavItem, 'to' | 'label' | 'icon' | 'count' | 'alert'>[] = [
  { to: '/overview', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/inbox', label: 'Hộp thư', icon: Inbox, count: inboxUnread },
  { to: '/calendar', label: 'Lịch', icon: Calendar },
  { to: '/tasks', label: 'Việc', icon: SquareCheck, alert: tasksOverdue },
  { to: '/more', label: 'Thêm', icon: Ellipsis },
]

/** On mobile these screens sit behind the "Thêm" tab (canvas `MobileMore`), which stays current on them and their sub-pages. */
export const MORE_PATHS = ['/more', '/notes', '/accounts', '/services', '/registrations', '/notifications', '/settings']

/** Every screen the shell can open, with its title; screens not built yet show the under-construction page. */
export const PAGES: { to: string; title: string }[] = [
  ...NAV_ITEMS.map(({ to, label }) => ({ to, title: label })),
  { to: '/notifications', title: 'Thông báo' },
  { to: '/more', title: 'Thêm' },
]

/** The value of a badge (0 when there is no data yet) and the accessible name of its link. */
export function badgeOf(label: string, badge: NavBadge | undefined, counts: NavCounts | undefined) {
  const value = badge && counts ? counts[badge.key] : 0
  const spoken = badge && value > 0 ? `, ${value} ${badge.text}` : ''
  return { value, spoken, name: `${label}${spoken}` }
}
