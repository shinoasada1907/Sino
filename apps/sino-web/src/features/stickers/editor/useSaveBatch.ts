import { useState } from 'react'
import { ApiError } from '@/shared/api/problem'
import { isPackName, PACK_NAME_RULE, packErrorMessage, PICTURE_UNREADABLE, uploadErrorMessage } from '../format'
import type { StickerPack } from '../stickers.types'
import { useCreatePack } from '../usePacks'
import { useUploadSticker } from '../useStickers'
import { fileToSend } from './fileToSend'
import { NO_PACK, type Batch, type PackChoice } from './useBatch'

/** What a whole save did, for the screen to say once the step has closed and to start the next batch on the same pack. */
export interface SavedBatch {
  count: number
  pack: StickerPack | null
}

/** Where a save stands, for the line of the step that a screen reader hears. */
type Progress = { kind: 'saving'; at: number; of: number } | { kind: 'partly'; saved: number; failed: number } | null

const packGone = (error: unknown) => error instanceof ApiError && error.code === 'STICKER_PACK_NOT_FOUND'

/**
 * "Lưu N sticker" (SP-10, D-347, spec sticker-upload-editor). A new pack ("Bộ mới…") is made first; when that fails (the
 * name is taken, too many packs) no picture is sent, the picker says why, and the batch stays as it is (the hint of the
 * task). Then the pictures go one at a time, in the order of the list, each with its frame, its name and the pack: a saved
 * one leaves the batch and is in the grid at once (the cache), a failed one stays with the reason in Vietnamese, to be
 * framed again or sent with the next "Lưu". A pack deleted meanwhile stops the save: the rest is not sent into nothing.
 * When every picture is saved the step closes, and `onSaved` tells the screen.
 */
export function useSaveBatch(batch: Batch, packs: StickerPack[], onSaved: (saved: SavedBatch) => void) {
  const createPack = useCreatePack()
  const upload = useUploadSticker()
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [packError, setPackError] = useState<string | null>(null)

  /** Saves the batch into `choice`, the pack the picker shows (a pack deleted meanwhile shows as none). */
  async function save(choice: PackChoice) {
    const chosen = batch.items
    setPackError(null)
    setProgress(null)
    let pack: StickerPack | null = null
    if (choice.kind === 'new') {
      if (!isPackName(choice.name)) {
        setPackError(PACK_NAME_RULE)
        return
      }
      setSaving(true)
      try {
        pack = await createPack.mutateAsync(choice.name)
      } catch (error) {
        setPackError(packErrorMessage(error, choice.name))
        setSaving(false)
        return
      }
      // Made: a second "Lưu" (after a picture failed) must not make it again.
      batch.setPack({ kind: 'existing', id: pack.id })
    } else if (choice.kind === 'existing') {
      pack = packs.find((item) => item.id === choice.id) ?? null
    }
    const packId = choice.kind === 'existing' ? choice.id : (pack?.id ?? null)

    setSaving(true)
    chosen.forEach((item) => batch.setStatus(item.id, 'waiting'))
    let saved = 0
    for (const [at, item] of chosen.entries()) {
      batch.setStatus(item.id, 'sending')
      setProgress({ kind: 'saving', at: at + 1, of: chosen.length })
      let file: File
      try {
        file = await fileToSend(item)
      } catch {
        batch.fail(item.id, PICTURE_UNREADABLE)
        continue
      }
      try {
        await upload.mutateAsync({ file, name: item.name, packId })
        batch.take([item.id])
        saved += 1
      } catch (error) {
        if (packGone(error)) {
          // The cache has forgotten the pack already (useUploadSticker); what was not sent waits for another pack.
          chosen.slice(at).forEach((rest) => batch.setStatus(rest.id, 'idle'))
          batch.setPack(NO_PACK)
          setPackError(packErrorMessage(error, ''))
          setProgress(saved > 0 ? { kind: 'partly', saved, failed: chosen.length - saved } : null)
          setSaving(false)
          return
        }
        batch.fail(item.id, uploadErrorMessage(error))
      }
    }
    setSaving(false)
    if (saved === chosen.length) {
      onSaved({ count: saved, pack })
      reset()
      batch.close()
    } else {
      setProgress({ kind: 'partly', saved, failed: chosen.length - saved })
    }
  }

  const said =
    progress === null
      ? null
      : progress.kind === 'saving'
        ? `Đang lưu ảnh ${progress.at} trên ${progress.of}…`
        : progress.saved > 0
          ? `Đã lưu ${progress.saved} sticker. ${progress.failed} ảnh chưa lưu được.`
          : 'Chưa lưu được ảnh nào.'

  /** What a save said is about one batch: the step clears it when it closes, since it stays mounted for the next one. */
  const reset = () => {
    setProgress(null)
    setPackError(null)
  }

  return { save, saving, progress: said, packError, clearPackError: () => setPackError(null), reset }
}
