import { useId, type CSSProperties } from 'react'
import { LanguageButton } from '@/app/shell/LanguageButton'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import type { ThemePreference } from '@/shared/theme/theme'
import { useTheme } from '@/shared/theme/themeContext'
import { Segmented } from '@/shared/ui/segmented'
import { DATE_FORMATS, MOTION_LEVELS } from '../settings.sample'
import { useSettingValues } from '../useSettings'
import { SettingRow, SettingSection, SettingSelect } from './SettingRow'

/**
 * The previews of the three theme tiles of the canvas (`.tt-prev`): a sidebar, a bar and a pane in each theme's own
 * colours. They picture the themes, so they keep these colours whatever theme is on.
 */
const PREVIEWS: { value: ThemePreference; label: string; frame: CSSProperties; parts: [string, string, string] }[] = [
  {
    value: 'system',
    label: 'Theo hệ thống',
    frame: { background: 'linear-gradient(90deg, #070707 50%, #F2F2EF 50%)', border: '1px solid var(--border)' },
    parts: ['#1B1B1D', '#ECECEA', '#2A2A2D'],
  },
  { value: 'dark', label: 'Tối', frame: { background: '#070707', border: '1px solid #2A2A2D' }, parts: ['#1B1B1D', '#232326', '#151516'] },
  { value: 'light', label: 'Sáng', frame: { background: '#F2F2EF', border: '1px solid #DEDEDA' }, parts: ['#FFFFFF', '#ECECEA', '#FFFFFF'] },
]

/** Canvas `.theme-tiles`: three tiles, the chosen one pressed; picking one changes the app's theme at once (D-395). */
export function ThemeTiles() {
  const { preference, choose } = useTheme()
  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-3 md:grid-cols-[repeat(3,148px)]">
      {PREVIEWS.map(({ value, label, frame, parts }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          onClick={() => choose(value)}
          className="flex cursor-pointer flex-col gap-2.5 rounded-md border bg-surface p-2.5 text-left text-[13px] leading-[18px] font-medium text-foreground transition-[border-color,background-color] duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-foreground aria-pressed:bg-raised"
        >
          <span aria-hidden="true" className="grid h-18 grid-cols-[22px_minmax(0,1fr)] grid-rows-[14px_minmax(0,1fr)] gap-1 overflow-hidden rounded-[8px] p-1.5" style={frame}>
            <span className="row-span-2 block rounded-[3px]" style={{ background: parts[0] }} />
            <span className="block rounded-[3px]" style={{ background: parts[1] }} />
            <span className="block rounded-[3px]" style={{ background: parts[2] }} />
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

export function AppearanceSection() {
  return (
    <SettingSection id="giao-dien" title="Giao diện">
      <SettingRow title="Theme" description="Theo hệ thống sẽ tự đổi giữa sáng và tối theo máy của bạn." control={<ThemeTiles />} />
    </SettingSection>
  )
}

export function LanguageSection() {
  const { values, disabled, update, errorOf } = useSettingValues()
  const dateId = useId()
  return (
    <SettingSection id="ngon-ngu" title="Ngôn ngữ">
      <SettingRow title="Ngôn ngữ hiển thị" description="Tiếng Việt và English. Các ngôn ngữ khác sẽ thêm sau." inline control={<LanguageButton />} />
      <SettingRow
        title="Định dạng ngày giờ"
        description="Dùng trong danh sách, lịch sử và thông báo."
        labelFor={dateId}
        error={errorOf('dateFormat')}
        control={
          <SettingSelect id={dateId} value={values.dateFormat} options={DATE_FORMATS} disabled={disabled} onChange={(dateFormat) => update({ dateFormat })} />
        }
      />
    </SettingSection>
  )
}

/** The level of motion, saved (settings-backend); what the OS asks for is read in the sentence beside it. */
export function MotionControl() {
  const { values, disabled, update } = useSettingValues()
  return (
    <Segmented
      label="Mức chuyển động"
      value={values.motion}
      options={MOTION_LEVELS}
      disabled={disabled}
      onChange={(motion) => update({ motion })}
      className="justify-self-start"
    />
  )
}

export function MotionDescription() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  return <>Giảm: bỏ dịch chuyển, giữ hiệu ứng mờ dần. Máy của bạn đang {reduce ? '' : 'không '}yêu cầu giảm chuyển động.</>
}

function MotionRow() {
  const { errorOf } = useSettingValues()
  return <SettingRow title="Mức chuyển động" description={<MotionDescription />} error={errorOf('motion')} control={<MotionControl />} />
}

export function MotionSection() {
  return (
    <SettingSection id="chuyen-dong" title="Chuyển động">
      <MotionRow />
    </SettingSection>
  )
}
