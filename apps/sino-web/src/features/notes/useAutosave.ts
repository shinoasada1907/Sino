import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/shared/api/problem'
import { sameDiagram } from './diagram/diagram'
import type { Diagram, NoteChange, NoteItem, NoteKind } from './notes.types'
import { FROM_NEW, useCreateNote, useNotes, useSaveNote } from './useNotes'

/** How long the changes must stop before they are saved (D-203, D-210). */
export const SAVE_AFTER_MS = 600

/**
 * Why the last save did not go through (D-178): `conflict` the note was saved from another place meanwhile (409), `gone`
 * it was deleted there (404), `failed` anything else (the network, the server).
 */
export type SyncProblem = 'conflict' | 'gone' | 'failed'

/** What an editor holds: the title, and the text of a text note or the diagram of a diagram note. */
export interface NoteContent {
  title: string
  body: string
  diagram: Diagram | null
}

/** What `useAutosave` gives an editor. */
export interface NoteSync {
  problem: SyncProblem | null
  /** A pin was refused; the pin stays as it was. */
  pinProblem: boolean
  /** The content changed: save it once the changes stop. */
  later: () => void
  /** Save now (the field is left, the editor goes away). */
  flush: () => void
  /** "Thử lại": try the save that failed. */
  retry: () => void
  /** "Tải bản mới": take the note of the server, dropping what was not saved. */
  reload: () => void
  /** "Lưu bản của tôi": save what the editor holds over the newest version. */
  keepMine: () => void
  /** "Lưu thành ghi chú mới": the note was deleted elsewhere, so make a new one of what the editor holds. */
  saveAsNew: () => void
  pin: () => void
}

/** What an editor would save: the fields that differ from the note it started from, or null. */
function changeOf(base: NoteItem, content: NoteContent): NoteChange | null {
  const change: NoteChange = {}
  // The server keeps a title without the spaces at its ends, and none when it is only spaces.
  if (content.title.trim() !== (base.title ?? '')) {
    change.title = content.title
  }
  if (base.kind === 'TEXT' && content.body !== base.body) {
    change.body = content.body
  }
  if (base.kind === 'DIAGRAM' && content.diagram && !sameDiagram(content.diagram, base.diagram)) {
    change.diagram = content.diagram
  }
  return Object.keys(change).length > 0 ? change : null
}

function problemOf(error: unknown): SyncProblem {
  if (error instanceof ApiError && error.status === 409) {
    return 'conflict'
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'gone'
  }
  return 'failed'
}

/**
 * The saving of an open note, for the text editor and the diagram editor alike (D-172, D-178, D-203, D-210). The editor
 * holds what the user is writing; this hook sends it:
 * - A save goes over `base`, the version of the note the editor started from, and the answer becomes the new base. The
 *   list read again does not move the base while something is unsaved, so a note changed from another place is met by a
 *   409 and never written over in silence. With nothing unsaved the editor takes the newer note (`adopt`).
 * - One request at a time, in the order they were asked: a change made while a save is on its way waits for it and
 *   goes over the version that comes back, so two saves never carry the same version.
 * - A 409 or a 404 stops the saving by itself until the user chooses (`reload`, `keepMine`, `saveAsNew`); another
 *   failure leaves the writing where it is, and the next change or `retry` tries again.
 * - A new note is made at its first save with something to save (text with words, a diagram once changed), and the
 *   address becomes the note's, the same editor staying.
 */
export function useAutosave({
  kind,
  note,
  content,
  adopt,
  search,
}: {
  kind: NoteKind
  note: NoteItem | undefined
  content: NoteContent
  /** Put a note of the server into the fields of the editor. */
  adopt: (note: NoteItem) => void
  search: string
}): NoteSync {
  const { refetch } = useNotes()
  const { mutateAsync: save } = useSaveNote()
  const { mutateAsync: create } = useCreateNote()
  const navigate = useNavigate()
  // The note as the editor started from it; undefined for a note not made yet.
  const base = useRef<NoteItem | undefined>(note)
  const latest = useRef(content)
  const context = useRef({ kind, adopt, search, refetch, save, create, navigate })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const started = useRef(false)
  const mounted = useRef(true)
  const problemNow = useRef<SyncProblem | null>(null)
  const [problem, setProblemState] = useState<SyncProblem | null>(null)
  const [pinProblem, setPinProblem] = useState(false)
  const setProblem = (next: SyncProblem | null) => {
    problemNow.current = next
    setProblemState(next)
  }
  const blocked = () => problemNow.current === 'conflict' || problemNow.current === 'gone'
  // Requests go one after the other; a task handles its own failures, so the queue never breaks.
  const enqueue = (task: () => Promise<void>) => {
    pending.current += 1
    queue.current = queue.current.then(task).catch(() => undefined).finally(() => {
      pending.current -= 1
    })
  }

  // The save of what the editor holds, or the making of the note; what it sees is what is there when its turn comes.
  const saveWhatIsThere = async () => {
    if (blocked()) {
      return
    }
    const { kind: noteKind, save: saveChange, create: makeNote, navigate: go, search: query } = context.current
    const draft = latest.current
    const current = base.current
    if (!current) {
      const ready = noteKind === 'TEXT' ? draft.body.trim() !== '' : started.current
      if (!ready) {
        return
      }
      try {
        const created = await makeNote(noteKind === 'DIAGRAM' ? { title: draft.title, body: '', diagram: draft.diagram ?? undefined } : { title: draft.title, body: draft.body })
        base.current = created
        setProblem(null)
        if (mounted.current) {
          go({ pathname: `/notes/${created.id}`, search: query }, { replace: true, state: FROM_NEW })
        }
      } catch {
        setProblem('failed')
      }
      return
    }
    // A text emptied out is not saved: the editor says the note needs text.
    const change = noteKind === 'TEXT' && draft.body.trim() === '' ? null : changeOf(current, draft)
    if (!change) {
      return
    }
    try {
      base.current = await saveChange({ note: current, change })
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
    }
  }

  // The note as the server has it now; null when it is gone, undefined when it could not be read.
  const readNote = async (): Promise<NoteItem | null | undefined> => {
    const result = await context.current.refetch()
    if (result.isError || !result.data) {
      return undefined
    }
    return result.data.notes.find((entry) => entry.id === base.current?.id) ?? null
  }

  const latestTask = useRef({ saveWhatIsThere, readNote })
  useEffect(() => {
    latest.current = content
    context.current = { kind, adopt, search, refetch, save, create, navigate }
    latestTask.current = { saveWhatIsThere, readNote }
  })

  const flush = () => {
    clearTimeout(timer.current)
    enqueue(() => latestTask.current.saveWhatIsThere())
  }

  // The list read again: a newer note is taken when nothing of the editor's is unsaved.
  useEffect(() => {
    const current = base.current
    if (!note || !current || note.id !== current.id || note.version <= current.version || pending.current > 0) {
      return
    }
    if (changeOf(current, latest.current) === null) {
      base.current = note
      context.current.adopt(note)
    }
  }, [note])

  // Leaving the note saves what is left to save.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on leaving; `flush` reads everything through refs
  }, [])

  return {
    problem,
    pinProblem,
    later: () => {
      started.current = true
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_AFTER_MS)
    },
    flush,
    retry: flush,
    reload: () =>
      enqueue(async () => {
        const fresh = await latestTask.current.readNote()
        if (fresh === null) {
          setProblem('gone')
        } else if (fresh) {
          base.current = fresh
          context.current.adopt(fresh)
          setProblem(null)
        }
      }),
    keepMine: () => {
      enqueue(async () => {
        const fresh = await latestTask.current.readNote()
        if (fresh === null) {
          setProblem('gone')
        } else if (fresh) {
          // The version of the server is the one to save over; what the editor holds stays.
          base.current = fresh
          setProblem(null)
        }
      })
      flush()
    },
    saveAsNew: () => {
      enqueue(async () => {
        base.current = undefined
        started.current = true
        setProblem(null)
      })
      flush()
    },
    pin: () =>
      enqueue(async () => {
        const current = base.current
        if (!current || blocked()) {
          return
        }
        setPinProblem(false)
        try {
          base.current = await context.current.save({ note: current, change: { pinned: !current.pinned } })
        } catch (error) {
          const next = problemOf(error)
          if (next === 'failed') {
            setPinProblem(true)
          } else {
            setProblem(next)
          }
        }
      }),
  }
}
