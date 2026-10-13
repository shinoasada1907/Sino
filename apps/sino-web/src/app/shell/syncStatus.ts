import { formatAgo } from '@/shared/time/relative'
import type { StatusTone } from '@/shared/ui/status'
import type { ShellData } from './shell.types'

/** The sync line of the top bar: `text` on desktop, `short` next to the page title on tablet. */
export function syncStatus(sync: ShellData['sync'], now: Date): { tone: StatusTone; text: string; short: string } {
  if (sync.state === 'SYNCING') {
    const text = `Đang đồng bộ lần đầu · ${sync.progress ?? 0}%`
    return { tone: 'warn', text, short: text }
  }
  if (sync.state === 'IDLE' || sync.lastSyncedAt === null) {
    return { tone: 'off', text: 'Chưa có nguồn nào', short: 'Chưa có nguồn nào' }
  }
  const ago = formatAgo(new Date(sync.lastSyncedAt), now)
  return { tone: 'ok', text: `Đồng bộ ${ago}`, short: ago }
}
