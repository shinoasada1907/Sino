/**
 * The settings of the Cài đặt screen on sample data (fe-ui-settings, D-394): the values of the canvas `Settings`,
 * `MobileSettings` and `MobileSettingsNotifications`. Nothing here is saved or used by the rest of the app yet.
 */

export type DateFormat = 'vn' | 'iso' | 'long'
export type MotionLevel = 'full' | 'reduced' | 'off'
export type QuietHours = 'off' | '22-7' | '23-6'
export type Morning = '07:00' | '08:00' | '09:00'
export type DefaultReminder = 'none' | '15' | '30' | '60'
export type WeekStart = 'monday' | 'sunday'

export interface NotifySettings {
  newMessages: boolean
  importantOnly: boolean
  syncErrors: boolean
  newRegistrations: boolean
  reminders: boolean
  scheduledFailed: boolean
}

/** A browser that receives Web Push; `note` is the small line under it. */
export interface PushDevice {
  id: string
  name: string
  note: string
}

export interface SettingsSample {
  dateFormat: DateFormat
  motion: MotionLevel
  notify: NotifySettings
  quietHours: QuietHours
  pushOnThisDevice: boolean
  devices: PushDevice[]
  timeZone: string
  morning: Morning
  defaultReminder: DefaultReminder
  weekStart: WeekStart
  stored: { messages: number; megabytes: number }
  sessions: { count: number; summary: string }
  /** Sample too: the web app has no version yet (`package.json` says 0.0.0), D-396. */
  version: string
  build: string
}

export const SETTINGS_SAMPLE: SettingsSample = {
  dateFormat: 'vn',
  motion: 'full',
  notify: { newMessages: true, importantOnly: false, syncErrors: true, newRegistrations: true, reminders: true, scheduledFailed: true },
  quietHours: '22-7',
  pushOnThisDevice: true,
  devices: [
    { id: 'chrome', name: 'Chrome · Windows', note: 'MÁY NÀY · ĐĂNG KÝ 29/09' },
    { id: 'edge', name: 'Edge · Windows', note: 'LẦN CUỐI NHẬN 28/09' },
  ],
  timeZone: 'Asia/Ho_Chi_Minh',
  morning: '09:00',
  defaultReminder: '15',
  weekStart: 'monday',
  stored: { messages: 3912, megabytes: 412 },
  sessions: { count: 2, summary: 'máy này và một điện thoại, lần cuối 08:12 hôm nay' },
  version: '0.2.0',
  build: '2026.10.02',
}

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'vn', label: '02/10/2026 · 14:05' },
  { value: 'iso', label: '2026-10-02 · 14:05' },
  { value: 'long', label: 'Thứ Sáu, 2 tháng 10' },
]

export const MOTION_LEVELS: { value: MotionLevel; label: string }[] = [
  { value: 'full', label: 'Đầy đủ' },
  { value: 'reduced', label: 'Giảm' },
  { value: 'off', label: 'Tắt' },
]

export const QUIET_HOURS: { value: QuietHours; label: string }[] = [
  { value: 'off', label: 'Tắt' },
  { value: '22-7', label: '22:00 – 07:00' },
  { value: '23-6', label: '23:00 – 06:00' },
]

export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh · GMT+7' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok · GMT+7' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo · GMT+9' },
]

export const MORNINGS: { value: Morning; label: string }[] = [
  { value: '07:00', label: '07:00' },
  { value: '08:00', label: '08:00' },
  { value: '09:00', label: '09:00' },
]

export const DEFAULT_REMINDERS: { value: DefaultReminder; label: string }[] = [
  { value: 'none', label: 'Không nhắc' },
  { value: '15', label: '15 phút trước' },
  { value: '30', label: '30 phút trước' },
  { value: '60', label: '1 giờ trước' },
]

export const WEEK_STARTS: { value: WeekStart; label: string }[] = [
  { value: 'monday', label: 'Thứ Hai' },
  { value: 'sunday', label: 'Chủ nhật' },
]

/** The notification switches in the order of the canvas, with their two lines. */
export const NOTIFY_ROWS: { key: keyof NotifySettings; title: string; description: string; short?: string }[] = [
  { key: 'newMessages', title: 'Thư và tin nhắn mới', description: 'Từ mọi tài khoản đã kết nối.' },
  { key: 'importantOnly', title: 'Chỉ từ người quan trọng', description: 'Người bạn đã trả lời nhiều lần hoặc đánh dấu.' },
  { key: 'syncErrors', title: 'Lỗi đồng bộ và tài khoản cần đăng nhập lại', description: 'Nên giữ bật để không lỡ tin nhắn.', short: 'Lỗi đồng bộ, cần đăng nhập lại' },
  { key: 'newRegistrations', title: 'Đăng ký mới được phát hiện', description: 'Khi Sino tìm thấy một website mới dùng danh tính của bạn.' },
  { key: 'reminders', title: 'Nhắc nhở và lịch hẹn', description: 'Task, lịch hẹn và cuộc trò chuyện hiện lại theo hẹn.' },
  { key: 'scheduledFailed', title: 'Thư hẹn giờ không gửi được', description: 'Báo ngay khi Sino không gửi được, kèm cách sửa.' },
]

/** The label of a value among its options. */
export const labelOf = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value

/** 3912 → "3.912", as Vietnamese writes thousands. */
export const formatCount = (count: number) => count.toLocaleString('vi-VN')
