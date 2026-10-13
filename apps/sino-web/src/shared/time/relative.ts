const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How long ago `from` was, in Vietnamese ("2 phút trước"). A time in the future counts as "vừa xong". */
export function formatAgo(from: Date, now: Date): string {
  const elapsed = now.getTime() - from.getTime()
  if (elapsed < MINUTE) {
    return 'vừa xong'
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} phút trước`
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} giờ trước`
  }
  return `${Math.floor(elapsed / DAY)} ngày trước`
}
