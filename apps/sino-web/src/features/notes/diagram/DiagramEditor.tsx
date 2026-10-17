import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { Plus, Trash2 } from 'lucide-react'
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
import { addBlock, diagramFootLine, freeSpot, newBlock, newDiagram } from './diagram'
import { DiagramCanvas } from './DiagramCanvas'

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
  const [fresh, setFresh] = useState<string>()
  const { mutate: save } = useSaveNote()
  const { mutateAsync: create } = useCreateNote()
  const navigate = useNavigate()
  const { screenToFlowPosition } = useReactFlow()
  const canvas = useRef<HTMLDivElement>(null)
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
    const box = canvas.current?.getBoundingClientRect()
    const middle = screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 })
    const spot = freeSpot(diagram, middle.x, middle.y)
    const block = newBlock(spot.x, spot.y)
    setFresh(block.id)
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
            className="min-w-0 flex-[1_1_240px] bg-transparent p-0 text-xl leading-7 font-bold tracking-[-0.018em] text-foreground outline-none placeholder:text-subtle-foreground md:text-2xl md:leading-8"
          />
          <Button type="button" variant="primary" size="sm" aria-label="Thêm khối" onClick={addInMiddle}>
            <Plus strokeWidth={1.6} />
            Khối
          </Button>
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
        <DiagramCanvas ref={canvas} diagram={diagram} fresh={fresh} onChange={change} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-5 py-2.5">
          <Spec>{note ? editedLine(note.updatedAt, now) : 'Sơ đồ mới · lưu khi có thay đổi'}</Spec>
          <Spec>{diagramFootLine(diagram)}</Spec>
        </div>
      </main>
    </>
  )
}
