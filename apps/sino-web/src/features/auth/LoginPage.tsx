import { Check, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { ApiError } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { SinoMark } from '@/shared/ui/sino-mark'
import { Spec } from '@/shared/ui/spec'
import { Switch } from '@/shared/ui/switch'
import { loginFailure } from './format'
import { safeReturnTo } from './returnTo'
import { useLogin, useMe } from './useAuth'

const POINTS = ['Một hộp thư cho mọi tài khoản.', 'Việc, lịch, ghi chú từ chính tin nhắn.', 'Nhắc đúng giờ, chỉ qua Sino.']

/**
 * `/login`, the canvas `SiteLogin` with the parts that have no flow yet left out (Google, "Quên mật khẩu?", "Bắt đầu
 * tại đây", language, terms, the public home page). After a failure the password is emptied and focused, the email
 * kept. Once `useMe` knows who is signed in, the page moves on to `returnTo` (a path of this app only).
 */
export function LoginPage() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const { data: me } = useMe()
  const signIn = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const emailId = useId()
  const passwordId = useId()

  if (me) {
    return <Navigate to={returnTo} replace />
  }

  const failure = signIn.error ? loginFailure(signIn.error) : null
  const wrongPassword = signIn.error instanceof ApiError && signIn.error.code === 'INVALID_CREDENTIALS'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    signIn.mutate(
      { email, password, rememberMe },
      {
        onError: () => {
          setPassword('')
          passwordRef.current?.focus()
        },
      },
    )
  }

  return (
    <div className="grid h-svh bg-background md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside aria-hidden="true" className="hidden flex-col justify-between gap-8 overflow-hidden border-r bg-surface bg-dots px-14 py-12 md:flex">
        <span className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em] text-foreground">
          <SinoMark className="size-5" />
          Sino
        </span>
        <div className="flex flex-col gap-7">
          <span className="font-mono text-[96px] leading-none font-semibold tracking-[0.14em] text-foreground">SINO</span>
          <ul className="flex flex-col gap-3.5">
            {POINTS.map((point) => (
              <li key={point} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 text-base text-foreground">
                <Check className="mt-0.75 size-4.5 text-success-ink" strokeWidth={1.6} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <Spec>© 2026 SINO</Spec>
      </aside>

      <main className="flex min-h-0 flex-col overflow-auto">
        <div className="grid grow place-items-start justify-items-center px-4 pt-10 pb-10 md:place-items-center md:px-6 md:pt-6 md:pb-14">
          <form aria-labelledby={headingId} onSubmit={submit} className="flex w-full max-w-100 flex-col gap-5.5">
            <span className="inline-flex items-center gap-2.5 text-lg leading-6 font-bold tracking-[-0.03em] text-foreground md:hidden">
              <SinoMark className="size-5" />
              Sino
            </span>
            <div className="flex flex-col gap-2">
              <h1 id={headingId} className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">
                Đăng nhập vào Sino
              </h1>
              <p className="text-sm text-muted-foreground">Chào mừng bạn quay lại.</p>
            </div>

            {failure && (
              <div role="alert" className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5">
                <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{failure.title}</span>
                  {failure.text && <span className="text-sm text-muted-foreground">{failure.text}</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={emailId}>Email</Label>
                <Input id={emailId} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={passwordId}>Mật khẩu</Label>
                <div className="relative flex items-center">
                  <Input
                    ref={passwordRef}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={wrongPassword || undefined}
                    className="pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    aria-controls={passwordId}
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="absolute right-1"
                  >
                    {showPassword ? <EyeOff strokeWidth={1.6} /> : <Eye strokeWidth={1.6} />}
                  </Button>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium">
                <Switch checked={rememberMe} onCheckedChange={setRememberMe} />
                Giữ đăng nhập trên máy này
              </label>
              <Button type="submit" className="w-full" disabled={signIn.isPending}>
                {signIn.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
