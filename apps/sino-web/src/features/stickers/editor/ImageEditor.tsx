import { useState } from 'react'
import Cropper from 'react-easy-crop'
import { FrameControls, NameField } from './EditorControls'
import { frameAspect, MAX_ZOOM, MIN_ZOOM, type PictureEdit } from './pictureEdit'
import type { BatchItem } from './useBatch'

/** How far an arrow key moves the picture under the frame, in pixels of the screen; Shift moves a fifth of it. */
const KEYBOARD_STEP = 10

/**
 * The picture selected in the "Thêm sticker" step (SP-09, spec sticker-upload-editor). A still one sits under a frame of
 * react-easy-crop: drag it, pinch or scroll to zoom, or give the frame the focus and move the picture with the arrow keys;
 * the frame says each new area (`croppedAreaPixels`, in pixels of the turned picture) and that is what is saved. A moving
 * one is shown as it plays, with no frame, since it is saved whole. The step mounts one editor per picture (`key`), and
 * everything it shows comes from the picture's own edit, so going to another picture and back finds it as it was left.
 */
export function ImageEditor({
  item,
  onEdit,
  onRename,
}: {
  item: BatchItem
  onEdit: (change: Partial<PictureEdit>) => void
  onRename: (name: string) => void
}) {
  // The size of the picture as the browser shows it (upright by its EXIF orientation), for the shape of the frame.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const still = item.kind.editing === 'crop'

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative aspect-square max-h-[min(28rem,50svh)] w-full overflow-hidden rounded-lg border bg-raised">
        {still ? (
          <Cropper
            image={item.previewUrl}
            crop={item.edit.crop}
            zoom={item.edit.zoom}
            rotation={item.edit.rotation}
            aspect={frameAspect(item.edit, size.width, size.height)}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            keyboardStep={KEYBOARD_STEP}
            onCropChange={(crop) => onEdit({ crop })}
            onZoomChange={(zoom) => onEdit({ zoom })}
            onCropComplete={(_area, area) => onEdit({ area })}
            onMediaLoaded={(media) => setSize({ width: media.naturalWidth, height: media.naturalHeight })}
            mediaProps={{ alt: `Xem trước ${item.file.name}` }}
            cropperProps={{ role: 'group', 'aria-label': 'Vùng cắt: kéo ảnh, hoặc dùng phím mũi tên để dời ảnh' }}
          />
        ) : (
          <div className="grid size-full place-items-center">
            <img src={item.previewUrl} alt={`Xem trước ${item.file.name}`} className="max-h-full max-w-full object-contain" />
          </div>
        )}
      </div>
      {still ? (
        <>
          <FrameControls edit={item.edit} onEdit={onEdit} />
          <p className="text-sm text-muted-foreground">Phần trong khung được lưu thành PNG, cạnh tối đa 512 điểm ảnh.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Ảnh động được lưu nguyên: không cắt, không xoay.</p>
      )}
      <NameField value={item.name} onChange={onRename} />
      {item.problem && (
        <p role="alert" className="text-sm text-danger-ink">
          {item.problem}
        </p>
      )}
    </div>
  )
}
