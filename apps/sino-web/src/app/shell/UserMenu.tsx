import { LogOut, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLogout, useMe } from '@/features/auth/useAuth'
import { useTheme } from '@/shared/theme/themeContext'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

/**
 * The menu behind "Tài khoản Sino của bạn" (the sidebar's "…" and the rail's avatar): who is signed in, light or dark,
 * and signing out. The canvas draws the button without its menu; the content follows the spec `web-app-foundation`.
 */
export function UserMenu({ children }: { children: ReactNode }) {
  const { data: me } = useMe()
  const { theme, toggleTheme } = useTheme()
  const signOut = useLogout()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{me?.displayName}</span>
          <span className="truncate font-mono text-[11px] leading-4 font-medium text-muted-foreground">{me?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun strokeWidth={1.6} /> : <Moon strokeWidth={1.6} />}
          {theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          <LogOut strokeWidth={1.6} />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
