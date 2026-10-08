import type { AccountExtras, AccountsData } from './accounts.types'

// The moment the canvas shows: Friday 02/10/2026, 14:05 in Vietnam.
const CANVAS_NOW = Date.parse('2026-10-02T14:05:00+07:00')

const EMPTY_EXTRAS: AccountExtras = { scopes: null, sites: null, syncRuns: null, activity: null }

/** Moves a time written as on the canvas by however long it is since the canvas moment. */
function clockFrom(now: Date) {
  return (canvasTime: string) => new Date(Date.parse(canvasTime) + now.getTime() - CANVAS_NOW).toISOString()
}

/**
 * Sample data shaped like the "Sino UI" canvas (`Accounts`, `AccountDetail`). Every time moves with `now`,
 * so the screen looks current whenever it is opened; at 14:05 it shows exactly the times of the canvas.
 */
export function createAccountsSample(now: Date): AccountsData {
  const at = clockFrom(now)
  const authExpiredAt = at('2026-10-01T21:04:00+07:00')

  return {
    generatedAt: now.toISOString(),
    providers: [
      { type: 'gmail', displayName: 'Gmail' },
      { type: 'zalo', displayName: 'Zalo' },
      { type: 'messenger', displayName: 'Messenger' },
    ],
    accounts: [
      {
        id: 'acc-gmail',
        provider: 'gmail',
        externalAccountId: 'an.nguyen@gmail.com',
        displayName: 'An Nguyễn',
        avatarUrl: null,
        status: 'CONNECTED',
        syncEnabled: true,
        lastSyncedAt: at('2026-10-02T14:03:00+07:00'),
        createdAt: at('2026-09-29T20:05:00+07:00'),
        syncProgress: null,
        statusChangedAt: null,
        access: { expiresAt: null, autoRenew: true, lastRenewedAt: at('2026-10-02T13:50:00+07:00') },
        storedMessages: 1284,
        syncIntervalMinutes: 15,
        channels: [
          { kind: 'INBOUND', available: true, enabled: true },
          { kind: 'SEND', available: true, enabled: true },
          { kind: 'ATTACHMENTS', available: true, enabled: true },
          { kind: 'CONTACTS', available: false, enabled: false },
        ],
      },
      {
        id: 'acc-zalo',
        provider: 'zalo',
        externalAccountId: '+84 9•• ••• 218',
        displayName: 'An Nguyễn',
        avatarUrl: null,
        status: 'CONNECTED',
        syncEnabled: true,
        lastSyncedAt: at('2026-10-02T14:04:30+07:00'),
        createdAt: at('2026-10-02T13:58:00+07:00'),
        syncProgress: 64,
        statusChangedAt: null,
        access: { expiresAt: at('2026-10-07T14:05:00+07:00'), autoRenew: false, lastRenewedAt: null },
        storedMessages: 1424,
        syncIntervalMinutes: null,
        channels: [
          { kind: 'INBOUND', available: true, enabled: true },
          { kind: 'SEND', available: true, enabled: false },
          { kind: 'ATTACHMENTS', available: true, enabled: false },
        ],
      },
      {
        id: 'acc-messenger',
        provider: 'messenger',
        externalAccountId: 'an.nguyen.92',
        displayName: 'An Nguyễn',
        avatarUrl: null,
        status: 'AUTH_EXPIRED',
        syncEnabled: true,
        lastSyncedAt: authExpiredAt,
        createdAt: at('2026-09-14T20:15:00+07:00'),
        syncProgress: null,
        statusChangedAt: authExpiredAt,
        access: { expiresAt: authExpiredAt, autoRenew: false, lastRenewedAt: null },
        storedMessages: 1204,
        syncIntervalMinutes: null,
        channels: [
          { kind: 'INBOUND', available: true, enabled: true },
          { kind: 'SEND', available: true, enabled: false },
          { kind: 'ATTACHMENTS', available: true, enabled: false },
        ],
      },
    ],
    storedMessages: 3912,
  }
}

/** The detail sections of one account; only Gmail has them all, the others show "Chưa có dữ liệu". */
export function createAccountExtrasSample(accountId: string, now: Date): AccountExtras {
  const at = clockFrom(now)

  if (accountId === 'acc-messenger') {
    return {
      ...EMPTY_EXTRAS,
      activity: [
        { id: 'act-m2', at: at('2026-10-01T21:04:00+07:00'), kind: 'AUTH_EXPIRED' },
        { id: 'act-m1', at: at('2026-09-14T20:15:00+07:00'), kind: 'ACCOUNT_CONNECTED', initialMessages: 860, durationMinutes: 6 },
      ],
    }
  }
  if (accountId !== 'acc-gmail') {
    return EMPTY_EXTRAS
  }
  return {
    scopes: [
      { code: 'gmail.readonly', granted: true },
      { code: 'gmail.send', granted: true },
      { code: 'userinfo.email', granted: true },
      { code: 'gmail.modify', granted: false },
    ],
    sites: {
      total: 21,
      items: [
        { name: 'Ví Hạt Đậu', domain: 'hatdau.vn', method: 'google', sensitive: true, since: at('2025-03-14T10:20:00+07:00') },
        { name: 'Nhà sách Lumen', domain: 'lumen.vn', method: 'google', sensitive: false, since: at('2026-08-12T19:40:00+07:00') },
        { name: 'Rạp phim Ngân Hà', domain: 'nganha.film', method: 'google', sensitive: false, since: at('2026-06-05T21:10:00+07:00') },
        { name: 'Sổ tay Mint', domain: 'sotaymint.app', method: 'google', sensitive: false, since: at('2025-11-19T08:30:00+07:00') },
      ],
    },
    syncRuns: [
      { at: at('2026-10-02T14:03:00+07:00'), result: 'OK', messages: 12, durationMs: 3100 },
      { at: at('2026-10-02T13:48:00+07:00'), result: 'OK', messages: 4, durationMs: 2700 },
      { at: at('2026-10-02T13:33:00+07:00'), result: 'OK', messages: 0, durationMs: 1900 },
      { at: at('2026-10-02T12:01:00+07:00'), result: 'SLOW', messages: 40, durationMs: 18_400 },
      { at: at('2026-10-02T11:46:00+07:00'), result: 'OK', messages: 7, durationMs: 2200 },
    ],
    activity: [
      { id: 'act-g3', at: at('2026-10-01T09:12:00+07:00'), kind: 'SCOPE_GRANTED', scope: 'gmail.send' },
      { id: 'act-g2', at: at('2026-09-30T22:40:00+07:00'), kind: 'SITES_DETECTED', count: 21, method: 'google' },
      { id: 'act-g1', at: at('2026-09-29T20:05:00+07:00'), kind: 'ACCOUNT_CONNECTED', initialMessages: 1180, durationMinutes: 4 },
    ],
  }
}
