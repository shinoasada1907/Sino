import { setupServer } from 'msw/node'

/** Fake network for tests: each test adds the API responses it needs with `server.use(...)`. */
export const server = setupServer()
