import { Inbox, Key, Plus, Search, SquareCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Kbd } from '@/shared/ui/kbd'
import { Card } from './Card'

const SHORTCUTS: { label: string; keys: string; icon: LucideIcon }[] = [
  { label: 'Tìm kiếm', keys: 'Ctrl K', icon: Search },
  { label: 'Mở hộp thư', keys: 'G I', icon: Inbox },
  { label: 'Tạo task', keys: 'T', icon: SquareCheck },
  { label: 'Kết nối tài khoản', keys: 'N', icon: Plus },
  { label: 'Xem lại đăng ký', keys: 'G R', icon: Key },
]

// Canvas `Dashboard` "Lối tắt". The keyboard shortcuts themselves come later; the buttons do nothing yet.
export function ShortcutsCard({ className }: { className?: string }) {
  return (
    <Card surface="quiet" title="Lối tắt" className={cn('gap-0.5', className)}>
      <div className="mt-2 flex flex-col gap-0.5">
        {SHORTCUTS.map(({ label, keys, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-sm border border-transparent px-2.5 text-left text-sm font-medium text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
            {label}
            <Kbd className="ml-auto">{keys}</Kbd>
          </button>
        ))}
      </div>
    </Card>
  )
}
