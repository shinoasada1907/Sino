import { TriangleAlert } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'
import { useMe } from './useAuth'

/**
 * The gate in front of every page but sign-in and 404: it asks `GET /api/auth/me` once, sends a signed-out visitor to
 * `/login?returnTo=<this page>`, and offers "Thử lại" when the server cannot be reached.
 */
export function RequireAuth() {
  const { data: me, isPending, isError, isFetching, refetch } = useMe()
  const location = useLocation()

  if (isPending) {
    return (
      <div role="status" aria-label="Đang kiểm tra đăng nhập" className="grid min-h-svh place-items-center bg-background">
        <SinoMark className="size-8 text-muted-foreground motion-safe:animate-pulse" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-4">
        <div role="alert" className="flex max-w-100 flex-col items-start gap-4">
          <TriangleAlert className="size-6 text-danger" strokeWidth={1.6} />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không mở được Sino</h1>
            <p className="text-sm text-muted-foreground">Không kết nối được máy chủ Sino. Kiểm tra máy chủ đã chạy chưa rồi thử lại.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }
  if (!me) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <Outlet />
}
