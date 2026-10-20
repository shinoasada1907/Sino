import { useEffect, useRef, useState } from 'react'
import { checkStickerFile, isRetryableUpload, uploadErrorMessage } from './format'
import { useUploadSticker } from './useStickers'

export type UploadState = 'waiting' | 'uploading' | 'done' | 'failed'

/** One chosen file and where it stands; `message` says why a failed one failed. */
export interface UploadEntry {
  id: number
  name: string
  state: UploadState
  message?: string
  /** A failed upload that may work the second time (no network, a server that failed): the screen offers "Thử lại". */
  retryable?: boolean
}

const isActive = (entry: UploadEntry) => entry.state === 'waiting' || entry.state === 'uploading'

/** A file and the name the owner gave its sticker in the "Thêm sticker" step (SP-09); a bare file is named by the server. */
export interface NamedFile {
  file: File
  name?: string
}

/**
 * The files the owner chose, sent one after the other. One at a time because it is light for the server and lets the
 * screen say which file failed and why; a file the web refuses never leaves (`checkStickerFile`), and one that fails
 * leaves the others alone. The finished ones stay in `entries` until the next choice or `dismiss`.
 */
export function useUploadQueue() {
  const upload = useUploadSticker()
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const pending = useRef<({ id: number } & NamedFile)[]>([])
  const running = useRef(false)
  const nextId = useRef(0)
  // The files by entry, for `retry`; a file is kept only while its entry is.
  const kept = useRef(new Map<number, NamedFile>())
  useEffect(() => {
    for (const id of kept.current.keys()) {
      if (!entries.some((entry) => entry.id === id)) {
        kept.current.delete(id)
      }
    }
  }, [entries])

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
          await upload.mutateAsync({ file: item.file, name: item.name })
          update(item.id, { state: 'done' })
        } catch (error) {
          update(item.id, { state: 'failed', message: uploadErrorMessage(error), retryable: isRetryableUpload(error) })
        }
      }
    } finally {
      running.current = false
    }
  }

  /** Takes the files of one choice: the web refuses what it can at once, the rest wait for their turn. */
  function add(files: (File | NamedFile)[]) {
    const made: UploadEntry[] = []
    for (const chosen of files) {
      const named = chosen instanceof File ? { file: chosen } : chosen
      const { file } = named
      const id = nextId.current++
      const check = checkStickerFile(file)
      if (check.ok) {
        kept.current.set(id, named)
        pending.current.push({ id, ...named })
        made.push({ id, name: file.name, state: 'waiting' })
      } else {
        made.push({ id, name: file.name, state: 'failed', message: check.reason })
      }
    }
    // A new choice starts afresh: what the last one finished with goes, what is still going stays.
    setEntries((list) => [...list.filter(isActive), ...made])
    void drain()
  }

  /** Puts a failed file back in the queue, at the end. */
  function retry(id: number) {
    const named = kept.current.get(id)
    if (!named) {
      return
    }
    update(id, { state: 'waiting', message: undefined, retryable: undefined })
    pending.current.push({ id, ...named })
    void drain()
  }

  const dismiss = () => setEntries((list) => list.filter(isActive))

  return { entries, add, retry, dismiss, active: entries.some(isActive) }
}
