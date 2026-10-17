import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router'
import { useMe } from '@/features/auth/useAuth'
import { SinoMark } from '@/shared/ui/sino-mark'

// The public pages and gsap load only for a visitor (D-313).
const Landing = lazy(() => import('./PublicPages').then((module) => ({ default: module.Landing })))

/**
 * `/` (web-public-pages, D-310): the owner goes on to Tổng quan, anybody else sees the Sino Messages page. While the
 * session is asked for, only the mark of RequireAuth shows, so the owner never sees the page flash by. When the server
 * cannot be reached the page still shows: a public page must not fail because the API is down.
 */
export function HomeGate() {
  const { data: me, isPending } = useMe()

  if (isPending) {
    return <SessionCheck />
  }
  if (me) {
    return <Navigate to="/overview" replace />
  }
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>
      <Landing />
    </Suspense>
  )
}

// The same mark as RequireAuth while it asks who is signed in.
function SessionCheck() {
  return (
    <div role="status" aria-label="Đang kiểm tra đăng nhập" className="grid min-h-svh place-items-center bg-background">
      <SinoMark className="size-8 text-muted-foreground motion-safe:animate-pulse" />
    </div>
  )
}
