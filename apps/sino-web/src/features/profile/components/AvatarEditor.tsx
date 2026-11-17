import { RotateCw } from 'lucide-react'
import { useId } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { INITIAL_EDIT, MAX_ZOOM, MIN_ZOOM, turnedQuarter, type AvatarEdit } from '../avatarImage'

/** How far an arrow key moves the picture under the frame, in pixels of the screen; Shift moves a fifth of it. */
const KEYBOARD_STEP = 10

/**
 * The frame of the picture being chosen: a round window of react-easy-crop on the picture (drag, wheel, pinch, arrow keys on
 * the frame), a zoom slider, a quarter turn and a reset. The round window is the avatar as it will show; the file sent is the
 * square around it, in `area`. Same shape of control as the sticker editor, without a choice of frame shape.
 */
export function AvatarEditor({ imageUrl, edit, onEdit }: { imageUrl: string; edit: AvatarEdit; onEdit: (change: Partial<AvatarEdit>) => void }) {
  const zoom = useId()
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-80 overflow-hidden rounded-lg border bg-raised">
        <Cropper
          image={imageUrl}
          crop={edit.crop}
          zoom={edit.zoom}
          rotation={edit.rotation}
          aspect={1}
          cropShape="round"
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          keyboardStep={KEYBOARD_STEP}
          onCropChange={(crop) => onEdit({ crop })}
          onZoomChange={(value) => onEdit({ zoom: value })}
          onCropComplete={(_area, area) => onEdit({ area })}
          mediaProps={{ alt: 'Xem trước ảnh đại diện' }}
          cropperProps={{ role: 'group', 'aria-label': 'Vùng cắt: kéo ảnh, hoặc dùng phím mũi tên để dời ảnh' }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor={zoom} className="shrink-0">
          Phóng to
        </Label>
        <input
          id={zoom}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={edit.zoom}
          aria-valuetext={`${String(Math.round(edit.zoom * 10) / 10).replace('.', ',')} lần`}
          onChange={(event) => onEdit({ zoom: Number(event.target.value) })}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-foreground"
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* A turn moves the picture under the frame back to the middle, where it is sure to fill the frame. */}
        <Button type="button" variant="secondary" size="sm" onClick={() => onEdit({ rotation: turnedQuarter(edit.rotation), crop: { x: 0, y: 0 }, area: null })} className="max-md:h-11">
          <RotateCw strokeWidth={1.6} />
          Xoay 90°
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(INITIAL_EDIT)} className="max-md:h-11">
          Đặt lại
        </Button>
      </div>
    </div>
  )
}
