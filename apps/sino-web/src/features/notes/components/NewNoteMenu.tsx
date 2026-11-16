import { TextAlignStart, Workflow } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

const ITEM = 'h-auto items-start gap-2.5 py-2 [&_svg]:mt-0.5'

/**
 * What "+ Ghi chú" opens (fe-ui-diagram-notes, D-206): a text note (`/notes/new`) or a diagram
 * (`/notes/new?kind=diagram`), keeping the filter and the search of the list (`search`).
 */
export function NewNoteMenu({ search, trigger }: { search: string; trigger: ReactElement }) {
  const diagram = new URLSearchParams(search)
  diagram.set('kind', 'diagram')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuItem asChild className={ITEM}>
          <Link to={{ pathname: '/notes/new', search }}>
            <TextAlignStart strokeWidth={1.6} />
            <span className="flex flex-col gap-0.5">
              Ghi chú chữ
              <span className="text-xs leading-4 font-normal text-muted-foreground">Viết tự do</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to={{ pathname: '/notes/new', search: `?${diagram}` }}>
            <Workflow strokeWidth={1.6} />
            <span className="flex flex-col gap-0.5">
              Sơ đồ
              <span className="text-xs leading-4 font-normal text-muted-foreground">Khối ghi chú nối với nhau</span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
