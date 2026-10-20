import { ExternalLink, Link2Off, SquareCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { anchorChip, anchorHeading, editedLine, lengthLine, linkedDue, NOTE_MAX_LENGTH, quoteHeading, savedLine } from '../format'
import type { NoteItem } from '../notes.types'
import { useAutosave } from '../useAutosave'
import { DeleteNoteDialog } from './DeleteNoteDialog'
import { PinButton } from './PinButton'
import { SyncNotice } from './SyncNotice'

const CHIP =
  'inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full border bg-surface pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid'

/**
 * The open note (canvas `Notes` `.note-ed`): what it is tied to, Ghim, Xóa; the title, the quote, the text, the related
 * tasks and the foot. "Thêm thao tác" is left out until a note has an action. An edit saves itself once the typing
 * stops, or when the field is left, or when the editor goes away (D-203); `useAutosave` sends it over the version the
 * editor started from, and says at the top when the note was saved or deleted from another place or could not be saved,
 * keeping what was typed (D-178). Without `note` it is a new note (`/notes/new`): the first save with text makes it, and
 * the address becomes the note's, keeping this editor so the typing goes on. A text emptied out is not saved.
 */
export function NoteEditor({ note, search, now }: { note: NoteItem | undefined; search: string; now: Date }) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const sync = useAutosave({
    kind: 'TEXT',
    note,
    content: { title, body, diagram: null },
    adopt: (fresh) => {
      setTitle(fresh.title ?? '')
      setBody(fresh.body)
    },
    search,
  })
  const anchor = note?.anchor ?? null

  return (
    <>
      {/* Canvas MobileNoteEditor: back to the list, when it was saved, and Ghim; the length and Xóa go to the foot. */}
      <MobilePageHeader
        back={{ to: `/notes${search}`, label: 'Quay lại Ghi chú' }}
        title="Ghi chú"
        subtitle={note ? savedLine(note.updatedAt, now) : 'Ghi chú mới'}
        action={<PinButton pinned={note?.pinned ?? false} disabled={!note} onClick={sync.pin} size="icon" />}
      />
      <main aria-label="Ghi chú đang mở" className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pt-4 pb-6 md:gap-5 md:pt-6 md:pb-10 xl:px-14 xl:pt-7">
        <SyncNotice sync={sync} kind="TEXT" />
        <div className="flex min-w-0 items-center gap-2">
          {anchor && (
            <>
              <span className="shrink-0 text-xs leading-4 font-semibold text-muted-foreground">{anchorHeading(anchor)}</span>
              {anchor.missing ? (
                <span className="inline-flex items-center gap-1.5 text-xs leading-4 font-medium text-warning-ink">
                  <Link2Off className="size-3.5" strokeWidth={1.6} />
                  Tin nhắn gốc không còn
                </span>
              ) : anchor.conversationId ? (
                <Link to={`/inbox/${anchor.conversationId}`} className={CHIP}>
                  <ProviderIcon provider={anchor.provider ?? 'gmail'} className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{anchorChip(anchor)}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                </Link>
              ) : (
                <span className={CHIP}>
                  <ProviderIcon provider={anchor.provider ?? 'gmail'} className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{anchorChip(anchor)}</span>
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 max-md:hidden">
            <PinButton pinned={note?.pinned ?? false} disabled={!note} onClick={sync.pin} size="icon-sm" />
            {note ? (
              <DeleteNoteDialog
                note={note}
                after={`/notes${search}`}
                trigger={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa ghi chú">
                    <Trash2 strokeWidth={1.6} />
                  </Button>
                }
              />
            ) : (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Xóa ghi chú" disabled>
                <Trash2 strokeWidth={1.6} />
              </Button>
            )}
          </div>
        </div>
        <input
          type="text"
          aria-label="Tiêu đề ghi chú"
          placeholder="Tiêu đề"
          maxLength={200}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            sync.later()
          }}
          onBlur={sync.flush}
          className="w-full bg-transparent p-0 text-[22px] leading-7 font-bold md:text-[28px] md:leading-9 tracking-[-0.018em] text-foreground outline-none placeholder:text-subtle-foreground"
        />
        {note?.quote && (
          <blockquote className="flex max-w-180 flex-col gap-2 rounded-r-sm border-l-3 border-border-strong bg-surface px-4.5 py-3.5">
            <Spec>{quoteHeading(anchor, note.quote.at, now)}</Spec>
            <p className="text-sm leading-5.5 text-muted-foreground">“{note.quote.text}”</p>
          </blockquote>
        )}
        <textarea
          aria-label="Nội dung ghi chú"
          placeholder="Viết ghi chú…"
          maxLength={NOTE_MAX_LENGTH}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
            sync.later()
          }}
          onBlur={sync.flush}
          aria-invalid={note && body.trim() === '' ? true : undefined}
          className="min-h-40 w-full max-w-180 flex-1 resize-none bg-transparent p-0 text-[15px] leading-6 md:min-h-50 md:text-base md:leading-6.5 text-foreground outline-none placeholder:text-subtle-foreground"
        />
        {note && body.trim() === '' && (
          <p role="alert" className="-mt-3 text-sm text-danger-ink">
            Ghi chú cần có nội dung
          </p>
        )}
        {note && note.linked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {note.linked.map((task) => (
              <Link key={task.id} to={`/tasks/${task.id}`} className={CHIP}>
                <SquareCheck className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <span className="truncate">{task.title}</span>
                {linkedDue(task) && <Spec className="truncate">{linkedDue(task)}</Spec>}
              </Link>
            ))}
          </div>
        )}
        <div className="flex max-w-180 flex-wrap items-center justify-between gap-3 border-t pt-3.5 max-md:hidden">
          <Spec>{note ? editedLine(note.updatedAt, now) : 'Ghi chú mới · lưu khi có nội dung'}</Spec>
          <Spec>{lengthLine(body)}</Spec>
        </div>
      </main>
      <div role="group" aria-label="Ghi chú này" className="flex items-center justify-between gap-3 border-t px-5 pt-2.5 pb-7 md:hidden">
        <Spec>{lengthLine(body)}</Spec>
        {note && (
          <DeleteNoteDialog
            note={note}
            after={`/notes${search}`}
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-danger-ink">
                Xóa
              </Button>
            }
          />
        )}
      </div>
    </>
  )
}
