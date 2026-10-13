import { Moon, Sun } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { useTheme } from './themeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={toggleTheme}>
      {theme === 'dark' ? <Sun strokeWidth={1.6} /> : <Moon strokeWidth={1.6} />}
    </Button>
  )
}
