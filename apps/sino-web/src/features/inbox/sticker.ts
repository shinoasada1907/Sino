/**
 * Keeps an address for a sticker picture when it is safe to load in the browser: https only, no user info, no scripts.
 * Refuses anything else (ZL-14, D-279).
 */
export function pictureOf(address: string | null | undefined): string | null {
  if (!address) {
    return null
  }
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) {
      return null
    }
    return address
  } catch {
    return null
  }
}
