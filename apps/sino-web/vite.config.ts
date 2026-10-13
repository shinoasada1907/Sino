/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The browser talks to one origin only (D-36): cookies and CSRF work without CORS.
    proxy: {
      '/api/': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // The slowest tests (a whole sign-in, typing and sending a message) take 1.6-2.3 s alone and about 2.5 times that
    // when all files run in parallel, past the default 5 s; 15 s still stops a test that really hangs.
    testTimeout: 15_000,
    unstubGlobals: true,
    // Times on screen depend on the time zone; fix it so tests read the same on every machine and in CI (UTC).
    env: { TZ: 'Asia/Ho_Chi_Minh' },
  },
})
