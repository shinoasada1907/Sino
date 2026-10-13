import { Link2Off, Pin, Plus, Search } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { filterNotes, groupNotes, noteCounts, noteSource, noteTime, noteTitle } from '../format'
import type { NoteItem, NotesFilter } from '../notes.types'

const FILTERS: { value: NotesFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'linked', label: 'Gắn tin nhắn' },
  { value: 'pinned', label: 'Đã ghim' },
]

const CHIP =
  'inline-flex h-8.5 shrink-0 cursor-pointer items-center rounded-full border bg-surface px-3 text-[13px] leading-4.5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-foreground aria-pressed:bg-raised aria-pressed:text-foreground'

/**
 * The list of canvas `Notes` (`.notes-list`): the title with "+ Ghi chú", the search, the filter chips with their counts
 * over every note, then "ĐÃ GHIM" and "GẦN ĐÂY" (D-205). A card opens its note (`/notes/:noteId`), keeping the filter.
 * On a phone (canvas `MobileNotes`) `phoneHeader` takes the place of the title, and the search shows only once asked
 * for (`searchOpen`) or while it holds a query. Without any note it says so, with "+ Ghi chú".
 */
export function NoteList({
  notes,
  filter,
  query,
  search,
  selectedId,
  now,
  onFilter,
  onQuery,
  phoneHeader,
  searchOpen = false,
  className,
}: {
  notes: NoteItem[]
  filter: NotesFilter
  query: string
  search: string
  selectedId: string | null
  now: Date
  onFilter: (filter: NotesFilter) => void
  onQuery: (query: string) => void
  phoneHeader?: ReactNode
  searchOpen?: boolean
  className?: string
}) {
  const counts = noteCounts(notes)
  const { pinned, recent } = groupNotes(filterNotes(notes, filter, query))
  const groups = [
    { label: 'ĐÃ GHIM', items: pinned },
    { label: 'GẦN ĐÂY', items: recent },
  ].filter((group) => group.items.length > 0)
  const searchBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searchOpen) {
      searchBox.current?.focus()
    }
  }, [searchOpen])

  return (
    <section aria-label="Danh sách ghi chú" className={cn('min-h-0 flex-col overflow-auto md:border-r', className)}>
      {phoneHeader}
      <div className="z-1 flex flex-col gap-3.5 border-b bg-background px-4 pt-3 pb-3.5 md:sticky md:top-0 md:pt-5">
        <div className="flex items-center justify-between gap-3 max-md:hidden">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Ghi chú</h1>
          <Button asChild variant="primary" size="sm">
            <Link to={{ pathname: '/notes/new', search }}>
              <Plus strokeWidth={1.6} />
              Ghi chú
            </Link>
          </Button>
        </div>
        <span data-slot="note-search" className={cn('relative flex items-center', !searchOpen && query === '' && 'max-md:hidden')}>
          <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" strokeWidth={1.6} />
          <input
            ref={searchBox}
            type="search"
            aria-label="Tìm trong ghi chú"
            placeholder="Tìm trong ghi chú"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className="h-10 w-full min-w-0 rounded-sm border border-border bg-surface pr-3.5 pl-10.5 text-sm text-foreground transition-[border-color,box-shadow] duration-(--dur-hover) ease-out outline-none placeholder:text-subtle-foreground hover:border-border-strong focus:border-foreground focus:ring-3 focus:ring-foreground/16"
          />
        </span>
        <div role="group" aria-label="Lọc ghi chú" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => onFilter(option.value)} className={CHIP}>
              {option.label} · {counts[option.value]}
            </button>
          ))}
        </div>
      </div>
      {notes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 py-8 md:px-5.5">
          <p className="text-base font-semibold">Chưa có ghi chú nào</p>
          <p className="text-sm text-muted-foreground">Ghi lại điều cần nhớ; ghi chú tạo từ một tin nhắn sẽ gắn với tin nhắn đó.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={{ pathname: '/notes/new', search }}>
              <Plus strokeWidth={1.6} />
              Ghi chú
            </Link>
          </Button>
        </div>
      ) : (
        groups.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Không có ghi chú nào khớp</p>
      )}
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5 pb-1">
          <div className="px-4 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground md:px-5.5">{group.label}</div>
          {group.items.map((note) => (
            <NoteCard key={note.id} note={note} search={search} selected={note.id === selectedId} now={now} />
          ))}
        </div>
      ))}
    </section>
  )
}

// Canvas `.ncard`: pin, title and time; two lines of the text; where it comes from.
function NoteCard({ note, search, selected, now }: { note: NoteItem; search: string; selected: boolean; now: Date }) {
  const source = noteSource(note)
  return (
    <Link
      to={{ pathname: `/notes/${note.id}`, search }}
      aria-current={selected ? 'page' : undefined}
      className="mx-2 flex flex-col gap-1.5 rounded-xl border border-transparent p-3.5 text-foreground max-md:mx-0 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:border-b-border max-md:px-4 transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-border-strong aria-[current=page]:bg-raised"
    >
      <span className="flex min-w-0 items-center gap-2">
        {note.pinned && <Pin role="img" aria-label="Đã ghim" className="size-3.5 shrink-0" strokeWidth={1.6} />}
        <span data-slot="note-title" className="truncate text-sm font-semibold">
          {noteTitle(note)}
        </span>
        <Spec className="ml-auto shrink-0">{noteTime(note.updatedAt, now)}</Spec>
      </span>
      <span className="line-clamp-2 text-[13px] leading-4.5 whitespace-pre-line text-muted-foreground">{note.body}</span>
      <span className="flex min-w-0 items-center">
        {source.tone === 'anchor' && note.anchor ? (
          <span className="inline-flex h-5.5 max-w-70 min-w-0 items-center gap-1.5 rounded-xs border bg-raised pr-2 pl-0.75 text-[11px] leading-4 font-medium text-muted-foreground">
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-surface text-foreground">
              <ProviderIcon provider={note.anchor.provider ?? 'gmail'} className="size-2.75" />
            </span>
            <span className="truncate">{source.text}</span>
          </span>
        ) : source.tone === 'missing' ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] leading-4 font-medium text-warning-ink">
            <Link2Off className="size-3" strokeWidth={1.6} />
            {source.text}
          </span>
        ) : (
          <Spec>{source.text}</Spec>
        )}
      </span>
    </Link>
  )
}
