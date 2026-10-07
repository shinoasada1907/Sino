import { ThemeToggle } from '@/shared/theme/ThemeToggle'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'

/** Temporary start page for FE-01: shows the design tokens and base components. FE-04 replaces it with the router. */
export function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-lg font-semibold">
          <svg className="size-5" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M21 6A9 9 0 0 0 21 24H27A9 9 0 1 1 18 33" fill="none" stroke="currentColor" strokeWidth="7" />
            <rect x="24" y="1.5" width="9" height="9" rx="2.5" fill="currentColor" />
          </svg>
          Sino
        </span>
        <ThemeToggle />
      </header>

      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Nền móng web</h1>
        <p className="text-sm text-muted-foreground">
          Trang tạm của FE-01: kiểm tra màu, font và component theo canvas. Trang đăng nhập và khung app đến ở FE-03, FE-04.
        </p>
      </div>

      <form className="flex flex-col gap-4 rounded-lg border bg-surface p-6" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-email">Email</Label>
          <Input id="demo-email" type="email" placeholder="ban@example.com" />
        </div>
        <Label className="font-medium">
          <Switch defaultChecked />
          Giữ đăng nhập trên máy này
        </Label>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Nút chính
          </Button>
          <Button type="button" variant="secondary" className="flex-1">
            Nút phụ
          </Button>
        </div>
      </form>
    </main>
  )
}
