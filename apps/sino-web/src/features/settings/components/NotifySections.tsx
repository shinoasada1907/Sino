import { Monitor, Smartphone, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Status } from '@/shared/ui/status'
import { DEFAULT_REMINDERS, MORNINGS, NOTIFY_ROWS, QUIET_HOURS, TIME_ZONES, WEEK_STARTS, type PushDevice } from '../settings.sample'
import { useSettingsSample } from '../useSettingsSample'
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

/** The switches of what Sino tells the user, and the quiet hours (sample data, D-394). */
export function NotifySwitches() {
  const { settings, update } = useSettingsSample()
  const quietId = useId()
  return (
    <>
      {NOTIFY_ROWS.map(({ key, title, description }) => (
        <SwitchRow
          key={key}
          title={title}
          description={description}
          checked={settings.notify[key]}
          onChange={(checked) => update({ notify: { ...settings.notify, [key]: checked } })}
        />
      ))}
      <SettingRow
        title="Giờ yên lặng"
        description="Không báo gì trong khoảng này, trừ lỗi tài khoản và nhắc nhở bạn tự đặt."
        labelFor={quietId}
        control={<SettingSelect id={quietId} value={settings.quietHours} options={QUIET_HOURS} onChange={(quietHours) => update({ quietHours })} />}
      />
    </>
  )
}

/** The browsers that receive notifications. The buttons do nothing yet (D-399): there is no Web Push behind them. */
export function PushDevices({ devices }: { devices: PushDevice[] }) {
  const { settings } = useSettingsSample()
  return (
    <>
      <SettingRow
        title="Thông báo trình duyệt (Web Push)"
        description="Tới được cả khi đã đóng tab, miễn trình duyệt còn chạy. Chỉ có tiêu đề và đường dẫn, không có nội dung tin nhắn."
        control={
          <div className="flex items-center gap-3">
            <Status tone={settings.pushOnThisDevice ? 'ok' : 'off'}>{settings.pushOnThisDevice ? 'Đã bật trên máy này' : 'Chưa bật trên máy này'}</Status>
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
  const { settings } = useSettingsSample()
  return (
    <SettingSection id="thong-bao" title="Thông báo">
      <NotifySwitches />
      <h3 className="pt-4.5 text-sm leading-5 font-semibold">Thiết bị nhận thông báo</h3>
      <PushDevices devices={settings.devices} />
    </SettingSection>
  )
}

/** Time zone, what "sáng mai" means, the default reminder and the first day of the week (sample data, D-394). */
export function CalendarRows() {
  const { settings, update } = useSettingsSample()
  const ids = { zone: useId(), morning: useId(), reminder: useId(), week: useId() }
  return (
    <>
      <SettingRow
        title="Múi giờ"
        description="Mọi giờ trong Sino hiển thị và tính lặp lại theo múi giờ này."
        labelFor={ids.zone}
        control={<SettingSelect id={ids.zone} value={settings.timeZone} options={TIME_ZONES} onChange={(timeZone) => update({ timeZone })} />}
      />
      <SettingRow
        title="“Sáng mai” nghĩa là"
        description="Dùng cho Nhắc tôi, Tạm ẩn và Gửi lúc…"
        labelFor={ids.morning}
        control={<SettingSelect id={ids.morning} value={settings.morning} options={MORNINGS} onChange={(morning) => update({ morning })} />}
      />
      <SettingRow
        title="Nhắc mặc định cho lịch hẹn"
        description="Áp dụng khi tạo lịch hẹn mới; sửa được từng lịch hẹn."
        labelFor={ids.reminder}
        control={
          <SettingSelect id={ids.reminder} value={settings.defaultReminder} options={DEFAULT_REMINDERS} onChange={(defaultReminder) => update({ defaultReminder })} />
        }
      />
      <SettingRow
        title="Tuần bắt đầu từ"
        description="Dùng cho màn Lịch và quy tắc lặp hằng tuần."
        labelFor={ids.week}
        control={<SettingSelect id={ids.week} value={settings.weekStart} options={WEEK_STARTS} onChange={(weekStart) => update({ weekStart })} />}
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
