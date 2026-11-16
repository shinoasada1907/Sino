import { useEffect, useRef, useState } from 'react'
import { batchRefusal } from '../format'
import { inspectPicture, type PictureKind } from './editable'
import { DEFAULT_EDIT, type PictureEdit } from './pictureEdit'

/** One picture of the batch. `id` is its own for the whole step, so what is done to it never moves to another one. */
export interface BatchItem {
  id: number
  file: File
  /** The name of the sticker: the file name without its extension, until the owner types another (SP-09). */
  name: string
  kind: PictureKind
  /** What the owner did to it in the editor (SP-09); a moving picture keeps the default, which it never uses. */
  edit: PictureEdit
  /** The address of the file for an `<img>`, made when the picture came in and let go when it leaves. */
  previewUrl: string
  /** Where it stands in a save (SP-10): not asked yet, waiting for its turn, being sent, or failed (`problem` says why). */
  status: 'idle' | 'waiting' | 'sending' | 'failed'
  /** Why it could not be sent the last time, if it could not. */
  problem?: string
}

/** The pack the batch goes into (SP-10): one of the owner's, none ("Chưa xếp bộ"), or a new one made before the first picture. */
export type PackChoice = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string }

export const NO_PACK: PackChoice = { kind: 'none' }

/** A file of the last choice that did not go in, and why. */
export interface Refusal {
  key: number
  fileName: string
  reason: string
}

export type Batch = ReturnType<typeof useBatch>

// "meo.vui.png" → "meo.vui"; a name of nothing but its extension keeps it.
const stemOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * The pictures of one "Thêm sticker" step (SP-08, spec sticker-upload-editor). A choice goes in after what is there, each
 * file looked at by its first bytes (`inspectPicture`) and refused at once when it cannot be used (`batchRefusal`); the
 * step opens when a picture goes in. Each picture has a preview address (`URL.createObjectURL`), which holds the file in
 * memory until it is revoked: so it is revoked when the picture leaves the batch, when the step closes, and when the
 * screen goes away with the step still open.
 */
export function useBatch() {
  const [open, setOpen] = useState(false)
  // The pictures, the one selected and the pack change together (a picture taken out may hand on the selection, the first
  // choice of a closed step sets the pack), so one state.
  const [{ items, selectedId, pack }, setBatch] = useState<{ items: BatchItem[]; selectedId: number | null; pack: PackChoice }>({
    items: [],
    selectedId: null,
    pack: NO_PACK,
  })
  const [refusals, setRefusals] = useState<Refusal[]>([])
  const nextId = useRef(0)
  // The preview addresses not revoked yet, by picture; read when the screen goes away, after the last render.
  const previews = useRef(new Map<number, string>())

  useEffect(() => {
    const live = previews.current
    return () => {
      for (const url of live.values()) {
        URL.revokeObjectURL(url)
      }
      live.clear()
    }
  }, [])

  const letGo = (ids: Iterable<number>) => {
    for (const id of ids) {
      const url = previews.current.get(id)
      if (url) {
        URL.revokeObjectURL(url)
        previews.current.delete(id)
      }
    }
  }

  /**
   * Takes the files of one choice; what cannot be used is said, and the refusals of the last choice go. The choice that
   * opens the step sets the pack of the batch (`pack`, D-348); a later one keeps the pack the owner has chosen since.
   */
  async function add(files: File[], { pack: opening = NO_PACK }: { pack?: PackChoice } = {}) {
    const kinds = await Promise.all(files.map((file) => inspectPicture(file).catch(() => null)))
    const made: BatchItem[] = []
    const refused: Refusal[] = []
    files.forEach((file, at) => {
      const kind = kinds[at]
      const id = nextId.current++
      const reason = batchRefusal(file, kind)
      if (reason !== null || kind === null) {
        refused.push({ key: id, fileName: file.name, reason: reason ?? '' })
        return
      }
      const previewUrl = URL.createObjectURL(file)
      previews.current.set(id, previewUrl)
      made.push({ id, file, name: stemOf(file.name), kind, edit: DEFAULT_EDIT, previewUrl, status: 'idle' })
    })
    setRefusals(refused)
    if (made.length > 0) {
      setBatch((batch) => ({
        items: [...batch.items, ...made],
        selectedId: batch.selectedId ?? made[0].id,
        pack: batch.items.length === 0 ? opening : batch.pack,
      }))
      setOpen(true)
    }
  }

  /** Takes pictures out of the batch; a selected one gives the selection to the next, else to the one before. */
  function take(ids: number[]) {
    const gone = new Set(ids)
    letGo(gone)
    setBatch(({ items: list, selectedId: current, pack: chosen }) => {
      const kept = list.filter((item) => !gone.has(item.id))
      if (current === null || !gone.has(current)) {
        return { items: kept, selectedId: current, pack: chosen }
      }
      const at = list.findIndex((item) => item.id === current)
      const after = list.slice(at + 1).find((item) => !gone.has(item.id))
      const before = list.slice(0, at).reverse().find((item) => !gone.has(item.id))
      return { items: kept, selectedId: (after ?? before)?.id ?? null, pack: chosen }
    })
  }

  function close() {
    letGo([...previews.current.keys()])
    setBatch({ items: [], selectedId: null, pack: NO_PACK })
    setRefusals([])
    setOpen(false)
  }

  const change = (id: number, update: (item: BatchItem) => BatchItem) =>
    setBatch((batch) => ({ ...batch, items: batch.items.map((item) => (item.id === id ? update(item) : item)) }))

  return {
    open,
    items,
    refusals,
    selectedId,
    selected: items.find((item) => item.id === selectedId),
    pack,
    setPack: (choice: PackChoice) => setBatch((batch) => ({ ...batch, pack: choice })),
    add,
    select: (id: number) => setBatch((batch) => ({ ...batch, selectedId: id })),
    remove: (id: number) => take([id]),
    take,
    /** Puts a picture where it stands in a save; anything but a failure forgets why the last one failed. */
    setStatus: (id: number, status: 'idle' | 'waiting' | 'sending') => change(id, (item) => ({ ...item, status, problem: undefined })),
    fail: (id: number, problem: string) => change(id, (item) => ({ ...item, status: 'failed', problem })),
    /** Changes what was done to a picture; by its id, never by where it is in the list (the hint of SP-09). */
    edit: (id: number, edit: Partial<PictureEdit>) => change(id, (item) => ({ ...item, edit: { ...item.edit, ...edit } })),
    rename: (id: number, name: string) => change(id, (item) => ({ ...item, name })),
    dismissRefusals: () => setRefusals([]),
    close,
  }
}
