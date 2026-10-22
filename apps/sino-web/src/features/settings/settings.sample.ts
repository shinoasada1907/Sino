import type { UserSettings } from './settings.api'

/**
 * What the Cài đặt screen still shows from the canvas (fe-ui-settings D-394; outside settings-backend): the browsers
 * that receive Web Push, the sign-in sessions, the version. The settings themselves come from the API (D-405).
 */
export interface PushDevice {
  id: string
  name: string
  note: string
}

export const SETTINGS_SAMPLE = {
  pushOnThisDevice: true,
  devices: [
    { id: 'chrome', name: 'Chrome · Windows', note: 'MÁY NÀY · ĐĂNG KÝ 29/09' },
    { id: 'edge', name: 'Edge · Windows', note: 'LẦN CUỐI NHẬN 28/09' },
  ] satisfies PushDevice[],
  sessions: { count: 2, summary: 'máy này và một điện thoại, lần cuối 08:12 hôm nay' },
  /** The web app has no version yet (`package.json` says 0.0.0), fe-ui-settings D-396. */
  version: '0.2.0',
  build: '2026.10.02',
}

type Option<T extends string> = { value: T; label: string }

export const DATE_FORMATS: Option<UserSettings['dateFormat']>[] = [
  { value: 'DMY', label: '02/10/2026 · 14:05' },
  { value: 'ISO', label: '2026-10-02 · 14:05' },
  { value: 'LONG', label: 'Thứ Sáu, 2 tháng 10' },
]

export const MOTION_LEVELS: Option<UserSettings['motion']>[] = [
  { value: 'FULL', label: 'Đầy đủ' },
  { value: 'REDUCED', label: 'Giảm' },
  { value: 'OFF', label: 'Tắt' },
]

export const TIME_ZONES: Option<string>[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh · GMT+7' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok · GMT+7' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo · GMT+9' },
]

export const MORNINGS: Option<string>[] = ['07:00', '08:00', '09:00'].map((time) => ({ value: time, label: time }))

export const WEEK_STARTS: Option<UserSettings['weekStart']>[] = [
  { value: 'MONDAY', label: 'Thứ Hai' },
  { value: 'SUNDAY', label: 'Chủ nhật' },
]

/** The quiet hours of the canvas; the select's value is `off` or `start-end`. */
export const QUIET_HOURS: Option<string>[] = [
  { value: 'off', label: 'Tắt' },
  { value: '22:00-07:00', label: '22:00 – 07:00' },
  { value: '23:00-06:00', label: '23:00 – 06:00' },
]

export const quietValue = (quiet: UserSettings['quietHours']) => (quiet ? `${quiet.start}-${quiet.end}` : 'off')

export function quietOf(value: string): UserSettings['quietHours'] {
  const [start, end] = value.split('-')
  return value === 'off' || !start || !end ? null : { start, end }
}

export const quietLabel = (value: string) => value.replace('-', ' – ')

/** The reminders of the canvas; the select's value is `none` or the minutes. */
export const DEFAULT_REMINDERS: Option<string>[] = [
  { value: 'none', label: 'Không nhắc' },
  { value: '15', label: '15 phút trước' },
  { value: '30', label: '30 phút trước' },
  { value: '60', label: '1 giờ trước' },
]

export const reminderValue = (minutes: number | null) => (minutes === null ? 'none' : String(minutes))

export const reminderOf = (value: string) => (value === 'none' ? null : Number(value))

export function reminderLabel(value: string): string {
  const minutes = Number(value)
  if (minutes % 1440 === 0) {
    return `${minutes / 1440} ngày trước`
  }
  return minutes % 60 === 0 ? `${minutes / 60} giờ trước` : `${minutes} phút trước`
}

/** The options, with the current value added when the API holds one the canvas does not list (D-405). */
export function withCurrent<T extends string>(options: Option<T>[], value: T, label: (value: T) => string = (v) => v): Option<T>[] {
  return options.some((option) => option.value === value) ? options : [...options, { value, label: label(value) }]
}

/** The notification switches in the order of the canvas, with their two lines. */
export const NOTIFY_ROWS: { key: keyof UserSettings['notifications']; title: string; description: string }[] = [
  { key: 'newMessages', title: 'Thư và tin nhắn mới', description: 'Từ mọi tài khoản đã kết nối.' },
  { key: 'importantOnly', title: 'Chỉ từ người quan trọng', description: 'Người bạn đã trả lời nhiều lần hoặc đánh dấu.' },
  { key: 'syncErrors', title: 'Lỗi đồng bộ và tài khoản cần đăng nhập lại', description: 'Nên giữ bật để không lỡ tin nhắn.' },
  { key: 'newRegistrations', title: 'Đăng ký mới được phát hiện', description: 'Khi Sino tìm thấy một website mới dùng danh tính của bạn.' },
  { key: 'reminders', title: 'Nhắc nhở và lịch hẹn', description: 'Task, lịch hẹn và cuộc trò chuyện hiện lại theo hẹn.' },
  { key: 'scheduledFailed', title: 'Thư hẹn giờ không gửi được', description: 'Báo ngay khi Sino không gửi được, kèm cách sửa.' },
]

/** 3912 → "3.912", as Vietnamese writes thousands. */
export const formatCount = (count: number) => count.toLocaleString('vi-VN')

/** Bytes as whole megabytes, as the canvas writes "412 MB". */
export const formatMegabytes = (bytes: number) => `${formatCount(Math.round(bytes / (1024 * 1024)))} MB`
