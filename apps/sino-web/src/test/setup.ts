import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { stubOsColorScheme } from './matchMedia'
import { server } from './msw/server'

const unhandledRequests: string[] = []

// A request without a handler fails with a network error, and the test fails afterwards even when
// the code under test catches that error (the API client turns it into NETWORK_ERROR).
beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      unhandledRequests.push(`${request.method} ${request.url}`)
      print.error()
    },
  }),
)

// The OS states no dark-mode preference unless a test says otherwise; `unstubGlobals` resets it after each test.
beforeEach(() => stubOsColorScheme('light'))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  const unhandled = unhandledRequests.splice(0)
  if (unhandled.length > 0) {
    throw new Error(`Requests without an MSW handler: ${unhandled.join(', ')}`)
  }
})

afterAll(() => server.close())
