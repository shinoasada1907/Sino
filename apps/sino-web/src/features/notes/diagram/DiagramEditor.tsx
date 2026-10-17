import { ReactFlowProvider, useReactFlow, useStore } from '@xyflow/react'
import { Maximize, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { DeleteNoteDialog } from '../components/DeleteNoteDialog'
import { PinButton } from '../components/PinButton'
import { editedLine, savedLine } from '../format'
import type { Diagram, NoteItem } from '../notes.types'
import { FROM_NEW, useCreateNote, useSaveNote } from '../useNotes'
import { addBlock, diagramFootLine, diagramSummary, freeSpot, newBlock, newDiagram } from './diagram'
import { DiagramCanvas } from './DiagramCanvas'
import { FIT_VIEW } from './flow'

/** How long the changes must stop before the diagram is saved (D-210). */
const SAVE_AFTER_MS = 600

/**
 * An open diagram (fe-ui-diagram-notes), loaded on its own so that React Flow weighs only on a diagram (D-208): its
 * name with "+ Khối", Ghim and Xóa, the canvas, and the foot. Every change saves the whole diagram once the changes
 * stop, and when the diagram is left (D-210). Without `note` it is a new diagram (`/notes/new?kind=diagram`): one main
 * block "Ý chính", made only at its first change, then under its own address with the same canvas (D-209).
 */
export function DiagramEditor(props: { note: NoteItem | undefined; search: string; now: Date }) {
  return (
    <ReactFlowProvider>
      <DiagramPane {...props} />
    </ReactFlowProvider>
  )
}

function DiagramPane({ note, search, now }: { note: NoteItem | undefined; search: string; now: Date }) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [diagram, setDiagram] = useState<Diagram>(() => note?.diagram ?? newDiagram())
  // The block being written: one just added, or one double-clicked.
  const [editing, setEditing] = useState<string | null>(null)
  const { mutate: save } = useSaveNote()
  const { mutateAsync: create } = useCreateNote()
  const navigate = useNavigate()
  const { screenToFlowPosition } = useReactFlow()
  const canvas = useStore((state) => state.domNode)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const changed = useRef(false)
  const creating = useRef(false)
  // What a save made later (a timer, leaving the name, leaving the diagram) must see.
  const latest = useRef({ title, diagram, note })
  const flush = useRef(() => {})

  useEffect(() => {
    latest.current = { title, diagram, note }
    flush.current = () => {
      clearTimeout(timer.current)
      const current = latest.current
      if (!current.note) {
        if (changed.current && !creating.current) {
          creating.current = true
          void create({ title: current.title, body: '', diagram: current.diagram }).then((created) => {
            latest.current = { ...latest.current, note: created }
            navigate({ pathname: `/notes/${created.id}`, search }, { replace: true, state: FROM_NEW })
          })
        }
        return
      }
      const change = {
        ...(current.title !== (current.note.title ?? '') ? { title: current.title } : {}),
        ...(current.diagram !== current.note.diagram ? { diagram: current.diagram } : {}),
      }
      if (Object.keys(change).length > 0) {
        save({ note: current.note, change })
      }
    }
  })
  // Leaving the diagram saves what is left to save.
  useEffect(() => () => flush.current(), [])

  const later = () => {
    changed.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flush.current(), SAVE_AFTER_MS)
  }
  const change = (next: Diagram) => {
    setDiagram(next)
    later()
  }
  // "+ Khối": a block in the middle of what the canvas shows, or below the blocks there.
  const addInMiddle = () => {
    const box = canvas?.getBoundingClientRect()
    const middle = screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 })
    const spot = freeSpot(diagram, middle.x, middle.y)
    const block = newBlock(spot.x, spot.y)
    setEditing(block.id)
    change(addBlock(diagram, block))
  }
  const togglePin = () => note && save({ note, change: { pinned: !note.pinned } })

  return (
    <>
      <MobilePageHeader
        back={{ to: `/notes${search}`, label: 'Quay lại Ghi chú' }}
        title="Sơ đồ"
        subtitle={note ? savedLine(note.updatedAt, now) : 'Sơ đồ mới'}
        action={<PinButton pinned={note?.pinned ?? false} disabled={!note} onClick={togglePin} size="icon" />}
      />
      <main aria-label="Sơ đồ đang mở" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 pt-4 pb-3">
          <input
            type="text"
            aria-label="Tên sơ đồ"
            placeholder="Tên sơ đồ"
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              later()
            }}
            onBlur={() => flush.current()}
            className="min-w-0 flex-[1_1_160px] bg-transparent p-0 text-xl leading-7 font-bold tracking-[-0.018em] text-ellipsis text-foreground outline-none placeholder:text-subtle-foreground xl:text-2xl xl:leading-8"
          />
          {/* One group: on a narrow column it goes to a line of its own as a whole, never Ghim and Xóa alone. */}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Button type="button" variant="primary" size="sm" aria-label="Thêm khối" onClick={addInMiddle}>
              <Plus strokeWidth={1.6} />
              Khối
            </Button>
            <ZoomControls />
            <div className="flex shrink-0 items-center gap-0.5 max-md:hidden">
              <PinButton pinned={note?.pinned ?? false} disabled={!note} onClick={togglePin} size="icon-sm" />
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
        </div>
        <DiagramCanvas diagram={diagram} editing={editing} onEditing={setEditing} onChange={change} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-5 py-2.5 max-md:hidden">
          <Spec>{note ? editedLine(note.updatedAt, now) : 'Sơ đồ mới · lưu khi có thay đổi'}</Spec>
          <Spec>{diagramFootLine(diagram)}</Spec>
        </div>
      </main>
      {/* D-212: on a phone the saved time sits in the header; the foot holds the size and Xóa, as for a text note. */}
      <div role="group" aria-label="Sơ đồ này" className="flex items-center justify-between gap-3 border-t px-5 pt-2.5 pb-7 md:hidden">
        <Spec>{diagramSummary(diagram)}</Spec>
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

/** −, how far, +, and "Vừa màn hình" (D-207); scrolling and pinching zoom too. */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  return (
    <div role="group" aria-label="Thu phóng" className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border bg-surface p-0.5 max-md:hidden">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Thu nhỏ" onClick={() => void zoomOut({ duration: 150 })}>
        <Minus strokeWidth={1.6} />
      </Button>
      <output className="min-w-11.5 text-center font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</output>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Phóng to" onClick={() => void zoomIn({ duration: 150 })}>
        <Plus strokeWidth={1.6} />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Vừa màn hình" onClick={() => void fitView({ ...FIT_VIEW, duration: 200 })}>
        <Maximize strokeWidth={1.6} />
      </Button>
    </div>
  )
}
