/**
 * Helpers for clipboard operations with files and images (copy and paste).
 */

/**
 * Extracts all files from a DataTransfer object (clipboard or drag-drop),
 * checking both `clipboardData.files` and `clipboardData.items`.
 */
export function extractClipboardFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []

  const files: File[] = []

  // 1. Direct files list (populated by modern browsers on file paste or drop)
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i]
      if (file) {
        files.push(file)
      }
    }
    return files
  }

  // 2. DataTransfer items fallback (e.g. pasted screenshots or copied browser images)
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }
  }

  return files
}

/**
 * Copies an image from a URL or blob to the user's system clipboard as a PNG image.
 * Falls back to copying image URL if clipboard.write() is unsupported or blocked.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
  if (!imageUrl) return false

  try {
    // If it's a blob URL or same-origin / CORS-friendly URL
    const response = await fetch(imageUrl, { mode: 'cors' })
    const blob = await response.blob()

    // Clipboard API strictly accepts 'image/png' in most browsers
    let pngBlob = blob
    if (blob.type !== 'image/png') {
      pngBlob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || 300
          canvas.height = img.naturalHeight || 300
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0)
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas to Blob failed'))), 'image/png')
        }
        img.onerror = () => reject(new Error('Failed to load image for PNG conversion'))
        img.src = imageUrl
      })
    }

    if (navigator?.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob }),
      ])
      return true
    }
  } catch (err) {
    console.warn('Could not copy image binary to clipboard, falling back to URL copy', err)
  }

  // Fallback: Copy URL text
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(imageUrl)
      return true
    }
  } catch (err) {
    console.error('Failed to copy to clipboard', err)
  }

  return false
}

/**
 * Copies a file link or file name to clipboard.
 */
export async function copyFileLinkToClipboard(urlOrText: string): Promise<boolean> {
  if (!urlOrText) return false
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(urlOrText)
      return true
    }
  } catch (err) {
    console.error('Failed to copy file link to clipboard', err)
  }
  return false
}
