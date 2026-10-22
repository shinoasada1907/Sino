import { useEffect, useRef, useState } from 'react'
import { isPicture, refusalOf } from './outgoingFiles'

/** At most this many pictures and files go in one send (D-376). */
export const TRAY_LIMIT = 10

export interface TrayItem {
  id: string
  file: File
  /** The address of a picture's preview, made when it came in and let go when it leaves; null for a file. */
  preview: string | null
}

export type AttachmentTray = ReturnType<typeof useAttachmentTray>

/**
 * The pictures and files waiting in the reply box of a chat (zalo-send-files, D-376): pasted, chosen with the paperclip
 * or dropped on the chat. A file too large, empty, or past the tenth is not taken; `refusals` says which and why until
 * the next files come. Previews are let go when an item leaves the tray, when the tray is emptied and when it goes.
 */
export function useAttachmentTray() {
  const [items, setItems] = useState<TrayItem[]>([])
  const [refusals, setRefusals] = useState<string[]>([])
  const live = useRef(new Set<string>())

  useEffect(() => {
    const urls = live.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const letGo = (gone: TrayItem[]) =>
    gone.forEach(({ preview }) => {
      if (preview) {
        URL.revokeObjectURL(preview)
        live.current.delete(preview)
      }
    })

  return {
    items,
    refusals,
    add(files: File[]) {
      const taken: TrayItem[] = []
      const refused: string[] = []
      for (const file of files) {
        const refusal = refusalOf(file) ?? (items.length + taken.length >= TRAY_LIMIT ? `Mỗi lượt gửi tối đa ${TRAY_LIMIT} tệp.` : null)
        if (refusal) {
          refused.push(`${file.name}: ${refusal}`)
          continue
        }
        const preview = isPicture(file) ? URL.createObjectURL(file) : null
        if (preview) {
          live.current.add(preview)
        }
        taken.push({ id: crypto.randomUUID(), file, preview })
      }
      setItems((current) => [...current, ...taken])
      setRefusals(refused)
    },
    remove(id: string) {
      letGo(items.filter((item) => item.id === id))
      setItems((current) => current.filter((item) => item.id !== id))
    },
    /** Empties the tray once its files are on their way; the messages make their own previews. */
    clear() {
      letGo(items)
      setItems([])
      setRefusals([])
    },
  }
}
