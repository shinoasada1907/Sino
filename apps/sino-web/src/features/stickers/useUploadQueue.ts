import { useRef, useState } from 'react'
import { checkStickerFile, uploadErrorMessage } from './format'
import { useUploadSticker } from './useStickers'

export type UploadState = 'waiting' | 'uploading' | 'done' | 'failed'

/** One chosen file and where it stands; `message` says why a failed one failed. */
export interface UploadEntry {
  id: number
  name: string
  state: UploadState
  message?: string
}

const isActive = (entry: UploadEntry) => entry.state === 'waiting' || entry.state === 'uploading'

/**
 * The files the owner chose, sent one after the other. One at a time because it is light for the server and lets the
 * screen say which file failed and why; a file the web refuses never leaves (`checkStickerFile`), and one that fails
 * leaves the others alone. The finished ones stay in `entries` until the next choice or `dismiss`.
 */
export function useUploadQueue() {
  const upload = useUploadSticker()
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const pending = useRef<{ id: number; file: File }[]>([])
  const running = useRef(false)
  const nextId = useRef(0)

  const update = (id: number, change: Partial<UploadEntry>) =>
    setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))

  async function drain() {
    if (running.current) {
      return
    }
    running.current = true
    try {
      for (let item = pending.current.shift(); item; item = pending.current.shift()) {
        update(item.id, { state: 'uploading' })
        try {
          await upload.mutateAsync({ file: item.file })
          update(item.id, { state: 'done' })
        } catch (error) {
          update(item.id, { state: 'failed', message: uploadErrorMessage(error) })
        }
      }
    } finally {
      running.current = false
    }
  }

  /** Takes the files of one choice: the web refuses what it can at once, the rest wait for their turn. */
  function add(files: File[]) {
    const made: UploadEntry[] = []
    for (const file of files) {
      const id = nextId.current++
      const check = checkStickerFile(file)
      if (check.ok) {
        pending.current.push({ id, file })
        made.push({ id, name: file.name, state: 'waiting' })
      } else {
        made.push({ id, name: file.name, state: 'failed', message: check.reason })
      }
    }
    // A new choice starts afresh: what the last one finished with goes, what is still going stays.
    setEntries((list) => [...list.filter(isActive), ...made])
    void drain()
  }

  const dismiss = () => setEntries((list) => list.filter(isActive))

  return { entries, add, dismiss, active: entries.some(isActive) }
}
