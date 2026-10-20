import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { stickerPacing } from '@/features/inbox/stickerQueue'
import { stubEventSource } from './eventSource'
import { stubOsColorScheme } from './matchMedia'
import { stubObjectUrls } from './objectUrls'
import { server } from './msw/server'

// jsdom has no ResizeObserver; every browser does. Radix measures the hidden input of a form control with it (a Switch
// inside a <form>, as on the sign-in page). Nothing in the tests depends on sizes, so observing does nothing.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// A whole screen re-rendered after a navigation takes about 0.3 s in jsdom and more when the test files run in parallel;
// the default 1 s wait of `findBy…` and `waitFor` was sometimes too short (seen on the Tổng quan links test).
configure({ asyncUtilTimeout: 3000 })

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

// The OS states no dark-mode preference unless a test says otherwise, and every signed-in screen opens the event stream
// (F08), which jsdom lacks; `unstubGlobals` resets both after each test. jsdom has no object URLs either, which the
// previews of the "Thêm sticker" step use (SP-08); each test starts with none.
beforeEach(() => {
  // The stickers wait a second between two sends (stickerQueue); no test does.
  stickerPacing.gapMs = 0
  stubOsColorScheme('light')
  stubEventSource()
  stubObjectUrls()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  const unhandled = unhandledRequests.splice(0)
  if (unhandled.length > 0) {
    throw new Error(`Requests without an MSW handler: ${unhandled.join(', ')}`)
  }
})

afterAll(() => server.close())
