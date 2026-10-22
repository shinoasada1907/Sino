import { api } from '@/shared/api/client'

/** The user's settings as `GET /api/settings` gives them (settings-backend, D-401). */
export interface UserSettings {
  theme: 'SYSTEM' | 'LIGHT' | 'DARK'
  dateFormat: 'DMY' | 'ISO' | 'LONG'
  motion: 'FULL' | 'REDUCED' | 'OFF'
  notifications: Notifications
  /** null: no quiet hours. */
  quietHours: { start: string; end: string } | null
  /** An IANA ID, such as `Asia/Ho_Chi_Minh`. */
  timeZone: string
  /** `HH:mm`: what "sáng mai" means. */
  morningTime: string
  /** null: no reminder. */
  defaultReminderMinutes: number | null
  weekStart: 'MONDAY' | 'SUNDAY'
}

export interface Notifications {
  newMessages: boolean
  importantOnly: boolean
  syncErrors: boolean
  newRegistrations: boolean
  reminders: boolean
  scheduledFailed: boolean
}

/** A `PATCH`: only the fields that change; `notifications` only the switches that change (D-402). */
export type SettingsChange = Partial<Omit<UserSettings, 'notifications'>> & { notifications?: Partial<Notifications> }

/** What `GET /api/settings/storage` gives (D-403). */
export interface StorageUse {
  messages: number
  bytes: number
}

/** What the backend answers before the user saved anything (D-401): the values of the canvas. */
export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'SYSTEM',
  dateFormat: 'DMY',
  motion: 'FULL',
  notifications: { newMessages: true, importantOnly: false, syncErrors: true, newRegistrations: true, reminders: true, scheduledFailed: true },
  quietHours: { start: '22:00', end: '07:00' },
  timeZone: 'Asia/Ho_Chi_Minh',
  morningTime: '09:00',
  defaultReminderMinutes: 15,
  weekStart: 'MONDAY',
}

/** The settings once `change` is applied, as the backend merges it. */
export function withChange(settings: UserSettings, change: SettingsChange): UserSettings {
  return { ...settings, ...change, notifications: { ...settings.notifications, ...change.notifications } }
}

export const fetchSettings = () => api.get<UserSettings>('/api/settings')

export const patchSettings = (change: SettingsChange) => api.patch<UserSettings>('/api/settings', change)

export const fetchStorage = () => api.get<StorageUse>('/api/settings/storage')
