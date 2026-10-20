import { useEffect, useRef, useState } from 'react'
import { batchRefusal } from '../format'
import { inspectPicture, type PictureKind } from './editable'

/** One picture of the batch. `id` is its own for the whole step, so what is done to it never moves to another one. */
export interface BatchItem {
  id: number
  file: File
  /** The name of the sticker: the file name without its extension, until the owner types another (SP-09). */
  name: string
  kind: PictureKind
  /** The address of the file for an `<img>`, made when the picture came in and let go when it leaves. */
  previewUrl: string
  /** Why it could not be sent the last time, if it could not. */
  problem?: string
}

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
  // The pictures and the one selected change together (a picture taken out may hand on the selection), so one state.
  const [{ items, selectedId }, setBatch] = useState<{ items: BatchItem[]; selectedId: number | null }>({ items: [], selectedId: null })
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

  /** Takes the files of one choice; what cannot be used is said, and the refusals of the last choice go. */
  async function add(files: File[]) {
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
      made.push({ id, file, name: stemOf(file.name), kind, previewUrl })
    })
    setRefusals(refused)
    if (made.length > 0) {
      setBatch((batch) => ({ items: [...batch.items, ...made], selectedId: batch.selectedId ?? made[0].id }))
      setOpen(true)
    }
  }

  /** Takes pictures out of the batch; a selected one gives the selection to the next, else to the one before. */
  function take(ids: number[]) {
    const gone = new Set(ids)
    letGo(gone)
    setBatch(({ items: list, selectedId: current }) => {
      const kept = list.filter((item) => !gone.has(item.id))
      if (current === null || !gone.has(current)) {
        return { items: kept, selectedId: current }
      }
      const at = list.findIndex((item) => item.id === current)
      const after = list.slice(at + 1).find((item) => !gone.has(item.id))
      const before = list.slice(0, at).reverse().find((item) => !gone.has(item.id))
      return { items: kept, selectedId: (after ?? before)?.id ?? null }
    })
  }

  function close() {
    letGo([...previews.current.keys()])
    setBatch({ items: [], selectedId: null })
    setRefusals([])
    setOpen(false)
  }

  return {
    open,
    items,
    refusals,
    selectedId,
    selected: items.find((item) => item.id === selectedId),
    add,
    select: (id: number) => setBatch((batch) => ({ ...batch, selectedId: id })),
    remove: (id: number) => take([id]),
    take,
    setProblem: (id: number, problem: string) =>
      setBatch((batch) => ({ ...batch, items: batch.items.map((item) => (item.id === id ? { ...item, problem } : item)) })),
    dismissRefusals: () => setRefusals([]),
    close,
  }
}
