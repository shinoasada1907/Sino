// A Zalo photo in a chat (ZL-16): the picture in the slot of the canvas `.photo` (rounded 14px, a 1px border, 280 px wide
// at most, 220 px on a phone), keeping the shape the photo has, and a click opens it whole in a new tab. The other tab
// is given neither this page (`noopener`) nor its address (`noreferrer`), like the picture itself (`no-referrer`).
export function PhotoPicture({ src, onError }: { src: string; onError: () => void }) {
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-[14px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid">
      <img
        src={src}
        alt="Ảnh"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={onError}
        className="block h-auto max-h-80 min-h-20 w-auto max-w-55 min-w-20 rounded-[14px] border bg-surface object-cover md:max-w-70"
      />
    </a>
  )
}
