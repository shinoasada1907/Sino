import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, User } from 'lucide-react'
import { ApiError } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { EDITABLE_FIELDS, type EditableField, type ProfileChange, type UserProfile } from '../profile.types'

type Values = Record<EditableField, string>
type FieldErrors = Partial<Record<EditableField, string>>

const valuesOf = (profile: UserProfile): Values => ({
  displayName: profile.displayName,
  phoneNumber: profile.phoneNumber ?? '',
  jobTitle: profile.jobTitle ?? '',
  location: profile.location ?? '',
  bio: profile.bio ?? '',
})

/** Only what differs from the saved profile (D-480); the server trims, so a value is compared trimmed. */
function changeOf(profile: UserProfile, values: Values): ProfileChange {
  const saved = valuesOf(profile)
  const change: ProfileChange = {}
  for (const field of EDITABLE_FIELDS) {
    if (values[field].trim() !== saved[field]) {
      change[field] = values[field].trim()
    }
  }
  return change
}

/** What each field's 400 says: the server only tells which field failed, the sentence is the web's (Vietnamese, D-478 limits). */
const FIELD_MESSAGES: Record<EditableField, string> = {
  displayName: 'Họ và tên không được để trống và tối đa 200 ký tự.',
  phoneNumber: 'Số điện thoại chỉ gồm chữ số, khoảng trắng và + ( ) - . , tối đa 30 ký tự.',
  jobTitle: 'Chức danh tối đa 100 ký tự.',
  location: 'Địa điểm tối đa 100 ký tự.',
  bio: 'Giới thiệu tối đa 500 ký tự.',
}

const isEditable = (field: string): field is EditableField => (EDITABLE_FIELDS as readonly string[]).includes(field)

const inputClass = 'aria-invalid:border-danger'
const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={`${id}-error`} role="alert" className="text-[11px] text-danger-ink">
      {message}
    </p>
  ) : null

export function ProfileInfoForm({
  profile,
  onSave,
  isPending,
}: {
  profile: UserProfile
  onSave: (change: ProfileChange) => Promise<UserProfile>
  isPending?: boolean
}) {
  const [values, setValues] = useState<Values>(() => valuesOf(profile))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const change = changeOf(profile, values)
  const dirty = Object.keys(change).length > 0

  const edit = (field: EditableField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }))
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const save = async () => {
    if (!dirty) return
    setFailure(null)
    setFieldErrors({})
    setShowSuccess(false)
    try {
      const saved = await onSave(change)
      setValues(valuesOf(saved))
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3500)
    } catch (error) {
      const found: FieldErrors = {}
      if (error instanceof ApiError && error.status === 400) {
        for (const { field } of error.errors) {
          if (isEditable(field)) found[field] = FIELD_MESSAGES[field]
        }
      }
      if (Object.keys(found).length > 0) {
        setFieldErrors(found)
      } else {
        setFailure('Không lưu được thông tin cá nhân. Vui lòng thử lại.')
      }
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void save()
  }

  const handleReset = () => {
    setValues(valuesOf(profile))
    setFieldErrors({})
    setFailure(null)
    setShowSuccess(false)
  }

  const props = (field: EditableField) => ({
    id: field,
    value: values[field],
    onChange: (e: { target: { value: string } }) => edit(field, e.target.value),
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
  })

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center gap-2.5 pb-4 border-b border-border">
        <User className="size-5 text-primary" strokeWidth={1.8} />
        <div>
          <h3 className="text-base font-semibold text-foreground">Thông tin cá nhân</h3>
          <p className="text-xs text-muted-foreground">Cập nhật họ tên, liên hệ và chức danh hiển thị của bạn trong Sino.</p>
        </div>
      </div>

      {showSuccess && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success-ink"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Đã lưu thay đổi thông tin cá nhân thành công!</span>
        </div>
      )}

      {failure && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger-ink"
        >
          <span>{failure}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void save()} disabled={isPending}>
            Thử lại
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Họ và tên</Label>
            <Input {...props('displayName')} placeholder="Nhập họ và tên..." className={inputClass} />
            <FieldError id="displayName" message={fieldErrors.displayName} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Địa chỉ Email</Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              disabled
              className="bg-muted text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground">Email đăng nhập tài khoản chính.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber">Số điện thoại</Label>
            <Input {...props('phoneNumber')} placeholder="VD: 0901 234 567" className={inputClass} />
            <FieldError id="phoneNumber" message={fieldErrors.phoneNumber} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Chức danh / Vai trò</Label>
            <Input {...props('jobTitle')} placeholder="VD: Quản trị viên hệ thống" className={inputClass} />
            <FieldError id="jobTitle" message={fieldErrors.jobTitle} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="location">Địa điểm làm việc</Label>
          <Input {...props('location')} placeholder="VD: Hà Nội, Việt Nam" className={inputClass} />
          <FieldError id="location" message={fieldErrors.location} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio">Giới thiệu ngắn (Bio)</Label>
          <textarea
            {...props('bio')}
            rows={3}
            placeholder="Viết một vài dòng giới thiệu về vai trò hoặc phương châm làm việc của bạn..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground aria-invalid:border-danger"
          />
          <FieldError id="bio" message={fieldErrors.bio} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={handleReset} disabled={isPending || !dirty}>
            Khôi phục
          </Button>
          <Button type="submit" size="sm" disabled={isPending || !dirty} className="gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </div>
  )
}
