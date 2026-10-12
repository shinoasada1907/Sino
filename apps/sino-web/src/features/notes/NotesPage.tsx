import { Link, useLocation, useMatch, useParams } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { NoteEditor } from './components/NoteEditor'
import { NoteList } from './components/NoteList'
import { NotesLoadFailed, NotesSkeleton } from './components/NoteStates'
import { useNotesFilter } from './useNotesFilter'
import { FROM_NEW, useNotes } from './useNotes'

/**
 * The Ghi chú screen (canvas `Notes`): the list and, beside it from 768 px, the open note (D-201). `/notes/:noteId`
 * opens a note and `/notes/new` a new one, keeping the filter and the search of the address (D-205). A new note keeps
 * its editor when it gets its own address, so the typing goes on (D-203).
 */
export function NotesPage() {
  const { noteId } = useParams()
  const creating = useMatch('/notes/new') !== null
  const location = useLocation()
  const { data, error, refetch } = useNotes()
  const now = useNow()
  const { filter, query, search, setFilter, setQuery } = useNotesFilter()

  if (!data) {
    return error ? <NotesLoadFailed onRetry={() => void refetch()} /> : <NotesSkeleton />
  }

  const open = creating || noteId !== undefined
  const note = noteId === undefined ? undefined : data.notes.find((entry) => entry.id === noteId)
  const fromNew = (location.state as typeof FROM_NEW | null)?.noteFromNew === true
  const editorKey = creating || fromNew ? 'new' : noteId

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
      <NoteList
        notes={data.notes}
        filter={filter}
        query={query}
        search={search}
        selectedId={noteId ?? null}
        now={now}
        onFilter={setFilter}
        onQuery={setQuery}
        className={open ? 'hidden md:flex' : 'flex'}
      />
      <div className={cn('min-h-0 min-w-0 flex-col', open ? 'flex' : 'hidden md:flex')}>
        {creating || note ? (
          <NoteEditor key={editorKey} note={note} search={search} now={now} />
        ) : noteId !== undefined ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10">
            <p className="text-base">Không tìm thấy ghi chú này.</p>
            <Button asChild variant="secondary" size="sm">
              <Link to={{ pathname: '/notes', search }}>Về Ghi chú</Link>
            </Button>
          </div>
        ) : (
          <p className="m-auto p-10 text-sm text-muted-foreground">Chọn một ghi chú để xem</p>
        )}
      </div>
    </div>
  )
}
