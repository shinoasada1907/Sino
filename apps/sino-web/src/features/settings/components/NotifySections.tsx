import { Monitor, Smartphone, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Status } from '@/shared/ui/status'
import {
  DEFAULT_REMINDERS,
  MORNINGS,
  NOTIFY_ROWS,
  QUIET_HOURS,
  quietLabel,
  quietOf,
  quietValue,
  reminderLabel,
  reminderOf,
  reminderValue,
  SETTINGS_SAMPLE,
  TIME_ZONES,
  WEEK_STARTS,
  withCurrent,
  type PushDevice,
} from '../settings.sample'
import { useSettingValues } from '../useSettings'
import { SettingRow, SettingSection, SettingSelect, SwitchRow } from './SettingRow'

/** Canvas `.who` with `.site`: a device or app, its icon in a small tile, its name and a mono line under it. */
function Who({ icon: Icon, name, note }: { icon: LucideIcon; name: string; note: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-sm border bg-raised text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.6} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm leading-5 font-semibold">{name}</span>
        <span className="font-mono text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">{note}</span>
      </span>
    </div>
  )
}

/** The switches of what Sino tells the user, and the quiet hours, saved (settings-backend, D-405). */
export function NotifySwitches() {
  const { values, disabled, update, errorOf } = useSettingValues()
  const quietId = useId()
  const quiet = quietValue(values.quietHours)
  return (
    <>
      {NOTIFY_ROWS.map(({ key, title, description }) => (
        <SwitchRow
          key={key}
          title={title}
          description={description}
          checked={values.notifications[key]}
          disabled={disabled}
          error={errorOf(`notifications.${key}`)}
          onChange={(checked) => update({ notifications: { [key]: checked } })}
        />
      ))}
      <SettingRow
        title="Giờ yên lặng"
        description="Không báo gì trong khoảng này, trừ lỗi tài khoản và nhắc nhở bạn tự đặt."
        labelFor={quietId}
        error={errorOf('quietHours')}
        control={
          <SettingSelect
            id={quietId}
            value={quiet}
            options={withCurrent(QUIET_HOURS, quiet, quietLabel)}
            disabled={disabled}
            onChange={(value) => update({ quietHours: quietOf(value) })}
          />
        }
      />
    </>
  )
}

/** The browsers that receive notifications: still the canvas sample, and the buttons do nothing yet (fe-ui-settings D-399). */
export function PushDevices({ devices = SETTINGS_SAMPLE.devices }: { devices?: PushDevice[] }) {
  const here = SETTINGS_SAMPLE.pushOnThisDevice
  return (
    <>
      <SettingRow
        title="Thông báo trình duyệt (Web Push)"
        description="Tới được cả khi đã đóng tab, miễn trình duyệt còn chạy. Chỉ có tiêu đề và đường dẫn, không có nội dung tin nhắn."
        control={
          <div className="flex items-center gap-3">
            <Status tone={here ? 'ok' : 'off'}>{here ? 'Đã bật trên máy này' : 'Chưa bật trên máy này'}</Status>
            <Button type="button" variant="secondary" size="sm">
              Gửi thử
            </Button>
          </div>
        }
      />
      {devices.map((device) => (
        <SettingRow
          key={device.id}
          title={<Who icon={Monitor} name={device.name} note={device.note} />}
          inline
          control={
            <Button type="button" variant="ghost" size="sm" aria-label={`Gỡ ${device.name}`}>
              Gỡ
            </Button>
          }
        />
      ))}
      <SettingRow title={<Who icon={Smartphone} name="Sino cho iOS và Android" note="SẮP CÓ · PUSH TRÊN ĐIỆN THOẠI ĐI CÙNG APP MOBILE" />} inline stale control={<Badge>Sắp có</Badge>} />
    </>
  )
}

export function NotifySection() {
  return (
    <SettingSection id="thong-bao" title="Thông báo">
      <NotifySwitches />
      <h3 className="pt-4.5 text-sm leading-5 font-semibold">Thiết bị nhận thông báo</h3>
      <PushDevices />
    </SettingSection>
  )
}

/** Time zone, what "sáng mai" means, the default reminder and the first day of the week, saved (D-405). */
export function CalendarRows() {
  const { values, disabled, update, errorOf } = useSettingValues()
  const ids = { zone: useId(), morning: useId(), reminder: useId(), week: useId() }
  const reminder = reminderValue(values.defaultReminderMinutes)
  return (
    <>
      <SettingRow
        title="Múi giờ"
        description="Mọi giờ trong Sino hiển thị và tính lặp lại theo múi giờ này."
        labelFor={ids.zone}
        error={errorOf('timeZone')}
        control={
          <SettingSelect
            id={ids.zone}
            value={values.timeZone}
            options={withCurrent(TIME_ZONES, values.timeZone)}
            disabled={disabled}
            onChange={(timeZone) => update({ timeZone })}
          />
        }
      />
      <SettingRow
        title="“Sáng mai” nghĩa là"
        description="Dùng cho Nhắc tôi, Tạm ẩn và Gửi lúc…"
        labelFor={ids.morning}
        error={errorOf('morningTime')}
        control={
          <SettingSelect
            id={ids.morning}
            value={values.morningTime}
            options={withCurrent(MORNINGS, values.morningTime)}
            disabled={disabled}
            onChange={(morningTime) => update({ morningTime })}
          />
        }
      />
      <SettingRow
        title="Nhắc mặc định cho lịch hẹn"
        description="Áp dụng khi tạo lịch hẹn mới; sửa được từng lịch hẹn."
        labelFor={ids.reminder}
        error={errorOf('defaultReminderMinutes')}
        control={
          <SettingSelect
            id={ids.reminder}
            value={reminder}
            options={withCurrent(DEFAULT_REMINDERS, reminder, reminderLabel)}
            disabled={disabled}
            onChange={(value) => update({ defaultReminderMinutes: reminderOf(value) })}
          />
        }
      />
      <SettingRow
        title="Tuần bắt đầu từ"
        description="Dùng cho màn Lịch và quy tắc lặp hằng tuần."
        labelFor={ids.week}
        error={errorOf('weekStart')}
        control={
          <SettingSelect id={ids.week} value={values.weekStart} options={WEEK_STARTS} disabled={disabled} onChange={(weekStart) => update({ weekStart })} />
        }
      />
    </>
  )
}

export function CalendarSection() {
  return (
    <SettingSection id="lich-nhac" title="Lịch và nhắc nhở">
      <CalendarRows />
    </SettingSection>
  )
}
