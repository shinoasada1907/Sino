/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import siteConfig from './site.config.ts'
import type { SiteData } from './src/site/site-data.ts'

// `pnpm dev` and the tests show site.config.ts as a preview build would; scripts/build.ts passes its own
// __SITE_DATA__ to both bundles so the server and the browser render the same HTML (D-250).
const previewData: SiteData = { mode: 'preview', config: siteConfig, year: new Date().getFullYear() }

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: command === 'serve' ? { __SITE_DATA__: JSON.stringify(previewData) } : {},
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    // test/cli.test.ts runs real Vite builds in a child process.
    testTimeout: 60_000,
  },
}))
