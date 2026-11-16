import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { ApiError, NETWORK_ERROR } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { UserAvatar } from '@/shared/ui/user-avatar'
import { canDecode, INITIAL_EDIT, looksLikeImage, makeAvatar, type AvatarEdit } from '../avatarImage'
import { AvatarEditor } from './AvatarEditor'

const NOT_AN_IMAGE = 'Tệp này không phải ảnh. Chọn tệp PNG, JPEG hoặc WebP.'
const UNREADABLE = 'Không đọc được ảnh này. Thử ảnh khác.'

/** What a failed `PUT` or `DELETE` says in the box; the old picture stays (D-481: 400 file, 413 AVATAR_TOO_LARGE). */
function messageOf(error: unknown, saving: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return 'Ảnh quá lớn (tối đa 1 MB). Chọn ảnh khác.'
    }
    if (error.status === 400) {
      return 'Máy chủ không nhận ảnh này. Chọn ảnh PNG, JPEG hoặc WebP khác.'
    }
    if (error.code === NETWORK_ERROR) {
      return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
    }
  }
  return saving ? 'Không lưu được ảnh. Thử lại.' : 'Không xóa được ảnh. Thử lại.'
}

interface Picked {
  file: File
  previewUrl: string
}

/** The box of "Thay đổi ảnh đại diện" (profile-info PI-05): choose a file, frame it (drag, zoom, turn), save; or remove the picture. */
export function AvatarDialog({
  open,
  onOpenChange,
  displayName,
  avatarUrl,
  onSave,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName: string
  avatarUrl: string | null
  onSave: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        {/* Mounted only while open, so a closed box forgets its file and its error. */}
        <AvatarForm displayName={displayName} avatarUrl={avatarUrl} onSave={onSave} onRemove={onRemove} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AvatarForm({
  displayName,
  avatarUrl,
  onSave,
  onRemove,
  onDone,
}: {
  displayName: string
  avatarUrl: string | null
  onSave: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
  onDone: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [edit, setEdit] = useState<AvatarEdit>(INITIAL_EDIT)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'reading' | 'saving' | 'removing' | null>(null)

  // The preview address is let go when the picture is replaced or the box closes.
  const previewUrl = picked?.previewUrl
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    if (!looksLikeImage(file)) {
      setError(NOT_AN_IMAGE)
      return
    }
    setBusy('reading')
    try {
      if (await canDecode(file)) {
        setEdit(INITIAL_EDIT)
        setPicked({ file, previewUrl: URL.createObjectURL(file) })
      } else {
        setError(UNREADABLE)
      }
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!picked) {
      return
    }
    setError(null)
    setBusy('saving')
    // What the frame shows is cut from the original here; a frame never touched keeps the centre square.
    let avatar: File
    try {
      avatar = await makeAvatar(picked.file, { area: edit.area ?? undefined, rotation: edit.rotation })
    } catch {
      setError(UNREADABLE)
      setBusy(null)
      return
    }
    try {
      await onSave(avatar)
      onDone()
    } catch (failure) {
      setError(messageOf(failure, true))
      setBusy(null)
    }
  }

  async function remove() {
    setError(null)
    setBusy('removing')
    try {
      await onRemove()
      onDone()
    } catch (failure) {
      setError(messageOf(failure, false))
      setBusy(null)
    }
  }

  const working = busy !== null

  return (
    <>
      <DialogHeader>
        <DialogTitle>Đổi ảnh đại diện</DialogTitle>
        <DialogDescription>Kéo ảnh, phóng to hoặc xoay để chọn phần hiển thị. Ảnh được thu về 256 × 256.</DialogDescription>
      </DialogHeader>
      <DialogBody className="items-center gap-4">
        {picked ? (
          <AvatarEditor imageUrl={picked.previewUrl} edit={edit} onEdit={(change) => setEdit((current) => ({ ...current, ...change }))} />
        ) : (
          <UserAvatar name={displayName} src={avatarUrl} className="size-32 border-2 border-border shadow-md" />
        )}
        <input ref={input} type="file" accept="image/*" aria-label="Tệp ảnh" className="hidden" onChange={(event) => void choose(event)} />
        <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={working}>
          {busy === 'reading' && <Loader2 className="animate-spin" />}
          {picked ? 'Chọn ảnh khác' : 'Chọn ảnh'}
        </Button>
        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        {avatarUrl ? (
          <Button type="button" variant="danger" onClick={() => void remove()} disabled={working}>
            {busy === 'removing' && <Loader2 className="animate-spin" />}
            Xóa ảnh
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={() => void save()} disabled={!picked || working}>
          {busy === 'saving' && <Loader2 className="animate-spin" />}
          Lưu ảnh
        </Button>
      </DialogFooter>
    </>
  )
}
