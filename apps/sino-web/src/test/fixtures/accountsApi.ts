/** `GET /api/accounts` and `GET /api/providers` as the backend answers today (F02, F03). */
export const API_ACCOUNTS = [
  {
    id: 'acc-1',
    provider: 'gmail',
    externalAccountId: 'an.nguyen@gmail.com',
    displayName: 'An Nguyễn',
    avatarUrl: null,
    status: 'CONNECTED',
    syncEnabled: true,
    lastSyncedAt: '2026-10-02T07:03:00Z',
    capabilities: ['READ_MESSAGES'],
    createdAt: '2026-09-29T13:05:00Z',
    updatedAt: '2026-10-02T07:03:00Z',
  },
  {
    id: 'acc-2',
    provider: 'gmail',
    externalAccountId: 'cong.viec@gmail.com',
    displayName: 'Công việc',
    avatarUrl: null,
    status: 'AUTH_EXPIRED',
    syncEnabled: false,
    lastSyncedAt: null,
    capabilities: [],
    createdAt: '2026-09-30T02:00:00Z',
    updatedAt: '2026-10-01T14:04:00Z',
  },
]
export const API_PROVIDERS = [{ type: 'gmail', displayName: 'Gmail', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] }]

/** `GET /api/accounts/{id}/initial-sync` (BE-45): a finished 90-day import unless told otherwise. */
export function apiInitialSync(overrides: Record<string, unknown> = {}) {
  return {
    status: 'DONE',
    range: 'DAYS_90',
    imported: 1180,
    skipped: 0,
    estimated: 1180,
    remainingMinutes: null,
    storedMessages: 1180,
    startedAt: '2026-10-02T07:05:00Z',
    finishedAt: '2026-10-02T07:09:00Z',
    errorCode: null,
    ...overrides,
  }
}
