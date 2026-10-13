import type { ConnectableProvider } from './connect.types'

/**
 * The provider catalog of the wizard, as `GET /api/providers` would return it. Only Gmail has a connect flow today
 * (D-50); the others are listed as "Sắp có".
 */
export function createConnectProvidersSample(): ConnectableProvider[] {
  return [
    { type: 'gmail', displayName: 'Gmail', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'], connectable: true, scopes: ['gmail.readonly', 'userinfo.email'] },
    { type: 'zalo', displayName: 'Zalo', capabilities: ['READ_MESSAGES'], connectable: false, scopes: [] },
    { type: 'messenger', displayName: 'Messenger', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'], connectable: false, scopes: [] },
    { type: 'google', displayName: 'Google', capabilities: ['REGISTRATIONS'], connectable: false, scopes: [] },
    { type: 'telegram', displayName: 'Telegram', capabilities: ['READ_MESSAGES'], connectable: false, scopes: [] },
  ]
}
