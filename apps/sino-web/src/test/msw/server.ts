import { setupServer } from 'msw/node'
import { settingsHandlers } from '@/test/fixtures/settingsApi'

/**
 * Fake network for tests: each test adds the API responses it needs with `server.use(...)`. The settings API is always
 * on, since every signed-in screen reads the saved theme (settings-backend, D-405); `server.use` still overrides it.
 */
export const server = setupServer(...settingsHandlers)
